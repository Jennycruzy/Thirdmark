import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { ContractState, type ContractAddress, type JubjubPoint } from "@midnight-ntwrk/compact-runtime";
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
  type ProofProvider,
  type UnboundTransaction,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { fromHex, toHex } from "@midnight-ntwrk/midnight-js-utils";
import {
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
  Contract as ExampleCounterContract,
} from "../../../verification/example-counter/managed/counter/contract/index.js";
import {
  createInitialPrivateState,
  stageOprfPrivateState,
  witnesses,
  type ThirdmarkPrivateState,
  type ThirdmarkWitnesses,
} from "../../../contract/src/witnesses.js";
import { asCiphertext128, decryptReport, type ReportAttestation } from "../../../client/crypto.js";
import type { CompletedOprf } from "../../../client/oprf.js";
import { configuredIssuerPublicKey } from "../issuer.js";
import { getContractAddress, publicAppConfig } from "../config.js";
import type { WalletSession } from "./wallet.js";
import { encryptedPrivateStateProvider } from "./private-state.js";

const PRIVATE_STATE_ID = "thirdmark-filer";
const DEPLOYMENT_PRIVATE_STATE_ID = "thirdmark-deployment";
const WAVE_ONE_THRESHOLD = 3n;
const ARTIFACT_ROOT = "/";

const balancedTxHex = new WeakMap<object, string>();
type ProgressReporter = (stage: string) => void;

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

const counterCompiledContract = () =>
  CompiledContract.make("counter", ExampleCounterContract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets("/counter/"),
  );

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

const artifactBaseUrl = (artifactRoot: string): string =>
  new URL(artifactRoot, window.location.origin).toString().replace(/\/+$/u, "");

const keyMaterialProviderFor = (
  provider: {
    asKeyMaterialProvider: () => {
      getZKIR(circuitKeyLocation: string): Promise<Uint8Array>;
      getProverKey(circuitKeyLocation: string): Promise<Uint8Array>;
      getVerifierKey(circuitKeyLocation: string): Promise<Uint8Array>;
    };
  },
  reportProgress: ProgressReporter,
) => {
  const material = provider.asKeyMaterialProvider();
  return {
    async getZKIR(circuitKeyLocation: string): Promise<Uint8Array> {
      reportProgress(`Loading ${circuitKeyLocation} proving representation`);
      try {
        return await material.getZKIR(circuitKeyLocation);
      } catch {
        throw new Error(`The browser could not load the ${circuitKeyLocation} proving representation.`);
      }
    },
    async getProverKey(circuitKeyLocation: string): Promise<Uint8Array> {
      reportProgress(`Loading ${circuitKeyLocation} proving key`);
      try {
        return await material.getProverKey(circuitKeyLocation);
      } catch {
        throw new Error(`The browser could not load the ${circuitKeyLocation} proving key.`);
      }
    },
    async getVerifierKey(circuitKeyLocation: string): Promise<Uint8Array> {
      reportProgress(`Loading ${circuitKeyLocation} verifier key`);
      try {
        return await material.getVerifierKey(circuitKeyLocation);
      } catch {
        throw new Error(`The browser could not load the ${circuitKeyLocation} verifier key.`);
      }
    },
  };
};

const buildProviders = async (
  session: WalletSession,
  artifactRoot = ARTIFACT_ROOT,
  reportProgress: ProgressReporter = () => undefined,
): Promise<ThirdmarkProviders> => {
  setNetworkId(publicAppConfig.networkId);
  reportProgress("Checking the wallet's Preprod connection");
  const walletConfig = await session.api.getConfiguration();
  if (walletConfig.networkId !== publicAppConfig.networkId) {
    throw new Error(`The wallet is connected to ${walletConfig.networkId}, not ${publicAppConfig.networkId}.`);
  }

  const shielded = await session.api.getShieldedAddresses();
  reportProgress("Loading browser proving assets");
  const zkConfigProvider = new FetchZkConfigProvider<"file">(
    artifactBaseUrl(artifactRoot),
    fetch.bind(window),
  );
  reportProgress("Requesting delegated proving from the wallet");
  let provingProvider: Awaited<ReturnType<WalletSession["api"]["getProvingProvider"]>>;
  try {
    provingProvider = await session.api.getProvingProvider(
      keyMaterialProviderFor(zkConfigProvider, reportProgress),
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("The browser could not load")) {
      throw error;
    }
    throw new Error("The wallet could not start delegated proving for this contract.");
  }
  reportProgress("Delegated proving provider ready");
  const delegatedProofProvider = createProofProvider(provingProvider);
  const proofProvider: ProofProvider = {
    async proveTx(tx, config) {
      reportProgress("Requesting proof-service approval in 1AM");
      return delegatedProofProvider.proveTx(tx, config);
    },
  };

  const walletProvider: WalletProvider = {
    getCoinPublicKey: () => shielded.shieldedCoinPublicKey,
    getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey,
    async balanceTx(tx: UnboundTransaction, _ttl?: Date): Promise<FinalizedTransaction> {
      reportProgress("Asking the wallet to balance the transaction");
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
      reportProgress("Waiting for the wallet transaction approval");
      await session.api.submitTransaction(balancedTxHex.get(tx as unknown as object) ?? toHex(tx.serialize()));
      return tx.identifiers()[0];
    },
  };

  reportProgress("Preparing the Preprod indexer provider");
  const basePublic = indexerPublicDataProvider(walletConfig.indexerUri, walletConfig.indexerWsUri, window.WebSocket);
  reportProgress("Preprod providers ready");
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
  const address = getContractAddress();
  if (!address) {
    throw new Error("The Thirdmark contract address is not configured for this deployment.");
  }
  return address as ContractAddress;
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
  readonly slotKey: Uint8Array;
};

