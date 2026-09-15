#!/usr/bin/env bash
set -euo pipefail

readonly root="${THIRDMARK_ROOT:-${HOME}/thirdmark}"
readonly service="${1:?usage: run-backend.sh issuer|registry}"
readonly runtime="${root}/app/node_modules/.bin/tsx"

if [[ ! -x "${runtime}" ]]; then
  printf 'Thirdmark backend dependencies are not installed: %s\n' "${runtime}" >&2
  exit 1
fi

case "${service}" in
  issuer)
    if [[ ! -s "${root}/secrets/issuer.scalar" ]]; then
      printf 'Thirdmark issuer scalar is missing.\n' >&2
      exit 1
    fi
    export THIRDMARK_ISSUER_SCALAR_HEX="$(tr -d '\r\n' < "${root}/secrets/issuer.scalar")"
    export THIRDMARK_ISSUER_HOST="127.0.0.1"
    export THIRDMARK_ISSUER_PORT="8797"
    export THIRDMARK_ISSUER_ALLOWED_ORIGIN="${THIRDMARK_ALLOWED_ORIGIN:-}"
    exec "${runtime}" "${root}/app/issuer/server.ts"
    ;;
  registry)
    export THIRDMARK_CAC_PUBLIC_SEARCH_URL="${THIRDMARK_CAC_PUBLIC_SEARCH_URL:-https://authapp.cac.gov.ng/name_similarity_app/api/public_search/search}"
    export THIRDMARK_REGISTRY_HOST="127.0.0.1"
    export THIRDMARK_REGISTRY_PORT="8798"
    export THIRDMARK_REGISTRY_ALLOWED_ORIGIN="${THIRDMARK_ALLOWED_ORIGIN:?THIRDMARK_ALLOWED_ORIGIN is required for registry}"
    exec "${runtime}" "${root}/app/registry/server.ts"
    ;;
  *)
    printf 'unknown Thirdmark backend service: %s\n' "${service}" >&2
    exit 64
    ;;
esac
