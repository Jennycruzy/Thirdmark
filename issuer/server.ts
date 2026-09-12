import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { JUBJUB_SCALAR_MODULUS } from "../client/scalars.js";
import {
  parseBlindedPointRequest,
  serializeEvaluation,
  serializeIssuerPublicKey,
} from "./transport.js";

const MAX_REQUEST_BYTES = 4_096;

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const parseIssuerScalar = (value: string): bigint => {
  if (!/^(?:0x)?[0-9a-fA-F]+$/.test(value)) {
    throw new Error("THIRDMARK_ISSUER_SCALAR_HEX must be hexadecimal");
  }
  const scalar = BigInt(value.startsWith("0x") ? value : `0x${value}`);
  if (scalar <= 0n || scalar >= JUBJUB_SCALAR_MODULUS) {
    throw new Error("THIRDMARK_ISSUER_SCALAR_HEX is outside the Jubjub scalar range");
  }
  return scalar;
};

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("request body is too large");
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("request body must be valid JSON");
  }
};

const sendJson = (
  response: ServerResponse,
  status: number,
  body: unknown,
  allowedOrigin: string | undefined,
): void => {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  if (allowedOrigin) response.setHeader("access-control-allow-origin", allowedOrigin);
  response.end(JSON.stringify(body));
};

const requestOriginAllowed = (
  request: IncomingMessage,
  allowedOrigin: string | undefined,
): boolean => !allowedOrigin || request.headers.origin === allowedOrigin;

export const handleIssuerRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  issuerScalar: bigint,
  allowedOrigin?: string,
): Promise<void> => {
    if (!requestOriginAllowed(request, allowedOrigin)) {
      sendJson(response, 403, { error: "origin is not allowed" }, allowedOrigin);
      return;
    }

    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      response.setHeader("access-control-allow-headers", "content-type");
      if (allowedOrigin) response.setHeader("access-control-allow-origin", allowedOrigin);
      response.end();
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, { status: "ok" }, allowedOrigin);
      return;
    }

    if (request.method === "GET" && request.url === "/v1/oprf/public-key") {
      sendJson(response, 200, serializeIssuerPublicKey(issuerScalar), allowedOrigin);
      return;
    }

    if (request.method === "POST" && request.url === "/v1/oprf/evaluate") {
      try {
        const blindedPoint = parseBlindedPointRequest(await readJson(request));
        sendJson(
          response,
          200,
          serializeEvaluation(blindedPoint, issuerScalar),
          allowedOrigin,
        );
      } catch (error) {
        sendJson(
          response,
          400,
          { error: error instanceof Error ? error.message : "invalid OPRF request" },
          allowedOrigin,
        );
      }
      return;
    }

    sendJson(response, 404, { error: "not found" }, allowedOrigin);
};

export const createIssuerServer = (issuerScalar: bigint, allowedOrigin?: string) =>
  createServer((request, response) => {
    void handleIssuerRequest(request, response, issuerScalar, allowedOrigin);
  });

const start = (): void => {
  const issuerScalar = parseIssuerScalar(requiredEnv("THIRDMARK_ISSUER_SCALAR_HEX"));
  const allowedOrigin = process.env.THIRDMARK_ISSUER_ALLOWED_ORIGIN;
  const host = requiredEnv("THIRDMARK_ISSUER_HOST");
  const portValue = requiredEnv("THIRDMARK_ISSUER_PORT");
  if (!/^\d+$/.test(portValue)) throw new Error("THIRDMARK_ISSUER_PORT must be numeric");
  const port = Number(portValue);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("THIRDMARK_ISSUER_PORT is outside the TCP port range");
  }

  const server = createIssuerServer(issuerScalar, allowedOrigin);
  server.listen(port, host, () => {
    // This is operational metadata only; never print the scalar or request data.
    process.stdout.write(`Thirdmark issuer listening on ${host}:${port}\n`);
  });
};

if (import.meta.url === `file://${process.argv[1]}`) start();
