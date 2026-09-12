# Thirdmark handoff

Last updated: 2026-09-12

## Repository

- Path: `/Users/user/thirdmark`
- Remote: `https://github.com/Jennycruzy/Thirdmark.git`
- Branch: `main`
- Latest commit: `ef7a683 ci: move Compact validation to CircleCI`
- Expected author and committer: `Jennycruzy <jennycruzy@users.noreply.github.com>`
- Latest checked state: clean and pushed to `origin/main`

## Current truth

W1-P0 is still blocked. The repository contains documentation, source findings, the OPRF verification circuit, and a reproducible CircleCI full-proof compile check. It does not yet contain the Thirdmark product contract, simulator suite, SDK, frontend, deployment, or submission assets.

The selected safe ledger-v8 candidate is Compact 0.30.0:

- Compact compiler: `0.30.0`
- Compact language: `0.22.0`
- Compact runtime: `0.15.0`
- Compiler ledger target: `ledger-8.0.2`
- Reference application family: ledger-v8 `8.0.3`, Midnight.js `4.0.4`, proof-server reference `8.0.3`

This choice is documented in [`FINDINGS.md`](FINDINGS.md). It is a narrow correction for the published 0.31.x compiler advisory, not a claim that historical 0.30 defects can be ignored.

## What has been verified

- Product name and repository name checks completed for Thirdmark.
- Apache-2.0 license and required git identity are in place.
- Five reference repositories and `example-counter` are checked out under the ignored `.references/` directory.
- MatchLock and Moonray slicer were read in full.
- Compact hash, commitment, Jubjub, `hashToCurve`, disclosure, and time-gating APIs were checked against maintained source.
- The OPRF scratch source compiles with Compact 0.30.0 using `--skip-zk`; this is not a proof result.
- The local full compile reaches `zkir` and exits `SIGILL` for both `example-counter` and the OPRF scratch circuit. The same local failure occurs with 0.31.1, indicating a host execution limitation.
- The CircleCI config and validation script were committed and pushed.

## What is not verified

- CircleCI full proving-key result.
- Local proof server health.
- `example-counter` deployment to Preprod.
- Any Thirdmark contract compile, test, simulator run, deployment, transaction, address, timing, screenshot, URL, dossier, deck, or video.
- AKINDO registration details, Discord handle, or a funded Preprod wallet.

## Resume commands

```sh
cd /Users/user/thirdmark
git status --short --branch
git log -4 --format='%h %an <%ae> %s'
```

Then run the CircleCI `compact-validation` workflow. The local equivalent is:

```sh
./scripts/verify-compact.sh
```

It is expected to fail on this Mac at full `zkir` proving-key generation; `--skip-zk` must not be used to clear the gate.

## Non-negotiable continuation rules

- Do not deploy with Compact 0.31.1.
- Do not use Compact 0.34.0 as a substitute for ledger-v8 Preprod.
- Do not ask for or handle a wallet seed, private key, API key, or other secret.
- Do not mark W1-P0 complete without full proof evidence and the official example-counter Preprod address, transaction hash, and block.
- Do not begin product contract work until the W1-P0 deployment prerequisite is satisfied.
- Keep the AKINDO draft in [`COMMENTS.md`](COMMENTS.md) marked not ready until a verifiable artifact exists.
