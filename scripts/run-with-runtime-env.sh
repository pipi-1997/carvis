#!/usr/bin/env zsh

set -euo pipefail

env_file="${CARVIS_RUNTIME_ENV_FILE:-$HOME/.carvis/runtime.env}"

if [[ -f "$env_file" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    if [[ -z ${parameters[$key]+present} ]]; then
      export "${key}=${value}"
    fi
  done < "$env_file"
fi

exec "$@"
