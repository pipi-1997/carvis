# Feishu On-Demand Guidance Design

## Goal

把当前 `carvis onboard` / `carvis configure feishu` 中“一次性整屏输出飞书说明”的体验，调整为字段级按需提示，并修正长块 `note()` 在终端中的渲染负担。

## Context

当前实现已经把飞书接入知识集中到了 `packages/channel-feishu/src/setup.ts`，这是对的；问题出在 CLI 展示层：

- [adapter-guidance.ts](/Users/pipi/workspace/carvis/.worktrees/013-carvis-onboard-cli/packages/carvis-cli/src/adapter-guidance.ts) 会在进入 `feishu` 流程后一次性渲染 overview + 5 个 section
- [prompt-runtime.ts](/Users/pipi/workspace/carvis/.worktrees/013-carvis-onboard-cli/packages/carvis-cli/src/prompt-runtime.ts) 直接把这些长文本交给 `@clack/prompts` 的 `note()`
- 实际 TTY 验证中，长块说明在小终端宽度下会形成大量 boxed content，阅读负担很重，也会把真正的输入题目推到后面

这与社区里典型的 prompt-wizard 实践不一致。`Clack` 官方文档强调它更适合最小化 prompt 组件和渐进披露；如果要做真正的 app-like 全屏 TUI，社区通常会直接切到 `Ink`，而不是在 prompt 库上堆长块 UI。  
参考：

- Clack docs: <https://bomb.sh/docs/clack/basics/getting-started/>
- Clack npm: <https://www.npmjs.com/package/@clack/prompts>
- Ink repo: <https://github.com/vadimdemedes/ink>
- Inquirer repo: <https://github.com/SBoudrias/Inquirer.js>

## Problem Statement

我们需要同时解决两个问题：

1. 飞书引导内容不能消失，仍要让首次用户知道 `App ID`、`App Secret`、机器人能力、事件接收、`allowFrom/chat_id` 从哪里来
2. 默认交互不能再一上来灌整页说明；提示应该跟着当前问题走，必要时再展开完整帮助

## Approaches

### 方案 A：继续保留当前整块说明，只优化文案长度

做法：

- 保留 `note()` + 多段 section 的模式
- 尽量压短每段文案

优点：

- 改动最小
- 现有 adapter guide 结构基本不动

缺点：

- 根本问题没变，仍然是“先看一页文档，再开始填表”
- `Clack` 在这种长块盒子场景下观感仍然重
- 终端宽度变化时仍然容易变形

结论：不推荐。

### 方案 B：保留 `Clack`，改成字段级按需提示 + 可选完整指引

做法：

- 默认只在字段输入前展示该字段相关的短提示
- adapter contract 新增字段级 `promptHint` / `promptHelpTitle`
- 把跨字段知识保留成显式可选入口，例如“查看完整飞书接入步骤”
- `onboard` / `configure feishu` 只在用户选择查看时才渲染完整 guide

优点：

- 最符合 `Clack` 的使用边界
- 用户默认路径更短，首次体验更像 wizard 而不是 embedded doc page
- adapter-owned 知识仍保留在 `channel-feishu`
- 改动范围可控，不需要重写整个 prompt runtime

缺点：

- 需要重构当前 guide 渲染模型与测试
- 完整说明入口要设计清楚，避免再次变成噪音

结论：推荐。

### 方案 C：直接切到 `Ink`，重做全屏 TUI

做法：

- 改用 `Ink` 做多区域 wizard
- 左侧步骤导航，右侧字段与帮助区

优点：

- 如果目标是 app-like TUI，这是社区成熟路线
- 能更好控制布局、滚动和状态显示

缺点：

- 对当前问题明显过度设计
- 测试、渲染稳定性和维护成本都会上升
- 当前 CLI 已经建立在 `Clack` prompt runtime 上，立即切换会放大变更面

结论：现在不做，只保留未来演进空间。

## Chosen Approach

采用方案 B：保留 `@clack/prompts`，改成字段级按需提示，并把完整飞书说明改成显式可选入口。

## Design

### 1. Adapter contract 调整

`packages/channel-feishu/src/setup.ts` 从“完整 guide 一次性展示”调整为“两层知识模型”：

- 字段级提示：跟随 `appId`、`appSecret`、`allowFrom`、`requireMention` 各自的问题展示
- 完整 guide：保留 overview / sections / links，但只用于显式帮助入口

建议字段结构增加：

```ts
type FeishuSetupField = {
  key: "appId" | "appSecret" | "allowFrom" | "requireMention";
  label: string;
  description: string;
  howToGet: string[];
  promptHelpTitle?: string;
  promptHint?: string[];
  // 现有 envName/defaultValue/required 保持不变
};
```

`promptHint` 只包含当前题目需要的 1-3 行短提示，不再承载整套接入叙事。

### 2. CLI 交互调整

`onboard` / `configure feishu` 改为：

1. 选定 `feishu`
2. 询问一次：`是否先查看完整飞书接入步骤？`
3. 若用户选择否，直接进入字段输入
4. 每个字段输入前，展示该字段的短提示
5. 只有用户显式请求时，才展示完整 `guide`

这样默认路径最短，同时完整帮助仍然可达。

### 3. 渲染策略

继续使用 `Clack`，但收敛 `note()` 用法：

- 字段级提示只渲染单个小 `note()`，长度控制在短块范围
- 完整 guide 入口才允许连续输出多个 section
- 题目前的提示优先用短标题 + 2-3 行正文，避免大盒子

### 4. 边界

- 仍由 `packages/channel-feishu` 拥有飞书知识
- `packages/carvis-cli` 只负责交互流程和选择何时展示
- 不引入 `Ink`、`Blessed`、`terminal-kit` 等全新 TUI 框架

## Testing

需要把测试从“默认一定展示完整 guide”改为：

- 默认流程只展示字段级按需提示
- 只有显式选择完整帮助时，才展示大段 guide
- `configure feishu` 与 `onboard` 两条路径行为一致
- TTY 渲染验证继续在临时 `HOME` 下进行，避免碰真实 `~/.carvis`

## Success Criteria

- 默认交互路径不再先出现一整页飞书说明
- 用户在输入 `App ID`、`App Secret`、`allowFrom`、`requireMention` 时都能看到对应短提示
- 用户仍可显式查看完整飞书接入说明
- 继续通过现有 CLI contract/integration tests，并补上按需提示的新测试
