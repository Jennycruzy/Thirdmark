# Progress

Updated 2026-09-14.

Source correction recorded during local contract inspection: Compact circuits do not
enumerate ledger state, but the generated public-state query wrapper exposes map/set
sizes and iterators. The architecture and privacy claims now describe the resulting
opaque-key occupancy/count leak explicitly; no no-enumeration claim is being carried
forward.

## W1-P0 — source verification and registration

Status: **passed for source verification, CI validation, and the canonical Preprod wallet smoke test. Thirdmark deployment remains blocked on issuer configuration.**

Passed:

- Chose the product/repository name `Thirdmark` after checking the exact unscoped npm name and `Jennycruzy/Thirdmark` GitHub repository; both returned 404. Earlier fallback naming and the discrepancy in the supplied alternatives are recorded in [`FINDINGS.md`](FINDINGS.md).
- Initialized a fresh repository with Apache-2.0 licensing and the requested local git identity: `Jennycruzy <jennycruzy@users.noreply.github.com>`.
- Cloned the five cited references and `example-counter` into the gitignored `.references/` directory. Reference commits are recorded in [`FINDINGS.md`](FINDINGS.md).
- Read the complete MatchLock contract and Moonray slicer source. Verified witness, disclosure, ledger, nullifier, domain-separated hash, and time-gating patterns.
- Read the maintained Compact standard-library API. Verified persistent hashing, persistent commitments, Jubjub point construction and arithmetic, `hashToCurve`, and block-time circuits.
- Found and recorded an OPRF design correction: the selected ledger-v8 Compact toolchain has no `JubjubScalar` inversion circuit. The inverse must be computed client-side from the runtime’s source-backed scalar modulus and used only as an input to an `ecMul` unblinding circuit.
- An isolated scratch contract using the previously installed 0.31.1 compiler with `--skip-zk` compiled the `hashToCurve` plus three-`ecMul` shape and generated proof metadata. This historical check is not a simulator run, proof, or deployment and does not clear any gate.
- Installed the official Compact CLI and the source-backed ledger-v8 candidate Compact 0.30.0. It reports language 0.22.0, runtime 0.15.0, and compiler target ledger-8.0.2.
- Compiled the OPRF scratch contract with Compact 0.30.0 using `--skip-zk`; generated metadata marks the OPRF circuit as proof-bearing. This is syntax evidence only.
- Added a reproducible full-proof compile check for the official example-counter commit and the OPRF scratch contract. It is configured for CircleCI because the current Intel Mac cannot execute the bundled `zkir` binary.
- Verified that the GitHub repository is public, GitHub detects Apache-2.0, and the required `compact`, `midnight`, `midnightntwrk`, and `zero-knowledge` topics are present.
- Added the source-backed `midnightntwrk/proof-server:8.0.3` compose service and started it on port 6300. Its parameters and keys verified, its Actix service started, and the root endpoint returned HTTP 200 with `{"status":"ok"}`.
- Connected the repository to CircleCI and completed pipeline `#1` at commit `65624e3` (`717dbcfa-c2be-4fcd-9afb-0484ab68f99c`). The `compact-validation` workflow and job succeeded, running the full proving-key compile for the pinned `example-counter` reference and the OPRF scratch circuit, followed by exact compiler/language/runtime metadata checks.
- Added the `OprfSimulator` using the verified in-process `CircuitContext` pattern. `npm run test:oprf` completed strict TypeScript checking and six simulator tests, including a non-trivial blind/issuer/unblind round-trip, incorrect-unblinding rejection, same/different subject checks, scalar vectors, and wrong-width input rejection. The dependency audit reports zero vulnerabilities after upgrading Vitest to `4.1.11`.
- Latest CircleCI pipeline `#3` at commit `c5d11b5` (`758b3c19-e135-43fa-9d7c-f34ba4e4412b`) succeeded. Workflow `compact-validation` stopped successfully at `2026-09-12T11:51:14Z`; job `compact-validation` was job number `3` (`ca60dc5a-cfeb-4016-bed5-973ae3411b30`). This validates the full proving-key compile and the simulator/typecheck workflow on the managed runner.
- CircleCI pipeline `#5` at commit `2206138` (`b2d7d191-4219-4132-ad5c-1c29b6934022`) succeeded. Job `compact-validation` number `5` (`ff14550d-4680-403e-878c-55885a7ff065`) published the full counter contract and proving assets as CircleCI artifacts. The reference counter package built successfully from those assets, and its Preprod CLI reached the wallet setup menu without creating or reading a wallet secret.
- CircleCI pipeline `#10` at commit `0b2d84a` (`0a58ba08-73c2-49d8-96a6-79f713f998c8`) succeeded. Workflow `compact-validation` (`14ff75b3-b091-46f1-ba78-f49a2d806d15`) passed the full proving-key compile for the reference counter, OPRF scratch circuit, and Thirdmark contract, then passed all 33 simulator, crypto, and dossier tests. Pipeline `#9` exposed a CI-only false-negative in the signature-tamper test; the test now changes a significant encoded byte and passes on both environments.
- Diagnosed and corrected the reference CLI’s wallet-sync failure. `wallet-sdk-shielded@2.1.0` called `.map` on the iterator returned by ledger-v8 `pendingOutputs.values()`. Added the source-checked compatibility patch and verified it idempotently; an empty `ZswapLocalState` now passes `CoinHashesMap.pickAllCoins` with zero coins. The patch is documented in [`FINDINGS.md`](FINDINGS.md) and must be applied after each fresh `npm ci` in the ignored reference checkout.
- Verified the patch from a clean temporary reference checkout and reran `npm run test:oprf`: strict typechecking and all six simulator tests passed. The local Vitest timeout was raised to 30 seconds because the circuit simulator can exceed Vitest’s five-second default on this development machine.
- The corrected CLI then exposed a second operational issue: its fresh wallet replayed the Preprod shielded and dust streams from cursor zero while displaying only a spinner. The public indexer remained responsive and advertised approximately 1.51 million Zswap events. Added source-checked checkpointing and cursor reporting to the ignored reference CLI; the checkpoint patch typechecks, applies cleanly to a fresh checkout, and is idempotent through `npm run patch:reference-wallet`.

