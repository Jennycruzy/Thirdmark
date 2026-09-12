/**
 * Wave 1 subject handling for Nigerian CAC-registered companies.
 *
 * The public CAC search calls the company identifier an "RC Number". The
 * value is kept as digits exactly as supplied by CAC; Thirdmark does not
 * invent a width or zero-pad it. The canonical subject adds an explicit
 * jurisdiction and registry domain before it enters the OPRF adapter.
 */

export const NIGERIA_CAC_PUBLIC_SEARCH_URL =
  "https://icrp.cac.gov.ng/public-search/" as const;

export const NIGERIA_CAC = {
  countryCode: "NG",
  registryCode: "CAC",
  entityType: "company",
  identifierType: "RC",
} as const;

export type NigeriaCompanySubject = {
  readonly jurisdiction: typeof NIGERIA_CAC.countryCode;
  readonly registry: typeof NIGERIA_CAC.registryCode;
  readonly entityType: typeof NIGERIA_CAC.entityType;
  readonly identifierType: typeof NIGERIA_CAC.identifierType;
  readonly registrationNumber: string;
  readonly canonical: string;
};

const separators = /[\s./_-]+/g;
const rcPrefix = /^RC/;
const subjectDomain = "thirdmark:subject:v1\0";
const encoder = new TextEncoder();

/**
 * Normalize a CAC company RC number without changing its significant digits.
 *
 * CAC's public search labels this field "RC Number". Users may copy the RC
 * label and ordinary display separators; those are removed. Other CAC
 * identifier families, such as AV codes, are intentionally rejected in Wave 1.
 */
export const normalizeNigeriaRcNumber = (input: string): string => {
  if (typeof input !== "string") {
    throw new TypeError("Nigeria CAC RC number must be text");
  }

  const compact = input.trim().toUpperCase().replace(separators, "");
  const digits = (rcPrefix.test(compact) ? compact.slice(2) : compact);

  if (!/^\d+$/.test(digits)) {
    throw new Error("Nigeria CAC RC number must contain digits only");
  }

  return digits;
};

export const canonicalNigeriaCompanySubject = (
  input: string,
): NigeriaCompanySubject => {
  const registrationNumber = normalizeNigeriaRcNumber(input);
  const canonical = [
    NIGERIA_CAC.countryCode,
    NIGERIA_CAC.registryCode,
    NIGERIA_CAC.entityType,
    NIGERIA_CAC.identifierType,
    registrationNumber,
  ].join(":");

  return {
    jurisdiction: NIGERIA_CAC.countryCode,
    registry: NIGERIA_CAC.registryCode,
    entityType: NIGERIA_CAC.entityType,
    identifierType: NIGERIA_CAC.identifierType,
    registrationNumber,
    canonical,
  };
};

/**
 * Convert the canonical subject into the fixed Bytes<32> input expected by
 * the current Compact OPRF circuit. This prehash is domain-separated and is
 * not a slot key; the OPRF remains the only source of the slot secret.
 */
export const nigeriaCompanySubjectBytes = async (
  input: string,
): Promise<Uint8Array> => {
  const { canonical } = canonicalNigeriaCompanySubject(input);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${subjectDomain}${canonical}`),
  );

  return new Uint8Array(digest);
};
