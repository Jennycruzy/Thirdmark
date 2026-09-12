# Thirdmark

Three suppliers can independently attest that the same company is 90+ days overdue. A single filing is sealed. Only the third independent filing unlocks the three records to those three filers and produces a co-signed dossier.

Thirdmark is a Midnight Buildathon project focused on one narrow Wave 1 vertical: late-payment corroboration for synthetic companies in one registry jurisdiction. The project keeps filing contents private, discloses one public threshold result, and settles the result as a dossier that can be checked against the public ledger.

> Status: initial source verification is complete. The safe ledger-v8 candidate is Compact 0.30.0 (language 0.22.0, runtime 0.15.0, compiler target ledger-8.0.2), which the official advisory identifies as outside the affected 0.31.x range. CircleCI pipeline #3 passed full proving-key compilation, strict typechecking, and the six-test `OprfSimulator` suite. This development Mac still exits with `SIGILL` from the bundled `zkir` binary locally. No deployment is claimed until the Preprod checks pass.

## Why Midnight

This is inter-party private state, not self-attestation. Each supplier proves knowledge of a private filing and a private filing history while the public ledger stores only commitments, nullifiers, opaque ciphertexts, aggregate counts, and the threshold result. The dual-ledger model lets private witness data drive a public state transition without placing report plaintext on a server. A transparent chain cannot provide the same selective disclosure boundary.

The differentiator is simple: every supplier knows the buyer does not pay, and none of them has to be the only one to say it.

## Planned Wave 1 architecture

- Canonical company registration identifiers are resolved by registry lookup. Wave 1 uses one jurisdiction; free-text company names are not cryptographic inputs.
- A single issuer provides a blind OPRF service. The issuer can rate-limit or censor requests, but cannot recover the company identifier from a blinded point, read filings, or force a reveal. Wave 2 distributes the OPRF key across issuers. The client computes the Jubjub scalar inverse using the source-backed runtime constant; the selected ledger-v8 Compact toolchain does not expose arithmetic or inversion for `JubjubScalar`.
- Slot keys and filer nullifiers use `persistentHash`. Filing-history commitments use `persistentCommit` with a fresh opening for every filing.
- Report plaintext is encrypted in the client with AES-GCM. The Compact contract receives only a fixed-width opaque ciphertext.
- The contract has no administrator, pause circuit, upgrade path, or operator reveal path.
- The public ledger has no enumeration circuit. An observer who can derive an exact slot key can learn that slot’s aggregate count; the OPRF is therefore part of the count-privacy boundary.

The detailed threat model is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The safety and demo rules are in [`docs/ETHICS.md`](docs/ETHICS.md).

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
