#!/usr/bin/env bash
set -euo pipefail

readonly root="${THIRDMARK_ROOT:-${HOME}/thirdmark}"
readonly cloudflared="${root}/bin/cloudflared"

if [[ ! -x "${cloudflared}" ]]; then
  printf 'cloudflared is not installed: %s\n' "${cloudflared}" >&2
  exit 1
fi

mkdir -p "${root}/run" "${root}/logs"

start_one() {
  local name="$1"
  local port="$2"
  local pid_file="${root}/run/${name}-tunnel.pid"
  local log_file="${root}/logs/${name}-tunnel.log"
  if [[ -f "${pid_file}" ]] && kill -0 "$(<"${pid_file}")" 2>/dev/null; then
    printf '%s tunnel already running (pid %s)\n' "${name}" "$(<"${pid_file}")"
    return
  fi
  nohup "${cloudflared}" tunnel --no-autoupdate --url "http://127.0.0.1:${port}" \
    </dev/null >"${log_file}" 2>&1 &
  printf '%s\n' "$!" >"${pid_file}"
  printf '%s tunnel started (pid %s)\n' "${name}" "$!"
}

start_one issuer 8797
start_one registry 8798
