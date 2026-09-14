# Thirdmark

Three suppliers can independently attest that the same company is 90+ days overdue. A single filing is sealed. Only the third independent filing unlocks the three records to those three filers and produces a co-signed dossier.

Thirdmark is a Midnight Buildathon project focused on one narrow Wave 1 vertical: late-payment corroboration for synthetic companies in one registry jurisdiction. The project keeps filing contents private, discloses one public threshold result, and settles the result as a dossier that can be checked against the public ledger.

> Status: initial source verification, the local contract layer, client AES-GCM envelope, client and issuer OPRF cores, subject-blind issuer transport, browser Midnight.js contract client, encrypted browser private-state provider, deterministic dossier artifact, and Nigeria CAC subject canonicalization are complete. The safe ledger-v8 candidate is Compact 0.30.0 (language 0.22.0, runtime 0.15.0, compiler target ledger-8.0.2), which the official advisory identifies as outside the affected 0.31.x range. The local command passes 8 test files and 52 tests, and the web typecheck and Vite/WASM production build pass. CircleCI compiles the full proving artifacts, stages them for the browser build, and runs the same checks. This development Mac still exits with `SIGILL` from the bundled `zkir` binary locally. No deployment or end-to-end contract filing is claimed until the Preprod checks pass.

## Why Midnight

This is inter-party private state, not self-attestation. Each supplier proves knowledge of a private filing and a private filing history while the public ledger stores only commitments, nullifiers, opaque ciphertexts, aggregate counts, and the threshold result. The dual-ledger model lets private witness data drive a public state transition without placing report plaintext on a server. A transparent chain cannot provide the same selective disclosure boundary.

The differentiator is simple: every supplier knows the buyer does not pay, and none of them has to be the only one to say it.

## Planned Wave 1 architecture

- Canonical company registration identifiers are resolved by registry lookup. Wave 1 uses Nigeria's Corporate Affairs Commission (CAC) company `RC Number`; free-text company names are not cryptographic inputs. The canonicalization rules and current public-search boundary are documented in [`docs/REGISTRY.md`](docs/REGISTRY.md).
- A single issuer provides a blind OPRF service. The issuer can rate-limit or censor requests, but cannot recover the company identifier from a blinded point, read filings, or force a reveal. Wave 2 distributes the OPRF key across issuers. The client computes the Jubjub scalar inverse using the source-backed runtime constant; the selected ledger-v8 Compact toolchain does not expose arithmetic or inversion for `JubjubScalar`.
- Slot keys and filer nullifiers use `persistentHash`. Filing-history commitments use `persistentCommit` with a fresh opening for every filing.
- The Compact contract authenticates the issuer’s OPRF evaluation with an in-circuit DLEQ proof. It derives the slot key only from the verified evaluated point and the private unblinding scalar; the caller cannot submit an arbitrary slot key.
- Report plaintext is encrypted in the client with AES-GCM. The Compact contract receives only a fixed-width opaque ciphertext.
- The contract has no administrator, pause circuit, upgrade path, or operator reveal path.
- Compact circuits have no enumeration operation. However, the generated public-state
  query wrapper exposes `size()` and iterators for ledger maps and sets, so a chain
  observer can enumerate opaque occupied keys and aggregate counts. The OPRF is
  therefore mandatory: those keys are not company identifiers, and an observer without
  the issuer-derived slot secret cannot map them to a registry subject. This is a
  broader residual leak than the original no-enumeration assumption; it is recorded in
  [`docs/FINDINGS.md`](docs/FINDINGS.md) and must be shown honestly in the privacy UI.

The detailed threat model is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The safety and demo rules are in [`docs/ETHICS.md`](docs/ETHICS.md).

## Local contract and simulator

The first product contract is [`contract/src/thirdmark.compact`](contract/src/thirdmark.compact).
It contains the sealed issuer configuration, DLEQ-authenticated OPRF slot derivation,
nullifier and ciphertext replay guards, evolving private filing-history commitment,
opaque `Bytes<128>` storage, and threshold-only unlock state. The in-process
[`ThirdmarkSimulator`](contract/src/test/thirdmark-simulator.ts) runs without a proof
server or wallet and uses the same production witness implementation from
[`contract/src/witnesses.ts`](contract/src/witnesses.ts). State is advanced only after
the transaction succeeds. Run the local checks with:

```sh
npm test
```

The local command intentionally uses `--skip-zk` because this Intel Mac cannot execute
the bundled `zkir`; CircleCI performs the full proving-key compile. This is test/build
evidence only, not Preprod deployment evidence.

Client report encryption lives in [`client/crypto.ts`](client/crypto.ts). It derives an
AES-GCM key from the OPRF-derived Jubjub point, places a random IV and authentication
tag in a fixed `Bytes<128>` envelope, and rejects malformed widths or report fields
before a contract call. Plaintext and slot secrets stay in the client process; the
contract receives only the opaque envelope.

The client-side 2HashDH session is [`client/oprf.ts`](client/oprf.ts). It blinds the
fixed-width registry subject, verifies the issuer's DLEQ evaluation with the generated
Compact pure circuit, unblinds the point, and derives the same slot key that the filing
circuit derives. The subject-blind issuer HTTP boundary is documented in
[`docs/ISSUER.md`](docs/ISSUER.md). It is a real request handler and local transport
test, but it is not a hosted issuer and does not contain an operator scalar.

