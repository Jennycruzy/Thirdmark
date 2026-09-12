import { describe, expect, it } from "vitest";
import { ecMul, ecMulGenerator } from "@midnight-ntwrk/compact-runtime";
import { pureCircuits } from "../../managed/thirdmark/contract/index.js";
import {
  advancePrivateState,
  createPrivateState,
  JUBJUB_SCALAR_MODULUS,
  makeOprfMaterial,
  ThirdmarkSimulator,
} from "./thirdmark-simulator.js";

const issuerSecret = 11n;
const issuerKey = ecMulGenerator(issuerSecret);
const subject = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const ciphertext = (value: number): Uint8Array => {
  const result = new Uint8Array(128);
  result[0] = value;
  return result;
};

const randomBytes = (length: number): Uint8Array => {
  const result = new Uint8Array(length);
  crypto.getRandomValues(result);
  return result;
};

const randomScalar = (): bigint => {
  let result = 0n;
  do {
    const bytes = randomBytes(30);
    result = bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
  } while (result === 0n);
  return result;
};

const state = (
  secret: number,
  blindingScalar: bigint,
  proofNonce: bigint,
  salt: number,
) =>
  createPrivateState(
    Uint8Array.from({ length: 32 }, (_, index) => (index + secret) & 0xff),
    subject,
    issuerSecret,
    blindingScalar,
    proofNonce,
    Uint8Array.from({ length: 32 }, (_, index) => (index + salt) & 0xff),
  );

describe("Thirdmark OPRF authentication", () => {
  it("accepts an issuer DLEQ proof for a blinded evaluation", () => {
    const privateState = state(1, 7n, 13n, 1);
    expect(
      pureCircuits.verifyDleq(
        issuerKey,
        privateState.blindedOprfPoint,
        privateState.evaluatedOprfPoint,
        privateState.issuerDleqProof,
      ),
    ).toBe(true);
  });

  it("rejects a proof with a changed response", () => {
    const privateState = state(1, 7n, 13n, 1);
    expect(
      pureCircuits.verifyDleq(
        issuerKey,
        privateState.blindedOprfPoint,
        privateState.evaluatedOprfPoint,
        {
          ...privateState.issuerDleqProof,
          response:
            (privateState.issuerDleqProof.response + 1n) %
            JUBJUB_SCALAR_MODULUS,
        },
      ),
    ).toBe(false);
  });

  it("rejects an evaluation produced with a different issuer scalar", () => {
    const privateState = state(1, 7n, 13n, 1);
    const forged = makeOprfMaterial(subject, 17n, 7n, 13n);
    expect(
      pureCircuits.verifyDleq(
        issuerKey,
        forged.blindedOprfPoint,
        forged.evaluatedOprfPoint,
        forged.issuerDleqProof,
      ),
    ).toBe(false);
    expect(privateState.evaluatedOprfPoint).not.toEqual(
      forged.evaluatedOprfPoint,
    );
  });

  it("derives one slot key for the same subject under different blinds", () => {
    const first = makeOprfMaterial(subject, issuerSecret, 7n, 13n);
    const second = makeOprfMaterial(subject, issuerSecret, 19n, 23n);
    const firstPoint = ecMul(first.evaluatedOprfPoint, first.unblindingScalar);
    const secondPoint = ecMul(
      second.evaluatedOprfPoint,
      second.unblindingScalar,
    );

    expect(first.blindedOprfPoint).not.toEqual(second.blindedOprfPoint);
    expect(pureCircuits.slotKeyFromPoint(firstPoint)).toEqual(
      pureCircuits.slotKeyFromPoint(secondPoint),
    );
  });

  it("does not make different subjects share a slot key", () => {
    const otherSubject = subject.slice();
    otherSubject[31] ^= 1;
    const first = makeOprfMaterial(subject, issuerSecret, 7n, 13n);
    const second = makeOprfMaterial(otherSubject, issuerSecret, 19n, 23n);
    const firstPoint = ecMul(first.evaluatedOprfPoint, first.unblindingScalar);
    const secondPoint = ecMul(
      second.evaluatedOprfPoint,
      second.unblindingScalar,
    );

    expect(pureCircuits.slotKeyFromPoint(firstPoint)).not.toEqual(
      pureCircuits.slotKeyFromPoint(secondPoint),
    );
  });

  it("preserves slot and nullifier derivation properties across random inputs", () => {
    for (let index = 0; index < 8; index += 1) {
      const randomSubject = randomBytes(32);
      const first = makeOprfMaterial(
        randomSubject,
        issuerSecret,
        randomScalar(),
        randomScalar(),
      );
      const second = makeOprfMaterial(
        randomSubject,
        issuerSecret,
        randomScalar(),
        randomScalar(),
      );
      const firstPoint = ecMul(first.evaluatedOprfPoint, first.unblindingScalar);
      const secondPoint = ecMul(second.evaluatedOprfPoint, second.unblindingScalar);
      const slotKey = pureCircuits.slotKeyFromPoint(firstPoint);
      const filerSecret = randomBytes(32);

      expect(pureCircuits.slotKeyFromPoint(secondPoint)).toEqual(slotKey);
      expect(pureCircuits.filerNullifier(filerSecret, slotKey)).toEqual(
        pureCircuits.filerNullifier(filerSecret.slice(), slotKey.slice()),
      );

      const changedSecret = filerSecret.slice();
      changedSecret[0] ^= 1;
      expect(pureCircuits.filerNullifier(changedSecret, slotKey)).not.toEqual(
        pureCircuits.filerNullifier(filerSecret, slotKey),
      );
    }
  });
});

