import {
  validateReport,
  type ReportAttestation,
} from "./crypto.js";

export const DOSSIER_SCHEMA = "thirdmark.dossier.v1" as const;
export const DOSSIER_RECORD_COUNT = 3 as const;

export type Hex32 = string & { readonly __thirdmarkHex32: unique symbol };

export type DossierTransactionEvidence = {
  readonly txId: string;
  readonly txHash: string;
  readonly blockHeight: number;
  readonly blockHash: string;
  readonly status: string;
};

export type DossierRecordInput = {
  readonly entryKey: Uint8Array;
  readonly filedAt: string;
  readonly attestation: ReportAttestation;
  readonly transaction?: DossierTransactionEvidence;
};

export type DossierRecord = {
  readonly entryKey: Hex32;
  readonly filedAt: string;
  readonly attestation: ReportAttestation;
  readonly transaction?: DossierTransactionEvidence;
};

export type Dossier = {
  readonly schema: typeof DOSSIER_SCHEMA;
  readonly contractAddress: string;
  readonly slotKey: Hex32;
  readonly threshold: number;
  readonly unlockedAt: string;
  readonly records: readonly [DossierRecord, DossierRecord, DossierRecord];
};

export type DossierSigner = {
  readonly reference: string;
  readonly keyPair: CryptoKeyPair;
};

export type DossierSignature = {
  readonly reference: string;
  readonly publicKey: string;
  readonly signature: string;
};

export type SignedDossier = {
  readonly dossier: Dossier;
  readonly signatures: readonly [
    DossierSignature,
    DossierSignature,
    DossierSignature,
  ];
};

const encoder = new TextEncoder();

const asArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const fromHex = (value: string): Uint8Array => {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("expected a 32-byte lowercase hexadecimal value");
  }
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

const asHex32 = (bytes: Uint8Array): Hex32 => {
  if (bytes.length !== 32) {
    throw new Error("dossier keys must be exactly 32 bytes");
  }
  return toHex(bytes) as Hex32;
};

const copyReport = (report: ReportAttestation): ReportAttestation => {
  validateReport(report);
  return {
    amountOverdueMinorUnits: report.amountOverdueMinorUnits,
    daysLate: report.daysLate,
    invoiceReference: report.invoiceReference,
  };
};

const assertNonEmpty = (value: string, field: string): void => {
  if (value.trim().length === 0) {
    throw new Error(`${field} must not be empty`);
  }
};

const assertHash = (value: string, field: string): void => {
  if (!/^[0-9a-f]{64}$/iu.test(value)) {
    throw new Error(`${field} must be a 32-byte hexadecimal value`);
  }
};

const copyTransactionEvidence = (
  evidence: DossierTransactionEvidence | undefined,
): DossierTransactionEvidence | undefined => {
  if (!evidence) return undefined;
  assertNonEmpty(evidence.txId, "transaction ID");
  assertHash(evidence.txHash, "transaction hash");
  assertHash(evidence.blockHash, "block hash");
  if (!Number.isSafeInteger(evidence.blockHeight) || evidence.blockHeight < 0) {
    throw new Error("block height must be a non-negative safe integer");
  }
  assertNonEmpty(evidence.status, "transaction status");
  return {
    txId: evidence.txId,
    txHash: evidence.txHash.toLowerCase(),
    blockHeight: evidence.blockHeight,
    blockHash: evidence.blockHash.toLowerCase(),
    status: evidence.status,
  };
};

