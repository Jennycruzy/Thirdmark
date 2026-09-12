import { describe, expect, it } from "vitest";
import {
  ecMul,
  ecMulGenerator,
  hashToCurve,
  CompactTypeBytes,
  type JubjubPoint,
} from "@midnight-ntwrk/compact-runtime";
import {
  pureCircuits,
  type DleqProof,
} from "../contract/managed/thirdmark/contract/index.js";
import { beginNigeriaCompanyOprf, beginOprf, completeOprf } from "./oprf.js";
import { JUBJUB_SCALAR_MODULUS } from "./scalars.js";

const issuerScalar = 11n;
const issuerKey = ecMulGenerator(issuerScalar);
const subject = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

const issue = (
  blindedPoint: JubjubPoint,
  nonce: bigint,
  scalar = issuerScalar,
): { evaluatedPoint: JubjubPoint; proof: DleqProof } => {
  const evaluatedPoint = ecMul(blindedPoint, scalar);
  const proof = {
    announcementGenerator: ecMulGenerator(nonce),
    announcementBlinded: ecMul(blindedPoint, nonce),
    response: 0n,
  };
  const challenge = pureCircuits.dleqChallenge(
    ecMulGenerator(scalar),
    blindedPoint,
    evaluatedPoint,
    proof.announcementGenerator,
    proof.announcementBlinded,
  );
  proof.response =
    (nonce + (challenge * scalar) % JUBJUB_SCALAR_MODULUS) %
    JUBJUB_SCALAR_MODULUS;
  return { evaluatedPoint, proof };
};

describe("Thirdmark client OPRF", () => {
  it("completes a blinded request and derives the Compact slot key", () => {
    const session = beginOprf(subject, 7n);
    const result = completeOprf(session, issuerKey, issue(session.blindedPoint, 13n));

    expect(result.slotKey).toHaveLength(32);
    expect(result.slotSecret).toEqual(
      ecMul(hashToCurve(new CompactTypeBytes(32), subject), issuerScalar),
    );
  });

  it("derives the same slot for the same subject under different blinds", () => {
    const first = beginOprf(subject, 7n);
    const second = beginOprf(subject, 19n);

    const firstResult = completeOprf(first, issuerKey, issue(first.blindedPoint, 13n));
    const secondResult = completeOprf(
      second,
      issuerKey,
      issue(second.blindedPoint, 17n),
    );

    expect(first.blindedPoint).not.toEqual(second.blindedPoint);
    expect(firstResult.slotKey).toEqual(secondResult.slotKey);
  });

  it("separates different subjects", () => {
    const first = beginOprf(subject, 7n);
    const otherSubject = subject.slice();
    otherSubject[31] ^= 1;
    const second = beginOprf(otherSubject, 7n);

    const firstResult = completeOprf(first, issuerKey, issue(first.blindedPoint, 13n));
    const secondResult = completeOprf(
      second,
      issuerKey,
      issue(second.blindedPoint, 17n),
    );

    expect(firstResult.slotKey).not.toEqual(secondResult.slotKey);
  });

  it("rejects a forged issuer evaluation", () => {
    const session = beginOprf(subject, 7n);
    const valid = issue(session.blindedPoint, 13n);
    const forged = {
      evaluatedPoint: ecMul(session.blindedPoint, 17n),
      proof: valid.proof,
    };

    expect(() => completeOprf(session, issuerKey, forged)).toThrow(
      "issuer OPRF proof is invalid",
    );
  });

  it("uses the same canonical subject for CAC RC display variants", async () => {
    const first = await beginNigeriaCompanyOprf("RC-001234", 7n);
    const second = await beginNigeriaCompanyOprf("001234", 19n);

    const firstResult = completeOprf(first, issuerKey, issue(first.blindedPoint, 13n));
    const secondResult = completeOprf(
      second,
      issuerKey,
      issue(second.blindedPoint, 17n),
    );

    expect(firstResult.slotKey).toEqual(secondResult.slotKey);
  });

  it("rejects an invalid subject width and scalar", () => {
    expect(() => beginOprf(subject.slice(0, 31), 7n)).toThrow(
      "OPRF subject must be exactly 32 bytes",
    );
    expect(() => beginOprf(subject, 0n)).toThrow(
      "blinding scalar must be non-zero and below the Jubjub modulus",
    );
    expect(() => beginOprf(subject, JUBJUB_SCALAR_MODULUS)).toThrow(
      "blinding scalar must be non-zero and below the Jubjub modulus",
    );
  });
});
