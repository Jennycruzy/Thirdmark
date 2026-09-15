# AKINDO comment drafts

These are drafts for the user to review and post from their own account. No comment has been posted.

## Final W1 submission draft — ready to post after owner review

Thirdmark is live on Midnight Preprod at [`thirdmark.vercel.app`](https://thirdmark.vercel.app). The active Wave 1 contract is `acda20c181cee5a84030a088de372949104b1ea894373e2cc9af4813e0ad5fbe`, deployed in block `2562366` with transaction hash `b67da74efeb47b98bcf5570b8b7eff384a4f84874bd99ec377a4b6fb5ba77d3f`.

The real filing journey is proven against the labelled synthetic subject: three distinct 1AM wallet/filer states filed encrypted attestations, the third filing changed the threshold bit to true, and the participating browser decrypted all three records locally. Receipts: [filing 1](https://explorer.1am.xyz/tx/6084a446c87573749aed73b7db74a67a727c6c54aeb4f687d179435c3216f2f6?network=preprod), [filing 2](https://explorer.1am.xyz/tx/2770f966f0f6d08418e84a88e1996d461eb30dc3bf5666230140dc70a39e8fbb?network=preprod), and [filing 3](https://explorer.1am.xyz/tx/1b48e2cc49c4f78fba5b402763bd0560f4c52219fd232ae57fa4a636fbe30904?network=preprod).

The dossier screen now joins the three private attestations with public indexer transaction IDs, hashes, blocks, and timestamps; captures three distinct browser-held Ed25519 approvals; exports a signed JSON dossier; and independently verifies a re-uploaded artifact. The demo is explicit that these are artifact approvals, not wallet-native supplier identity signatures. Local validation is 52/52 tests, browser typecheck, and production build. The issuer and CAC adapter run on an isolated Lightsail user service behind temporary HTTPS tunnels; stable DNS is optional production hardening.

## W1-P0 — ready to post after owner review

Thirdmark’s canonical wallet smoke test is live on Midnight Preprod. The official example-counter was submitted through 1AM: contract `fdfd87f55cfcb499dec443d1c35f38fd7d721baa45dbb66303b8f3fb8dd38c4`, transaction ID `00003035511fe02e788f6a82fb0085cb5a60803ddb6c891f296212b5997cc6a499`, transaction hash `3c8a9e7474f8f6b3422c3b5d110199368e5fbee63b9d8f66664f5b1d3d126ea5`, block `2549975`. The browser receipt shows `TRANSACTION SUBMITTED`.

Two source findings changed the implementation plan. The official Compact advisory GHSA-3p6x-5vpx-wwpj covers compiler 0.31.1 with a critical `Uint<N>` range-proof issue, while the same advisory identifies 0.30.x as outside that regression. Compact 0.34.0 targets ledger v9, so Compact 0.30.0 is the ledger-v8 candidate under validation. The maintained API also has no Jubjub scalar inverse circuit, and the pinned runtime does not export the Jubjub scalar modulus; the scratch harness uses the source-backed protocol constant explicitly and uses `ecMul` for in-circuit unblinding. The pinned proof server is healthy on port 6300. CircleCI pipeline `#5`, UUID `b2d7d191-4219-4132-ad5c-1c29b6934022`, passed the full proving-key compile, typecheck, and simulator suite and published the managed counter artifacts. The browser path initially stopped on a missing Node `Buffer` global before reaching the wallet; adding the browser polyfill allowed 1AM delegated proving and submission to complete.

Honesty note: this is the canonical example-counter smoke test, not a Thirdmark deployment. Thirdmark still requires an operator-run issuer endpoint and its sealed public key. The repository name is Thirdmark because the exact unscoped npm and `Jennycruzy/Thirdmark` GitHub checks returned 404 before the rename.

## W1-P2 — ready to post after owner review

Thirdmark is deployed on Midnight Preprod with a sealed single-issuer key and a threshold of three. The current payload-compatible contract is `76df34103d6e2e0e0b1a561509366090c27eb392f6a07eb75b2d102fd646ef12`, deployment transaction ID `00a602aeba4fb9ffd0a9a04902da9f870c79a82ca03fae0d565d433b94d93525cb`, transaction hash `c5e7eddd73bc3463c55f05131d7b15563d2a0a4f460e9a5bca2db4f174b2135c`, block `2561298`.

The browser deployment path uses 1AM delegated proving, wallet balancing, signing, and submission. The canonical example-counter smoke test completed first at block `2549975`. The public issuer endpoint exposes only the issuer public point and blinded OPRF evaluation; its scalar remains runtime-only.

The public demo frontend is `https://thirdmark.vercel.app`; the issuer and CAC adapter are live behind temporary HTTPS tunnels on an isolated Lightsail user service. The registry adapter and public hosting are now complete.

Honesty note: the three-party filing cycle, threshold unlock, dossier timestamps, approvals, export, and independent verification are not complete yet. The deployment receipt is real Preprod evidence; no filing or unlock is being claimed here.
