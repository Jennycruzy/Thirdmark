import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import type {
  DleqProof,
  Ledger,
  Witnesses,
} from "../managed/thirdmark/contract/index.js";
import type { JubjubPoint } from "@midnight-ntwrk/compact-runtime";

/**
 * Private witness material for one filer. The contract never receives this
 * object; the generated witness functions expose one field at a time to the
 * proving runtime.
 *
 * The state is deliberately read-only from the witness perspective. The
 * public nullifier set is the replay guard, so a failed proof does not need
 * to roll back an evolving private history.
 */
export type ThirdmarkPrivateState = {
  readonly filerSecret: Uint8Array;
  readonly blindedOprfPoint: JubjubPoint;
  readonly evaluatedOprfPoint: JubjubPoint;
  readonly unblindingScalar: bigint;
  readonly issuerDleqProof: DleqProof;
};

export type ThirdmarkWitnesses = Witnesses<ThirdmarkPrivateState>;
type Context = WitnessContext<Ledger, ThirdmarkPrivateState>;

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
): ThirdmarkPrivateState => ({
  filerSecret,
  ...oprf,
});

/** Stage fresh OPRF material without changing the filer secret. */
export const stageOprfPrivateState = (
  state: ThirdmarkPrivateState,
  oprf: OprfWitnessMaterial,
): ThirdmarkPrivateState => ({
  ...state,
  ...oprf,
});

export const witnesses: ThirdmarkWitnesses = {
  filerSecret: ({ privateState }: Context) => [privateState, privateState.filerSecret],
  blindedOprfPoint: ({ privateState }: Context) => [privateState, privateState.blindedOprfPoint],
  evaluatedOprfPoint: ({ privateState }: Context) => [privateState, privateState.evaluatedOprfPoint],
  unblindingScalar: ({ privateState }: Context) => [privateState, privateState.unblindingScalar],
  issuerDleqProof: ({ privateState }: Context) => [privateState, privateState.issuerDleqProof],
};
