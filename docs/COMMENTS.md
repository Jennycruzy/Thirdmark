# AKINDO comment drafts

These are drafts for the user to review and post from their own account. No comment has been posted.

## W1-P0 — not ready to post

Corroborate’s source review is complete, but the W1-P0 gate is blocked before a public deployment claim. The repository is initialized under Apache-2.0, the five cited Midnight references and `example-counter` are checked out, and the Compact standard-library source confirms `persistentHash`, `persistentCommit`, Jubjub arithmetic, `hashToCurve`, and block-time circuits.

One safety finding changed the implementation plan. The official Compact advisory GHSA-3p6x-5vpx-wwpj covers compiler 0.31.1 with a critical `Uint<N>` range-proof issue. The available 0.31 toolchain is 0.31.1; 0.34.0 targets ledger v9. We are not compiling or deploying a privacy contract with the affected compiler. The next public update will include the patched ledger-v8 compiler version, proof-server result, and a real example-counter transaction.

Honesty note: there is no Preprod address or transaction yet, and no scratch proof has been claimed. The repository name is Corroborate because `quorum`, `kth`, `corroborate`, and `nth` are occupied as unscoped npm packages; `Jennycruzy/Corroborate` was available when checked.
