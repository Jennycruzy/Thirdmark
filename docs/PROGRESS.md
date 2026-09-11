# Progress

Updated 2026-09-11.

## W1-P0 — source verification and registration

Status: **blocked**.

Passed:

- Chose the product/repository name `Thirdmark` after checking the exact unscoped npm name and `Jennycruzy/Thirdmark` GitHub repository; both returned 404. Earlier fallback naming and the discrepancy in the supplied alternatives are recorded in [`FINDINGS.md`](FINDINGS.md).
- Initialized a fresh repository with Apache-2.0 licensing and the requested local git identity: `Jennycruzy <jennycruzy@users.noreply.github.com>`.
- Cloned the five cited references and `example-counter` into the gitignored `.references/` directory. Reference commits are recorded in [`FINDINGS.md`](FINDINGS.md).
- Read the complete MatchLock contract and Moonray slicer source. Verified witness, disclosure, ledger, nullifier, domain-separated hash, and time-gating patterns.
- Read the maintained Compact standard-library API. Verified persistent hashing, persistent commitments, Jubjub point construction and arithmetic, `hashToCurve`, and block-time circuits.
- Found and recorded an OPRF design correction: Compact 0.31 has no `JubjubScalar` inversion circuit. The inverse must be computed client-side from the runtime’s source-backed scalar modulus and used only as an input to an `ecMul` unblinding circuit.
- An isolated scratch contract using the 0.31.1 compiler with `--skip-zk` compiled the `hashToCurve` plus three-`ecMul` shape and generated proof metadata. This is not a simulator run, proof, or deployment and does not clear the security blocker.
- Installed the official Compact CLI. It reports compiler 0.31.1 and lists 0.34.0, 0.31.1, and earlier toolchains.

Not passed:

- The scratch OPRF circuit has not been compiled or run. It must not be run as a product gate using the known-vulnerable 0.31.1 compiler.
- The supplied in-circuit inverse step is not available in the verified Compact API. The replacement client-side inverse plus in-circuit `ecMul` design needs a scratch proof under a safe compiler.
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
