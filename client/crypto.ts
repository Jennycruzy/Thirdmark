import {
  convertFieldToBytes,
  type JubjubPoint,
} from "@midnight-ntwrk/compact-runtime";

export const CIPHERTEXT_BYTES = 128 as const;
const IV_BYTES = 12 as const;
const GCM_TAG_BYTES = 16 as const;
export const MAX_REPORT_BYTES =
  CIPHERTEXT_BYTES - IV_BYTES - GCM_TAG_BYTES - 1;

declare const ciphertextBrand: unique symbol;
export type Ciphertext128 = Uint8Array & {
  readonly [ciphertextBrand]: "ThirdmarkCiphertext128";
};

export type ReportAttestation = {
  readonly amountOverdueMinorUnits: string;
  readonly daysLate: number;
  readonly invoiceReference: string;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const asArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
};

const assertCiphertext128 = (value: Uint8Array): Ciphertext128 => {
  if (value.length !== CIPHERTEXT_BYTES) {
    throw new Error(
      `ciphertext must be exactly ${CIPHERTEXT_BYTES} bytes`,
    );
  }
  return value as Ciphertext128;
};

const reportBytes = (report: ReportAttestation): Uint8Array => {
  validateReport(report);
  return textEncoder.encode(JSON.stringify(report));
};

const validateReport = (report: ReportAttestation): void => {
  if (!/^\d+$/.test(report.amountOverdueMinorUnits)) {
    throw new Error("amount must be non-negative minor units");
  }
  if (!Number.isSafeInteger(report.daysLate) || report.daysLate < 90) {
    throw new Error("days late must be an integer of at least 90");
  }
  if (
    report.invoiceReference.length === 0 ||
    report.invoiceReference.length > 256
  ) {
    throw new Error("invoice reference must contain 1 to 256 characters");
  }
};

const deriveAesKey = async (slotSecret: JubjubPoint): Promise<CryptoKey> => {
  const domain = textEncoder.encode("thirdmark:report-key:v1");
  const material = new Uint8Array(domain.length + 64);
  material.set(domain, 0);
  material.set(
    convertFieldToBytes(32, slotSecret.x, "thirdmark-report-key-x"),
    domain.length,
  );
  material.set(
    convertFieldToBytes(32, slotSecret.y, "thirdmark-report-key-y"),
    domain.length + 32,
  );
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    asArrayBuffer(material),
  );
  return globalThis.crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
};

export const encryptReport = async (
  slotSecret: JubjubPoint,
  report: ReportAttestation,
): Promise<Ciphertext128> => {
  const plaintext = reportBytes(report);
  if (plaintext.length > MAX_REPORT_BYTES) {
    throw new Error(
      `report is too large: ${plaintext.length} > ${MAX_REPORT_BYTES} bytes`,
    );
  }

  const key = await deriveAesKey(slotSecret);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
      key,
      asArrayBuffer(plaintext),
    ),
  );
  const envelope = new Uint8Array(CIPHERTEXT_BYTES);
  envelope.set(iv, 0);
  envelope.set(encrypted, IV_BYTES);
  envelope[CIPHERTEXT_BYTES - 1] = encrypted.length;
  return assertCiphertext128(envelope);
};

export const decryptReport = async (
  slotSecret: JubjubPoint,
  ciphertext: Ciphertext128,
): Promise<ReportAttestation> => {
  const checked = assertCiphertext128(ciphertext);
  const encryptedLength = checked[CIPHERTEXT_BYTES - 1];
  if (
    encryptedLength < GCM_TAG_BYTES ||
    IV_BYTES + encryptedLength > CIPHERTEXT_BYTES - 1
  ) {
    throw new Error("ciphertext envelope length is invalid");
  }

  const key = await deriveAesKey(slotSecret);
  const plaintext = await globalThis.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: asArrayBuffer(checked.slice(0, IV_BYTES)),
    },
    key,
    asArrayBuffer(checked.slice(IV_BYTES, IV_BYTES + encryptedLength)),
  );
  const parsed: unknown = JSON.parse(textDecoder.decode(plaintext));
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !(
      "amountOverdueMinorUnits" in parsed &&
      "daysLate" in parsed &&
      "invoiceReference" in parsed
    )
  ) {
    throw new Error("decrypted report has an invalid shape");
  }

  const report = parsed as ReportAttestation;
  validateReport(report);
  return report;
};

export const asCiphertext128 = (value: Uint8Array): Ciphertext128 =>
  assertCiphertext128(value);
