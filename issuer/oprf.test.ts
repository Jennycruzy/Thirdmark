import { describe, expect, it } from "vitest";
import { ecMulGenerator } from "@midnight-ntwrk/compact-runtime";
import { beginOprf, completeOprf } from "../client/oprf.js";
import { evaluateOprf, issuerPublicKey } from "./oprf.js";
import { JUBJUB_SCALAR_MODULUS } from "../client/scalars.js";

const issuerScalar = 11n;
const subject = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

describe("Thirdmark issuer OPRF", () => {
  it("returns an evaluation that the client verifies and unblinds", () => {
    const session = beginOprf(subject, 7n);
    const result = completeOprf(
      session,
      issuerPublicKey(issuerScalar),
      evaluateOprf(session.blindedPoint, issuerScalar, 13n),
    );

    expect(result.slotKey).toHaveLength(32);
  });

  it("does not expose a subject or slot key in an issuer evaluation", () => {
    const session = beginOprf(subject, 7n);
    const evaluation = evaluateOprf(session.blindedPoint, issuerScalar, 13n);

    expect(evaluation).not.toHaveProperty("subject");
    expect(evaluation).not.toHaveProperty("slotKey");
    expect(evaluation.evaluatedPoint).not.toEqual(session.blindedPoint);
  });

  it("changes only the proof transcript when the proof nonce changes", () => {
    const session = beginOprf(subject, 7n);
    const first = evaluateOprf(session.blindedPoint, issuerScalar, 13n);
    const second = evaluateOprf(session.blindedPoint, issuerScalar, 17n);

    expect(first.evaluatedPoint).toEqual(second.evaluatedPoint);
    expect(first.proof).not.toEqual(second.proof);
  });

  it("rejects an invalid issuer scalar before curve work", () => {
    expect(() => issuerPublicKey(0n)).toThrow(
      "issuer scalar must be non-zero and below the Jubjub modulus",
    );
    expect(() => evaluateOprf(ecMulGenerator(3n), JUBJUB_SCALAR_MODULUS)).toThrow(
      "issuer scalar must be non-zero and below the Jubjub modulus",
    );
  });
});
