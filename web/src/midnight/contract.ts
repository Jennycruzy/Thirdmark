import { CompiledContract } from "@midnight-ntwrk/compact-js";
import type { ContractAddress, JubjubPoint } from "@midnight-ntwrk/compact-runtime";
import {
  deployContract,
  findDeployedContract,
  type ContractProviders,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import {
  createProofProvider,
  type MidnightProvider,
  type UnboundTransaction,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { fromHex, toHex } from "@midnight-ntwrk/midnight-js-utils";
import {
  ContractState,
  type FinalizedTransaction,
  type Proof,
  type SignatureEnabled,
  type Binding,
  Transaction,
} from "@midnight-ntwrk/ledger-v8";
import {
  ledger,
  pureCircuits,
  Contract,
  type Ledger,
} from "../../../contract/managed/thirdmark/contract/index.js";
import {
  advancePrivateState,
  createInitialPrivateState,
  stageOprfPrivateState,
  witnesses,
  type ThirdmarkPrivateState,
  type ThirdmarkWitnesses,
} from "../../../contract/src/witnesses.js";
import { asCiphertext128, decryptReport, type ReportAttestation } from "../../../client/crypto.js";
import type { CompletedOprf } from "../../../client/oprf.js";
import { configuredIssuerPublicKey } from "../issuer.js";
import { publicAppConfig } from "../config.js";
import type { WalletSession } from "./wallet.js";
import { encryptedPrivateStateProvider } from "./private-state.js";

const PRIVATE_STATE_ID = "thirdmark-filer";
const DEPLOYMENT_PRIVATE_STATE_ID = "thirdmark-deployment";
const WAVE_ONE_THRESHOLD = 3n;
const ARTIFACT_ROOT = "/";

const balancedTxHex = new WeakMap<object, string>();

type ThirdmarkContract = Contract<ThirdmarkPrivateState, ThirdmarkWitnesses>;
type ThirdmarkProviders = ContractProviders<ThirdmarkContract>;
type ThirdmarkDeployment = FoundContract<ThirdmarkContract>;

const compiledContractCache = new Map<string, ReturnType<typeof buildCompiledContract>>();

const buildCompiledContract = (assetSource: string) =>
  CompiledContract.make<ThirdmarkContract>(
    "Thirdmark",
    Contract<ThirdmarkPrivateState, ThirdmarkWitnesses>,
  ).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(assetSource),
  );

const compiledContract = () => {
  const cached = compiledContractCache.get(ARTIFACT_ROOT);
  if (cached) return cached;
  const result = buildCompiledContract(ARTIFACT_ROOT);
  compiledContractCache.set(ARTIFACT_ROOT, result);
  return result;
};

const hexToBytes = (hex: string): Uint8Array => {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^(?:[0-9a-f]{2})*$/iu.test(normalized)) throw new Error("wallet returned invalid transaction hex");
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

const patchPublicDataProvider = (base: ReturnType<typeof indexerPublicDataProvider>, indexerUri: string) => ({
  ...base,
  async queryContractState(contractAddress: ContractAddress, config?: unknown) {
    if (config) return base.queryContractState(contractAddress, config as never);
    const response = await fetch(indexerUri, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: "query LATEST($address: HexEncoded!) { contractAction(address: $address) { state } }",
        variables: { address: contractAddress },
      }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`the Midnight indexer returned HTTP ${response.status}`);
    const payload = (await response.json()) as {
      readonly errors?: readonly { readonly message: string }[];
      readonly data?: { readonly contractAction?: { readonly state?: string } | null };
    };
    if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
    const serialized = payload.data?.contractAction?.state;
    return serialized ? ContractState.deserialize(hexToBytes(serialized)) : null;
  },
});

const randomBytes32 = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));

