#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OTP="${1:-}"

cd "$ROOT_DIR"

echo "== carvis npm publish helper =="
if [ -n "$OTP" ]; then
  echo "使用 OTP: ${OTP}"
else
  echo "用法: npm run publish:npm -- <otp>"
  echo "  请提供你的 2FA 一次性验证码"
  exit 1
fi
echo

PACKAGES=(
  "packages/core"
  "packages/channel-feishu"
  "packages/bridge-codex"
  "packages/carvis-schedule-cli"
  "apps/gateway"
  "apps/executor"
  "packages/carvis-cli"
)

for REL_PATH in "${PACKAGES[@]}"; do
  PKG_DIR="${ROOT_DIR}/${REL_PATH}"
  if [ ! -f "${PKG_DIR}/package.json" ]; then
    echo "!! 跳过 ${REL_PATH} (package.json 不存在)"
    continue
  fi

  NAME=$(node -p "require('./${REL_PATH}/package.json').name")
  VERSION=$(node -p "require('./${REL_PATH}/package.json').version")

  echo
  echo "--> 处理 ${NAME}@${VERSION} (${REL_PATH})"

  if npm view "${NAME}@${VERSION}" version >/dev/null 2>&1; then
    echo "    已存在于 registry，跳过 publish"
    continue
  fi

  echo "    开始发布 ${NAME}@${VERSION} ..."
  (
    cd "${PKG_DIR}"
    npm publish --access public --otp="$OTP"
  )
  echo "    发布完成 ${NAME}@${VERSION}"
done

echo
echo "== 所有包处理完毕 =="

