# Quickstart: Monorepo Release PR 自动化

## 1. 前置准备

1. 仓库已推送到 GitHub，默认分支为 `main`
2. GitHub 仓库已配置发布所需权限：
   - `GITHUB_TOKEN` 由 workflow 自动提供
   - workflow 必须具备 `id-token: write`
3. npm 公开包已完成 trusted publishing 绑定到 `pipi-1997/carvis` 的 `.github/workflows/release.yml`
4. 本地已完成 `bun install`
5. 操作者本地若希望更方便查看 PR / release，可安装 `gh`，但不是必需
6. 若使用 npm CLI 绑定 trusted publisher，本地 npm 需为 `11.10.0+`；建议直接使用 `npm@11.11.0`

## 2. 验证公开包集合

1. 检查当前 workspace 包：
   - 公开包应进入统一 release group
   - `private: true` 或缺失版本号的包不参与公开发布
2. 预期结果：
   - 当前 7 个公开 `@carvis/*` 包属于统一版本节奏
   - `packages/carvis-media-cli`、`packages/skill-media-cli` 与 `packages/skill-schedule-cli` 不被纳入

## 3. 为可发布改动添加 changeset

1. 在一个普通功能分支中完成改动
2. 为本次改动补充 release note entry
3. 预期结果：
   - 仓库新增一条 changeset 记录
   - 不需要手工同步多个 `package.json` 版本号

### 本地 dry-run 建议

在提交前可先运行：

- `bun run release:status`
- `node ./scripts/release/check-eligible-changesets.mjs`

预期结果：

- 公开 release group 与 ineligible package 列表符合预期
- 命中公开 release group 的 changeset 返回 `true`

## 4. 合并普通功能 PR

1. 将带有 changeset 的普通功能 PR 合并到 `main`
2. 预期结果：
   - `main` 上的 release workflow 开始运行
   - 仓库出现或更新一条单一 release PR

## 5. 检查 release PR

1. 在 GitHub 页面查看 release PR，或使用可选命令：
   - `gh pr list --search "Version Packages"`
   - `gh pr view <release-pr-number>`
2. 预期结果：
   - PR 中包含统一版本推进与 changelog 更新
   - 没有第二条竞争性的 release PR
   - 仅公开包参与本轮发版

## 6. 合并 release PR

1. operator 审核无误后合并 release PR
2. 预期结果：
   - release workflow 进入 publish 阶段
   - workflow 通过 trusted publishing 执行 tag / GitHub release / npm publish

## 7. 验证发布结果

1. 检查 GitHub Actions workflow run
   - 重点看 `workflow summary` 与 `release-summary` artifact
2. 检查 git tag 与 GitHub release
3. 检查 npm registry 中相关包版本
4. 可选本地辅助命令：
   - `gh run list --workflow release.yml`
   - `gh release list`
5. 预期结果：
   - 出现本轮统一版本对应的 tag
   - GitHub release 已生成
   - 公开包发布结果明确区分 `published` 与 `skipped_existing_version`

### 失败重试与 fallback

1. 若 workflow 失败，先看 `workflow summary` 与 `release-summary` artifact
2. 首选：直接 rerun workflow
3. 若 rerun 仍失败，再在本地或受控环境按 runbook 执行手工 fallback：
   - `bun run release:publish`
4. 预期结果：
   - 已存在版本继续显示为 `skipped_existing_version`
   - 不要求重建整套发布配置
5. 若失败原因是 trusted publishing 认证错误，先检查 npm package 的 trusted publisher 绑定是否已覆盖当前仓库与 workflow 文件

## 8. 验证 docs-only / internal-only 变更

1. 合并一个不影响公开包的改动
2. 预期结果：
   - 不会错误推动一次公开 release PR

## 9. 验证重复版本跳过

1. 人工模拟某个目标版本已存在于 registry
2. 预期结果：
   - 对应 package 被标记为 `skipped_existing_version`
   - 其余包仍可继续完成本轮发布或给出明确结果

## 10. 验证协作规则

1. 查阅 `AGENTS.md` 与 onboarding / runbook
2. 预期结果：
   - 能看到“版本推进必须通过 changeset + release PR”的明确规则
   - 能看到“公开 npm 发布默认通过 trusted publishing”的明确规则
   - 能看到 `gh` 是推荐辅助工具而非系统硬依赖

## 11. 验证回归

1. 运行：
   - `bun run lint`
   - `bun test`
   - `git diff --check -- .`
2. 若有新增脚本或配置校验，再运行对应验证命令
3. 预期结果：
   - 仓库既有测试与类型检查不因 release 自动化引入回归

## 12. 本次验证记录（2026-03-20）

- `bun run lint`
  - 结果：通过
- `bun test`
  - 结果：`428 pass, 0 fail`
- `git diff --check -- .`
  - 结果：通过
