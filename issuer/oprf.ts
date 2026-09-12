import {
  ecMul,
  ecMulGenerator,
  type JubjubPoint,
} from "@midnight-ntwrk/compact-runtime";
import {
  pureCircuits,
  type DleqProof,
} from "../contract/managed/thirdmark/contract/index.js";
import {
  JUBJUB_SCALAR_MODULUS,
  randomJubjubScalar,
} from "../client/scalars.js";
import type { OprfIssuerEvaluation } from "../client/oprf.js";

const assertScalar = (scalar: bigint, name: string): void => {
  if (scalar <= 0n || scalar >= JUBJUB_SCALAR_MODULUS) {
    throw new Error(`${name} must be non-zero and below the Jubjub modulus`);
  }
};

/** The public key that must be sealed into the deployed contract. */
export const issuerPublicKey = (issuerScalar: bigint): JubjubPoint => {
  assertScalar(issuerScalar, "issuer scalar");
  return ecMulGenerator(issuerScalar);
};

/**
 * Apply the issuer's secret scalar to a blinded point and return a
 * Chaum–Pedersen proof of the shared discrete-log relation.
 *
 * The caller must receive only the blinded point. This function never accepts
 * or derives a subject identifier, report, slot key, or filer secret.
 */
export const evaluateOprf = (
  blindedPoint: JubjubPoint,
  issuerScalar: bigint,
  proofNonce = randomJubjubScalar(),
): OprfIssuerEvaluation => {
  assertScalar(issuerScalar, "issuer scalar");
  assertScalar(proofNonce, "proof nonce");

  const evaluatedPoint = ecMul(blindedPoint, issuerScalar);
  const proof: DleqProof = {
    announcementGenerator: ecMulGenerator(proofNonce),
    announcementBlinded: ecMul(blindedPoint, proofNonce),
    response: 0n,
  };
  const challenge = pureCircuits.dleqChallenge(
    issuerPublicKey(issuerScalar),
    blindedPoint,
    evaluatedPoint,
    proof.announcementGenerator,
    proof.announcementBlinded,
  );
  proof.response =
    (proofNonce + (challenge * issuerScalar) % JUBJUB_SCALAR_MODULUS) %
    JUBJUB_SCALAR_MODULUS;

  return { evaluatedPoint, proof };
};