const buildProviders = async (session: WalletSession): Promise<ThirdmarkProviders> => {
  setNetworkId(publicAppConfig.networkId);
  const walletConfig = await session.api.getConfiguration();
  if (walletConfig.networkId !== publicAppConfig.networkId) {
    throw new Error(`The wallet is connected to ${walletConfig.networkId}, not ${publicAppConfig.networkId}.`);
  }

  const shielded = await session.api.getShieldedAddresses();
  const zkConfigProvider = new FetchZkConfigProvider<"file">(
    window.location.origin,
    fetch.bind(window),
  );
  const proofProvider = createProofProvider(
    await session.api.getProvingProvider(zkConfigProvider.asKeyMaterialProvider()),
  );

  const walletProvider: WalletProvider = {
    getCoinPublicKey: () => shielded.shieldedCoinPublicKey,
    getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey,
    async balanceTx(tx: UnboundTransaction, _ttl?: Date): Promise<FinalizedTransaction> {
      const balanced = await session.api.balanceUnsealedTransaction(toHex(tx.serialize()));
      const finalized = Transaction.deserialize<SignatureEnabled, Proof, Binding>(
        "signature",
        "proof",
        "binding",
        fromHex(balanced.tx),
      );
      balancedTxHex.set(finalized as unknown as object, balanced.tx);
      return finalized;
    },
  };

  const midnightProvider: MidnightProvider = {
    async submitTx(tx: FinalizedTransaction): Promise<string> {
      await session.api.submitTransaction(balancedTxHex.get(tx as unknown as object) ?? toHex(tx.serialize()));
      return tx.identifiers()[0];
    },
  };

  const basePublic = indexerPublicDataProvider(walletConfig.indexerUri, walletConfig.indexerWsUri, window.WebSocket);
  return {
    privateStateProvider: encryptedPrivateStateProvider(),
    publicDataProvider: patchPublicDataProvider(basePublic, walletConfig.indexerUri),
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
  };
};

const requireContractAddress = (): ContractAddress => {
  if (!publicAppConfig.contractAddress) {
    throw new Error("The Thirdmark contract address is not configured for this deployment.");
  }
  return publicAppConfig.contractAddress as ContractAddress;
};

const assertIssuerConfiguration = (current: Ledger): void => {
  const configured = configuredIssuerPublicKey();
  if (current.issuerKeyX !== configured.x || current.issuerKeyY !== configured.y) {
    throw new Error("The configured issuer key does not match the sealed key on the Thirdmark contract.");
  }
};

const stateFromPublicData = async (providers: ThirdmarkProviders, address: ContractAddress): Promise<Ledger> => {
  const state = await providers.publicDataProvider.queryContractState(address);
  if (!state) throw new Error("The configured Thirdmark contract was not found on the connected network.");
  const current = ledger(state.data);
  assertIssuerConfiguration(current);
  return current;
};

export type FilingReceipt = {
  readonly txId: string;
  readonly txHash: string;
  readonly blockHeight: number;
  readonly unlocked: boolean;
  readonly ciphertextId: Uint8Array;
  readonly nullifier: Uint8Array;
  readonly historyCommitment: Uint8Array;
  readonly slotKey: Uint8Array;
};

export type SlotSnapshot = {
  readonly unlocked: boolean;
  readonly threshold: number;
  readonly records?: readonly ReportAttestation[];
};

export type DeploymentReceipt = {
  readonly contractAddress: string;
  readonly txId: string;
  readonly txHash: string;
  readonly blockHeight: number | null;
};

/**
 * Deploy through the connected Lace wallet. The browser wallet owns wallet
 * synchronization, transaction balancing, signing, and submission; the
 * application does not run a second headless wallet history replay.
 */
export const deployThirdmark = async (session: WalletSession): Promise<DeploymentReceipt> => {
  if (publicAppConfig.contractAddress) {
    throw new Error("A Thirdmark contract address is already configured for this deployment.");
  }
  const providers = await buildProviders(session);
  const issuerKey = configuredIssuerPublicKey();
  const deployed = await deployContract(providers, {
    compiledContract: compiledContract(),
    args: [issuerKey.x, issuerKey.y, WAVE_ONE_THRESHOLD],
    privateStateId: DEPLOYMENT_PRIVATE_STATE_ID,
    // The constructor has no witness reads. Filer state is initialized only
    // when a browser joins the deployed address after an OPRF response.
    initialPrivateState: {} as never,
  } as never);
  const publicData = deployed.deployTxData.public;
  return {
    contractAddress: publicData.contractAddress,
    txId: publicData.txId,
    txHash: publicData.txHash,
    blockHeight: publicData.blockHeight === undefined ? null : Number(publicData.blockHeight),
  };
};

