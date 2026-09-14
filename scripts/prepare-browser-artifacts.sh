#!/usr/bin/env bash
set -euo pipefail

readonly artifact_root="${COMPACT_ARTIFACT_ROOT:?COMPACT_ARTIFACT_ROOT must point to a full Compact compile output}"
readonly contract_root="${artifact_root}/thirdmark-managed"
readonly counter_root="${artifact_root}/example-counter/contract/src/managed/counter"

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

for artifact in \
  "${counter_root}/keys/increment.prover" \
  "${counter_root}/keys/increment.verifier" \
  "${counter_root}/zkir/increment.bzkir" \
  "${counter_root}/zkir/increment.zkir"; do
  if [[ ! -f "${artifact}" ]]; then
    printf 'missing example-counter proving artifact: %s\n' "${artifact}" >&2
    exit 1
  fi
done

mkdir -p web/public/keys web/public/zkir web/public/counter/keys web/public/counter/zkir
cp "${contract_root}/keys/file.prover" web/public/keys/file.prover
cp "${contract_root}/keys/file.verifier" web/public/keys/file.verifier
cp "${contract_root}/zkir/file.bzkir" web/public/zkir/file.bzkir
cp "${contract_root}/zkir/file.zkir" web/public/zkir/file.zkir
cp "${counter_root}/keys/increment.prover" web/public/counter/keys/increment.prover
cp "${counter_root}/keys/increment.verifier" web/public/counter/keys/increment.verifier
cp "${counter_root}/zkir/increment.bzkir" web/public/counter/zkir/increment.bzkir
cp "${counter_root}/zkir/increment.zkir" web/public/counter/zkir/increment.zkir

printf 'Prepared Thirdmark browser proving artifacts from %s.\n' "${contract_root}"
printf 'Prepared example-counter browser proving artifacts from %s.\n' "${counter_root}"
