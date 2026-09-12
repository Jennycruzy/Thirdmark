import { describe, expect, it } from "vitest";
import { pureCircuits } from "./managed/oprf/contract/index.js";
import {
  createOprfPrivateState,
  JUBJUB_SCALAR_MODULUS,
  modInverse,
  OprfSimulator,
} from "./oprf-simulator.js";

const subject = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

const stateFor = (blindingScalar: bigint, issuerScalar: bigint) =>
  createOprfPrivateState(
    blindingScalar,
    issuerScalar,
    modInverse(blindingScalar, JUBJUB_SCALAR_MODULUS),
  );

describe("OPRF scratch circuit", () => {
  it("accepts a non-trivial blind, issuer evaluation, and client unblind", () => {
    const simulator = new OprfSimulator(stateFor(7n, 11n));

    expect(simulator.run(subject)).toBe(true);
    expect(simulator.getLedger().roundTripAccepted).toBe(true);
  });

  it("rejects an incorrect client unblinding scalar", () => {
    const simulator = new OprfSimulator(
      createOprfPrivateState(7n, 11n, modInverse(7n, JUBJUB_SCALAR_MODULUS) + 1n),
    );

    expect(simulator.run(subject)).toBe(false);
    expect(simulator.getLedger().roundTripAccepted).toBe(false);
  });

  it("produces the same curve point for the same subject", () => {
    const first = pureCircuits.subjectPoint(subject);
    const second = pureCircuits.subjectPoint(subject.slice());

    expect(first).toEqual(second);
  });

  it("does not produce the same curve point for different subjects", () => {
    const otherSubject = subject.slice();
    otherSubject[31] ^= 1;

    expect(pureCircuits.subjectPoint(subject)).not.toEqual(
      pureCircuits.subjectPoint(otherSubject),
    );
  });

  it("passes for a set of non-zero blind scalars and issuer scalars", () => {
    const vectors = [
      [1n, 3n],
      [2n, 5n],
      [13n, 17n],
      [31n, 47n],
      [101n, 103n],
    ] as const;

    for (const [blindingScalar, issuerScalar] of vectors) {
      const simulator = new OprfSimulator(
        stateFor(blindingScalar, issuerScalar),
      );
      expect(simulator.run(subject)).toBe(true);
    }
  });

  it("rejects a subject with the wrong byte width before circuit execution", () => {
    const simulator = new OprfSimulator(stateFor(7n, 11n));

    expect(() => simulator.run(subject.slice(0, 31))).toThrow();
  });
});
