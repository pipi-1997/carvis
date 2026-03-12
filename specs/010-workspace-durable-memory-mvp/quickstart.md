# Quickstart

## 目标

按最小可落地顺序实现 OpenClaw-like 的 workspace durable memory，并用 `009-workspace-memory-benchmark` 验证其不是“抽卡式命中”。

## 实现顺序

### 1. 先落 workspace memory 文件服务和 guidance

1. 在 `apps/executor/src/services/` 新增 workspace memory 服务和 memory guidance。
2. 约定 `.carvis/MEMORY.md` 与 `.carvis/memory/YYYY-MM-DD.md` 的最小结构。
3. 为路径解析、excerpt 裁剪、文件 diff 和来源选择写单元测试。

验证命令：

```bash
bun test tests/unit -t "workspace memory"
```

### 2. 接 executor preflight recall

1. 在 `apps/executor/src/run-controller.ts` 调用 bridge 前读取 `MEMORY.md`、今天和昨天的 daily memory。
2. 生成 bounded excerpt，并把 guidance + excerpt 注入 prompt。
3. 记录 `preflightLatencyMs`、`filesScannedPerSync`，并通过 instrumentation 记录 `toolCallCount`、`toolReadCount`、`toolWriteCount`。

验证命令：

```bash
bun test tests/integration -t "workspace memory recall"
```

### 3. 让正常 run 真实改写 memory 文件

1. 不新增 gateway memory work item 或显式 `/remember` 主路径。
2. 让普通 run 在 guidance 约束下，由 Codex 直接维护 `.carvis/MEMORY.md` 和当天的 daily memory。
3. 用文件 before/after diff 判断是否发生 durable write。
4. 同时验证不稳定聊天不会误写长期记忆，近期上下文会写入 daily memory。

验证命令：

```bash
bun test tests/integration -t "workspace memory write"
```

### 4. 接 pre-compaction memory flush

1. 在接近 compaction 时触发一次静默 memory flush。
2. 约束 flush 只影响当天的 daily memory，不产生额外用户可见消息。
3. 记录 flush trace，供 benchmark 和 operator 观察。

验证命令：

```bash
bun test tests/integration -t "workspace memory flush"
```

### 5. 让手工编辑文件直接生效

1. 确保 recall 每次都从 workspace 文件系统读取真实内容。
2. 验证手工修改 `MEMORY.md` 和 daily memory 后的下一次 run 可直接命中。

验证命令：

```bash
bun test tests/integration -t "workspace memory manual edit"
```

### 6. 接 benchmark real runtime trace

1. 扩展 harness、trace、runner 和 scorer。
2. 让 benchmark 读取真实文件变更、真实 bridge augmentation 和真实 flush 结果。
3. 对齐 `009` 的 stress fixtures 与热路径 gate。
4. 明确验证 memory 接入没有改变 queue/lock/heartbeat/cancel 语义，也没有引入独立 memory worker 或 tool-first retrieval surface。

验证命令：

```bash
bun run test:memory-benchmark
```

结果解释：

- `globalGate.passed = true` 才表示当前 benchmark 维度允许进入下一阶段 rollout 讨论。
- 若 `rolloutRecommendation = "blocked"`，优先看：
  - `falseWriteRate`
  - `staleRecallRate`
  - `preflightLatencyMsP95`
  - `filesScannedPerSyncP95`
  - `toolCallCountP95`

### 7. 全量回归

```bash
bun run lint
bun test
```

## 完成定义

- `.carvis/MEMORY.md` 是 workspace durable memory 的长期真相源。
- `.carvis/memory/YYYY-MM-DD.md` 是近期上下文和 flush 的 daily memory 载体。
- 普通 run 在 executor preflight 阶段注入 bounded memory excerpt。
- agent 在正常 run 中可自主形成 durable write，而不是依赖显式 memory 命令。
- 手工修改 memory 文件后无需 sync，下一次 run 直接读取新内容。
- 静默 memory flush 在需要时触发，且不泄漏用户可见消息。
- `009-workspace-memory-benchmark` 在真实 runtime 下给出通过或阻断结论。
