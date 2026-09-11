# Architecture

## Public and private sides

Compact ledger state is public. Corroborate therefore stores no report plaintext or raw company identifier in ledger state. The contract state is designed as:

```text
filed       Set<Bytes<32>>            filer nullifiers
entries     Map<Bytes<32>, Bytes<N>>   entry key -> opaque ciphertext
slotFilled  Map<Bytes<32>, Uint<8>>    slot key -> aggregate count
unlocked    Set<Bytes<32>>             slot keys whose threshold predicate is true
history     Map<Bytes<32>, Bytes<32>>  filer id -> latest history commitment
```

The final widths and the exact Compact types must be fixed from the compiler and runtime source before contract code is written. `Bytes<N>` must match the client AES-GCM envelope exactly.

## Key derivation

The company registration number is resolved by a single Wave 1 registry and normalized to one canonical representation. A free-text company name is never hashed directly. The slot derivation is:

```text
P         = hashToCurve(canonicalSubject)
P_blind   = ecMul(P, r)
P_issuer  = ecMul(P_blind, k)
r_inverse = client-side modular inverse of r
P_final   = ecMul(P_issuer, r_inverse)
slotKey   = persistentHash([pad(32, "corroborate:slot:v1"), P_final.x, P_final.y])
```

Compact 0.31 exposes `ecMul` for `JubjubScalar` but does not expose arithmetic or `inv` for that type. The client must compute `r_inverse` with a source-backed Jubjub scalar modulus from the Midnight runtime, then pass the inverse scalar to an `ecMul`-based unblinding circuit. The scratch circuit must prove the two group multiplications and the resulting point equality before product code is written. No scalar modulus is hardcoded.

The issuer receives only the blinded point and applies its secret. It can rate-limit or refuse service, but it must not receive the canonical identifier. An adversary who learns the exact slot key can still probe the public ledger; that count leak is the same problem as subject derivation because the ledger has no enumeration or prefix-scan API.

## Filing and history

For a filer secret `sk` and slot key `slotKey`:

```text
filerNullifier = persistentHash([pad(32, "corroborate:nullifier:v1"), sk, slotKey])
entryKey       = persistentHash([pad(32, "corroborate:entry:v1"), slotKey, index])
historyCommit  = persistentCommit(privateFilingHistory, freshSalt)
```

The nullifier is a public anti-replay guard. The private filing-history witness is the scored private-state feature: the circuit proves the new slot is not already in the history, appends it, and commits with a fresh salt. Both guards remain because they protect against different failure modes. A stale history commitment must fail; a repeated salt must never be accepted as a construction detail.

## Threshold transition

The contract discloses only the boolean threshold predicate at the point it controls public state. It inserts the ciphertext and updates the aggregate count only after checking the nullifier and history opening. It adds the slot to `unlocked` only when the count reaches the product threshold. No circuit returns a below-threshold count or exposes a filer identity.

Insertion order must not carry information. The three records are indexed by anonymous entry keys and are retrieved by the authorized filers after unlock; the contract does not publish an identity-to-entry mapping.

## Dossier boundary

AES-GCM is client-side because Compact has no in-circuit encryption primitive for this workflow. The ciphertext is the only report payload crossing into public state. After unlock, the three filers decrypt their chosen records locally and the app produces a signed JSON dossier. Independent verification checks the contract address, slot key, threshold state, entry keys, and on-chain filing dates without access to any Corroborate server.
