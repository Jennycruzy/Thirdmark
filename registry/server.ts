import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const CAC_PUBLIC_SEARCH_ORIGIN = "https://icrp.cac.gov.ng";
const MAX_QUERY_LENGTH = 110;
const MAX_RESULTS = 10;

type RegistryStatus = "active" | "dissolved" | "unknown";

export type RegistryResult = {
  readonly name: string;
  readonly rcNumber: string;
  readonly status: RegistryStatus;
};

type CacRecord = {
  readonly approvedName?: unknown;
  readonly rcNumber?: unknown;
  readonly classificationName?: unknown;
  readonly status?: unknown;
};

type CacSearchResponse = {
  readonly data?: unknown;
};

const requiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const sendJson = (
  response: ServerResponse,
  status: number,
  body: unknown,
  requestOrigin: string | undefined,
  allowedOrigin: string,
): void => {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  if (requestOrigin === allowedOrigin) {
    response.setHeader("access-control-allow-origin", allowedOrigin);
    response.setHeader("vary", "Origin");
  }
  response.end(JSON.stringify(body));
};

const requestOriginAllowed = (
  request: IncomingMessage,
  allowedOrigin: string,
): boolean => !request.headers.origin || request.headers.origin === allowedOrigin;

const mapStatus = (value: unknown): RegistryStatus => {
  if (value === "ACTIVE") return "active";
  if (value === "STRUCK OFF") return "dissolved";
  return "unknown";
};

export const parseCacSearchResponse = (value: unknown): RegistryResult[] => {
  if (typeof value !== "object" || value === null) {
    throw new Error("CAC returned an invalid response");
  }
  const records = (value as CacSearchResponse).data;
  if (!Array.isArray(records)) throw new Error("CAC returned an invalid result set");

  const seen = new Set<string>();
  const results: RegistryResult[] = [];
  for (const candidate of records) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const record = candidate as CacRecord;
    if (
      record.classificationName !== "COMPANY" ||
      typeof record.approvedName !== "string" ||
      typeof record.rcNumber !== "string"
    ) continue;
    const name = record.approvedName.trim();
    const rcNumber = record.rcNumber.trim();
    if (!name || !rcNumber || seen.has(rcNumber)) continue;
    seen.add(rcNumber);
    results.push({ name, rcNumber, status: mapStatus(record.status) });
    if (results.length === MAX_RESULTS) break;
  }
  return results;
};

export const searchCacCompanies = async (
  endpoint: string,
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<RegistryResult[]> => {
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > MAX_QUERY_LENGTH) return [];
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("CAC public-search endpoint is invalid");
  }
  if (url.protocol !== "https:") throw new Error("CAC public-search endpoint must use HTTPS");

  const response = await fetcher(url, {
    method: "POST",
    headers: {
      accept: "*/*",
      "content-type": "application/json",
      origin: CAC_PUBLIC_SEARCH_ORIGIN,
      referer: `${CAC_PUBLIC_SEARCH_ORIGIN}/public-search/`,
    },
    body: JSON.stringify({ SearchType: "APPROVED_NAME", searchTerm: trimmed }),
  });
  if (!response.ok) throw new Error(`CAC public search returned HTTP ${response.status}`);
  return parseCacSearchResponse(await response.json());
};

const start = (): void => {
  const endpoint = requiredEnv("THIRDMARK_CAC_PUBLIC_SEARCH_URL");
  const host = requiredEnv("THIRDMARK_REGISTRY_HOST");
  const portValue = requiredEnv("THIRDMARK_REGISTRY_PORT");
  const allowedOrigin = requiredEnv("THIRDMARK_REGISTRY_ALLOWED_ORIGIN");
  if (!/^\d+$/.test(portValue)) throw new Error("THIRDMARK_REGISTRY_PORT must be numeric");
  const port = Number(portValue);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("THIRDMARK_REGISTRY_PORT is outside the TCP port range");
  }

  const server = createServer((request, response) => {
    const requestOrigin = request.headers.origin;
    if (!requestOriginAllowed(request, allowedOrigin)) {
      sendJson(response, 403, { error: "origin is not allowed" }, requestOrigin, allowedOrigin);
      return;
    }
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.setHeader("access-control-allow-origin", allowedOrigin);
      response.setHeader("access-control-allow-methods", "GET, OPTIONS");
      response.setHeader("access-control-allow-headers", "content-type");
      response.end();
      return;
    }
    const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);
    if (request.method === "GET" && requestUrl.pathname === "/health") {
      sendJson(response, 200, { status: "ok" }, requestOrigin, allowedOrigin);
      return;
    }
    if (request.method !== "GET" || requestUrl.pathname !== "/v1/cac/search") {
      sendJson(response, 404, { error: "not found" }, requestOrigin, allowedOrigin);
      return;
    }

    void searchCacCompanies(endpoint, requestUrl.searchParams.get("q") ?? "")
      .then((results) => sendJson(response, 200, { results }, requestOrigin, allowedOrigin))
      .catch((error: unknown) =>
        sendJson(
          response,
          502,
          { error: error instanceof Error ? error.message : "CAC lookup failed" },
          requestOrigin,
          allowedOrigin,
        ),
      );
  });

  server.listen(port, host, () => {
    process.stdout.write(`Thirdmark CAC adapter listening on ${host}:${port}\n`);
  });
};

if (import.meta.url === `file://${process.argv[1]}`) start();
