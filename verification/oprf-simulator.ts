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

/**
 * The Jubjub scalar modulus from the maintained Compact source at c47230c,
 * runtime/src/constants.ts:33-39. Compact runtime 0.15.0 does not export this
 * protocol constant; the source discrepancy is recorded in docs/FINDINGS.md.
 */
export const JUBJUB_SCALAR_MODULUS =
  0xe7db4ea6533afa906673b0101343b00a6682093ccc81082d0970e5ed6f72cb7n;

export const modInverse = (value: bigint, modulus: bigint): bigint => {
  if (value <= 0n || value >= modulus) {
    throw new Error("scalar must be non-zero and below the modulus");
  }

  let oldRemainder = value;
  let remainder = modulus;
  let oldCoefficient = 1n;
  let coefficient = 0n;

  while (remainder !== 0n) {
    const quotient = oldRemainder / remainder;
    [oldRemainder, remainder] = [
      remainder,
      oldRemainder - quotient * remainder,
    ];
    [oldCoefficient, coefficient] = [
      coefficient,
      oldCoefficient - quotient * coefficient,
    ];
  }

  if (oldRemainder !== 1n) {
    throw new Error("scalar has no modular inverse");
  }

  return (oldCoefficient % modulus + modulus) % modulus;
};

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
