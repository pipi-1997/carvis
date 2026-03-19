# Release Management Runbook

## 目的

本文面向 `carvis` 的 operator，说明 release PR、统一版本推进、npm trusted publishing、tag 和 GitHub release 的标准操作路径。

## 标准主路径

1. 普通功能 PR 在开发阶段补充 changeset
2. 普通功能 PR 合并到 `main`
3. GitHub Actions 自动创建或更新单一 release PR
4. operator 审核并合并 release PR
5. workflow 自动执行发布并输出结果摘要

## 必备配置

- GitHub Actions 需要 `contents: write`、`pull-requests: write` 与 `id-token: write`
- `GITHUB_TOKEN` 由 GitHub Actions 自动提供
- 公开发布包必须在 npm 上预先绑定 trusted publishing 到 `pipi-1997/carvis` 仓库的 `.github/workflows/release.yml`
- 不再依赖长期保存的 `NPM_TOKEN` repository secret

## 本地 dry-run 与预检查

发布前推荐先运行：

- `bun run release:status`
- `node ./scripts/release/check-eligible-changesets.mjs`

检查目标：

- 当前公开 release group 是否仍然是预期的 7 个 package
- 当前 changeset 是否真的命中公开 release group

## Trusted Publishing 初始化

首次启用时，operator 需要为每个已存在于 npm registry 的公开包执行一次 trusted publisher 绑定。

建议命令：

- `npm install --global npm@11.11.0`
- `npm trust github @carvis/core --repo pipi-1997/carvis --file release.yml --yes`
- `npm trust github @carvis/channel-feishu --repo pipi-1997/carvis --file release.yml --yes`
- `npm trust github @carvis/bridge-codex --repo pipi-1997/carvis --file release.yml --yes`
- `npm trust github @carvis/carvis-schedule-cli --repo pipi-1997/carvis --file release.yml --yes`
- `npm trust github @carvis/gateway --repo pipi-1997/carvis --file release.yml --yes`
- `npm trust github @carvis/executor --repo pipi-1997/carvis --file release.yml --yes`
- `npm trust github @carvis/carvis-cli --repo pipi-1997/carvis --file release.yml --yes`

注意事项：

- `@carvis/carvis-media-cli` 当前作为内部 transport CLI，不参与 npm 公开发布，也不需要配置 trusted publisher
- `npm trust github` 要求包已经存在于 npm registry；如果某个新公开包从未发布过，需要先用受控人工首发路径完成第一次发布，再补 trusted publisher 绑定
- trusted publishing 依赖 OIDC，不需要为仓库再保存 `NPM_TOKEN`
- GitHub Actions 中的 npm CLI 版本需保持在 npm 官方 trusted publishing 要求之上；当前仓库固定为 `npm@11.11.0`

## operator 检查点

- release PR 是否只有一条活跃实例
- release PR 是否只由命中公开 release group 的 changeset 驱动
- 统一版本号是否符合当前发布预期
- 参与发布的公开 package 是否正确
- workflow summary / artifact 是否给出逐包结果
- tag / GitHub release / npm registry 是否一致
- 当前 workflow 是否仍保留 `id-token: write`，且没有重新引入 `NPM_TOKEN`

## 失败补救

- 首选：workflow rerun
- 次选：按仓库文档化的手工 fallback 路径重试
- 重试时依赖 `skipped_existing_version` 语义保证幂等
- 手工 fallback 前先检查 workflow summary / artifact 中逐包结果，避免重复处理已经成功或已跳过的包
- 若发布因 trusted publishing 认证失败，先检查 npm package 的 trusted publisher 绑定是否覆盖当前仓库与 workflow 文件名
- 手工 fallback 命令：
  - `bun run release:publish`

## 本地辅助工具

- 可选推荐：`gh`
- `gh` 只作为本地查看与协助工具，不是 CI 主流程依赖

## 协作约束

- 公开发版必须通过 `changeset + release PR`
- 公开 npm 发布默认通过 trusted publishing 完成，不要为 CI 重新引入长期 `NPM_TOKEN`
- 如果仓库里同时存在多个 AI 工具入口或镜像指导文件，这些 release 规则必须保持一致
