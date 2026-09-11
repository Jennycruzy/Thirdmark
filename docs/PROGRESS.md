# Progress

Updated 2026-09-11.

## W1-P0 — source verification and registration

Status: **blocked**.

Passed:

- Chose the product/repository name `Corroborate` after checking the four requested names against npm and the `Jennycruzy` GitHub account. The npm alternatives in the supplied specification were occupied; the discrepancy is recorded in [`FINDINGS.md`](FINDINGS.md).
- Initialized a fresh repository with Apache-2.0 licensing and the requested local git identity: `Jennycruzy <jennycruzy@users.noreply.github.com>`.
- Cloned the five cited references and `example-counter` into the gitignored `.references/` directory. Reference commits are recorded in [`FINDINGS.md`](FINDINGS.md).
- Read the complete MatchLock contract and Moonray slicer source. Verified witness, disclosure, ledger, nullifier, domain-separated hash, and time-gating patterns.
- Read the maintained Compact standard-library API. Verified persistent hashing, persistent commitments, Jubjub point construction and arithmetic, `hashToCurve`, and block-time circuits.
- Installed the official Compact CLI. It reports compiler 0.31.1 and lists 0.34.0, 0.31.1, and earlier toolchains.

Not passed:

- The scratch OPRF circuit has not been compiled or run. It must not be run as a product gate using the known-vulnerable 0.31.1 compiler.
- `example-counter` has not been compiled or deployed.
- The proof server has not been started or health-checked.
- No Preprod address, transaction, block, timing, screenshot, or URL exists.
- No AKINDO comment is ready to post because the required W1-P0 gate is not complete. A non-postable draft is kept in [`COMMENTS.md`](COMMENTS.md) for continuity.

Why blocked:

The official Compact security advisory GHSA-3p6x-5vpx-wwpj identifies 0.31.1 and earlier as vulnerable to forged `Uint<N>` range constraints. The only installable ledger-v8 compiler is 0.31.1; 0.34.0 targets ledger v9. Shipping or deploying with 0.31.1 would violate the project’s safety and “never assume” rules. The next action is to verify an installable patched ledger-v8 release or obtain a source-backed compatibility decision from Midnight.

User inputs still required before the external gates:

- GitHub repository URL and confirmation that the existing `Jennycruzy` account and git email should be used.
- AKINDO account confirmation and Discord handle.
- A funded Preprod wallet at W1-P2; the wallet seed or key must never be shared.
- A Vercel or Netlify account and optional domain at W1-P5.
