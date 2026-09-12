# AKINDO comment drafts

These are drafts for the user to review and post from their own account. No comment has been posted.

## W1-P0 — not ready to post

Thirdmark’s source review is complete, but the W1-P0 gate is blocked before a public deployment claim. The repository is initialized under Apache-2.0, the five cited Midnight references and `example-counter` are checked out, and the Compact standard-library source confirms `persistentHash`, `persistentCommit`, Jubjub arithmetic, `hashToCurve`, and block-time circuits.

Two source findings changed the implementation plan. The official Compact advisory GHSA-3p6x-5vpx-wwpj covers compiler 0.31.1 with a critical `Uint<N>` range-proof issue, while the same advisory identifies 0.30.x as outside that regression. Compact 0.34.0 targets ledger v9, so Compact 0.30.0 is the ledger-v8 candidate under validation. The maintained API also has no Jubjub scalar inverse circuit, and the pinned runtime does not export the Jubjub scalar modulus; the scratch harness uses the source-backed protocol constant explicitly and uses `ecMul` for in-circuit unblinding. The pinned proof server is healthy on port 6300. CircleCI pipeline `#3`, UUID `758b3c19-e135-43fa-9d7c-f34ba4e4412b`, passed the full proving-key compile, strict typecheck, and six-test OPRF simulator suite on `cimg/node:24.11`. This is not a public progress comment yet: there is still no deployment or transaction to report.

Honesty note: there is no Preprod address or transaction yet, and no scratch proof has been claimed. The repository name is Thirdmark because the exact unscoped npm and `Jennycruzy/Thirdmark` GitHub checks returned 404 before the rename.
