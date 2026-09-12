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
