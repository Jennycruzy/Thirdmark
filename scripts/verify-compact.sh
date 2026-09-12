#!/usr/bin/env bash
set -euo pipefail

readonly compact_toolchain_version="0.30.0"
readonly example_counter_commit="273f083ab36a52407f16ec9a9796d902226e05d6"
readonly example_counter_repository="https://github.com/midnightntwrk/example-counter.git"

compact_version="$(compact compile --version)"
if [[ "${compact_version}" != "${compact_toolchain_version}" ]]; then
  printf 'expected Compact %s, found %s\n' "${compact_toolchain_version}" "${compact_version}" >&2
  exit 1
fi

compile_root="$(mktemp -d)"
trap 'rm -rf "${compile_root}"' EXIT

git clone --quiet "${example_counter_repository}" "${compile_root}/example-counter"
git -C "${compile_root}/example-counter" checkout --quiet "${example_counter_commit}"

compact compile \
  "${compile_root}/example-counter/contract/src/counter.compact" \
  "${compile_root}/counter-managed"

compact compile \
  verification/oprf-scratch.compact \
  "${compile_root}/oprf-managed"

for contract_info in \
  "${compile_root}/counter-managed/compiler/contract-info.json" \
  "${compile_root}/oprf-managed/compiler/contract-info.json"; do
  rg -q '"compiler-version": "0\.30\.0"' "${contract_info}"
  rg -q '"language-version": "0\.22\.0"' "${contract_info}"
  rg -q '"runtime-version": "0\.15\.0"' "${contract_info}"
done

printf 'Compact %s full proving-key compile passed for example-counter and OPRF scratch.\n' "${compact_version}"
