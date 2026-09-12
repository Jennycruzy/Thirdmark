# Progress

Updated 2026-09-12.

Source correction recorded during local contract inspection: Compact circuits do not
enumerate ledger state, but the generated public-state query wrapper exposes map/set
sizes and iterators. The architecture and privacy claims now describe the resulting
opaque-key occupancy/count leak explicitly; no no-enumeration claim is being carried
forward.

## W1-P0 — source verification and registration

Status: **blocked**.

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
- `example-counter` has been compiled in CircleCI but has not been deployed.
- The local full counter compile still exits with `zkir` `-4`/`SIGILL`; the managed compiled assets are available from pipeline `#5` and are installed only in the gitignored reference checkout.
- No Preprod address, transaction, block, timing, screenshot, or URL exists.
- No AKINDO comment is ready to post because the required W1-P0 gate is not complete. The non-postable draft in [`COMMENTS.md`](COMMENTS.md) now includes the CircleCI evidence.

Why blocked:

The official Compact security advisory GHSA-3p6x-5vpx-wwpj identifies 0.31.1 and earlier as vulnerable to forged `Uint<N>` range constraints, while the same advisory identifies 0.30.x as outside that regression. Compact 0.34.0 targets ledger v9 and is not a Preprod substitute. The safe 0.30.0 candidate is installed, and its full proving-key compile for both the reference counter and the OPRF scratch circuit passed on the managed CircleCI runner. The scratch circuit also passes the in-process simulator suite locally and in the latest CircleCI run. This development Mac’s CPU still cannot execute the bundled `zkir`, but managed deployment assets are available. The next action is a user-controlled wallet create/restore and funding step, followed by deployment of the official example-counter.

User inputs still required before the external gates:

- AKINDO account confirmation and Discord handle.
- A funded Preprod wallet at W1-P2; the wallet seed or key must never be shared.
- A Vercel or Netlify account and optional domain at W1-P5.

## Parallel local implementation — 2026-09-12

The wallet replay remains the only external deployment blocker. At the user’s
direction, product implementation continued without claiming W1-P0 or W1-P1.

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
