# Architecture

## Public and private sides

Compact ledger state is public. Thirdmark therefore stores no report plaintext or raw company identifier in ledger state. The contract state is designed as:

```text
filed       Set<Bytes<32>>            filer nullifiers
entries     Map<Bytes<32>, Bytes<N>>   entry key -> opaque ciphertext
slotFilled  Map<Bytes<32>, Uint<8>>    slot key -> aggregate count
unlocked    Set<Bytes<32>>             slot keys whose threshold predicate is true
```

The Wave 1 contract fixes `Bytes<128>` for the AES-GCM envelope, matching the
source-backed MatchLock boundary. The delegated-wallet circuit intentionally keeps
the private witness to a filer secret and OPRF/DLEQ material. The public nullifier
set is the duplicate-filing guard; an evolving private filing-history commitment
was removed from the Wave 1 circuit because its generated proof payload exceeded
the 1AM connector boundary.

## Key derivation

The company registration number is resolved by Nigeria's Corporate Affairs Commission (CAC) public company search and normalized to one canonical `NG:CAC:company:RC:<digits>` representation. A free-text company name is never hashed directly. The current lookup boundary and exact normalization rules are in [`REGISTRY.md`](REGISTRY.md). The slot derivation is:

```text
subject32 = SHA-256("thirdmark:subject:v1\\0" || canonicalSubject)
P         = hashToCurve(subject32)
P_blind   = ecMul(P, r)
P_issuer  = ecMul(P_blind, k)
r_inverse = client-side modular inverse of r
P_final   = ecMul(P_issuer, r_inverse)
slotKey   = persistentHash([pad(32, "thirdmark:slot:v1"), P_final.x, P_final.y])
```

The selected ledger-v8 Compact toolchain exposes `ecMul` for the Jubjub operation but does not expose arithmetic or `inv` for `JubjubScalar`. [`client/oprf.ts`](../client/oprf.ts) computes `r_inverse` in client memory with the source-backed Jubjub scalar modulus, then uses the same `ecMul`-based unblinding relation that the filing circuit uses. The scratch circuit and client OPRF suite prove the two group multiplications and the resulting point equality. No scalar modulus is invented; its source discrepancy is recorded in [`FINDINGS.md`](FINDINGS.md).

The issuer receives only the blinded point and applies its secret through [`issuer/oprf.ts`](../issuer/oprf.ts). It can rate-limit or refuse service, but it must not receive the canonical identifier. The filing circuit verifies a Chaum–Pedersen/DLEQ proof that the evaluated point was produced with the sealed issuer key. This prevents a caller from inventing a slot key without issuer participation. The proof challenge is a domain-separated transient hash truncated to 248 bits inside the 0.30.0 circuit so it is always a valid Jubjub scalar; later toolchains expose a first-class `JubjubScalar` cast, but the selected safe ledger-v8 candidate does not.

The Compact circuit surface has no enumeration operation, but the compiler-generated
public-state query wrapper exposes `size()` and iterators for `Map` and `Set` values.
Consequently, a chain observer can enumerate opaque occupied keys and counts outside
the circuit. The keys are not company identifiers, and the OPRF prevents an observer
without the issuer-derived slot secret from mapping them to a registry subject. Anyone
who can derive an exact slot key can still probe that slot’s count. This is a residual
global occupancy/count leak and is stronger than the original no-enumeration
assumption; the privacy inspector must show it rather than imply that public state is
unqueryable.

## Filing and replay guards

For a filer secret `sk` and slot key `slotKey`:

```text
filerNullifier = persistentHash([pad(32, "thirdmark:nullifier:v1"), sk, slotKey])
entryKey       = persistentHash([pad(32, "thirdmark:entry:v1"), slotKey, index])
```

The nullifier is a public opaque anti-replay guard scoped to both filer secret and
slot. An exact ciphertext replay is separately rejected. This means one filer
cannot file twice on the same subject slot, while the same filer can still file on
another slot. The guard is visible only as an opaque ledger key; it does not expose
the filer secret or report contents. A richer evolving private-history commitment
remains a later circuit option after a toolchain or wallet payload limit is verified.

The browser provider stages fresh OPRF material in AES-GCM encrypted IndexedDB
storage before a proof is generated. A failed proof restores the prior witness;
after finalization the staged material remains available for the next filing. The
browser key is non-extractable same-origin storage, not a hardware vault; an active
compromised page can still use the witness while it is open.

## Threshold transition

The contract discloses only the boolean threshold predicate at the point it controls public state. It inserts the ciphertext and updates the aggregate count only after checking the nullifier and replay guard. It adds the slot to `unlocked` only when the count reaches the product threshold. No circuit returns a below-threshold count or exposes a filer identity.

Insertion order must not carry information. The three records are indexed by anonymous entry keys and are retrieved by the authorized filers after unlock; the contract does not publish an identity-to-entry mapping. Compact 0.30.0 exposes block-time predicates but no block timestamp value circuit, so the contract does not self-report a filing date. The dossier obtains the transaction/block date from the public indexer and must label that source explicitly.

## Dossier boundary

AES-GCM is client-side because Compact has no in-circuit encryption primitive for this workflow. The ciphertext is the only report payload crossing into public state. After unlock, the three filers decrypt their chosen records locally and the app produces a signed JSON dossier. Independent verification checks the contract address, slot key, threshold state, entry keys, and on-chain filing dates without access to any Thirdmark server.

The current Wave 1 envelope is exactly 128 bytes: 12 random IV bytes, the AES-GCM
ciphertext and 16-byte authentication tag, zero padding, and a final one-byte encrypted
length. The client rejects a report that cannot fit before submitting a transaction and
rejects a malformed length before attempting decryption. The report schema currently
contains only non-negative minor units, at least 90 late days, and a bounded invoice
reference. This fixed envelope is a product limit until a separately verified larger
Compact byte width is selected.

The dossier module accepts the three decrypted records plus filing times read from the
public indexer. It sorts records by their public entry keys before producing canonical
JSON, binds the contract address, slot key, and unlock metadata, and verifies three
distinct Ed25519 signatures over those exact bytes. Signer references are chosen by the
three filers; they may be pseudonymous, so the dossier does not invent a real-world
identity. The current implementation accepts caller-supplied `CryptoKeyPair` values;
Midnight wallet message signing and indexer retrieval remain separate integration work.
The browser therefore does not label decrypted records as a completed dossier until
it has the public indexer dates and three signer approvals required by this boundary.
