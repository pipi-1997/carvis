# 合同：Media Delivery Skill

## 1. 适用范围

- 本 skill 定义 agent 如何在需要交付资源本体时触发“向当前会话发送资源”这一能力
- skill 是 agent-facing 主契约；它描述用户价值与调用边界，不描述底层 PATH、worktree、`bun` 或 `runId` 接线

## 2. 主要职责

- 判断当前请求是否需要把图片、文件等资源直接发回当前会话
- 决定何时触发受支持的媒体发送 transport
- 在工具返回失败时，向用户解释失败结果，而不是伪装成已发送成功

## 3. 必须触发媒体发送的情况

- 用户明确要求“直接发图片”“直接发文件”“不要只贴链接”“把这个资源发出来”
- agent 已在当前 run 中生成了本地文件，且用户期望收到资源本体
- agent 需要把一个远端资源直接作为图片或文件发回当前会话

## 4. 不应触发媒体发送的情况

- 用户只需要文字解释、摘要或外链
- 当前任务本质上不是资源交付，而是普通问答、分析或代码修改
- agent 无法确定应发送哪个资源，且需要先澄清

## 5. 调用原则

- skill 的正常路径只允许 agent 提供资源业务参数，例如 `path`、`url`、`mediaKind`、`title`、`caption`
- skill 不应要求 agent 手工拼接 `chatId`、`sessionId`、`runId`、`workspace`、`gatewayBaseUrl` 或解释 PATH / worktree 细节
- skill 不得指导 agent 绕过受支持的 transport 直接调用 Feishu API
- 如果 transport 不可用，skill 应把它视为当前发送能力不可用，而不是默认进入多轮环境排查
- 正常主路径只尝试一次 `carvis-media send`；首次结构化失败后必须停止并报告
- skill 不得指导 agent 在失败后搜索源码目录、切换 worktree、包装 `bun` 或手工补运行时上下文

## 6. 高频示例

- 用户说“把截图发给我”时，主路径应直接调用 `carvis-media send --path <path> --media-kind image`
- 用户说“把这个文件直接发出来”时，主路径应直接调用 `carvis-media send --path <path> --media-kind file`
- 用户说“把这个链接对应的图片直接发出来”时，主路径应直接调用 `carvis-media send --url <url> --media-kind image`

## 7. 与 `carvis-media` 的关系

- 当前实现可以使用 `carvis-media send` 作为 shell transport
- 但 `carvis-media` 是 transport 形式，不是 product mental model
- 若未来改成 bridge 原生工具或其他封装，只要保留“向当前会话发送资源”的能力语义，skill 契约不应变化

## 8. 最终回复

- `sent` 时，最终回复可以简要说明资源已发出
- `rejected` 或 `failed` 时，最终回复必须明确说明失败原因和下一步可行操作
- skill 不得把失败包装成“可能已经发送”
