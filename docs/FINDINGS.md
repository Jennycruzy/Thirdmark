# Findings

Updated 2026-09-12.

This file records source verification that changes or constrains the build. The local reference checkouts used for line-level inspection are gitignored under `.references/`; the commit IDs below make the evidence reproducible.

## Naming

The requested unscoped npm/GitHub check was run before the rename commit.

- `quorum` is occupied on npm by multiple public packages, including `@schady4/quorum` and `@balpal4495/quorum`.
- `kth`, `corroborate`, and `nth` are also occupied as unscoped npm packages according to the npm registry response captured during verification.
- `Jennycruzy/quorum`, `Jennycruzy/Kth`, `Jennycruzy/Corroborate`, and `Jennycruzy/Nth` returned HTTP 404 from the GitHub repository API at the initial check.
- The exact `thirdmark` npm registry lookup and `Jennycruzy/Thirdmark` GitHub repository lookup both returned HTTP 404 on 2026-09-11.
- Decision: use **Thirdmark** for the product and repository. The earlier local fallback name `Corroborate` is superseded before product code begins.

This contradicts the supplied statement that the three alternatives are unclaimed on npm. The registry is authoritative for npm availability.

## Nigeria registry boundary

Verified on 2026-09-12 against the official CAC sites:

- The CAC public search at [`icrp.cac.gov.ng/public-search`](https://icrp.cac.gov.ng/public-search/) exposes the search categories `RC Number`, `AV Code`, and `Approved Name`.
- The official CAC site describes the company-search service as a way to verify company information and registration status: [`cac.gov.ng/services/company-search`](https://www.cac.gov.ng/services/company-search).
- CAC's separate [VAS API documentation](https://vas.cac.gov.ng/documentation-page) describes authenticated validation products, including lookup by RC number. Its published request examples require an API key, so it is not a client-side dependency and no credential is stored or requested.
- Decision: Wave 1 uses CAC company RC numbers only. No undocumented public-search request path is treated as an API contract; the client currently implements only the deterministic canonicalization and fixed-width OPRF subject input in [`client/registry.ts`](../client/registry.ts).

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

The hash and curve primitives in the OPRF design are source-backed. The scratch OPRF round-trip now runs through an in-process simulator; it is kept separate from product code until the remaining toolchain decisions are closed.

## OPRF correction

The supplied OPRF description assumes an in-circuit inverse for the Jubjub blinding scalar. The maintained API does not provide one. `inv` is documented only for `Secp256k1Scalar` and `Secp256k1Base` (`exports.md:684-695`), while the 0.31 changelog says that `JubjubScalar` has no arithmetic support (`CHANGELOG.md:547-564`) and that `ecMul` now requires a `JubjubScalar` instead of a `Field` (`CHANGELOG.md:647-652`).

This is a source-over-spec correction, not a reason to remove the OPRF. The implementable shape is: compute the inverse of the non-zero blinding scalar client-side; use only `ecMul` inside the Compact circuits for blinding, issuer evaluation, and unblinding; and prove the resulting point relation in a scratch circuit. The pinned Compact runtime `0.15.0` does not export `JUBJUB_SCALAR_MODULUS`; its published export surface was inspected directly. The maintained Compact source at `c47230c` defines the protocol modulus in `runtime/src/constants.ts:33-39`, so the scratch harness uses that source-backed value and records the version mismatch here. No product inverse helper will silently assume an unverified runtime export. MatchLock’s current contract still passes a `Field` to `ecMul` (`contract/src/matchlock.compact:68-74`), so that older pattern cannot be copied without compiling it against the selected toolchain.

The available 0.31.1 compiler confirms the version-specific shape: `JubjubScalar` is not a bound Compact identifier, while `Field` is accepted by the Jubjub `ecMul` calls used by the 0.31 language version. An isolated scratch contract using three `Field` witnesses, `hashToCurve<Bytes<32>>`, three `ecMul` calls, a disclosed equality predicate, and one public Boolean ledger cell compiled with `--skip-zk`; its generated `contract-info.json` marks the OPRF circuit as `proof: true`. This is syntax and circuit metadata evidence only, not a simulator run or deployment, and it was not used to clear the security gate.

The maintained source defines `JUBJUB_SCALAR_MODULUS` and `MAX_JUBJUB_SCALAR` in `runtime/src/constants.ts:33-39`, but the pinned `@midnight-ntwrk/compact-runtime@0.15.0` package does not export them. The scratch simulator’s source reference is explicit in `verification/oprf-simulator.ts`; before product OPRF code, the dependency choice must either expose the constant through a compatible runtime package or document and independently verify the protocol-constant import. Non-zero scalar inversion remains covered by the simulator tests.

## Product OPRF authentication and Compact 0.30 scalar handling

The product circuit cannot accept a caller-supplied `slotKey` as an authority claim:
that would make the mandatory forged-slot adversarial test fail. The source-backed
ledger-v8 primitive set provides `ecAdd`, `ecMul`, `ecMulGenerator`, and
`hashToCurve`; it does not provide the later standard-library Schnorr verifier in the
selected 0.30.0 toolchain. The contract therefore verifies a Chaum–Pedersen/DLEQ proof
for the issuer’s OPRF evaluation. The proof checks that one hidden issuer scalar maps
the embedded generator to the sealed issuer public key and the blinded subject point
to the evaluated point.

The maintained Compact release notes date the first-class `JubjubScalar` type and its
field-to-scalar reduction cast to toolchain 0.33 (`.references/compact-active/doc/release-notes/toolchain-0.33.0.md:129-139`). The installed 0.30.0 release notes document the renamed `JubjubPoint` API but not that scalar type (`/Users/user/.compact/versions/0.30.0/x86_64-apple-darwin/toolchain-0.30.0.md:100-114`). A raw transient hash therefore cannot be passed safely to the runtime’s scalar operation: the simulator initially reproduced `failed to decode for built-in type EmbeddedFr`.

The implemented correction is source-backed byte casting: the circuit computes a
domain-separated `transientHash`, takes its first 31 bytes with the standard
`slice<N>` circuit, and casts those 248 bits back to `Field` before the Jubjub
multiplications. The challenge has 248 bits of entropy and is always below the
Jubjub scalar modulus. The off-chain simulator uses the same exported Compact pure
circuit for the challenge, so proof generation and verification cannot silently drift.
This is a design correction to the supplied specification and must be revisited if
the deployment toolchain moves to a release with a different scalar API.

The product contract compiles with Compact 0.30.0 `--skip-zk`; its local simulator
now passes 14 product tests, while the OPRF simulator passes 6 tests. The client
AES-GCM suite adds 7 tests, for 27 tests in the full local command. Full proving-key
generation is added to the managed CircleCI check, but that CI result is not yet a
deployment or W1-P0 completion claim.

The client artifact layer adds a deterministic three-record dossier with explicit
contract/slot/threshold metadata, indexer-supplied filing times, and three Ed25519
signatures over canonical JSON. Its six tests cover ordering, record-count and
duplicate rejection, round-trip serialization and verification, report/signature
tampering, schema tampering, and duplicate signer references. The full local command
now passes 33 tests. These are client-local tests; no wallet signature or Preprod
record retrieval is being claimed.

## Product private-history bound

The Compact sources inspected for the selected toolchain use `List` as a ledger ADT;
no reference contract supplies an unbounded private witness list. Thirdmark’s first
contract therefore represents the private filing history as a 32-entry witness
vector with a private length and private per-entry commitment salts. The circuit
rejects a full history instead of silently dropping an entry. This preserves the
history-commitment property and makes the limit visible to the product layer; an
unbounded private collection requires a separately verified Compact representation.

## Public ledger query-surface correction

The specification’s no-enumeration statement is true of the Compact circuit API we
used: no circuit can iterate a ledger map or set. It is not true of the compiler-
generated public-state query wrapper. After compiling `contract/src/thirdmark.compact`
with Compact 0.30.0, `contract/managed/thirdmark/contract/index.d.ts:83-125` exposes
`size()` and `[Symbol.iterator]()` on every public map/set, including `slotFilled`,
`entries`, `filed`, `unlocked`, and `history`; the generated implementation at
`contract/managed/thirdmark/contract/index.js:1886-2500` materializes map keys for
those iterators. Managed output is ignored and regenerated by the compile command, so
these paths are evidence of the compiler output rather than checked-in application
code.

This changes the residual leak. Observers can enumerate opaque active keys and counts,
although the OPRF-derived keys do not reveal their registry subjects without the
issuer-derived slot secret. The privacy boundary cannot claim that an observer cannot
list occupied slots; it can claim only that the list is not subject-labelled absent the
OPRF secret. A single issuer can also evaluate candidate subjects offline if it chooses,
so Wave 1 retains a trust assumption against issuer enumeration; distributing the OPRF
key remains a real Wave 2 security change, not merely an availability feature.

## Version and security correction

The supplied specification pins Compact 0.31.1, language 0.23.0, runtime 0.16.0, ledger v8.1.0, Midnight JS 4.1.1, and proof server 8.0.3. The reference repositories corroborate the application dependency family, including Moonray commit `c10697a`, MatchLock `0738181`, NightPool `0e17c97`, Hermes `12f388e`, and Latch `5153e6b`.

The maintained Compact changelog contains later 0.31 development versions, including toolchain 0.31.108 / language 0.23.105 / runtime 0.16.101 (`CHANGELOG.md:853`). However, the official Compact CLI currently lists 0.31.1 as the only installable 0.31 release and reports compiler 0.31.1, while the official security advisory [GHSA-3p6x-5vpx-wwpj](https://github.com/LFDT-Minokawa/compact/security/advisories/GHSA-3p6x-5vpx-wwpj) identifies versions through 0.31.1 as affected by forged `Uint<N>` range constraints and says the fixed release is greater than 0.31.1.

Compact 0.34.0 is available, but its published release notes target ledger v9. The project target is Preprod on the ledger-v8 line, so moving to 0.34.0 would change the deployment target rather than solve this gate. This is a blocking source conflict. No contract will be compiled for deployment or deployed with the known-vulnerable 0.31.1 compiler.

The reference proof-server files use `midnightntwrk/proof-server:8.0.3`. The newer example-zkloan compatibility table uses `8.1.0`; because Thirdmark selected the older source-backed Compact 0.30.0 application family, the matching `example-counter` and Hermes `8.0.3` configuration is used and verified below.

## Proof-server validation

The pinned `example-counter` commit `273f083ab36a52407f16ec9a9796d902226e05d6` and Hermes commit `12f388ea7d23aa9fc1ee7959db1d22c38c550031` both configure `midnightntwrk/proof-server:8.0.3` on port 6300. Thirdmark now uses that exact source-backed image and the Hermes Preprod command in `docker-compose.yml`.

Observed locally on 2026-09-12:

- Docker resolved the image to `midnightntwrk/proof-server@sha256:8e6c36c3c175ef6e1b337952155b30470f252af79a20c3f65153a86a983e17ab`.
- The server downloaded and verified its public parameters and Zswap/Dust key material.
- The log reached `Actix runtime found; starting in Actix runtime` and listened on `0.0.0.0:6300` with four workers.
- `GET http://127.0.0.1:6300/` returned HTTP 200 and `{"status":"ok","timestamp":"2026-09-12 05:24:45.099286667 +00:00:00"}`.

The proof-server health requirement is therefore satisfied. This is not evidence that a Compact circuit has generated proving keys or that a Preprod transaction exists.

## Managed proving-key validation

The repository was connected to CircleCI on 2026-09-12. Pipeline `#1` at commit `65624e3` completed successfully; pipeline UUID `717dbcfa-c2be-4fcd-9afb-0484ab68f99c`, workflow and job `compact-validation`. The job ran [`scripts/verify-compact.sh`](../scripts/verify-compact.sh) on the managed runner. That script installs Compact 0.30.0, compiles the pinned `example-counter` commit and `verification/oprf-scratch.compact` without `--skip-zk`, and verifies compiler `0.30.0`, language `0.22.0`, and runtime `0.15.0` in both generated contract-info files.

This closes the managed full-proving-key compile check for the selected ledger-v8 candidate. It does not constitute simulator execution, a deployed contract, a transaction, or evidence that the Preprod network accepts the application dependency set. The development Mac’s local `zkir` `SIGILL` remains a local execution limitation only; it is not being worked around by weakening the CI check.

The first CircleCI run used `cimg/base:2026.09`. That image does not contain Node or npm, so the simulator workflow now uses the verified `cimg/node:24.11` image. The reference `example-counter` checkout declares Node `24.11.1` in `.nvmrc`; the CircleCI tag was checked against the public image manifest before changing the configuration.

The updated configuration passed in CircleCI pipeline `#3` at commit `c5d11b5` (pipeline UUID `758b3c19-e135-43fa-9d7c-f34ba4e4412b`). Workflow `compact-validation` succeeded; job number `3` (`ca60dc5a-cfeb-4016-bed5-973ae3411b30`) ran the full proving-key compile, installed the locked JavaScript dependencies, and passed the strict typecheck plus six-test OPRF simulator suite.

Pipeline `#5` at commit `2206138` (pipeline UUID `b2d7d191-4219-4132-ad5c-1c29b6934022`) also succeeded; job number `5` (`ff14550d-4680-403e-878c-55885a7ff065`) published the managed counter artifacts. The artifact root is [CircleCI counter artifacts](https://output.circle-artifacts.com/output/job/ff14550d-4680-403e-878c-55885a7ff065/artifacts/0/compact-artifacts/example-counter/contract/src/managed/counter/). Those assets were downloaded into the gitignored reference checkout and the reference contract package built successfully. The Preprod CLI reached its wallet setup menu; it was exited before wallet creation or seed restoration.

## Reference repository observations

- MatchLock’s `contract/src/matchlock.compact:11-95` confirms language pragma 0.23, client-side ciphertext as `Bytes<128>`, Jubjub ECDH, `persistentHash`, disclosed ledger keys, and nullifier protection.
- Moonray’s `contract/src/slicer.compact:24-76` confirms public ledger declarations, witness functions, domain-separated persistent hashes, and the distinction between transient tournament values and persistent identity/nullifier values.
- NightPool’s `contracts/nightpool.compact:61-105` confirms witness-held private notes, persistent commitments, persistent nullifiers, and Merkle membership patterns.
- Hermes’s `contracts/src/hermes-v2.compact` confirms late `disclose()` placement, public commitment state, and block-time checks; its README says the public proof-server image is 8.0.3.
- Latch’s `contract/src/moat.compact:183-205` explicitly documents that circuit arguments remain private until disclosed and uses a recomputed spend-state commitment.
- The archived `midnightntwrk/compact` repository now directs source development to `LFDT-Minokawa/compact`. The maintained repository is therefore used for language API verification, while Midnight’s archived release repository remains the release source.

## Ledger-v8 recovery path

The security finding does not make the project impossible. The official Compact 0.30.0 release notes state that the toolchain targets Midnight ledger version 8. The official security advisory identifies the specific `Uint<N>` range-proof defect as affecting versions `<= 0.31.1` and explicitly identifies 0.30.x as not affected by that regression. Sources: [Compact 0.30 release notes](https://github.com/midnightntwrk/compact/releases) and [GHSA-3p6x-5vpx-wwpj](https://github.com/LFDT-Minokawa/compact/security/advisories/GHSA-3p6x-5vpx-wwpj).

The installed 0.30.0 compiler reports:

- compiler: `0.30.0`
- language: `0.22.0`
- runtime: `0.15.0`
- compiler ledger target: `ledger-8.0.2`

The pinned `example-counter` reference at commit `273f083ab36a52407f16ec9a9796d902226e05d6` resolves the compatible application family in its lockfile: `@midnight-ntwrk/compact-runtime` `0.15.0`, `@midnight-ntwrk/ledger-v8` `8.0.3`, and Midnight.js `4.0.4`. This is the source-backed starting point for the project dependency pins; it is not yet deployment evidence.

## Wallet sync compatibility correction

The Preprod CLI reached wallet setup but then repeatedly failed while applying indexer updates with `state.pendingOutputs.values().map is not a function`. The installed packages were `@midnight-ntwrk/wallet-sdk-shielded@2.1.0` and `@midnight-ntwrk/ledger-v8@8.0.3`, the versions listed by Midnight’s compatibility matrix. The failure is reproducible without a wallet secret: the ledger-v8 `ZswapLocalState.pendingOutputs` is a native `Map`, whose `values()` method returns an iterator; the shielded SDK’s published `CoreWallet.pickAllCoins` calls `.map` directly on that iterator.

The ledger-v8 declaration confirms `pendingOutputs: Map<CoinCommitment, [ShieldedCoinInfo, Date | undefined]>`. The official wallet source contains the same incompatible expression in [`CoreWallet.ts`](https://github.com/midnightntwrk/midnight-wallet/blob/main/packages/shielded-wallet/src/v1/CoreWallet.ts#L825-L829). Thirdmark applies the minimal compatibility correction, `Array.from(state.pendingOutputs.values(), ([coin]) => coin)`, through [`scripts/patch-example-counter-wallet.sh`](../scripts/patch-example-counter-wallet.sh) and the auditable patch in [`patches/wallet-sdk-shielded-pending-outputs.patch`](../patches/wallet-sdk-shielded-pending-outputs.patch). The script checks the exact expected source and refuses to patch an unknown package. This preserves the complete pending-output collection and changes no cryptographic, signing, or contract logic. It is a local compatibility patch for the archived reference CLI, not a claim that the upstream package has released the correction.

Validation on 2026-09-12: `npm run patch:reference-wallet` is idempotent, and `CoinHashesMap.pickAllCoins(new ledger.ZswapLocalState())` returns an empty list instead of throwing. The deployment CLI must be restarted after applying the patch; no seed is required by the patch or its validation.

## Preprod first-sync behavior

After the collection-shape correction, the CLI no longer threw but appeared to hang at `Syncing with network`. This is the reference CLI’s `waitForSync` spinner: `WalletFacade.FacadeState.isSynced` requires shielded, dust, and unshielded progress to have a zero gap. The fresh CLI initializes all three SDK wallets at cursor zero and does not persist their serialized state. The public Preprod indexer was responsive on 2026-09-12; its Zswap stream advertised approximately 1.51 million historical events, and the public unshielded subscription for the funded address returned callbacks. The observed behavior is therefore a large historical replay, not a proof-server or funding failure.

The archived CLI is patched with [`example-counter-wallet-resume.patch`](../patches/example-counter-wallet-resume.patch). It persists only the SDK’s serialized shielded, unshielded, and dust wallet states, keyed by the public unshielded address, using atomic replacement and restrictive local permissions. It reports each component’s applied/highest cursor and checkpoints every five seconds. This is a usability correction for the reference CLI; it does not skip ledger history, relax `isSynced`, or claim a deployment.

The 0.30.0 compiler accepts the OPRF scratch source with `--skip-zk` and produces proof metadata for the OPRF circuit. Full proving-key generation cannot be completed on the current Intel Mac: the bundled `zkir` exits with `SIGILL` (reported by `compactc` as exit `-4`) for both the official counter circuit and the OPRF scratch circuit. The same failure occurs with the installed 0.31.1 binary. Running the CircleCI `cimg/base:2026.09` Linux image locally on the same physical machine reproduces the exit, confirming that changing the operating-system image does not bypass the host CPU limitation. The managed CircleCI run now supplies the full proving-key compile evidence; the simulator suite separately executes the generated circuit code without a proof server.

This is a narrow advisory correction, not a blanket claim that every historical 0.30 compiler defect is absent. We will run the complete source, proof, simulator, and deployment checks before relying on the toolchain.

## Current gate status

W1-P0 is **blocked**, not passed. The name check, reference checkout, source API review, safe ledger-v8 candidate installation, skip-ZK syntax checks, repository metadata, proof-server health check, managed full proving-key compile, scratch round-trip simulator run, and managed counter artifact retrieval are complete. The canonical example-counter deployment and Preprod evidence remain outstanding. Wallet creation/restoration, funding, and signing must be performed by the owner without sharing any wallet secret.
