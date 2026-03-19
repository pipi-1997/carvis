# 合同：Release Workflow

## 1. 适用范围

- 本合同定义 `carvis` 的仓库级 release PR 与发布主流程
- 适用于 `main` 分支上的公开 `@carvis/*` package 发版

## 2. 主流程

1. 普通功能分支为可发布改动补充 changeset
2. 普通功能 PR 合并到 `main`
3. 若 `main` 上存在至少一条命中公开 release group 的 changeset entry，则 release workflow 创建或更新单一 release PR
4. operator 审核并合并 release PR
5. workflow 自动执行 npm publish，并生成对应 tag 与 GitHub release

## 3. release PR 约束

- 任一时刻最多存在一条活跃 release PR
- release PR 必须只包含本轮版本推进、changelog 与必要的发布元数据更新
- 新 changeset 落到 `main` 后，现有 release PR 必须被更新，而不是生成第二条竞争 PR
- 若没有命中公开 release group 的 changeset entry，则不得创建公开 release PR

## 4. 发布阶段约束

- 只有 release PR 合并后才进入正式发布
- 发布必须同时覆盖：
  - git tag
  - GitHub release
  - npm publish
- 若某个目标版本已存在于 registry，对应包必须给出 skip 结果
- workflow rerun 必须可安全重复执行，并依赖 skip 语义避免已发布版本导致整轮发布失真

## 5. operator 可见性

- operator 必须能看到：
  - release PR 当前状态
  - workflow run 状态
  - 本轮统一版本号
  - 每个公开包的 publish 结果
  - 失败后推荐使用的 rerun / fallback 路径
- 这些结果必须落在 workflow summary、artifact、GitHub release body 或等价 GitHub 可见表面

## 6. 失败补救

- operator 首选使用 GitHub Actions rerun 作为失败补救路径
- 若 rerun 仍无法恢复，仓库必须保留文档化的手工 fallback 路径
- 手工 fallback 不得要求重建整套发布配置

## 7. 非目标行为

- 不允许 agent 或开发者直接手工同步多个 `package.json` 版本号来模拟发版
- 不允许绕过 release PR 在普通功能 PR 合并时直接无审查发布
- 不允许把 `gh` 设为 workflow 主流程的硬依赖
