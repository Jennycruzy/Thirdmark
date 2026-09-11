# Corroborate

Three suppliers can independently attest that the same company is 90+ days overdue. A single filing is sealed. Only the third independent filing unlocks the three records to those three filers and produces a co-signed dossier.

Corroborate is a Midnight Buildathon project focused on one narrow Wave 1 vertical: late-payment corroboration for synthetic companies in one registry jurisdiction. The project keeps filing contents private, discloses one public threshold result, and settles the result as a dossier that can be checked against the public ledger.

> Status: initial source verification is complete. Implementation is blocked until a patched Compact 0.31 toolchain is published for the ledger-v8 Preprod line. The available 0.31.1 compiler is covered by Midnight’s critical range-proof advisory and will not be used for a deployment.

## Why Midnight

This is inter-party private state, not self-attestation. Each supplier proves knowledge of a private filing and a private filing history while the public ledger stores only commitments, nullifiers, opaque ciphertexts, aggregate counts, and the threshold result. The dual-ledger model lets private witness data drive a public state transition without placing report plaintext on a server. A transparent chain cannot provide the same selective disclosure boundary.

The differentiator is simple: every supplier knows the buyer does not pay, and none of them has to be the only one to say it.

## Planned Wave 1 architecture

- Canonical company registration identifiers are resolved by registry lookup. Wave 1 uses one jurisdiction; free-text company names are not cryptographic inputs.
- A single issuer provides a blind OPRF service. The issuer can rate-limit or censor requests, but cannot recover the company identifier from a blinded point, read filings, or force a reveal. Wave 2 distributes the OPRF key across issuers. The client computes the Jubjub scalar inverse using the source-backed runtime constant; Compact 0.31 does not expose arithmetic or inversion for `JubjubScalar`.
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

The setup is intentionally incomplete until the Compact security blocker is resolved. The source references used during verification are kept outside version control in `.references/`.

Required before the first compile:

- Node.js 22.x, matching the current Midnight examples.
- The Compact toolchain selected from Midnight’s published compatibility matrix.
- Docker and Docker Compose for the proof server.
- A funded Preprod wallet supplied by the project owner at the deployment gate. Wallet keys and seed phrases never enter this repository or the chat.

The first runnable commands will be added only after the compiler and proof-server versions are source-compatible and safe to deploy.

## Prior art and attribution

Corroborate is built for Midnight and uses the Compact language and Midnight tooling. It is informed by the cited Midnight example and winner repositories listed in [`docs/FINDINGS.md`](docs/FINDINGS.md).

Callisto is prior art for threshold escrow in a different and more sensitive vertical. Callisto relies on trusted custodians who can decrypt; Corroborate’s intended issuer can rate-limit but cannot decrypt filings. Corroborate does not claim to invent threshold escrow.

## License

Midnight-related code in this repository is licensed under Apache-2.0. See [`LICENSE`](LICENSE).
