# Progress

Updated 2026-09-15.

## Three-filer Preprod filing and threshold-unlock evidence — 2026-09-15

The reduced Wave 1 contract was exercised end to end on Preprod with three
distinct 1AM wallet/filer states against the labelled synthetic subject
`Thirdmark Synthetic Company — Synthetic Only` (`000000000`). The third filing
changed the threshold bit to true and the browser decrypted all three
attestations locally. The explorer receipts supplied during the run are:

Active contract:

- Contract address: `acda20c181cee5a84030a088de372949104b1ea894373e2cc9af4813e0ad5fbe`
- Deployment transaction ID: `002aae5c1e3c6fdb5fbc36c082833978e7b8ea3363f45497f3608a8a85ccd25c3d`
- Deployment transaction hash: `b67da74efeb47b98bcf5570b8b7eff384a4f84874bd99ec377a4b6fb5ba77d3f`
- Deployment block: `2562366`

- Filing 1 — `25000` minor units, `90` days late, `TM-SYN-001`: [Preprod explorer transaction](https://explorer.1am.xyz/tx/6084a446c87573749aed73b7db74a67a727c6c54aeb4f687d179435c3216f2f6?network=preprod)
- Filing 2 — `300000` minor units, `90` days late, `TM-SYN-002`: [Preprod explorer transaction](https://explorer.1am.xyz/tx/2770f966f0f6d08418e84a88e1996d461eb30dc3bf5666230140dc70a39e8fbb?network=preprod)
- Filing 3 — `35000` minor units, `150` days late, `TM-SYN-003`: [Preprod explorer transaction](https://explorer.1am.xyz/tx/1b48e2cc49c4f78fba5b402763bd0560f4c52219fd232ae57fa4a636fbe30904?network=preprod)

The second amount is recorded as `300000` because that is what the unlocked
browser dossier displayed; it is not silently corrected to the originally
suggested `30000`. The cycle proves the real issuer, browser encryption,
delegated proving, contract threshold transition, and local decryption path. The
dossier screen and its public-indexer/export/verification path are implemented
below.

## Dossier integration and final public deployment — 2026-09-15

The dossier screen is now wired to the existing [`client/dossier.ts`](../client/dossier.ts)
library and the Midnight public indexer. It assembles the three locally decrypted
attestations with finalized transaction evidence, collects three distinct artifact
approvals, verifies the signed artifact, downloads `thirdmark-dossier.json`, and
independently verifies a re-uploaded JSON file.

Indexer evidence for the three successful filing hashes is:

| Filing | Transaction ID | Block | Filed at (UTC) | Explorer |
| --- | --- | ---: | --- | --- |
| 1 | `0082ceec77bace946fb68b1836f9e3cf2e4ea31c7f37470d4943e90e5e12dd1f0e` | 2562464 | 2026-09-15 15:50:42 | [Preprod](https://explorer.1am.xyz/tx/6084a446c87573749aed73b7db74a67a727c6c54aeb4f687d179435c3216f2f6?network=preprod) |
| 2 | `00cc453bdc5ddeaa7ff07737f121549dc199209e4a8c6aa6d7663d9b62f7ca19bb` | 2562606 | 2026-09-15 16:04:54 | [Preprod](https://explorer.1am.xyz/tx/2770f966f0f6d08418e84a88e1996d461eb30dc3bf5666230140dc70a39e8fbb?network=preprod) |
| 3 | `0030963b0784245ce3d57a367844e8cf7e9a7ad1a2f862bf64fd9d361807e3a71f` | 2562931 | 2026-09-15 16:37:24 | [Preprod](https://explorer.1am.xyz/tx/1b48e2cc49c4f78fba5b402763bd0560f4c52219fd232ae57fa4a636fbe30904?network=preprod) |

The transaction hashes in those receipts are, respectively,
`6084a446c87573749aed73b7db74a67a727c6c54aeb4f687d179435c3216f2f6`,
`2770f966f0f6d08418e84a88e1996d461eb30dc3bf5666230140dc70a39e8fbb`, and
`1b48e2cc49c4f78fba5b402763bd0560f4c52219fd232ae57fa4a636fbe30904`.

The production frontend deployment is `dpl_8k29tKxoaHg49LC3P9Xxy4GCtYC3` at
[`thirdmark.vercel.app`](https://thirdmark.vercel.app). Its live bundle was checked
for the dossier builder, JSON export path, and active contract address. Both
public adapter health endpoints returned HTTP 200 after the issuer and registry
were moved into Thirdmark-scoped user-level systemd services on the selected
Lightsail host. The accountless Quick Tunnel URLs remain temporary; no other
project, Nginx route, or host secret was changed.

The Vercel production configuration now includes the public issuer URL and point,
public registry adapter URL, synthetic-subject values, active contract address,
and three filing hashes. It contains no issuer scalar, wallet seed, or private
signing material.

The three approvals are deliberately described as browser-held Ed25519 artifact
signatures. They prove that three distinct keys approved the canonical dossier in
the current browser and are independently verifiable, but they are not yet
wallet-native 1AM signatures tied to supplier identity. That binding is the only
material dossier hardening item left for a production identity model.

The frontend also includes a safe recovery path for a stale tab: after a reload,
the owner can select the synthetic subject, reconnect 1AM, and recover the
already-unlocked threshold state from the encrypted local witness plus public
contract state. Recovery does not submit another filing, preventing a duplicate
third-filer attempt.

Source correction recorded during local contract inspection: Compact circuits do not
enumerate ledger state, but the generated public-state query wrapper exposes map/set
sizes and iterators. The architecture and privacy claims now describe the resulting
opaque-key occupancy/count leak explicitly; no no-enumeration claim is being carried
forward.

## Delegated-proving payload correction — 2026-09-15

The four-entry private-history reduction was still rejected by 1AM. The current
Wave 1 circuit removes the private filing-history vector, its salts, and the public
history commitment map. The duplicate-filer guarantee remains the scoped opaque
`filerNullifier`; exact ciphertext replay, threshold safety, DLEQ issuer
authentication, and client-side encryption remain enforced.

Evidence for commit `99a48cb`:

- CircleCI pipeline `#30` completed the full Compact proving-key compile, all 52
  root tests, browser typecheck, and browser build.
- The verified `file.prover` artifact is 21,579,079 bytes; the failing four-entry
  artifact was 42,686,064 bytes. `file.zkir` is 23,530 bytes.
- The public browser at `https://thirdmark.vercel.app` serves the new artifacts and
  intentionally has no build-time contract address, preventing calls to the old
  incompatible contract.

The old receipt below remains a valid historical Preprod deployment receipt, but
that contract contains the superseded circuit and cannot be upgraded in place.
The active replacement deployment and the completed three-filer cycle are
recorded above.

## W1-P0 — source verification and registration

Status: **source verification, CI validation, canonical counter smoke test, reduced Thirdmark Preprod deployment, public demo hosting, three-party filing, threshold unlock, dossier assembly, indexer evidence, artifact approvals, export, and independent verification path passed. Stable DNS and wallet-native signer identity remain optional production hardening.**

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

Not blockers:

- The development Mac still cannot execute the local 0.30.0 `zkir` process; it exits with `SIGILL`. Managed CircleCI completed the full proving-key compile, so the local CPU issue does not block validation or deployment.
- The supplied in-circuit inverse step is not available in the verified Compact API; the implemented client/circuit path uses the source-backed scalar modulus and has already passed the managed compile and real Preprod filing cycle.
- The canonical example-counter and the active reduced Thirdmark contract both have wallet-backed Preprod receipts recorded below and above.

Optional production hardening:

- Stable HTTPS/DNS requires a domain and Cloudflare account/token. The current accountless Quick Tunnels are healthy and the two backend adapters are supervised on the selected host.
- Wallet-native supplier identity binding would replace the current browser-held Ed25519 artifact approvals if AKINDO requires signer identity to be tied to 1AM accounts.

External submission input still required:

- An AKINDO account confirmation and Discord handle are needed for an authenticated external comment submission; the final draft is in [`COMMENTS.md`](COMMENTS.md).

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

- Added `contract/src/thirdmark.compact` with sealed issuer configuration, DLEQ-authenticated OPRF evaluation, persistent slot/nullifier/entry derivations, `Bytes<128>` opaque ciphertext storage, nullifier and ciphertext replay guards, a bounded evolving private filing-history commitment, fresh-salt uniqueness checks, and threshold-only unlock state.
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

At the time of this 2026-09-12 snapshot, no browser wallet transaction, registry
adapter deployment, issuer hosting, contract address, Preprod filing, dossier from
chain records, screenshot, or AKINDO gate comment existed. The later 2026-09-14
receipts and adapter evidence below supersede that snapshot.

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

This historical section predates the 2026-09-14 counter and Thirdmark receipts
recorded below.

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
- The example-counter transaction is now recorded below; the later Thirdmark
  deployment receipt is recorded in the following section.

Comment draft status: the W1-P0 and W1-P2 drafts are updated and ready for the user
to review and post.

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
The issuer URL and public key are now configured in the ignored browser environment;
the deployment receipt is recorded below.

## Thirdmark Preprod deployment receipt — 2026-09-14

The owner supplied a 1AM wallet receipt after the browser path deployed the actual
Thirdmark contract with the single-issuer public key and threshold `3`:

- Contract address: `22749f19d9b8ae40df5fd25a61866ee8b3d166e727967dea3ffef31f734cd6e4`
- Transaction ID: `000513b756e248426c0fec067dd16d3b5b7e0c05d89b32d65cea2ffee19593089a`
- Transaction hash: `792aa4578159921056df362d819be425675e644d3f81cd66e2d634df8cbdd0b2`
- Block: `2550375`
- Screenshot: `/Users/user/Pictures/Photos Library.photoslibrary/originals/8/81867582-D096-445A-A17B-A2BBBD596855.jpeg`

The ignored `web/.env.local` now contains only the issuer URL, issuer public point,
and this public contract address. It contains no issuer scalar or wallet material.
The next gate is an end-to-end filing, beginning with a real CAC adapter result and
one browser-held filer state.

## Initial replacement Thirdmark deployment and public demo stack — 2026-09-15

The original issuer scalar for the 14 September contract could not be recovered
from the local workspace or either available Lightsail host. Because the issuer
public point is sealed into the contract, generating a new scalar for that old
contract would have made the browser path fail closed. The owner authorized a
fresh Preprod deployment instead; the old receipt above remains historical.

Initial replacement receipt supplied by the owner after the connected 1AM wallet
path completed; it was superseded by the payload-compatible deployment recorded
below:

- Contract address: `0c3bc3991fa7cd8e8f88e444f01925810db4eb6c15b102c767dc0ccc9093d85a`
- Transaction ID: `00b3588bdb549b2fbce08c66402d79483b5efa2c3c244d8a7a03b31dd6c6de04d1`
- Transaction hash: `79a43b9220e636fc7f34afcc347e481306699dd53d5a52ae618475e180d127df`
- Block: `2559681`
- Issuer public point X: `204672577557605287820497018819041753968088741810193409593349906945901987694`
- Issuer public point Y: `28428946414311095959940971962553415704357918583949997884813409128029017757158`

The public demo stack is now:

- Frontend: `https://thirdmark.vercel.app`
- Issuer HTTPS endpoint: `https://together-session-consequently-employee.trycloudflare.com`
- CAC adapter HTTPS endpoint: `https://proper-directed-concerts-utilize.trycloudflare.com`
- Host: the selected Lightsail instance `13.62.181.128`, isolated under
  `/home/ubuntu/thirdmark`, with loopback listeners on `8797` and `8798`.

The issuer scalar is generated and stored only on that host with restrictive
permissions; it is not in the repository, browser bundle, or this record. The
existing projects, ports, Nginx routes, and processes on the host were not
modified. The two `trycloudflare.com` URLs are accountless Quick Tunnels for the
demo and are not production-grade stable service names; a restart may require
capturing new URLs and rebuilding the browser configuration.

Verification after deployment: both HTTPS health checks returned HTTP 200, both
returned `access-control-allow-origin: https://thirdmark.vercel.app`, and the
Vercel root served the rebuilt browser bundle. No filing, unlock, or dossier is
claimed by these checks.

## Superseded delegated-proving payload fix and deployment receipt — 2026-09-15

The first replacement circuit still carried a 32-entry private filing history.
1AM reached delegated proving but rejected the resulting payload as too large or
too deeply nested. A four-entry Wave 1 history bound was compiled and deployed,
but it also failed at the same proving stage. CircleCI pipeline `#26` completed
the full Compact proving-key compile and all simulator tests for that superseded
revision.

The owner then deployed the matching contract through 1AM:

- Contract address: `76df34103d6e2e0e0b1a561509366090c27eb392f6a07eb75b2d102fd646ef12`
- Transaction ID: `00a602aeba4fb9ffd0a9a04902da9f870c79a82ca03fae0d565d433b94d93525cb`
- Transaction hash: `c5e7eddd73bc3463c55f05131d7b15563d2a0a4f460e9a5bca2db4f174b2135c`
- Block: `2561298`

The indexer state decodes with threshold `3` and the expected sealed issuer
public point. The current public build no longer pins this superseded address;
it serves the reduced circuit assets and uses the replacement contract recorded
in the current deployment evidence. The three-filer filing and threshold unlock
are recorded above; the dossier remains the next evidence gate.

## CAC registry adapter — 2026-09-14

The official iCRP frontend request was verified against the live CAC service. The
local adapter uses the source-backed request and filters results to registered
companies only:

- Adapter process: `Thirdmark CAC adapter listening on 127.0.0.1:8788`.
- Browser endpoint: `http://127.0.0.1:8788/v1/cac/search`.
- Live response check: `curl` with `Origin: http://localhost:5173` returned the
  documented `{ results: [{ name, rcNumber, status }] }` shape.
- Validation: root and browser typechecks passed after adding `registry/server.ts`.

The adapter forwards no credentials, stores no CAC records, and only sends the
company name, RC number, and coarse status to the browser. It is a buildathon
integration against CAC's public-search request path; production should migrate to
an authorized CAC VAS integration when available.

## Product presentation and safe synthetic-subject path — 2026-09-14

Completed:

- Added a separate landing page so a judge sees the problem, threshold rule,
  public/private boundary, evidence links, and residual limits before entering the
  filing workspace.
- Added a configuration-driven synthetic subject, labelled `Thirdmark Synthetic
  Company — Synthetic Only` with deliberately invalid identifier `000000000`. It uses the
  same subject canonicalization, OPRF, encryption, and contract path as a live lookup;
  it is not a CAC record and must not be replaced with one for a recording.
- Replaced user-facing implementation language with product language where it crossed
  the privacy boundary: report details, company reference, sealed report, and opaque
  filer state. Technical detail remains in the linked architecture and findings documents.
- Rewrote the README to lead with the problem, link the judge path immediately, publish
  verified Preprod evidence, explain the product in one minute, state residual leaks,
  and distinguish completed artifacts from open filing/dossier gates.

Validation for this presentation pass is complete: the browser typecheck and
production build pass. No new Preprod claim is made by this UI/documentation change.

## Browser OPRF transport correction — 2026-09-14

The first filing attempt stopped before wallet interaction at the blinded-slot
derivation step. The browser reported `TypeError: Failed to fetch`; the issuer
health endpoint, blinded evaluation endpoint, and proof verification all passed
from the local runtime. The local Vite app now uses same-origin proxy paths for the
issuer and CAC adapter, avoiding the browser loopback-origin boundary while keeping
the issuer subject-blind protocol unchanged.

Validation: root suite 52 tests passed, browser typecheck passed, browser production
build passed, and the OPRF round-trip through the restarted Vite proxy returned HTTP
200 with a verified proof. No Preprod filing transaction is claimed from this
attempt; the next evidence step is the user-approved browser filing.
