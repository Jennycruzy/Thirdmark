import {
  canonicalNigeriaCompanySubject,
  type NigeriaCompanySubject,
} from "../../client/registry.js";
import { publicAppConfig } from "./config.js";

export type RegistrySearchResult = {
  readonly name: string;
  readonly rcNumber: string;
  readonly status: "active" | "dissolved" | "unknown";
  readonly subject: NigeriaCompanySubject;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseStatus = (value: unknown): RegistrySearchResult["status"] => {
  if (value === "active" || value === "dissolved") return value;
  return "unknown";
};

const parseResults = (value: unknown): RegistrySearchResult[] => {
  const candidates = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.results)
      ? value.results
      : null;
  if (!candidates) throw new Error("the registry adapter returned an invalid result set");

  return candidates.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.name !== "string" || typeof candidate.rcNumber !== "string") {
      throw new Error("the registry adapter returned an invalid company result");
    }
    return {
      name: candidate.name,
      rcNumber: candidate.rcNumber,
      status: parseStatus(candidate.status),
      subject: canonicalNigeriaCompanySubject(candidate.rcNumber),
    };
  });
};

/**
 * Query Thirdmark's explicitly configured registry adapter. This is not a CAC
 * endpoint: the CAC public-search page has no published anonymous autocomplete
 * API. The adapter must be an authorized integration and return the documented
 * `{ results: [{ name, rcNumber, status }] }` shape.
 */
export const searchCompanies = async (query: string): Promise<RegistrySearchResult[]> => {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  if (!publicAppConfig.registryAdapterUrl) {
    throw new Error("Company search is not connected to an authorized registry adapter yet.");
  }

  const endpoint = new URL(publicAppConfig.registryAdapterUrl);
  endpoint.searchParams.set("q", trimmed);
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error("The registry adapter could not be reached.");
  return parseResults(await response.json());
};