const assertInstant = (value: string, field: string): void => {
  assertNonEmpty(value, field);
  if (!value.endsWith("Z") || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be an ISO-8601 UTC instant`);
  }
};

const compareRecords = (left: DossierRecord, right: DossierRecord): number =>
  left.entryKey.localeCompare(right.entryKey);

const compareSignatures = (
  left: DossierSignature,
  right: DossierSignature,
): number => left.reference.localeCompare(right.reference);

const assertDossier = (dossier: Dossier): void => {
  if (dossier.schema !== DOSSIER_SCHEMA) {
    throw new Error("unsupported dossier schema");
  }
  assertNonEmpty(dossier.contractAddress, "contract address");
  fromHex(dossier.slotKey);
  if (!Number.isSafeInteger(dossier.threshold) || dossier.threshold < 2) {
    throw new Error("dossier threshold must be an integer of at least 2");
  }
  if (dossier.threshold !== DOSSIER_RECORD_COUNT) {
    throw new Error(
      `Wave 1 dossiers require exactly ${DOSSIER_RECORD_COUNT} records`,
    );
  }
  assertInstant(dossier.unlockedAt, "unlock time");
  if (dossier.records.length !== DOSSIER_RECORD_COUNT) {
    throw new Error(
      `dossier must contain exactly ${DOSSIER_RECORD_COUNT} records`,
    );
  }

  const entryKeys = new Set<string>();
  for (const record of dossier.records) {
    fromHex(record.entryKey);
    if (entryKeys.has(record.entryKey)) {
      throw new Error("dossier entry keys must be distinct");
    }
    entryKeys.add(record.entryKey);
    assertInstant(record.filedAt, "filing time");
    validateReport(record.attestation);
    if (record.transaction) copyTransactionEvidence(record.transaction);
  }
  const sorted = [...dossier.records].sort(compareRecords);
  if (sorted.some((record, index) => record !== dossier.records[index])) {
    throw new Error("dossier records must be sorted by entry key");
  }
}

export const createDossier = (input: {
  readonly contractAddress: string;
  readonly slotKey: Uint8Array;
  readonly threshold: number;
  readonly unlockedAt: string;
  readonly records: readonly DossierRecordInput[];
}): Dossier => {
  if (input.records.length !== DOSSIER_RECORD_COUNT) {
    throw new Error(
      `dossier requires exactly ${DOSSIER_RECORD_COUNT} records at unlock`,
    );
  }
  const records = input.records
    .map((record) => ({
      entryKey: asHex32(record.entryKey),
      filedAt: record.filedAt,
      attestation: copyReport(record.attestation),
      transaction: copyTransactionEvidence(record.transaction),
    }))
    .sort(compareRecords) as [DossierRecord, DossierRecord, DossierRecord];
  const dossier: Dossier = {
    schema: DOSSIER_SCHEMA,
    contractAddress: input.contractAddress,
    slotKey: asHex32(input.slotKey),
    threshold: input.threshold,
    unlockedAt: input.unlockedAt,
    records,
  };
  assertDossier(dossier);
  return dossier;
};

const dossierJsonValue = (dossier: Dossier): object => {
  assertDossier(dossier);
  return {
    schema: dossier.schema,
    contractAddress: dossier.contractAddress,
    slotKey: dossier.slotKey,
    threshold: dossier.threshold,
    unlockedAt: dossier.unlockedAt,
    records: dossier.records.map((record) => ({
      entryKey: record.entryKey,
      filedAt: record.filedAt,
      ...(record.transaction ? { transaction: record.transaction } : {}),
      attestation: {
        amountOverdueMinorUnits: record.attestation.amountOverdueMinorUnits,
        daysLate: record.attestation.daysLate,
        invoiceReference: record.attestation.invoiceReference,
      },
    })),
  };
};

export const canonicalDossier = (dossier: Dossier): string =>
  JSON.stringify(dossierJsonValue(dossier));

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis
    .btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};

const base64UrlDecode = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("invalid base64url value");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = (4 - (padded.length % 4)) % 4;
  const binary = globalThis.atob(`${padded}${"=".repeat(padding)}`);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const publicKeyBytes = async (publicKey: CryptoKey): Promise<Uint8Array> =>
  new Uint8Array(await globalThis.crypto.subtle.exportKey("raw", publicKey));

const signOne = async (
  dossier: Dossier,
  signer: DossierSigner,
): Promise<DossierSignature> => {
  assertNonEmpty(signer.reference, "signer reference");
  const message = encoder.encode(canonicalDossier(dossier));
  const signature = await globalThis.crypto.subtle.sign(
    { name: "Ed25519" },
    signer.keyPair.privateKey,
    asArrayBuffer(message),
  );
  return {
    reference: signer.reference,
    publicKey: base64UrlEncode(await publicKeyBytes(signer.keyPair.publicKey)),
    signature: base64UrlEncode(new Uint8Array(signature)),
  };
};

export const signDossier = async (
  dossier: Dossier,
  signer: DossierSigner,
): Promise<DossierSignature> => {
  assertDossier(dossier);
  return signOne(dossier, signer);
};

export const coSignDossier = async (
  dossier: Dossier,
  signers: readonly [DossierSigner, DossierSigner, DossierSigner],
): Promise<SignedDossier> => {
  assertDossier(dossier);
  const references = new Set(signers.map((signer) => signer.reference));
  if (references.size !== DOSSIER_RECORD_COUNT) {
    throw new Error("dossier signatures require three distinct references");
  }
  const signatures = (await Promise.all(
    signers.map((signer) => signOne(dossier, signer)),
  )).sort((left, right) => left.reference.localeCompare(right.reference)) as [
    DossierSignature,
    DossierSignature,
    DossierSignature,
  ];
  return { dossier, signatures };
};

export const verifySignedDossier = async (
  signed: SignedDossier,
): Promise<boolean> => {
  try {
    assertDossier(signed.dossier);
    if (signed.signatures.length !== DOSSIER_RECORD_COUNT) {
      return false;
    }
    const references = new Set<string>();
    const message = encoder.encode(canonicalDossier(signed.dossier));
    for (const signature of signed.signatures) {
      if (signature.reference.trim().length === 0) {
        return false;
      }
      if (references.has(signature.reference)) {
        return false;
      }
      references.add(signature.reference);
      const publicKey = await globalThis.crypto.subtle.importKey(
        "raw",
        asArrayBuffer(base64UrlDecode(signature.publicKey)),
        { name: "Ed25519" },
        false,
        ["verify"],
      );
      const valid = await globalThis.crypto.subtle.verify(
        { name: "Ed25519" },
        publicKey,
        asArrayBuffer(base64UrlDecode(signature.signature)),
        asArrayBuffer(message),
      );
      if (!valid) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
};

export const serializeSignedDossier = (signed: SignedDossier): string => {
  assertDossier(signed.dossier);
  if (signed.signatures.length !== DOSSIER_RECORD_COUNT) {
    throw new Error("signed dossier requires three signatures");
  }
  const references = new Set<string>();
  for (const signature of signed.signatures) {
    assertNonEmpty(signature.reference, "signer reference");
    if (references.has(signature.reference)) {
      throw new Error("signed dossier references must be distinct");
    }
    references.add(signature.reference);
  }
  const sortedSignatures = [...signed.signatures].sort(compareSignatures);
  if (
    sortedSignatures.some(
      (signature, index) => signature !== signed.signatures[index],
    )
  ) {
    throw new Error("signed dossier signatures must be sorted by reference");
  }
  return JSON.stringify({
    dossier: dossierJsonValue(signed.dossier),
    signatures: sortedSignatures.map((signature) => ({
      reference: signature.reference,
      publicKey: signature.publicKey,
      signature: signature.signature,
    })),
  });
};

export const parseSignedDossier = (serialized: string): SignedDossier => {
  const parsed: unknown = JSON.parse(serialized);
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("signed dossier must be a JSON object");
  }
  const candidate = parsed as {
    dossier?: unknown;
    signatures?: unknown;
  };
  if (
    candidate.dossier === null ||
    typeof candidate.dossier !== "object" ||
    !Array.isArray(candidate.signatures)
  ) {
    throw new Error("signed dossier has an invalid shape");
  }
  const dossierValue = candidate.dossier as Record<string, unknown>;
  if (
    dossierValue.schema !== DOSSIER_SCHEMA ||
    typeof dossierValue.contractAddress !== "string" ||
    typeof dossierValue.slotKey !== "string" ||
    typeof dossierValue.threshold !== "number" ||
    typeof dossierValue.unlockedAt !== "string" ||
    !Array.isArray(dossierValue.records)
  ) {
    throw new Error("dossier has an invalid shape");
  }
  const records = dossierValue.records.map((value) => {
    if (value === null || typeof value !== "object") {
      throw new Error("dossier record has an invalid shape");
    }
    const record = value as Record<string, unknown>;
    if (
      typeof record.entryKey !== "string" ||
      typeof record.filedAt !== "string" ||
      record.attestation === null ||
      typeof record.attestation !== "object"
    ) {
      throw new Error("dossier record has an invalid shape");
    }
    let transaction: DossierTransactionEvidence | undefined;
    if (record.transaction !== undefined) {
      if (record.transaction === null || typeof record.transaction !== "object") {
        throw new Error("dossier transaction evidence has an invalid shape");
      }
      const evidence = record.transaction as Record<string, unknown>;
      if (
        typeof evidence.txId !== "string" ||
        typeof evidence.txHash !== "string" ||
        typeof evidence.blockHeight !== "number" ||
        typeof evidence.blockHash !== "string" ||
        typeof evidence.status !== "string"
      ) {
        throw new Error("dossier transaction evidence has an invalid shape");
      }
      transaction = {
        txId: evidence.txId,
        txHash: evidence.txHash,
        blockHeight: evidence.blockHeight,
        blockHash: evidence.blockHash,
        status: evidence.status,
      };
    }
    return {
      entryKey: fromHex(record.entryKey),
      filedAt: record.filedAt,
      attestation: record.attestation as ReportAttestation,
      transaction,
    };
  });
  const dossier = createDossier({
    contractAddress: dossierValue.contractAddress,
    slotKey: fromHex(dossierValue.slotKey),
    threshold: dossierValue.threshold,
    unlockedAt: dossierValue.unlockedAt,
    records,
  });
  const signatures = candidate.signatures.map((value) => {
    if (value === null || typeof value !== "object") {
      throw new Error("dossier signature has an invalid shape");
    }
    const signature = value as Record<string, unknown>;
    if (
      typeof signature.reference !== "string" ||
      typeof signature.publicKey !== "string" ||
      typeof signature.signature !== "string"
    ) {
      throw new Error("dossier signature has an invalid shape");
    }
    return {
      reference: signature.reference,
      publicKey: signature.publicKey,
      signature: signature.signature,
    };
  });
  if (signatures.length !== DOSSIER_RECORD_COUNT) {
    throw new Error("signed dossier requires three signatures");
  }
  return {
    dossier,
    signatures: signatures as [
      DossierSignature,
      DossierSignature,
      DossierSignature,
    ],
  };
};
