import {
  CompactTypeBytes,
  createCircuitContext,
  createConstructorContext,
  ecMul,
  ecMulGenerator,
  hashToCurve,
  sampleContractAddress,
  type CircuitContext,
  type JubjubPoint,
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  ledger,
  pureCircuits,
  type FilingHistory,
  type Ledger,
} from "../../managed/thirdmark/contract/index.js";
import {
  JUBJUB_SCALAR_MODULUS,
  modInverse,
} from "../../../client/scalars.js";

import {
  witnesses,
  type ThirdmarkPrivateState,
  type ThirdmarkWitnesses,
} from "../witnesses.js";

export { JUBJUB_SCALAR_MODULUS, modInverse, witnesses };
export type { ThirdmarkPrivateState, ThirdmarkWitnesses };

export const emptyHistory = (): FilingHistory => ({
  slots: Array.from({ length: 32 }, () => new Uint8Array(32)),
  commitmentSalts: Array.from({ length: 32 }, () => new Uint8Array(32)),
  length: 0n,
});

const bytes32 = (value: number): Uint8Array => {
  const result = new Uint8Array(32);
  result[31] = value;
  return result;
};

export const makeOprfMaterial = (
  subject: Uint8Array,
  issuerSecret: bigint,
  blindingScalar: bigint,
  proofNonce: bigint,
): Pick<
  ThirdmarkPrivateState,
  | "blindedOprfPoint"
  | "evaluatedOprfPoint"
  | "unblindingScalar"
  | "issuerDleqProof"
> => {
  if (subject.length !== 32) {
    throw new Error("subject must be exactly 32 bytes");
  }

  const subjectPoint = hashToCurve(new CompactTypeBytes(32), subject);
  const blinded = ecMul(subjectPoint, blindingScalar);
  const evaluated = ecMul(blinded, issuerSecret);
  const issuerKey = ecMulGenerator(issuerSecret);
  const announcementGenerator = ecMulGenerator(proofNonce);
  const announcementBlinded = ecMul(blinded, proofNonce);
  const challenge = pureCircuits.dleqChallenge(
    issuerKey,
    blinded,
    evaluated,
    announcementGenerator,
    announcementBlinded,
  );
  const response =
    (proofNonce + (challenge * issuerSecret) % JUBJUB_SCALAR_MODULUS) %
    JUBJUB_SCALAR_MODULUS;

  return {
    blindedOprfPoint: blinded,
    evaluatedOprfPoint: evaluated,
    unblindingScalar: modInverse(blindingScalar, JUBJUB_SCALAR_MODULUS),
    issuerDleqProof: {
      announcementGenerator,
      announcementBlinded,
      response,
    },
  };
};

export const createPrivateState = (
  filerSecret: Uint8Array,
  subject: Uint8Array,
  issuerSecret: bigint,
  blindingScalar: bigint,
  proofNonce: bigint,
  nextHistorySalt = bytes32(1),
): ThirdmarkPrivateState => ({
  filerSecret,
  history: emptyHistory(),
  previousHistorySalt: new Uint8Array(32),
  nextHistorySalt,
  ...makeOprfMaterial(subject, issuerSecret, blindingScalar, proofNonce),
});

export class ThirdmarkSimulator {
  readonly contract: Contract<ThirdmarkPrivateState, ThirdmarkWitnesses>;
  circuitContext: CircuitContext<ThirdmarkPrivateState>;

  constructor(
    issuerKey: JubjubPoint,
    threshold: bigint,
    privateState: ThirdmarkPrivateState,
  ) {
    this.contract = new Contract(witnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(
      createConstructorContext(privateState, "0".repeat(64)),
      issuerKey.x,
      issuerKey.y,
      threshold,
    );
    this.circuitContext = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
    );
  }

  setPrivateState(privateState: ThirdmarkPrivateState): void {
    this.circuitContext.currentPrivateState = privateState;
  }

  file(ciphertext: Uint8Array): boolean {
    const result = this.contract.impureCircuits.file(
      this.circuitContext,
      ciphertext,
    );
    this.circuitContext = result.context;
    return result.result;
  }

  getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  getPrivateState(): ThirdmarkPrivateState {
    return this.circuitContext.currentPrivateState;
  }
}

export const advancePrivateState = (
  state: ThirdmarkPrivateState,
  slotKey: Uint8Array,
  nextHistorySalt: Uint8Array,
): ThirdmarkPrivateState => ({
  ...state,
  history: pureCircuits.nextFilingHistory(
    state.history,
    slotKey,
    nextHistorySalt,
  ),
  previousHistorySalt: state.nextHistorySalt,
  nextHistorySalt,
});
