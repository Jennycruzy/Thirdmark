import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
  type CircuitContext,
  type WitnessContext,
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  ledger,
  type Ledger,
  type Witnesses,
} from "./managed/oprf/contract/index.js";
import {
  JUBJUB_SCALAR_MODULUS,
  modInverse,
} from "../client/scalars.js";

export { JUBJUB_SCALAR_MODULUS, modInverse };

export type OprfPrivateState = {
  readonly blindingScalar: bigint;
  readonly issuerScalar: bigint;
  readonly unblindingScalar: bigint;
};

export type OprfWitnesses = Witnesses<OprfPrivateState>;

export const witnesses: OprfWitnesses = {
  blindingScalar: ({ privateState }: WitnessContext<Ledger, OprfPrivateState>) => [
    privateState,
    privateState.blindingScalar,
  ],
  issuerScalar: ({ privateState }: WitnessContext<Ledger, OprfPrivateState>) => [
    privateState,
    privateState.issuerScalar,
  ],
  unblindingScalar: ({ privateState }: WitnessContext<Ledger, OprfPrivateState>) => [
    privateState,
    privateState.unblindingScalar,
  ],
};

export const createOprfPrivateState = (
  blindingScalar: bigint,
  issuerScalar: bigint,
  unblindingScalar: bigint,
): OprfPrivateState => ({
  blindingScalar,
  issuerScalar,
  unblindingScalar,
});

export class OprfSimulator {
  readonly contract: Contract<OprfPrivateState, OprfWitnesses>;
  circuitContext: CircuitContext<OprfPrivateState>;

  constructor(privateState: OprfPrivateState) {
    this.contract = new Contract(witnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(
      createConstructorContext(privateState, "0".repeat(64)),
    );

    this.circuitContext = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
    );
  }

  run(subject: Uint8Array): boolean {
    const result = this.contract.impureCircuits.oprfRoundTrip(
      this.circuitContext,
      subject,
    );
    this.circuitContext = result.context;
    return result.result;
  }

  getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }
}
