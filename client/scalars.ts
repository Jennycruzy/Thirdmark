/**
 * The Jubjub scalar modulus is defined by the maintained Compact runtime
 * source at c47230c, runtime/src/constants.ts:33-39. Compact runtime 0.15.0
 * does not export the protocol constant; the source discrepancy is recorded
 * in docs/FINDINGS.md.
 */
export const JUBJUB_SCALAR_MODULUS =
  0xe7db4ea6533afa906673b0101343b00a6682093ccc81082d0970e5ed6f72cb7n;

export const modInverse = (value: bigint, modulus: bigint): bigint => {
  if (value <= 0n || value >= modulus) {
    throw new Error("scalar must be non-zero and below the modulus");
  }

  let oldRemainder = value;
  let remainder = modulus;
  let oldCoefficient = 1n;
  let coefficient = 0n;

  while (remainder !== 0n) {
    const quotient = oldRemainder / remainder;
    [oldRemainder, remainder] = [
      remainder,
      oldRemainder - quotient * remainder,
    ];
    [oldCoefficient, coefficient] = [
      coefficient,
      oldCoefficient - quotient * coefficient,
    ];
  }

  if (oldRemainder !== 1n) {
    throw new Error("scalar has no modular inverse");
  }

  return (oldCoefficient % modulus + modulus) % modulus;
};

const bytesToBigInt = (bytes: Uint8Array): bigint => {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
};

/** Generate a uniform non-zero scalar with rejection sampling. */
export const randomJubjubScalar = (): bigint => {
  const bytes = new Uint8Array(32);
  do {
    globalThis.crypto.getRandomValues(bytes);
    const candidate = bytesToBigInt(bytes);
    if (candidate > 0n && candidate < JUBJUB_SCALAR_MODULUS) {
      return candidate;
    }
  } while (true);
};
