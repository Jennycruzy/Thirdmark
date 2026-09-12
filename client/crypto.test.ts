import { describe, expect, it } from "vitest";
import { ecMulGenerator } from "@midnight-ntwrk/compact-runtime";
import {
  asCiphertext128,
  CIPHERTEXT_BYTES,
  decryptReport,
  encryptReport,
  MAX_REPORT_BYTES,
  type ReportAttestation,
} from "./crypto.js";

const slotSecret = ecMulGenerator(17n);
const report: ReportAttestation = {
  amountOverdueMinorUnits: "1250000",
  daysLate: 117,
  invoiceReference: "INV-SYNTH-001",
};

describe("Thirdmark client report encryption", () => {
  it("round-trips a report through the fixed-width AES-GCM envelope", async () => {
    const ciphertext = await encryptReport(slotSecret, report);

    expect(ciphertext).toHaveLength(CIPHERTEXT_BYTES);
    expect(await decryptReport(slotSecret, ciphertext)).toEqual(report);
  });

  it("randomizes envelopes for the same report and slot", async () => {
    const first = await encryptReport(slotSecret, report);
    const second = await encryptReport(slotSecret, report);

    expect(first).not.toEqual(second);
    expect(await decryptReport(slotSecret, first)).toEqual(report);
    expect(await decryptReport(slotSecret, second)).toEqual(report);
  });

  it("does not decrypt with a different slot secret", async () => {
    const ciphertext = await encryptReport(slotSecret, report);

    await expect(
      decryptReport(ecMulGenerator(19n), ciphertext),
    ).rejects.toThrow();
  });

  it("rejects a wrong envelope width at the boundary", async () => {
    const ciphertext = await encryptReport(slotSecret, report);
    const truncated = ciphertext.slice(0, CIPHERTEXT_BYTES - 1);

    expect(() => asCiphertext128(truncated)).toThrow(
      `ciphertext must be exactly ${CIPHERTEXT_BYTES} bytes`,
    );
  });

  it("rejects malformed envelope lengths before decryption", async () => {
    const ciphertext = await encryptReport(slotSecret, report);
    const malformed = ciphertext.slice();
    malformed[CIPHERTEXT_BYTES - 1] = 0;

    await expect(decryptReport(slotSecret, asCiphertext128(malformed))).rejects.toThrow(
      "ciphertext envelope length is invalid",
    );
  });

  it("enforces the late-payment report constraints", async () => {
    await expect(
      encryptReport(slotSecret, {
        ...report,
        daysLate: 89,
      }),
    ).rejects.toThrow("days late must be an integer of at least 90");

    await expect(
      encryptReport(slotSecret, {
        ...report,
        amountOverdueMinorUnits: "12.50",
      }),
    ).rejects.toThrow("amount must be non-negative minor units");

    await expect(
      encryptReport(slotSecret, {
        ...report,
        invoiceReference: "x".repeat(257),
      }),
    ).rejects.toThrow("invoice reference must contain 1 to 256 characters");
  });

  it("rejects a plaintext report that exceeds the envelope capacity", async () => {
    await expect(
      encryptReport(slotSecret, {
        ...report,
        invoiceReference: "x".repeat(MAX_REPORT_BYTES),
      }),
    ).rejects.toThrow("report is too large");
  });
});
