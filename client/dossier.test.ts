import { describe, expect, it } from "vitest";
import { type ReportAttestation } from "./crypto.js";
import {
  canonicalDossier,
  coSignDossier,
  createDossier,
  parseSignedDossier,
  serializeSignedDossier,
  verifySignedDossier,
  type DossierRecordInput,
  type DossierSigner,
} from "./dossier.js";

const bytes32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(32);
  bytes[31] = value;
  return bytes;
};

const report = (index: number): ReportAttestation => ({
  amountOverdueMinorUnits: `${1000 + index}`,
  daysLate: 90 + index,
  invoiceReference: `INV-SYNTH-${index}`,
});

const transactionEvidence = (index: number) => ({
  txId: `transaction-${index}`,
  txHash: index.toString(16).padStart(2, "0").repeat(32),
  blockHeight: 100 + index,
  blockHash: (index + 3).toString(16).padStart(2, "0").repeat(32),
  status: "SUCCESS",
});

const dossierRecords: DossierRecordInput[] = [
  {
    entryKey: bytes32(3),
    filedAt: "2026-09-12T15:03:00.000Z",
    attestation: report(3),
    transaction: transactionEvidence(3),
  },
  {
    entryKey: bytes32(1),
    filedAt: "2026-09-12T15:01:00.000Z",
    attestation: report(1),
    transaction: transactionEvidence(1),
  },
  {
    entryKey: bytes32(2),
    filedAt: "2026-09-12T15:02:00.000Z",
    attestation: report(2),
    transaction: transactionEvidence(2),
  },
];

const dossierInput = {
  contractAddress: "thirdmark-preprod-contract",
  slotKey: bytes32(99),
  threshold: 3,
  unlockedAt: "2026-09-12T16:00:00.000Z",
  records: dossierRecords,
};

const dossier = createDossier(dossierInput);

const signers = async (): Promise<[
  DossierSigner,
  DossierSigner,
  DossierSigner,
]> => {
  const make = async (reference: string): Promise<DossierSigner> => ({
    reference,
    keyPair: (await globalThis.crypto.subtle.generateKey(
      { name: "Ed25519" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair,
  });
  return [
    await make("supplier-a"),
    await make("supplier-b"),
    await make("supplier-c"),
  ];
};

describe("Thirdmark dossier", () => {
  it("normalizes record order and keeps canonical bytes stable", () => {
    expect(dossier.records.map((record) => record.entryKey)).toEqual([
      "0000000000000000000000000000000000000000000000000000000000000001",
      "0000000000000000000000000000000000000000000000000000000000000002",
      "0000000000000000000000000000000000000000000000000000000000000003",
    ]);
    expect(canonicalDossier(dossier)).toContain('"schema":"thirdmark.dossier.v1"');
  });

  it("requires exactly three distinct records", () => {
    expect(() =>
      createDossier({
        ...dossierInput,
        records: dossierRecords.slice(0, 2),
      }),
    ).toThrow("requires exactly 3 records");

    expect(() =>
      createDossier({
        ...dossierInput,
        records: [1, 1, 2].map(
          (index) => dossierRecords[index - 1],
        ),
      }),
    ).toThrow("entry keys must be distinct");
  });

  it("co-signs, serializes, parses, and verifies independently", async () => {
    const signed = await coSignDossier(dossier, await signers());
    const serialized = serializeSignedDossier(signed);
    const parsed = parseSignedDossier(serialized);

    expect(await verifySignedDossier(parsed)).toBe(true);
    expect(await verifySignedDossier(JSON.parse(serialized))).toBe(true);
    expect(parsed.dossier.records[0].transaction?.blockHeight).toBe(101);
  });

  it("rejects tampering with a report or a signature", async () => {
    const signed = await coSignDossier(dossier, await signers());
    const tampered = {
      ...signed,
      dossier: {
        ...signed.dossier,
        records: signed.dossier.records.map((record, index) =>
          index === 0
            ? {
                ...record,
                attestation: { ...record.attestation, daysLate: 365 },
              }
            : record,
        ) as unknown as typeof signed.dossier.records,
      },
    };
    expect(await verifySignedDossier(tampered)).toBe(false);

    const badSignature = {
      ...signed,
      signatures: signed.signatures.map((signature, index) =>
        index === 0
          ? {
              ...signature,
              signature: `${signature.signature[0] === "A" ? "B" : "A"}${signature.signature.slice(1)}`,
            }
          : signature,
      ) as unknown as typeof signed.signatures,
    };
    expect(await verifySignedDossier(badSignature)).toBe(false);
  });

  it("rejects a serialized dossier with a changed schema", async () => {
    const signed = await coSignDossier(dossier, await signers());
    const parsed = JSON.parse(serializeSignedDossier(signed)) as {
      dossier: { schema: string };
    };
    parsed.dossier.schema = "thirdmark.dossier.v2";

    expect(() => parseSignedDossier(JSON.stringify(parsed))).toThrow(
      "dossier has an invalid shape",
    );
  });

  it("rejects duplicate signer references", async () => {
    const original = await signers();
    const duplicate: [DossierSigner, DossierSigner, DossierSigner] = [
      original[0],
      original[0],
      original[2],
    ];
    await expect(coSignDossier(dossier, duplicate)).rejects.toThrow(
      "three distinct references",
    );
  });
});
