#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "== carvis npm publish helper (登录链接方式) =="
echo "== 发布前依赖自检 =="
node ./scripts/check-publish-runtime-deps.mjs
echo

# 若未登录，使用浏览器登录链接（支持 Security Key 等）
if ! npm whoami >/dev/null 2>&1; then
  echo "未检测到 npm 登录，将打开/展示登录链接，请在浏览器中完成登录（可使用 Security Key）。"
  npm login
else
  echo "已登录为: $(npm whoami)"
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
    npm publish --access public
  )
  echo "    发布完成 ${NAME}@${VERSION}"
done

echo
echo "== 所有包处理完毕 =="

