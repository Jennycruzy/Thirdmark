import type { JubjubPoint } from "@midnight-ntwrk/compact-runtime";
import {
  beginNigeriaCompanyOprf,
  completeOprf,
  type CompletedOprf,
} from "../../client/oprf.js";
import { parseEvaluation, parsePointWire } from "../../issuer/transport.js";
import { publicAppConfig } from "./config.js";

const pointWire = (point: JubjubPoint) => ({
  x: point.x.toString(10),
  y: point.y.toString(10),
});

const issuerEndpoint = (path: string): URL => {
  if (!publicAppConfig.issuerUrl) {
    throw new Error("The issuer endpoint is not configured for this deployment.");
  }
  return new URL(path, `${publicAppConfig.issuerUrl.replace(/\/$/u, "")}/`);
};

export const configuredIssuerPublicKey = (): JubjubPoint => {
  if (!publicAppConfig.issuerPublicKeyX || !publicAppConfig.issuerPublicKeyY) {
    throw new Error("The sealed issuer public key is not configured for this deployment.");
  }
  return parsePointWire(
    { x: publicAppConfig.issuerPublicKeyX, y: publicAppConfig.issuerPublicKeyY },
    "issuer public key",
  );
};

/**
 * Complete one client-side OPRF round trip. The subject is used only to create
 * the blinded point; it is never included in the issuer request body.
 */
export const deriveCompanySlot = async (rcNumber: string): Promise<CompletedOprf> => {
  const session = await beginNigeriaCompanyOprf(rcNumber);
  const response = await fetch(issuerEndpoint("/v1/oprf/evaluate"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blindedPoint: pointWire(session.blindedPoint) }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("The issuer did not accept the blinded request.");
  return completeOprf(session, configuredIssuerPublicKey(), parseEvaluation(await response.json()));
};
