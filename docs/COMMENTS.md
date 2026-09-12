# AKINDO comment drafts

These are drafts for the user to review and post from their own account. No comment has been posted.

## W1-P0 — not ready to post

Thirdmark’s source review is complete, but the W1-P0 gate is blocked before a public deployment claim. The repository is initialized under Apache-2.0, the five cited Midnight references and `example-counter` are checked out, and the Compact standard-library source confirms `persistentHash`, `persistentCommit`, Jubjub arithmetic, `hashToCurve`, and block-time circuits.

Two source findings changed the implementation plan. The official Compact advisory GHSA-3p6x-5vpx-wwpj covers compiler 0.31.1 with a critical `Uint<N>` range-proof issue, while the same advisory identifies 0.30.x as outside that regression. Compact 0.34.0 targets ledger v9, so Compact 0.30.0 is the ledger-v8 candidate under validation. The maintained API also has no Jubjub scalar inverse circuit; the OPRF will compute the inverse client-side from the runtime modulus and use `ecMul` for in-circuit unblinding. The pinned proof server is healthy on port 6300. CircleCI pipeline `#1`, UUID `717dbcfa-c2be-4fcd-9afb-0484ab68f99c`, passed the full proving-key compile for both the pinned `example-counter` reference and the OPRF scratch circuit. This is not a public progress comment yet: there is still no simulator execution evidence, deployment, or transaction to report.

Honesty note: there is no Preprod address or transaction yet, and no scratch proof has been claimed. The repository name is Thirdmark because the exact unscoped npm and `Jennycruzy/Thirdmark` GitHub checks returned 404 before the rename.