The browser client lives in [`web/`](web/). It connects to a real Midnight wallet when
one is installed, uses the source-backed Midnight.js provider path for delegated
proving and transaction submission, refuses to accept a raw RC number, renders the
five-step product flow and privacy inspector, and blocks actions until explicit
public deployment configuration exists. Filer witness state is stored as encrypted
IndexedDB records through [`web/src/midnight/private-state.ts`](web/src/midnight/private-state.ts);
the encryption key is non-exportable browser storage, not a hardware vault or a
password vault. The browser does not fake a filing transaction: it either submits a
real wallet call or explains which deployment value is missing.

When `VITE_CONTRACT_ADDRESS` is empty, the browser shows a deployment panel. After
the public issuer key is configured and Lace is connected to Preprod, use that panel
to deploy the canonical example-counter first, then Thirdmark. Lace owns wallet
synchronization, balancing, signing, and submission; the laptop does not need to run
the headless reference-counter wallet replay. The Thirdmark action remains disabled
without the public issuer key and neither action bypasses wallet or network safety
checks. The pinned counter source and generated binding are in
[`verification/example-counter/`](verification/example-counter/).

The browser runtime requires the four full Thirdmark proving artifacts generated by
the managed Compact compile (`file.prover`, `file.verifier`, `file.bzkir`, and
`file.zkir`) plus the four `example-counter` `increment` artifacts. They are staged
by [`scripts/prepare-browser-artifacts.sh`](scripts/prepare-browser-artifacts.sh) in
CircleCI and are intentionally not committed. The public build still has no contract
address, issuer endpoint, issuer public key, or registry-adapter fallback.

The local dossier implementation is [`client/dossier.ts`](client/dossier.ts). It sorts
the three unlocked records by entry key, binds the contract address, slot key,
threshold, and indexer-supplied filing times, then signs the canonical JSON bytes with
three distinct signer references. The current Compact contract has no timestamp
ledger cell, so the browser client does not invent filing dates: indexer transaction
retrieval and wallet-backed dossier signing remain the next integration layer and are
not represented as complete here.

## Three-wave roadmap

Wave 1 is one jurisdiction, a k=3 late-payment flow, a single-issuer OPRF, an evolving filing-history commitment, client-side encrypted payloads, nullifier protection, a deployed contract, five finished screens, and a verifiable dossier.

Wave 2 generalises to arbitrary k, distributes the OPRF key across t-of-n issuers, adds expiry and pre-threshold withdrawal, and completes the adversarial suite.

Wave 3 takes one vertical to a design partner, publishes an audit-style threat-model writeup, and hardens the deployment.

## Development status and evidence

All progress, source findings, residual leaks, and public-comment drafts are maintained in [`docs/PROGRESS.md`](docs/PROGRESS.md), [`docs/FINDINGS.md`](docs/FINDINGS.md), and [`docs/COMMENTS.md`](docs/COMMENTS.md). No Preprod address, transaction, timing, screenshot, or live URL is claimed until it exists as evidence.

## Local setup

The local setup is intentionally limited by the development Mac’s `zkir` CPU requirement; the authoritative full-proof compile runs in CircleCI. The source references used during verification are kept outside version control in `.references/`.

Required before the first compile:

- Node.js 24.11.1, matching the pinned `example-counter` reference; the CircleCI job uses the verified `cimg/node:24.11` image.
- Compact 0.30.0, language 0.22.0, runtime 0.15.0, and the matching ledger-v8 JavaScript packages. The version decision and source evidence are in [`docs/FINDINGS.md`](docs/FINDINGS.md).
- Docker and Docker Compose for the proof server.
- A funded Preprod wallet supplied by the project owner at the deployment gate. Wallet keys and seed phrases never enter this repository or the chat.

The reproducible reference-counter and OPRF compile check is [`scripts/verify-compact.sh`](scripts/verify-compact.sh). It intentionally requires full proving-key generation; `--skip-zk` is not a passing build.

The managed browser-artifact step is [`scripts/prepare-browser-artifacts.sh`](scripts/prepare-browser-artifacts.sh). It fails closed when a full Compact compile has not produced all four `file` proving assets; it never creates placeholder files.

The archived `example-counter` Preprod CLI currently has a wallet SDK collection-shape defect during sync. After installing its dependencies, apply the narrow, source-checked compatibility patch before running the CLI:

```sh
npm run patch:reference-wallet
```

The patch converts the ledger’s native `Map` iterator to an array before mapping pending shielded outputs. It also adds progress reporting and five-second checkpoints for the three SDK wallet states. A fresh CLI otherwise replays the complete Preprod event history from cursor zero and presents only a spinner; after an interruption, the same public wallet resumes from its latest local checkpoint. Checkpoints contain SDK-serialized wallet state, not the seed or secret keys, and are written below the ignored reference checkout with `0700`/`0600` permissions. The script refuses to modify an unexpected SDK source.

If the current CLI is already showing `Syncing with network`, stop it with `Ctrl-C`, apply the patch, and restart it. Do not fund a second address. The first run still has to catch up to the current Preprod indexer; subsequent interruptions do not discard the completed replay.

Start the pinned Preprod proof server and check its health:

```sh
docker compose up -d
curl http://127.0.0.1:6300/
```

A healthy server returns a JSON response with `"status":"ok"`. The compose configuration is pinned to the source-backed `midnightntwrk/proof-server:8.0.3` image.

## Prior art and attribution

Thirdmark is built for Midnight and uses the Compact language and Midnight tooling. It is informed by the cited Midnight example and winner repositories listed in [`docs/FINDINGS.md`](docs/FINDINGS.md).

Callisto is prior art for threshold escrow in a different and more sensitive vertical. Callisto relies on trusted custodians who can decrypt; Thirdmark’s intended issuer can rate-limit but cannot decrypt filings. Thirdmark does not claim to invent threshold escrow.

## License

Midnight-related code in this repository is licensed under Apache-2.0. See [`LICENSE`](LICENSE).
