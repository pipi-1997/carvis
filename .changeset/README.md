# Changesets Release 约定

## 适用范围

- 本仓库所有公开 `@carvis/*` package 的版本推进都通过 changeset 驱动
- changeset 是 release PR 的唯一输入，不使用手工批量改多个 `package.json` 版本号替代

## 公开 release group

当前固定进入统一版本节奏的公开 package：

- `@carvis/core`
- `@carvis/channel-feishu`
- `@carvis/bridge-codex`
- `@carvis/carvis-schedule-cli`
- `@carvis/gateway`
- `@carvis/executor`
- `@carvis/carvis-cli`

以下 package 不参与 npm 公开发布：

- `@carvis/carvis-media-cli`
- `@carvis/skill-media-cli`
- `@carvis/skill-schedule-cli`

## 编写规则

1. 可发布改动在普通功能分支中新增一条 changeset
2. 摘要写成面向发布说明的用户可读描述，不写内部 patch 清单
3. docs-only、internal-only 或不命中公开 release group 的改动可以不创建 changeset
4. 只有命中公开 release group 的 changeset 才能推动公开 release PR

## 推荐命令

- 创建 changeset：`bunx changeset`
- 预览版本推进：`bun run release:version`
- 手工发布兜底：`bun run release:publish`

## 协作规则

- agent、开发者和 operator 都必须把 changeset 视为公开发版主路径的一部分
- 若仓库存在多个 AI 工具入口或镜像指导文件，release 规则必须同步到所有现有入口
