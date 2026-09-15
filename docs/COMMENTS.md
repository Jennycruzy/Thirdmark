# AKINDO comment drafts

These are drafts for the user to review and post from their own account. No comment has been posted.

## W1-P0 — ready to post after owner review

Thirdmark’s canonical wallet smoke test is live on Midnight Preprod. The official example-counter was submitted through 1AM: contract `fdfd87f55cfcb499dec443d1c35f38fd7d721baa45dbb66303b8f3fb8dd38c4`, transaction ID `00003035511fe02e788f6a82fb0085cb5a60803ddb6c891f296212b5997cc6a499`, transaction hash `3c8a9e7474f8f6b3422c3b5d110199368e5fbee63b9d8f66664f5b1d3d126ea5`, block `2549975`. The browser receipt shows `TRANSACTION SUBMITTED`.

Two source findings changed the implementation plan. The official Compact advisory GHSA-3p6x-5vpx-wwpj covers compiler 0.31.1 with a critical `Uint<N>` range-proof issue, while the same advisory identifies 0.30.x as outside that regression. Compact 0.34.0 targets ledger v9, so Compact 0.30.0 is the ledger-v8 candidate under validation. The maintained API also has no Jubjub scalar inverse circuit, and the pinned runtime does not export the Jubjub scalar modulus; the scratch harness uses the source-backed protocol constant explicitly and uses `ecMul` for in-circuit unblinding. The pinned proof server is healthy on port 6300. CircleCI pipeline `#5`, UUID `b2d7d191-4219-4132-ad5c-1c29b6934022`, passed the full proving-key compile, typecheck, and simulator suite and published the managed counter artifacts. The browser path initially stopped on a missing Node `Buffer` global before reaching the wallet; adding the browser polyfill allowed 1AM delegated proving and submission to complete.

Honesty note: this is the canonical example-counter smoke test, not a Thirdmark deployment. Thirdmark still requires an operator-run issuer endpoint and its sealed public key. The repository name is Thirdmark because the exact unscoped npm and `Jennycruzy/Thirdmark` GitHub checks returned 404 before the rename.

## W1-P2 — ready to post after owner review

Thirdmark is deployed on Midnight Preprod with a sealed single-issuer key and a threshold of three. The current contract is `0c3bc3991fa7cd8e8f88e444f01925810db4eb6c15b102c767dc0ccc9093d85a`, deployment transaction ID `00b3588bdb549b2fbce08c66402d79483b5efa2c3c244d8a7a03b31dd6c6de04d1`, transaction hash `79a43b9220e636fc7f34afcc347e481306699dd53d5a52ae618475e180d127df`, block `2559681`.

The browser deployment path uses 1AM delegated proving, wallet balancing, signing, and submission. The canonical example-counter smoke test completed first at block `2549975`. The public issuer endpoint exposes only the issuer public point and blinded OPRF evaluation; its scalar remains runtime-only.

The public demo frontend is `https://thirdmark.vercel.app`; the issuer and CAC adapter are live behind temporary HTTPS tunnels on an isolated Lightsail user service. The registry adapter and public hosting are now complete.

Honesty note: the three-party filing cycle, threshold unlock, dossier timestamps, approvals, export, and independent verification are not complete yet. The deployment receipt is real Preprod evidence; no filing or unlock is being claimed here.
