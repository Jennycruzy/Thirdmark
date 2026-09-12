import { describe, expect, it } from "vitest";
import { constructJubjubPoint } from "@midnight-ntwrk/compact-runtime";
import { beginOprf, completeOprf } from "../client/oprf.js";
import { issuerPublicKey } from "./oprf.js";
import {
  parseBlindedPointRequest,
  parseEvaluation,
  serializeEvaluation,
  serializeIssuerPublicKey,
} from "./transport.js";
import { handleIssuerRequest } from "./server.js";

const issuerScalar = 11n;
const subject = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

class FakeResponse {
  statusCode = 0;
  readonly headers = new Map<string, string | number>();
  body = "";

  setHeader(name: string, value: string | number): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  end(body?: string): this {
    this.body = body ?? "";
    return this;
  }
}

const fakeRequest = (options: {
  readonly method: string;
  readonly url: string;
  readonly origin?: string;
  readonly body?: string;
}) => {
  const request = {
    method: options.method,
    url: options.url,
    headers: options.origin ? { origin: options.origin } : {},
    async *[Symbol.asyncIterator](): AsyncGenerator<Buffer> {
      if (options.body !== undefined) yield Buffer.from(options.body, "utf8");
    },
  };
  return request as never;
};

describe("Thirdmark issuer transport", () => {
  it("round-trips wire points without changing the OPRF result", () => {
    const session = beginOprf(subject, 7n);
    const wire = serializeEvaluation(session.blindedPoint, issuerScalar, 13n);
    const parsed = parseEvaluation(wire);
    const completed = completeOprf(session, issuerPublicKey(issuerScalar), parsed);

    expect(completed.slotKey).toHaveLength(32);
    expect(serializeIssuerPublicKey(issuerScalar)).toEqual({
      x: issuerPublicKey(issuerScalar).x.toString(10),
      y: issuerPublicKey(issuerScalar).y.toString(10),
    });
  });

  it("accepts only the blinded point request shape", () => {
    const point = constructJubjubPoint(12n, 34n);
    expect(parseBlindedPointRequest({ blindedPoint: { x: "12", y: "34" } })).toEqual(point);
    expect(() => parseBlindedPointRequest({ subject: "RC-1" })).toThrow(
      "request must contain blindedPoint",
    );
    expect(() => parseBlindedPointRequest({ blindedPoint: { x: "-1", y: "34" } })).toThrow(
      "blindedPoint.x must be a non-negative decimal field string",
    );
  });

  it("serves the HTTP protocol without exposing issuer inputs", async () => {
    const healthResponse = new FakeResponse();
    await handleIssuerRequest(
      fakeRequest({ method: "GET", url: "/health", origin: "http://localhost:5173" }),
      healthResponse as never,
      issuerScalar,
      "http://localhost:5173",
    );
    expect(healthResponse.statusCode).toBe(200);
    expect(JSON.parse(healthResponse.body)).toEqual({ status: "ok" });

    const publicKeyResponse = new FakeResponse();
    await handleIssuerRequest(
      fakeRequest({ method: "GET", url: "/v1/oprf/public-key", origin: "http://localhost:5173" }),
      publicKeyResponse as never,
      issuerScalar,
      "http://localhost:5173",
    );
    expect(publicKeyResponse.statusCode).toBe(200);
    expect(JSON.parse(publicKeyResponse.body)).toEqual(serializeIssuerPublicKey(issuerScalar));

    const session = beginOprf(subject, 7n);
    const evaluationResponse = new FakeResponse();
    await handleIssuerRequest(
      fakeRequest({
        method: "POST",
        url: "/v1/oprf/evaluate",
        origin: "http://localhost:5173",
        body: JSON.stringify({
          blindedPoint: {
            x: session.blindedPoint.x.toString(10),
            y: session.blindedPoint.y.toString(10),
          },
          subject: "must be ignored by the server contract",
        }),
      }),
      evaluationResponse as never,
      issuerScalar,
      "http://localhost:5173",
    );
    expect(evaluationResponse.statusCode).toBe(200);
    const evaluation = parseEvaluation(JSON.parse(evaluationResponse.body));
    expect(completeOprf(session, issuerPublicKey(issuerScalar), evaluation).slotKey).toHaveLength(32);

    const blockedResponse = new FakeResponse();
    await handleIssuerRequest(
      fakeRequest({ method: "GET", url: "/health", origin: "http://not-allowed.example" }),
      blockedResponse as never,
      issuerScalar,
      "http://localhost:5173",
    );
    expect(blockedResponse.statusCode).toBe(403);

    const oversizedResponse = new FakeResponse();
    await handleIssuerRequest(
      fakeRequest({
        method: "POST",
        url: "/v1/oprf/evaluate",
        origin: "http://localhost:5173",
        body: JSON.stringify({ blindedPoint: { x: "1", y: "2" }, padding: "x".repeat(5_000) }),
      }),
      oversizedResponse as never,
      issuerScalar,
      "http://localhost:5173",
    );
    expect(oversizedResponse.statusCode).toBe(400);
    expect(JSON.parse(oversizedResponse.body)).toEqual({ error: "request body is too large" });
  });
});
