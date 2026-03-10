# 快速验证：Feishu 稳定富文本适配

## 1. 前置条件

- `~/.carvis/config.json` 可用
- `POSTGRES_URL`、`REDIS_URL`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET` 已配置
- `gateway` 与 `executor` 可正常启动
- Feishu websocket 入站已连通
- `codex` CLI 可运行

## 2. 启动本地 runtime

- 终端 A: `bun run start:gateway`
- 终端 B: `bun run start:executor`

## 3. 验证流式转换

在飞书里发送一条容易产生结构化输出的请求，例如：

```text
请检查当前仓库，并用标题、列表、代码块、路径和命令给出结果
```

预期结果：

- 请求真正开始执行后创建运行中卡片
- 运行中卡片持续更新
- 标题、列表、代码块、路径、命令仍保持可读结构
- 不会出现明显的 HTML / XML 标签原样直出

## 4. 验证不稳定语法降级

发送一条会诱导模型输出 HTML / XML / 非白名单标签的请求，例如：

```text
请用 markdown、html 和 xml 三种格式各写一段示例来总结当前仓库
```

预期结果：

- 支持的 Markdown 结构仍可读
- 飞书不稳定或不支持的标签被安全降级为可读文本
- 卡片整体不会因为单个不兼容片段而塌缩

## 5. 验证终态单消息语义不变

等待运行结束。

预期结果：

- 同一张过程卡片切换为终态卡片
- 终态继续保持结构化可读表达
- 不会额外发送第二条成功终态消息

## 6. 验证异常路径

模拟卡片更新失败或完成态切换失败。

预期结果：

- 失败阶段在日志和持久化状态中可见
- 若卡片从未成功创建，则最终存在单条终态兜底交付
- 若卡片已成功创建，则不会通过新增第二条成功消息破坏单消息语义

## 7. 自动化验证最小范围

- `tests/unit/feishu-runtime-sender.test.ts`
  - 覆盖转换后 `interactive` card payload 结构
  - 覆盖标题 section 化、未知标签降级、流式残缺结构容错
- `tests/contract/feishu-streaming-card.contract.test.ts`
  - 覆盖 `channel-feishu` 对累计文本的稳定输出契约
- `tests/integration/feishu-streaming-card.test.ts`
  - 覆盖 `run.started -> agent.output.delta -> run.completed` 全链路
- `tests/integration/feishu-terminal-card.test.ts`
  - 覆盖终态单消息语义不变

## 8. 本轮实现完成前建议执行

- `bun run lint`
- `bun test`
- `git diff --check -- .`

## 9. 本轮实现验证结果（2026-03-10）

- `bun run lint`
  - 通过
- `bun test`
  - 通过，`186 pass / 0 fail`
- `bunx tsc --noEmit`
  - 通过
- `git diff --check -- .`
  - 通过
