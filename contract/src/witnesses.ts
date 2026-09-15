import { pureCircuits } from "../managed/thirdmark/contract/index.js";
import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import type {
  DleqProof,
  FilingHistory,
  Ledger,
  Witnesses,
} from "../managed/thirdmark/contract/index.js";
import type { JubjubPoint } from "@midnight-ntwrk/compact-runtime";

/**
 * Private witness material for one filer. The contract never receives this
 * object; the generated witness functions expose one field at a time to the
 * proving runtime.
 *
 * The state is deliberately read-only from the witness perspective. A caller
 * must persist the next history only after the corresponding transaction has
 * been accepted, so a failed proof cannot consume a filing salt or history
 * opening.
 */
export type ThirdmarkPrivateState = {
  readonly filerSecret: Uint8Array;
  readonly history: FilingHistory;
  readonly previousHistorySalt: Uint8Array;
  readonly nextHistorySalt: Uint8Array;
  readonly blindedOprfPoint: JubjubPoint;
  readonly evaluatedOprfPoint: JubjubPoint;
  readonly unblindingScalar: bigint;
  readonly issuerDleqProof: DleqProof;
};

export type ThirdmarkWitnesses = Witnesses<ThirdmarkPrivateState>;
type Context = WitnessContext<Ledger, ThirdmarkPrivateState>;

export const emptyFilingHistory = (): FilingHistory => ({
  slots: Array.from({ length: 4 }, () => new Uint8Array(32)),
  commitmentSalts: Array.from({ length: 4 }, () => new Uint8Array(32)),
  length: 0n,
});

export type OprfWitnessMaterial = Pick<
  ThirdmarkPrivateState,
  | "blindedOprfPoint"
  | "evaluatedOprfPoint"
  | "unblindingScalar"
  | "issuerDleqProof"
>;

/**
 * Create the first private state for a filer. The OPRF material is staged
 * before the first call so the generated witness functions never need to read
 * a subject, report, or slot secret from a server.
 */
export const createInitialPrivateState = (
  filerSecret: Uint8Array,
  oprf: OprfWitnessMaterial,
  nextHistorySalt: Uint8Array,
): ThirdmarkPrivateState => ({
  filerSecret,
  history: emptyFilingHistory(),
  previousHistorySalt: new Uint8Array(32),
  nextHistorySalt,
  ...oprf,
});

/** Stage fresh OPRF material without consuming the current history. */
export const stageOprfPrivateState = (
  state: ThirdmarkPrivateState,
  oprf: OprfWitnessMaterial,
  nextHistorySalt: Uint8Array,
): ThirdmarkPrivateState => ({
  ...state,
  ...oprf,
  nextHistorySalt,
});

/**
 * Advance private history only after the corresponding transaction has
 * finalized. A failed proof therefore cannot consume a salt or filing slot.
 */
export const advancePrivateState = (
  state: ThirdmarkPrivateState,
  slotKey: Uint8Array,
  usedHistorySalt: Uint8Array,
): ThirdmarkPrivateState => ({
  ...state,
  history: pureCircuits.nextFilingHistory(
    state.history,
    slotKey,
    usedHistorySalt,
  ),
  previousHistorySalt: state.nextHistorySalt,
  nextHistorySalt: usedHistorySalt,
});

export const witnesses: ThirdmarkWitnesses = {
  filerSecret: ({ privateState }: Context) => [privateState, privateState.filerSecret],
  filingHistory: ({ privateState }: Context) => [privateState, privateState.history],
  previousHistorySalt: ({ privateState }: Context) => [privateState, privateState.previousHistorySalt],
  nextHistorySalt: ({ privateState }: Context) => [privateState, privateState.nextHistorySalt],
  blindedOprfPoint: ({ privateState }: Context) => [privateState, privateState.blindedOprfPoint],
  evaluatedOprfPoint: ({ privateState }: Context) => [privateState, privateState.evaluatedOprfPoint],
  unblindingScalar: ({ privateState }: Context) => [privateState, privateState.unblindingScalar],
  issuerDleqProof: ({ privateState }: Context) => [privateState, privateState.issuerDleqProof],
};
