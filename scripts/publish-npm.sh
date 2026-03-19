#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "== carvis npm publish helper =="
echo "== 发布前依赖自检 =="
node ./scripts/check-publish-runtime-deps.mjs
echo

node ./scripts/release/publish-npm.mjs
