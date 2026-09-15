#!/usr/bin/env bash
set -euo pipefail

readonly root="${THIRDMARK_ROOT:-${HOME}/thirdmark}"
readonly origin="${THIRDMARK_ALLOWED_ORIGIN:?THIRDMARK_ALLOWED_ORIGIN is required}"
readonly launcher="${root}/bin/run-backend.sh"

mkdir -p "${root}/run" "${root}/logs"

start_one() {
  local name="$1"
  local pid_file="${root}/run/${name}.pid"
  local log_file="${root}/logs/${name}.log"
  if [[ -f "${pid_file}" ]] && kill -0 "$(<"${pid_file}")" 2>/dev/null; then
    printf '%s already running (pid %s)\n' "${name}" "$(<"${pid_file}")"
    return
  fi
  THIRDMARK_ALLOWED_ORIGIN="${origin}" nohup "${launcher}" "${name}" \
    </dev/null >"${log_file}" 2>&1 &
  printf '%s\n' "$!" >"${pid_file}"
  printf '%s started (pid %s)\n' "${name}" "$!"
}

start_one issuer
start_one registry
