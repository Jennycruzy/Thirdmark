# Thirdmark

> Three suppliers know. None stands alone.

Thirdmark is a privacy-first corroboration product for late-payment reporting. Each supplier submits an encrypted, dated attestation about the same company. The first report is sealed. The second is still sealed. Only the third independent filing changes the public threshold state, and only the three participating suppliers can read the records that they choose to share.

The product is built on Midnight: private inputs drive a public state transition, while the public ledger receives an opaque report envelope, scoped anti-replay protection, and the threshold result. A transparent chain cannot provide this boundary without exposing the first supplier.

## The problem

A supplier may know that a large customer is more than 90 days overdue and still stay silent. Being the only supplier on record can cost the relationship, the next order, or the supplier’s reputation.

Thirdmark makes corroboration possible without publishing a lone accusation. Three independent suppliers can point to the same canonical company reference, file privately, and reach a shared dossier only when the threshold is genuinely met.

## Judge first: the important links

- [Source repository](https://github.com/Jennycruzy/Thirdmark) — Compact contract, simulator, client cryptography, browser application, and evidence.
- [Preprod deployment and progress evidence](docs/PROGRESS.md) — verified contract receipts, blocks, tests, and remaining gates.
- [Threat model and architecture](docs/ARCHITECTURE.md) — state layout, OPRF derivation, filing guards, residual leaks, and dossier boundary.
- [Safety rules](docs/ETHICS.md) — why the threshold is the safety property and why public recordings use synthetic subjects.
- [Source findings](docs/FINDINGS.md) — version decisions, source corrections, and constraints discovered from Compact and Midnight tooling.
- [Midnight documentation](https://docs.midnight.network/) — the platform and dual-ledger model used by Thirdmark.
- [Nigeria CAC public search](https://icrp.cac.gov.ng/public-search/) — the official registry boundary used to resolve a company name to an RC number.
- [CircleCI build evidence](https://app.circleci.com/pipelines/github/Jennycruzy/Thirdmark) — managed full-proof compilation and browser checks.

The current build has a real Thirdmark contract on Midnight Preprod and a public browser URL at `https://thirdmark.vercel.app`. The three-wallet filing cycle and threshold unlock are evidenced in [`docs/PROGRESS.md`](docs/PROGRESS.md); the dossier export and independent verification remain open product gates.

## The product in one minute

The browser workspace follows five steps:

1. **Find** — choose a company from the Nigeria CAC lookup, or choose the clearly labelled synthetic subject for a safe recording. The user does not type a registration number.
2. **File** — enter amount overdue, days late, and invoice reference. The browser encrypts the report before preparing the contract call.
3. **Sealed** — the report is finalized but no sub-threshold count is shown.
4. **Unlocked** — the third independent filing makes the threshold true. Only the participating filers can decrypt their records locally.
5. **Dossier** — the three attestations are assembled into a signed, independently checkable artifact using public ledger evidence.

For local testing and public recordings, use the synthetic subject named **“Thirdmark Synthetic Company — Synthetic Only”** with the deliberately invalid identifier `000000000`. It is test data, not a CAC company. Never use a live CAC result in screenshots, recordings, or fabricated allegations.

## What makes it private

| Visible to the public ledger | Kept in the browser or private service boundary |
| --- | --- |
| Fixed-width encrypted report envelope | Company reference before blinded derivation |
| Anti-replay nullifier | Amount overdue, days late, and invoice reference |
| Opaque filer nullifier and ciphertext guard | Slot secret, filer secret, and report details |
| Opaque slot occupancy and threshold state | Plaintext report and local decryption keys |

The product-level disclosure is the threshold result: sealed or unlocked. The ledger also has public state because Midnight ledger state is public; the commitments, ciphertexts, and keys are designed to be opaque rather than personal data.

## Why Midnight

Thirdmark needs Midnight for three related reasons:

- **Selective disclosure:** report details remain private while the contract exposes the threshold transition.
- **Private state with public settlement:** each filer proves private OPRF material and a filer secret while the ledger records only opaque guards, a protected envelope, and the threshold result.
- **A real contract boundary:** the third filing is checked by Compact logic and settled on Preprod, rather than being simulated by a web server.

This is inter-party private state, not self-attestation. A supplier is not proving a fact about its own balance; several independent parties are corroborating a subject that none of them should expose alone.

## Current verified delivery

### Deployed on Midnight Preprod

The first replacement Thirdmark deployment was submitted through the connected
1AM wallet on 15 September 2026 with a threshold of three. It is retained as a
receipt, but it is superseded by the smaller delegated-proving circuit below
and must not be used with the current browser build:

- Contract: `76df34103d6e2e0e0b1a561509366090c27eb392f6a07eb75b2d102fd646ef12`
- Transaction ID: `00a602aeba4fb9ffd0a9a04902da9f870c79a82ca03fae0d565d433b94d93525cb`
- Transaction hash: `c5e7eddd73bc3463c55f05131d7b15563d2a0a4f460e9a5bca2db4f174b2135c`
- Block: `2561298`

The current browser build serves the smaller circuit and intentionally leaves the
contract address empty. The next wallet action is one fresh Thirdmark deployment
from the setup panel; that browser remembers the new address locally. The old
address above cannot be upgraded in place.

The canonical example-counter smoke test was deployed first through the same browser-wallet path:

- Contract: `fdfd87f55cfcb499dec443d1c35f38fd7d721baa45dbb66303b8f3fb8dd38c4`
- Transaction hash: `3c8a9e7474f8f6b3422c3b5d110199368e5fbee63b9d8f66664f5b1d3d126ea5`
- Block: `2549975`

### Implemented and tested

- Compact contract with sealed issuer configuration and threshold `3`.
- DLEQ-authenticated blinded OPRF evaluation for subject-derived slots.
- Client-side AES-GCM report encryption with an exact `Bytes<128>` envelope.
- Scoped anti-replay nullifiers and ciphertext replay guards.
- No admin key, forced reveal, pause circuit, or upgrade path.
- `ThirdmarkSimulator` and adversarial tests for replay, bad proofs, wrong widths, threshold safety, and subject separation.
- Browser wallet client using delegated proving and real Midnight transaction submission.
- Encrypted browser private-state storage that retains the filer secret and OPRF material locally.
- Nigeria CAC adapter based on the official public-search request path, with no CAC credential in the browser and no registry storage.
- Landing page, privacy inspector, five-step filing workspace, and a synthetic-only subject path.

The public frontend is available at `https://thirdmark.vercel.app`. Its issuer
and CAC adapter run as isolated user services on the selected Lightsail host
behind temporary HTTPS tunnels. The three-filer filing and threshold unlock are
recorded in [`docs/PROGRESS.md`](docs/PROGRESS.md); the dossier export and
independent verification remain open. See
[`docs/PROGRESS.md`](docs/PROGRESS.md) for the hosting caveat and receipts.

Latest local validation before this product pass: 52 root tests passed and the browser typecheck passed. CircleCI performs the full proving-key compile because the development Mac cannot execute the bundled `zkir` binary. Full evidence and historical findings are in [`docs/PROGRESS.md`](docs/PROGRESS.md), not inferred from a green local UI.

## How the privacy mechanism works

The company name is not a cryptographic input. The CAC lookup supplies a company RC number, which is normalized into a subject namespace:

```text
NG:CAC:company:RC:<digits>
```

The browser hashes that canonical subject into a fixed-width OPRF input, blinds it, and asks the single Wave 1 issuer to apply its secret. The issuer sees only the blinded curve point. The browser unblinds the result and derives the slot secret. The issuer can rate-limit or refuse service, but it does not receive the company identifier, report plaintext, or decryption key.

For each filing, the Compact circuit:

1. Verifies the issuer evaluation and the caller’s private unblinding relation.
2. Derives the slot key and filer nullifier inside the circuit.
3. Rejects a repeated filer, an exact ciphertext replay, or a malformed envelope.
4. Stores only the opaque ciphertext and entry commitment.
5. Discloses the threshold predicate only when the third valid filing arrives.

The detailed state model is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The contract source is [`contract/src/thirdmark.compact`](contract/src/thirdmark.compact), and the simulator is [`contract/src/test/thirdmark-simulator.ts`](contract/src/test/thirdmark-simulator.ts).

## Limits we state plainly

Privacy is not the same as invisibility. The public ledger contains opaque occupancy and aggregate state. Anyone who can derive an exact slot key can query that slot’s count. The OPRF is the protection against ordinary subject enumeration; it does not make a leaked or guessable slot secret safe.

Wave 1 uses one issuer. That issuer can censor or throttle OPRF requests. It cannot read report plaintext or force a threshold reveal. Wave 2 is planned to distribute the OPRF key across multiple issuers so one party cannot control the service boundary alone.

The current Compact contract does not record a timestamp cell itself. The final dossier must obtain filing dates from the public indexer and label that source. The local dossier module already enforces deterministic ordering, threshold cardinality, distinct signers, and signature verification; wallet-backed signing and indexer retrieval remain open integration work until a real three-party cycle proves them.

## Run the checks

Requirements: Node.js matching the pinned CI image, Docker for the proof server, and no wallet secret in the repository or chat.

```sh
npm ci
npm test
npm run web:typecheck
npm run web:build
```

`npm test` uses the safe local Compact `--skip-zk` compile and the in-process simulator. The full proving-key compile runs in CircleCI. The selected safe toolchain is Compact `0.30.0`, language `0.22.0`, runtime `0.15.0`, and ledger-v8 `8.0.3`; the version rationale is recorded in [`docs/FINDINGS.md`](docs/FINDINGS.md).

## Run the local product

### 1. Start the issuer

Keep the issuer scalar only in the terminal process. Generate it locally; do not paste it into chat, a file, or a commit. The complete runtime boundary is documented in [`docs/ISSUER.md`](docs/ISSUER.md).

```sh
export THIRDMARK_ISSUER_HOST=127.0.0.1
export THIRDMARK_ISSUER_PORT=8787
export THIRDMARK_ISSUER_ALLOWED_ORIGIN=http://localhost:5173
export THIRDMARK_ISSUER_SCALAR_HEX="$(node --import tsx -e 'import { randomJubjubScalar } from "./client/scalars.ts"; process.stdout.write(randomJubjubScalar().toString(16))')"
npm run issuer:start
```

The browser receives only the issuer URL and public point through ignored local configuration.

### 2. Start the CAC adapter

The adapter proxies the source-backed public search request because CAC’s response allows its official page origin rather than arbitrary localhost origins. It stores no records and forwards no credential.

```sh
export THIRDMARK_CAC_PUBLIC_SEARCH_URL='https://authapp.cac.gov.ng/name_similarity_app/api/public_search/search'
export THIRDMARK_REGISTRY_HOST=127.0.0.1
export THIRDMARK_REGISTRY_PORT=8788
export THIRDMARK_REGISTRY_ALLOWED_ORIGIN=http://localhost:5173
npm run registry:start
```

If the command reports `EADDRINUSE`, the adapter is already running. Check it instead of starting another copy:

```sh
curl http://127.0.0.1:8788/health
```

### 3. Configure the browser

Create the ignored file `web/.env.local` with public deployment values. Never place the issuer scalar, wallet seed, private key, or CAC credential in it:

```dotenv
# Local Vite uses same-origin proxies for the issuer and registry boundaries.
VITE_ISSUER_URL=/__thirdmark_issuer
VITE_ISSUER_PUBLIC_KEY_X=<issuer-public-x>
VITE_ISSUER_PUBLIC_KEY_Y=<issuer-public-y>
VITE_CONTRACT_ADDRESS=0c3bc3991fa7cd8e8f88e444f01925810db4eb6c15b102c767dc0ccc9093d85a
VITE_REGISTRY_ADAPTER_URL=/__thirdmark_registry/v1/cac/search
VITE_SYNTHETIC_SUBJECT_NAME=Thirdmark Synthetic Company — Synthetic Only
VITE_SYNTHETIC_SUBJECT_RC=000000000
```

### 4. Start the browser

```sh
npm run dev --workspace @thirdmark/web -- --host 127.0.0.1
```

Open `http://localhost:5173`. The landing page explains the product before the filing workspace is opened. Use **Open the workspace** and select the clearly labelled synthetic subject for recordings. Connect a funded Midnight Preprod wallet before submitting a real transaction.

## Tests and quality bar

The test suite includes:

- OPRF round trips under different blindings and subject separation.
- DLEQ proof rejection and forged issuer evaluation rejection.
- Duplicate filer and ciphertext replay rejection.
- Scoped nullifier replay rejection.
- Threshold rejection below three and unlock at exactly three.
- Wrong ciphertext width and invalid report-field rejection.
- Fourth-filing rejection after unlock.
- Client encryption/decryption and authentication failure.
- Deterministic dossier ordering, signature verification, and tamper rejection.
- CAC RC canonicalization across display variants.

No test is skipped or marked as a placeholder. The simulator does not pretend to be a Preprod transaction; deployment evidence is kept separately in [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Three-wave roadmap

### Wave 1 — one complete vertical

Nigeria CAC company references, threshold `3`, one issuer, scoped opaque nullifiers, client-side encryption, real Preprod deployment, five screens, and a verifiable dossier.

### Wave 2 — general threshold service

Arbitrary `k`, distributed OPRF issuers, expiry windows, pre-threshold withdrawal, and the completed adversarial suite.

### Wave 3 — operational deployment

One narrow design-partner vertical, synthetic-but-plausible volume, an audit-style threat-model report, and a hardened deployment.

If scope must be reduced, the dossier can remain a signed JSON artifact. Threshold safety and the scoped nullifier guard are not optional shortcuts; a richer evolving private-history commitment is deferred until it can fit the delegated-wallet proving boundary.

## Prior art and ethics

Callisto is prior art for threshold escrow in a more sensitive reporting vertical. Thirdmark does not claim to invent threshold escrow. The intended distinction is the trust boundary: Callisto’s custodians can decrypt; Thirdmark’s Wave 1 issuer is designed to rate-limit or censor without receiving report plaintext or forcing a reveal.

The project uses synthetic companies with clearly invalid identifiers in public recordings. It does not store report plaintext on a project-controlled server, and it has no administrator, pause key, forced reveal, or upgrade path. Read the full rules in [`docs/ETHICS.md`](docs/ETHICS.md).

## License

Midnight-related code is licensed under [Apache-2.0](LICENSE).
