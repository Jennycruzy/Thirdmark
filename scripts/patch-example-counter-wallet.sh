#!/usr/bin/env bash

set -euo pipefail

readonly script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly repository_root="$(cd -- "${script_directory}/.." && pwd)"
readonly reference_root="${1:-${repository_root}/.references/example-counter}"
readonly wallet_package="${reference_root}/node_modules/@midnight-ntwrk/wallet-sdk-shielded"
readonly wallet_file="${wallet_package}/dist/v1/CoreWallet.js"
readonly patch_file="${repository_root}/patches/wallet-sdk-shielded-pending-outputs.patch"
readonly reference_patch_file="${repository_root}/patches/example-counter-wallet-resume.patch"
readonly reference_api_file="${reference_root}/counter-cli/src/api.ts"
readonly reference_cli_file="${reference_root}/counter-cli/src/cli.ts"
readonly original_line='return [...state.coins, ...state.pendingOutputs.values().map(([coin]) => coin)];'
readonly fixed_line='return [...state.coins, ...Array.from(state.pendingOutputs.values(), ([coin]) => coin)];'
readonly resume_marker='const walletStateRoot = process.env.THIRDMARK_WALLET_STATE_DIR'
readonly resume_cli_marker='await walletCtx.walletCheckpoint?.stop();'

if [[ ! -f "${wallet_file}" ]]; then
  printf 'Missing wallet SDK file: %s\nRun npm ci in the example-counter checkout first.\n' "${wallet_file}" >&2
  exit 1
fi

if rg --fixed-strings --quiet "${fixed_line}" "${wallet_file}"; then
  printf 'Wallet SDK compatibility fix is already applied.\n'
else
  if ! rg --fixed-strings --quiet "${original_line}" "${wallet_file}"; then
    printf 'Unexpected wallet SDK source; refusing to patch: %s\n' "${wallet_file}" >&2
    exit 1
  fi

  patch --forward --directory="${wallet_package}" --strip=1 < "${patch_file}"
  printf 'Applied shielded wallet pending-output compatibility fix.\n'
fi

if rg --fixed-strings --quiet "${resume_marker}" "${reference_api_file}" &&
  rg --fixed-strings --quiet "${resume_cli_marker}" "${reference_cli_file}"; then
  printf 'Wallet sync checkpointing is already applied.\n'
  exit 0
fi

if rg --fixed-strings --quiet "${resume_marker}" "${reference_api_file}" ||
  rg --fixed-strings --quiet "${resume_cli_marker}" "${reference_cli_file}"; then
  printf 'Partial wallet sync patch detected; refusing to continue.\n' >&2
  exit 1
fi

if ! rg --fixed-strings --quiet "export interface WalletContext" "${reference_api_file}" ||
  ! rg --fixed-strings --quiet "await walletCtx.wallet.stop();" "${reference_cli_file}"; then
  printf 'Unexpected example-counter source; refusing to patch wallet sync.\n' >&2
  exit 1
fi

patch --forward --directory="${reference_root}" --strip=1 < "${reference_patch_file}"
printf 'Applied wallet sync checkpointing and progress reporting.\n'