export class ThirdmarkClient {
  private constructor(
    private readonly providers: ThirdmarkProviders,
    private readonly address: ContractAddress,
    private deployed: ThirdmarkDeployment | undefined,
  ) {}

  static async connect(session: WalletSession, initialOprf: CompletedOprf): Promise<ThirdmarkClient> {
    const address = requireContractAddress();
    const providers = await buildProviders(session);
    providers.privateStateProvider.setContractAddress(address);

    const existing = await providers.privateStateProvider.get(PRIVATE_STATE_ID);
    const initial = existing ?? createInitialPrivateState(randomBytes32(), initialOprf, randomBytes32());
    await providers.privateStateProvider.set(PRIVATE_STATE_ID, initial);
    const current = await stateFromPublicData(providers, address);
    if (current.threshold < 2n) throw new Error("The deployed contract has an invalid threshold.");

    const deployed = await findDeployedContract(providers, {
      contractAddress: address,
      compiledContract: compiledContract(),
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: initial,
    });
    return new ThirdmarkClient(providers, address, deployed as ThirdmarkDeployment);
  }

  private async privateState(): Promise<ThirdmarkPrivateState> {
    const state = await this.providers.privateStateProvider.get(PRIVATE_STATE_ID);
    if (!state) throw new Error("The local filing witness state is missing; reconnect the wallet.");
    return state;
  }

  async file(completed: CompletedOprf, ciphertext: Uint8Array): Promise<FilingReceipt> {
    if (ciphertext.length !== 128) throw new Error("the filing envelope must be exactly 128 bytes");
    const previous = await this.privateState();
    const staged = stageOprfPrivateState(previous, completed, randomBytes32());
    await this.providers.privateStateProvider.set(PRIVATE_STATE_ID, staged);
    let transactionFinalized = false;

    try {
      if (!this.deployed) throw new Error("The deployed Thirdmark contract is not ready.");
      const result = await this.deployed.callTx.file(ciphertext);
      transactionFinalized = true;
      const next = await this.privateState();
      await this.providers.privateStateProvider.set(
        PRIVATE_STATE_ID,
        advancePrivateState(next, completed.slotKey, staged.nextHistorySalt),
      );

      const current = await stateFromPublicData(this.providers, this.address);
      const filerId = pureCircuits.filerIdFromSecret(staged.filerSecret);
      const ciphertextId = pureCircuits.ciphertextId(ciphertext);
      const nullifier = pureCircuits.filerNullifier(staged.filerSecret, completed.slotKey);
      const historyCommitment = current.history.lookup(filerId);
      return {
        txId: result.public.txId,
        txHash: result.public.txHash,
        blockHeight: result.public.blockHeight,
        unlocked: result.private.result,
        ciphertextId,
        nullifier,
        historyCommitment,
        slotKey: completed.slotKey,
      };
    } catch (error) {
      if (!transactionFinalized) {
        await this.providers.privateStateProvider.set(PRIVATE_STATE_ID, previous);
      }
      throw error;
    }
  }

  async readSlot(completed: CompletedOprf): Promise<SlotSnapshot> {
    const current = await stateFromPublicData(this.providers, this.address);
    const threshold = Number(current.threshold);
    const unlocked = current.unlocked.member(completed.slotKey);
    if (!unlocked) return { unlocked: false, threshold };

    const records: ReportAttestation[] = [];
    for (let index = 0n; index < current.slotFilled.lookup(completed.slotKey); index += 1n) {
      const key = pureCircuits.entryKey(completed.slotKey, index);
      records.push(await decryptReport(completed.slotSecret, asCiphertext128(current.entries.lookup(key))));
    }
    return { unlocked: true, threshold, records };
  }
}

export const connectThirdmark = (session: WalletSession, initialOprf: CompletedOprf): Promise<ThirdmarkClient> =>
  ThirdmarkClient.connect(session, initialOprf);
