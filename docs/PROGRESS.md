# Progress

Updated 2026-09-12.

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

Not passed:

- The scratch OPRF circuit has not completed full proving-key generation. The local 0.30.0 `zkir` process exits with `SIGILL`; `--skip-zk` output is not a passing proof gate.
- The supplied in-circuit inverse step is not available in the verified Compact API. The replacement client-side inverse plus in-circuit `ecMul` design needs a scratch proof under a safe compiler.
- `example-counter` has not been compiled or deployed.
- CircleCI has not discovered `Jennycruzy/Thirdmark`; its public project endpoint returned `404 Project not found`. The repository must be connected through the owner’s CircleCI account before the managed Linux proof-key run can start.
- No Preprod address, transaction, block, timing, screenshot, or URL exists.
- No AKINDO comment is ready to post because the required W1-P0 gate is not complete. A non-postable draft is kept in [`COMMENTS.md`](COMMENTS.md) for continuity.

Why blocked:

The official Compact security advisory GHSA-3p6x-5vpx-wwpj identifies 0.31.1 and earlier as vulnerable to forged `Uint<N>` range constraints, while the same advisory identifies 0.30.x as outside that regression. Compact 0.34.0 targets ledger v9 and is not a Preprod substitute. The safe 0.30.0 candidate is installed and compiles the scratch source without proof generation, but this Mac’s CPU cannot execute the bundled `zkir`; the same failure occurs inside the CircleCI Linux image when run on this host. The next action is to connect the repository in CircleCI and pass the full compile on a managed runner, then deploy the official example-counter.

User inputs still required before the external gates:

- AKINDO account confirmation and Discord handle.
- A funded Preprod wallet at W1-P2; the wallet seed or key must never be shared.
- A Vercel or Netlify account and optional domain at W1-P5.
