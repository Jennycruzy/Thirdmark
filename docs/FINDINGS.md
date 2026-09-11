# Findings

Updated 2026-09-11.

This file records source verification that changes or constrains the build. The local reference checkouts used for line-level inspection are gitignored under `.references/`; the commit IDs below make the evidence reproducible.

## Naming

The requested unscoped npm/GitHub check was run before the first project commit.

- `quorum` is occupied on npm by multiple public packages, including `@schady4/quorum` and `@balpal4495/quorum`.
- `kth`, `corroborate`, and `nth` are also occupied as unscoped npm packages according to the npm registry response captured during verification.
- `Jennycruzy/quorum`, `Jennycruzy/Kth`, `Jennycruzy/Corroborate`, and `Jennycruzy/Nth` returned HTTP 404 from the GitHub repository API at verification time.
- Decision: use **Corroborate** for the product and repository. If a publishable npm package is needed later, it must use a confirmed scoped name rather than claiming the occupied unscoped name.

This contradicts the supplied statement that the three alternatives are unclaimed on npm. The registry is authoritative for npm availability.

## Compact language and cryptography

Verified against the maintained Compact source at `LFDT-Minokawa/compact`, commit `c47230c`, and the public API material it contains:

- `transientHash<T>(value): Field` is not upgrade-stable and is not sufficient to protect witness input: `doc/api/CompactStandardLibrary/exports.md:407-424`.
- `transientCommit<T>(value, rand): Field` is circuit-efficient but not upgrade-stable: `exports.md:426-445`.
- `persistentHash<T>(value): Bytes<32>` is upgrade-stable and SHA-256 based: `exports.md:447-461`.
- `persistentCommit<T>(value, rand): Bytes<32>` is upgrade-stable and SHA-256 based: `exports.md:463-477`.
- `degradeToTransient` exists for moving a persistent result into transient operations: `exports.md:479-484`.
- `constructJubjubPoint(Field, Field): JubjubPoint`: `exports.md:529-542`.
- `ecAdd`, `ecMul`, and `ecMulGenerator` support Jubjub points/scalars: `exports.md:626-669`.
- `hashToCurve<T>(value): JubjubPoint` exists and its documentation guarantees unknown discrete logarithm with respect to the base and other outputs: `exports.md:697-710`.
- `blockTimeLt`, `blockTimeGte`, `blockTimeGt`, and `blockTimeLte` exist: `exports.md:1008-1038`.

The OPRF primitive set in the design is therefore source-backed. A scratch OPRF round-trip still needs to compile and run through a local simulator before product code begins.

## Version and security correction

The supplied specification pins Compact 0.31.1, language 0.23.0, runtime 0.16.0, ledger v8.1.0, Midnight JS 4.1.1, and proof server 8.0.3. The reference repositories corroborate the application dependency family, including Moonray commit `c10697a`, MatchLock `0738181`, NightPool `0e17c97`, Hermes `12f388e`, and Latch `5153e6b`.

The maintained Compact changelog contains later 0.31 development versions, including toolchain 0.31.108 / language 0.23.105 / runtime 0.16.101 (`CHANGELOG.md:853`). However, the official Compact CLI currently lists 0.31.1 as the only installable 0.31 release and reports compiler 0.31.1, while the official security advisory [GHSA-3p6x-5vpx-wwpj](https://github.com/LFDT-Minokawa/compact/security/advisories/GHSA-3p6x-5vpx-wwpj) identifies versions through 0.31.1 as affected by forged `Uint<N>` range constraints and says the fixed release is greater than 0.31.1.

Compact 0.34.0 is available, but its published release notes target ledger v9. The project target is Preprod on the ledger-v8 line, so moving to 0.34.0 would change the deployment target rather than solve this gate. This is a blocking source conflict. No contract will be compiled for deployment or deployed with the known-vulnerable 0.31.1 compiler.

The reference proof-server files use `midnightntwrk/proof-server:8.0.3`. The newer example-zkloan compatibility table uses `8.1.0`; this must be reconciled against the current Preprod compatibility matrix before writing Corroborate’s compose file. No image version is hardcoded in the product repository yet.

## Reference repository observations

- MatchLock’s `contract/src/matchlock.compact:11-95` confirms language pragma 0.23, client-side ciphertext as `Bytes<128>`, Jubjub ECDH, `persistentHash`, disclosed ledger keys, and nullifier protection.
- Moonray’s `contract/src/slicer.compact:24-76` confirms public ledger declarations, witness functions, domain-separated persistent hashes, and the distinction between transient tournament values and persistent identity/nullifier values.
- NightPool’s `contracts/nightpool.compact:61-105` confirms witness-held private notes, persistent commitments, persistent nullifiers, and Merkle membership patterns.
- Hermes’s `contracts/src/hermes-v2.compact` confirms late `disclose()` placement, public commitment state, and block-time checks; its README says the public proof-server image is 8.0.3.
- Latch’s `contract/src/moat.compact:183-205` explicitly documents that circuit arguments remain private until disclosed and uses a recomputed spend-state commitment.
- The archived `midnightntwrk/compact` repository now directs source development to `LFDT-Minokawa/compact`. The maintained repository is therefore used for language API verification, while Midnight’s archived release repository remains the release source.

## Current gate status

W1-P0 is **blocked**, not passed. The name check, reference checkout, source API review, and CLI installation are complete. The required scratch proof, canonical example-counter build/deploy, proof-server health check, and Preprod evidence cannot honestly be completed until the ledger-v8 compiler security issue has an installable patched release and the owner supplies the required external account and wallet information.