describe("Thirdmark filing simulator", () => {
  it("keeps the first two filings sealed and unlocks exactly on the third", () => {
    const first = state(1, 7n, 13n, 1);
    const second = state(2, 19n, 23n, 41);
    const third = state(3, 31n, 37n, 81);
    const simulator = new ThirdmarkSimulator(issuerKey, 3n, first);

    const firstPoint = ecMul(
      first.evaluatedOprfPoint,
      first.unblindingScalar,
    );
    const slotKey = pureCircuits.slotKeyFromPoint(firstPoint);

    expect(simulator.file(ciphertext(1))).toBe(false);
    let ledger = simulator.getLedger();
    expect(ledger.slotFilled.lookup(slotKey)).toBe(1n);
    expect(ledger.unlocked.member(slotKey)).toBe(false);
    expect(ledger.entries.size()).toBe(1n);

    simulator.setPrivateState(second);
    expect(simulator.file(ciphertext(2))).toBe(false);
    ledger = simulator.getLedger();
    expect(ledger.slotFilled.lookup(slotKey)).toBe(2n);
    expect(ledger.unlocked.member(slotKey)).toBe(false);

    simulator.setPrivateState(third);
    expect(simulator.file(ciphertext(3))).toBe(true);
    ledger = simulator.getLedger();
    expect(ledger.slotFilled.lookup(slotKey)).toBe(3n);
    expect(ledger.unlocked.member(slotKey)).toBe(true);
  });

  it("blocks a filer from filing twice even with a new ciphertext", () => {
    const first = state(1, 7n, 13n, 1);
    const simulator = new ThirdmarkSimulator(issuerKey, 3n, first);
    const slotKey = pureCircuits.slotKeyFromPoint(
      ecMul(first.evaluatedOprfPoint, first.unblindingScalar),
    );

    expect(simulator.file(ciphertext(1))).toBe(false);
    simulator.setPrivateState(
      advancePrivateState(first, slotKey, first.nextHistorySalt),
    );
    expect(() => simulator.file(ciphertext(2))).toThrow(
      "this filer already filed on this slot",
    );
  });

  it("blocks a stale private history opening", () => {
    const first = state(1, 7n, 13n, 1);
    const otherSubject = subject.slice();
    otherSubject[31] ^= 1;
    const simulator = new ThirdmarkSimulator(issuerKey, 3n, first);
    const slotKey = pureCircuits.slotKeyFromPoint(
      ecMul(first.evaluatedOprfPoint, first.unblindingScalar),
    );

    expect(simulator.file(ciphertext(1))).toBe(false);
    // The public commitment has advanced, but the witness is deliberately
    // stale while the filer attempts a different slot. The evolving private
    // state must reject this opening before it can mutate the second slot.
    simulator.setPrivateState({
      ...first,
      ...makeOprfMaterial(otherSubject, issuerSecret, 19n, 23n),
    });
    expect(() => simulator.file(ciphertext(2))).toThrow(
      "stale history commitment",
    );
    expect(simulator.getLedger().slotFilled.lookup(slotKey)).toBe(1n);
  });

  it("blocks exact ciphertext replay by a different filer", () => {
    const first = state(1, 7n, 13n, 1);
    const second = state(2, 19n, 23n, 41);
    const simulator = new ThirdmarkSimulator(issuerKey, 3n, first);
    const firstCiphertext = ciphertext(9);

    expect(simulator.file(firstCiphertext)).toBe(false);
    simulator.setPrivateState(second);
    expect(() => simulator.file(firstCiphertext)).toThrow(
      "ciphertext has already been filed",
    );
  });

  it("rejects an invalid issuer proof before mutating ledger state", () => {
    const first = state(1, 7n, 13n, 1);
    const simulator = new ThirdmarkSimulator(issuerKey, 3n, {
      ...first,
      issuerDleqProof: {
        ...first.issuerDleqProof,
        response: first.issuerDleqProof.response + 1n,
      },
    });

    expect(() => simulator.file(ciphertext(1))).toThrow(
      "invalid issuer OPRF proof",
    );
    expect(simulator.getLedger().entries.size()).toBe(0n);
  });

  it("does not expose a below-threshold count through unlock state", () => {
    const first = state(1, 7n, 13n, 1);
    const second = state(2, 19n, 23n, 41);
    const simulator = new ThirdmarkSimulator(issuerKey, 3n, first);
    const slotKey = pureCircuits.slotKeyFromPoint(
      ecMul(first.evaluatedOprfPoint, first.unblindingScalar),
    );

    expect(simulator.file(ciphertext(1))).toBe(false);
    simulator.setPrivateState(second);
    expect(simulator.file(ciphertext(2))).toBe(false);
    expect(simulator.getLedger().unlocked.member(slotKey)).toBe(false);
    expect(simulator.getLedger().slotFilled.lookup(slotKey)).toBe(2n);
  });

  it("rejects malformed widths before a circuit can run", () => {
    const privateState = state(1, 7n, 13n, 1);
    const simulator = new ThirdmarkSimulator(issuerKey, 3n, privateState);
    expect(() => simulator.file(new Uint8Array(127))).toThrow();
  });

  it("uses a fresh history salt for every private-state transition", () => {
    const first = state(1, 7n, 13n, 1);
    const otherSubject = subject.slice();
    otherSubject[31] ^= 1;
    const simulator = new ThirdmarkSimulator(issuerKey, 3n, first);
    const slotKey = pureCircuits.slotKeyFromPoint(
      ecMul(first.evaluatedOprfPoint, first.unblindingScalar),
    );
    expect(simulator.file(ciphertext(1))).toBe(false);

    const repeatedSalt = first.nextHistorySalt;
    const advanced = advancePrivateState(first, slotKey, repeatedSalt);
    simulator.setPrivateState({
      ...advanced,
      nextHistorySalt: repeatedSalt,
      ...makeOprfMaterial(otherSubject, issuerSecret, 43n, 47n),
    });

    expect(() => simulator.file(ciphertext(2))).toThrow(
      "history commitment salt was reused",
    );
  });
});