Not passed:

- The development Mac still cannot execute the local 0.30.0 `zkir` process; it exits with `SIGILL`. Managed CircleCI has now completed the full proving-key compile, so the local CPU issue is not blocking CI validation.
- The supplied in-circuit inverse step is not available in the verified Compact API. The pinned runtime also does not export the Jubjub scalar modulus; the scratch harness uses the source-backed protocol constant explicitly, and product OPRF code must resolve this dependency choice before implementation.
- The local full counter compile still exits with `zkir` `-4`/`SIGILL`; the managed compiled assets are available from pipeline `#5` and are installed only in the gitignored reference checkout.
- Thirdmark has no Preprod address, transaction, block, timing, dossier, or live URL yet.
- The canonical example-counter now has a wallet-backed Preprod receipt; its address, transaction ID, transaction hash, block, and screenshot are recorded below.

Why blocked:

The official Compact security advisory GHSA-3p6x-5vpx-wwpj identifies 0.31.1 and earlier as vulnerable to forged `Uint<N>` range constraints, while the same advisory identifies 0.30.x as outside that regression. Compact 0.34.0 targets ledger v9 and is not a Preprod substitute. The safe 0.30.0 candidate is installed, and its full proving-key compile for both the reference counter and the OPRF scratch circuit passed on the managed CircleCI runner. The scratch circuit also passes the in-process simulator suite locally and in the latest CircleCI run. This development Mac’s CPU still cannot execute the bundled `zkir`, but managed deployment assets are available. The canonical example-counter has now been deployed through 1AM on Preprod. The next action is to run the issuer with its operator-held scalar, expose only its public key and evaluation endpoint to the browser, then deploy Thirdmark through the same wallet path.

User inputs still required before the external gates:

- AKINDO account confirmation and Discord handle.
- A funded Preprod wallet at W1-P2; the wallet seed or key must never be shared. This is now satisfied by the owner-controlled 1AM wallet.
- An operator-run issuer process with its scalar kept outside the repository and chat; only the issuer URL and derived public point belong in browser configuration.
- A Vercel or Netlify account and optional domain at W1-P5.

