#!/usr/bin/env bash
set -euo pipefail

readonly artifact_root="${COMPACT_ARTIFACT_ROOT:?COMPACT_ARTIFACT_ROOT must point to a full Compact compile output}"
readonly contract_root="${artifact_root}/thirdmark-managed"

for artifact in \
  "${contract_root}/keys/file.prover" \
  "${contract_root}/keys/file.verifier" \
  "${contract_root}/zkir/file.bzkir" \
  "${contract_root}/zkir/file.zkir"; do
  if [[ ! -f "${artifact}" ]]; then
    printf 'missing full proving artifact: %s\n' "${artifact}" >&2
    exit 1
  fi
done

mkdir -p web/public/keys web/public/zkir
cp "${contract_root}/keys/file.prover" web/public/keys/file.prover
cp "${contract_root}/keys/file.verifier" web/public/keys/file.verifier
cp "${contract_root}/zkir/file.bzkir" web/public/zkir/file.bzkir
cp "${contract_root}/zkir/file.zkir" web/public/zkir/file.zkir

printf 'Prepared Thirdmark browser proving artifacts from %s.\n' "${contract_root}"
