import {
  constructJubjubPoint,
  jubjubPointX,
  jubjubPointY,
  type JubjubPoint,
} from "@midnight-ntwrk/compact-runtime";
import type { DleqProof } from "../contract/managed/thirdmark/contract/index.js";
import { evaluateOprf, issuerPublicKey } from "./oprf.js";

const MAX_DECIMAL_FIELD_LENGTH = 78;

export type PointWire = {
  readonly x: string;
  readonly y: string;
};

export type DleqProofWire = {
  readonly announcementGenerator: PointWire;
  readonly announcementBlinded: PointWire;
  readonly response: string;
};

export type OprfEvaluationWire = {
  readonly evaluatedPoint: PointWire;
  readonly proof: DleqProofWire;
};

export type OprfPublicKeyWire = PointWire;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const decimalField = (value: unknown, name: string): bigint => {
  if (typeof value !== "string" || !/^\d+$/.test(value) || value.length > MAX_DECIMAL_FIELD_LENGTH) {
    throw new Error(`${name} must be a non-negative decimal field string`);
  }
  return BigInt(value);
};

export const parsePointWire = (value: unknown, name: string): JubjubPoint => {
  if (!isRecord(value)) throw new Error(`${name} must be an object`);
  return constructJubjubPoint(
    decimalField(value.x, `${name}.x`),
    decimalField(value.y, `${name}.y`),
  );
};

const pointToWire = (point: JubjubPoint): PointWire => ({
  x: jubjubPointX(point).toString(10),
  y: jubjubPointY(point).toString(10),
});

const proofToWire = (proof: DleqProof): DleqProofWire => ({
  announcementGenerator: pointToWire(proof.announcementGenerator),
  announcementBlinded: pointToWire(proof.announcementBlinded),
  response: proof.response.toString(10),
});

/** Parse the one value the issuer is permitted to receive. */
export const parseBlindedPointRequest = (value: unknown): JubjubPoint => {
  if (!isRecord(value) || !("blindedPoint" in value)) {
    throw new Error("request must contain blindedPoint");
  }
  return parsePointWire(value.blindedPoint, "blindedPoint");
};

export const serializeEvaluation = (
  blindedPoint: JubjubPoint,
  issuerScalar: bigint,
  proofNonce?: bigint,
): OprfEvaluationWire => {
  const evaluation = evaluateOprf(blindedPoint, issuerScalar, proofNonce);
  return {
    evaluatedPoint: pointToWire(evaluation.evaluatedPoint),
    proof: proofToWire(evaluation.proof),
  };
};

export const serializeIssuerPublicKey = (issuerScalar: bigint): OprfPublicKeyWire =>
  pointToWire(issuerPublicKey(issuerScalar));

export const parseEvaluation = (value: unknown): {
  readonly evaluatedPoint: JubjubPoint;
  readonly proof: DleqProof;
} => {
  if (!isRecord(value)) throw new Error("evaluation must be an object");
  const proofValue = value.proof;
  if (!isRecord(proofValue)) throw new Error("evaluation.proof must be an object");
  return {
    evaluatedPoint: parsePointWire(value.evaluatedPoint, "evaluatedPoint"),
    proof: {
      announcementGenerator: parsePointWire(
        proofValue.announcementGenerator,
        "proof.announcementGenerator",
      ),
      announcementBlinded: parsePointWire(
        proofValue.announcementBlinded,
        "proof.announcementBlinded",
      ),
      response: decimalField(proofValue.response, "proof.response"),
    },
  };
};
