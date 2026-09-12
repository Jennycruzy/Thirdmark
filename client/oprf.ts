import {
  CompactTypeBytes,
  ecMul,
  hashToCurve,
  type JubjubPoint,
} from "@midnight-ntwrk/compact-runtime";
import {
  pureCircuits,
  type DleqProof,
} from "../contract/managed/thirdmark/contract/index.js";
import { nigeriaCompanySubjectBytes } from "./registry.js";
import {
  JUBJUB_SCALAR_MODULUS,
  modInverse,
  randomJubjubScalar,
} from "./scalars.js";

export type OprfClientSession = {
  /** The only value sent to the issuer during the blind request. */
  readonly blindedPoint: JubjubPoint;
  /** Kept in client memory for the response step; never sent to the issuer. */
  readonly unblindingScalar: bigint;
};

export type OprfIssuerEvaluation = {
  readonly evaluatedPoint: JubjubPoint;
  readonly proof: DleqProof;
};

export type CompletedOprf = {
  /** The final OPRF point used to derive the local report-encryption key. */
  readonly slotSecret: JubjubPoint;
  /** The public ledger slot key derived by the Compact circuit. */
  readonly slotKey: Uint8Array;
  /** Witness material retained locally for the subsequent filing call. */
  readonly blindedOprfPoint: JubjubPoint;
  readonly evaluatedOprfPoint: JubjubPoint;
  readonly unblindingScalar: bigint;
  readonly issuerDleqProof: DleqProof;
};

const assertSubjectBytes = (subject: Uint8Array): void => {
  if (subject.length !== 32) {
    throw new Error("OPRF subject must be exactly 32 bytes");
  }
};

const assertScalar = (scalar: bigint, name: string): void => {
  if (scalar <= 0n || scalar >= JUBJUB_SCALAR_MODULUS) {
    throw new Error(`${name} must be non-zero and below the Jubjub modulus`);
  }
};

/** Begin a 2HashDH OPRF request from a fixed-width subject. */
export const beginOprf = (
  subject: Uint8Array,
  blindingScalar = randomJubjubScalar(),
): OprfClientSession => {
  assertSubjectBytes(subject);
  assertScalar(blindingScalar, "blinding scalar");

  const subjectPoint = hashToCurve(new CompactTypeBytes(32), subject);
  return {
    blindedPoint: ecMul(subjectPoint, blindingScalar),
    unblindingScalar: modInverse(blindingScalar, JUBJUB_SCALAR_MODULUS),
  };
};

/** Begin an OPRF request from the selected Wave 1 Nigeria CAC subject. */
export const beginNigeriaCompanyOprf = async (
  rcNumber: string,
  blindingScalar?: bigint,
): Promise<OprfClientSession> =>
  beginOprf(await nigeriaCompanySubjectBytes(rcNumber), blindingScalar);

/**
 * Verify the issuer's DLEQ proof and finish the client-side OPRF response.
 * The generated pure circuit is used here so the browser and Compact verify
 * exactly the same transcript before a filing witness is assembled.
 */
export const completeOprf = (
  session: OprfClientSession,
  issuerKey: JubjubPoint,
  evaluation: OprfIssuerEvaluation,
): CompletedOprf => {
  const valid = pureCircuits.verifyDleq(
    issuerKey,
    session.blindedPoint,
    evaluation.evaluatedPoint,
    evaluation.proof,
  );
  if (!valid) {
    throw new Error("issuer OPRF proof is invalid");
  }

  const slotSecret = ecMul(
    evaluation.evaluatedPoint,
    session.unblindingScalar,
  );
  return {
    slotSecret,
    slotKey: pureCircuits.slotKeyFromPoint(slotSecret),
    blindedOprfPoint: session.blindedPoint,
    evaluatedOprfPoint: evaluation.evaluatedPoint,
    unblindingScalar: session.unblindingScalar,
    issuerDleqProof: evaluation.proof,
  };
};