## Parallel local implementation — 2026-09-12

### Registry decision

Wave 1 jurisdiction is now **Nigeria**, using the Corporate Affairs Commission
(CAC) company `RC Number` as the sole subject identifier. The official iCRP public
search exposes `RC Number`, `AV Code`, and `Approved Name`; Thirdmark intentionally
restricts the first release to company RC numbers. The canonicalization and the
fixed-width OPRF input are implemented and tested in [`client/registry.ts`](../client/registry.ts).
The official public page does not publish a stable unauthenticated autocomplete
API, so no undocumented endpoint or credentialed VAS integration is being claimed.
See [`docs/REGISTRY.md`](REGISTRY.md) for the source boundary and residual work.

Evidence: `npm test` passed with 39 tests on the development machine. CircleCI
pipeline [#12](https://app.circleci.com/pipelines/github/Jennycruzy/Thirdmark/12)
for commit `c881244` passed the full proving-key compile, strict typecheck, and
the complete 39-test suite; workflow `compact-validation` stopped successfully at
2026-09-12T18:31:24Z.

The next local layer is now complete: [`client/oprf.ts`](../client/oprf.ts) performs
the client blind, generated DLEQ verification, unblind, and Compact slot-key
derivation. The client OPRF tests cover forged issuer evaluations, different
blinding values for the same subject, different subjects, and equivalent CAC RC
display forms. The issuer core in [`issuer/oprf.ts`](../issuer/oprf.ts) now produces
the evaluated point and DLEQ proof without receiving a subject or report. `npm test`
now covers 49 tests. Issuer transport, wallet witness
submission, and Preprod execution remain unimplemented and are not represented as
passed gates.

The wallet replay remains the only external deployment blocker. At the user’s
direction, product implementation continued without claiming W1-P0 or W1-P1.

The headless wallet path is no longer the only option. Thirdmark now has a real
Lace-backed browser deployment action, so the laptop does not need to run the
Node wallet’s multi-hour historical replay. The browser path still waits for
Lace to be ready and does not bypass network or balance safety checks.

The browser deployment batch now includes the pinned official example-counter
contract and its `increment` proving assets. The browser presents that smoke test
before Thirdmark deployment. This remains local/CI implementation evidence only;
no counter or Thirdmark Preprod transaction is claimed.

Completed locally:

- Added `contract/src/thirdmark.compact` with sealed issuer configuration, DLEQ-authenticated OPRF evaluation, persistent slot/nullifier/entry derivations, `Bytes<128>` opaque ciphertext storage, nullifier and ciphertext replay guards, a 32-entry evolving private filing-history commitment, fresh-salt uniqueness checks, and threshold-only unlock state.
- Added `ThirdmarkSimulator` and 14 product tests. The suite covers valid and invalid DLEQ proofs, same-subject/different-blind equality, different-subject separation, first/second/third threshold behavior, duplicate filer, stale private state, ciphertext replay, invalid proof mutation safety, wrong ciphertext width, and history-salt reuse.
- Added the product contract to the full CircleCI proving-key compile and changed the CI simulator step to `npm test`. Pipeline `#10` is the successful managed result.
- Added the client-side AES-GCM report envelope in `client/crypto.ts`. It derives its key from the OPRF-derived Jubjub point, uses a random 12-byte IV, authenticates the report, and enforces the contract’s exact 128-byte ciphertext width. Seven tests cover round-trip recovery, randomized envelopes, wrong-key failure, width and length rejection, field validation, and capacity rejection.
- Added `client/dossier.ts` for deterministic three-record dossier construction, canonical JSON serialization, three distinct Ed25519 signatures, independent verification, and strict parse validation. Six tests cover ordering, threshold cardinality, serialization round-trip, report/signature/schema tampering, and duplicate signer references. It accepts caller-supplied keys and indexer timestamps; wallet connector signing and on-chain retrieval remain pending.

Source correction recorded: Compact 0.30.0 has no first-class `JubjubScalar` cast. A raw transient-hash challenge caused a runtime scalar decode failure, so the circuit now truncates the domain-separated field hash to 248 bits before the DLEQ equations. See [`FINDINGS.md`](FINDINGS.md).

Evidence:

- `npm run test:thirdmark`: passed, 13 tests.
- `compact compile --skip-zk contract/src/thirdmark.compact ...`: passed.
- `npm test`: passed, 33 tests across the OPRF simulator, product simulator, client crypto suite, and dossier suite; strict TypeScript and both Compact `--skip-zk` compiles also passed.

Not passed: no proof-server-backed product transaction, contract address, block, timing, screenshot, or AKINDO comment. The wallet process must finish a complete sync before the deployment path can be exercised. The next local layer is registry canonicalization and contract client integration; neither is being represented as deployed functionality.

## Parallel local implementation — issuer and browser boundary — 2026-09-12

Completed locally:

- Added a subject-blind issuer HTTP boundary with strict decimal Jubjub wire
  serialization, health and public-key routes, bounded request bodies, explicit
  origin checks, and fail-closed runtime configuration. The issuer process never
  receives a company identifier or report payload.
- Added transport tests for the wire round trip, invalid request shapes, DLEQ
  verification after parsing, health response, and origin rejection. The tests
  use an in-memory request/response harness because this development sandbox does
  not permit binding a local TCP socket.
- Added the browser shell in [`web/`](../web/): the five-step flow, sealed tally,
  privacy inspector, wallet connector boundary, configured registry-adapter
  boundary, and real client-side OPRF/encryption preparation path. The UI refuses
  to accept a raw RC number and refuses to claim a chain filing when public
  deployment configuration is absent.
- Added the public browser configuration keys to `.env.example`; no issuer scalar,
  wallet key, seed, or API credential is included.

Evidence:

- `npm run typecheck`: passed with the Compact 0.30.0 skip-ZK local limitation.
- `npx vitest run issuer/oprf.test.ts issuer/transport.test.ts`: 7 tests passed.
- `npm run web:typecheck`: passed.
- `npm run web:build`: passed; Vite transformed 62 modules and emitted the
  `compact-runtime` WebAssembly asset. This is a local build artifact, not a live
  deployment.

Not passed: no browser wallet transaction, registry adapter deployment, issuer
hosting, contract address, Preprod filing, dossier from chain records, screenshot,
or AKINDO gate comment. Comment drafts remain limited to the blocked W1-P0 entry;
these local layers do not clear W1-P0 or W1-P1.

## Production witness extraction — 2026-09-12

The simulator’s witness implementation is now shared from
[`contract/src/witnesses.ts`](../contract/src/witnesses.ts), rather than living
only under the test harness. The generated witness shape is unchanged: each
function returns the current private state and one private value. This gives the
browser contract client one source of truth for filer secret, OPRF material,
history opening, and fresh history salt. The client must persist the advanced
history only after a successful transaction; failed proof generation cannot
consume a private opening.

Evidence: `npm run typecheck` passed and the product simulator passed all 14
filing/OPRF tests using the extracted production witnesses. CircleCI pipeline
[#16](https://app.circleci.com/pipelines/github/Jennycruzy/Thirdmark/16) also
passed the preceding issuer/browser commit’s full proving-key compile, 52 root
tests, browser typecheck, and browser build. The follow-up witness implementation
was included in the successful browser transaction validation in pipeline [#18](https://app.circleci.com/pipelines/github/Jennycruzy/Thirdmark/18).

## Browser transaction boundary — 2026-09-12

Completed locally:

- Replaced the browser-only preparation path with a source-backed Midnight.js
  4.0.4 contract client. It uses the wallet’s delegated proving provider, same-origin
  Compact proving assets, ledger-v8 balance/submit calls, the public indexer state,
  and the generated Thirdmark witnesses. It has no fallback contract address,
  endpoint, issuer key, or local-only filing success path.
- Added an encrypted IndexedDB `PrivateStateProvider` for the filer witness. The
  provider encrypts serialized private state with AES-GCM and retains only a
  non-extractable same-origin key. The client advances filing history only after
  finalization and does not roll back a committed filing if a later indexer read
  fails.
- Added a fail-closed browser artifact staging script. It requires all four full
  `file` proving assets and copies them from the managed Compact output; it cannot
  create placeholders.
- Updated the UI to show proving stages, finalized transaction metadata, the public
  history commitment, and decrypted records only after the real threshold result is
  returned. It still stops before dossier export because timestamp retrieval and
  wallet-backed signing are not complete.

Evidence:

- `npm test`: passed, 8 files and 52 tests.
- `npm run web:typecheck`: passed.
- `npm run web:build`: passed; Vite transformed 1,258 modules and emitted the
  Compact on-chain-runtime and ledger-v8 WASM assets. The build reports upstream
  bundle warnings for Node-only imports and `isomorphic-ws`; these are recorded in
  [`FINDINGS.md`](FINDINGS.md).
- `bash -n scripts/prepare-browser-artifacts.sh`: passed.
- CircleCI pipeline [#18](https://app.circleci.com/pipelines/github/Jennycruzy/Thirdmark/18)
  for commit `9e6dd8b` succeeded. Job `compact-validation` (`f4cc722b-6674-415d-b6c5-bfd155e9ceeb`)
  completed the full proving-key compile, staged all four browser `file` artifacts,
  ran the 52-test root suite, and passed browser typecheck and build.
- CircleCI pipeline [#19](https://app.circleci.com/pipelines/github/Jennycruzy/Thirdmark/19)
  for the evidence-only successor commit `10e5742` also succeeded; job
  `compact-validation` was `995fd8df-b7b2-451b-9f27-80ff1a88f525`.
- No Preprod transaction, contract address, block, dossier, live URL, or screenshot
  was claimed.

The canonical example-counter portion of W1-P0 is complete. The Thirdmark deployment
gate remains open until the issuer public key is configured and a Thirdmark Preprod
receipt exists.

## Browser counter deployment batch — 2026-09-14

Completed locally:

- Added the pinned official `example-counter` source and generated Compact binding
  under [`verification/example-counter/`](../verification/example-counter/).
- Added the four `increment` proving assets to the browser artifact staging contract
  and checked that the pinned source and generated bindings match Compact 0.30.0
  output exactly.
- Added a real Lace deployment action for `example-counter` before the Thirdmark
  deployment action. It uses wallet balancing, delegated proving, signing, and
  submission; it does not bypass wallet synchronization or network checks.

Evidence:

- Compact 0.30.0 `--skip-zk` source/binding comparison: passed.
- `npm test`: 8 files, 52 tests passed.
- `npm run web:typecheck`: passed.
- `npm run web:build`: passed; 1,259 modules transformed.
- The example-counter transaction is now recorded below. Thirdmark remains pending
  issuer configuration and a separate wallet-backed deployment.

Comment draft status: the W1-P0 draft is updated and ready for the user to review and
post. It reports only the verified example-counter receipt; it does not claim a
Thirdmark deployment.

## Canonical example-counter Preprod receipt — 2026-09-14

The owner supplied a 1AM wallet receipt after the browser path completed delegated
proving, wallet balancing, signing, submission, and indexer confirmation:

- Contract address: `fdfd87f55cfcb499dec443d1c35f38fd7d721baa45dbb66303b8f3fb8dd38c4`
- Transaction ID: `00003035511fe02e788f6a82fb0085cb5a60803ddb6c891f296212b5997cc6a499`
- Transaction hash: `3c8a9e7474f8f6b3422c3b5d110199368e5fbee63b9d8f66664f5b1d3d126ea5`
- Block: `2549975`
- Screenshot: `/Users/user/Pictures/Photos Library.photoslibrary/originals/E/E62C02DF-B536-417E-9039-06402050A149.jpeg`

The browser-side `Buffer` compatibility fix and deployment-stage diagnostics were
validated with `npm run typecheck --workspace @thirdmark/web` and `git diff --check`.
The next blocker is explicit in the UI: the issuer public key and issuer endpoint
must be configured before the Thirdmark deployment button can be enabled.