export type SlotSnapshot = {
  readonly unlocked: boolean;
  readonly threshold: number;
  readonly records?: readonly {
    readonly entryKey: Uint8Array;
    readonly attestation: ReportAttestation;
  }[];
};

export type DeploymentReceipt = {
  readonly contractAddress: string;
  readonly txId: string;
  readonly txHash: string;
  readonly blockHeight: number | null;
};

export type CounterDeploymentReceipt = {
  readonly contractAddress: string;
  readonly txId: string;
  readonly txHash: string;
  readonly blockHeight: number | null;
};

/**
 * Deploy the canonical Midnight example-counter through a connected wallet. This is the
 * pre-product network smoke test: it proves the wallet, proving assets, fee
 * balancing, signing, and Preprod submission without the headless history scan.
 */
export const deployExampleCounter = async (
  session: WalletSession,
  reportProgress?: ProgressReporter,
): Promise<CounterDeploymentReceipt> => {
  const providers = await buildProviders(session, "/counter/", reportProgress);
  reportProgress?.("Checking the example-counter verifier asset");
  await (providers.zkConfigProvider as unknown as {
    getVerifierKey(circuitId: string): Promise<unknown>;
  }).getVerifierKey("increment");
  reportProgress?.("Building the example-counter deployment transaction");
  const deployed = await deployContract(providers as never, {
    compiledContract: counterCompiledContract(),
    privateStateId: "example-counter-private-state",
    initialPrivateState: { privateCounter: 0 },
  } as never);
  const publicData = deployed.deployTxData.public;
  return {
    contractAddress: publicData.contractAddress,
    txId: publicData.txId,
    txHash: publicData.txHash,
    blockHeight: publicData.blockHeight === undefined ? null : Number(publicData.blockHeight),
  };
};

/**
 * Deploy through the connected Midnight wallet. The browser wallet owns wallet
 * synchronization, transaction balancing, signing, and submission; the
 * application does not run a second headless wallet history replay.
 */
export const deployThirdmark = async (
  session: WalletSession,
  reportProgress?: ProgressReporter,
): Promise<DeploymentReceipt> => {
  if (getContractAddress()) {
    throw new Error("A Thirdmark contract address is already configured for this deployment.");
  }
  const providers = await buildProviders(session, ARTIFACT_ROOT, reportProgress);
  reportProgress?.("Checking the Thirdmark verifier asset");
  await providers.zkConfigProvider.getVerifierKey("file");
  reportProgress?.("Building the Thirdmark deployment transaction");
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
    const initial = existing ?? createInitialPrivateState(randomBytes32(), initialOprf);
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
    const staged = stageOprfPrivateState(previous, completed);
    await this.providers.privateStateProvider.set(PRIVATE_STATE_ID, staged);
    let transactionFinalized = false;

    try {
      if (!this.deployed) throw new Error("The deployed Thirdmark contract is not ready.");
      const result = await this.deployed.callTx.file(ciphertext);
      transactionFinalized = true;
      const ciphertextId = pureCircuits.ciphertextId(ciphertext);
      const nullifier = pureCircuits.filerNullifier(staged.filerSecret, completed.slotKey);
      return {
        txId: result.public.txId,
        txHash: result.public.txHash,
        blockHeight: result.public.blockHeight,
        unlocked: result.private.result,
        ciphertextId,
        nullifier,
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

    const records: {
      readonly entryKey: Uint8Array;
      readonly attestation: ReportAttestation;
    }[] = [];
    for (let index = 0n; index < current.slotFilled.lookup(completed.slotKey); index += 1n) {
      const key = pureCircuits.entryKey(completed.slotKey, index);
      records.push({
        entryKey: key,
        attestation: await decryptReport(completed.slotSecret, asCiphertext128(current.entries.lookup(key))),
      });
    }
    return { unlocked: true, threshold, records };
  }
}

export const connectThirdmark = (session: WalletSession, initialOprf: CompletedOprf): Promise<ThirdmarkClient> =>
  ThirdmarkClient.connect(session, initialOprf);
