# Quickstart

## 1. 目标

本 quickstart 用于帮助开发者在本地实现并运行 workspace memory benchmark 的第一阶段能力。

## 2. 前置条件

- 使用当前 feature worktree：`009-workspace-memory-benchmark`
- 本地可运行 `bun`
- 仓库现有测试依赖可用

## 3. 实现顺序

1. 定义 benchmark domain model
2. 建立 fixture 目录与样例加载器
3. 扩展 `tests/support/harness.ts` 以输出 benchmark trace
4. 实现 runner、scorer 和 gate evaluator
5. 为 trace 增加分类、写入、召回、用户可见结果和成本工件
6. 补充 golden / replay / adversarial 样例
7. 添加脚本命令、gate 输出和 operator 可读说明

## 4. 建议运行方式

### 单元阶段

```bash
bun test tests/unit
```

### benchmark 相关测试

```bash
bun test tests/unit/memory-benchmark-models.test.ts
bun test tests/unit/memory-benchmark-fixtures.test.ts
bun test tests/unit/memory-benchmark-score.test.ts
bun test tests/unit/memory-benchmark-gates.test.ts
bun test tests/integration/memory-benchmark-trace.test.ts
bun test tests/integration/memory-benchmark.test.ts
bun test tests/integration/memory-benchmark-golden-scenarios.test.ts
bun test tests/integration/memory-benchmark-suite-coverage.test.ts
bun test tests/integration/memory-benchmark-gate.test.ts
bun run test:memory-benchmark
bun run test:memory-benchmark:gate
```

### 全量校验

```bash
bun test
bun run lint
```

## 5. 预期结果

- benchmark 可以输出每条样例的 pass/fail 和失败原因
- benchmark 可以输出 suite 级和全局级指标
- benchmark 可以输出成本指标的 P50/P95 聚合
- `false_write_rate`、`stale_recall_rate`、`missed_durable_recall_rate` 可被 gate 使用
- 文档或报告可以说明 queue、lock、heartbeat 等信号是来自真实运行复用还是测试替身
- `bun run test:memory-benchmark` 应返回全部 benchmark contract/integration 测试通过
- `bun run test:memory-benchmark:gate` 当前与 benchmark 套件对齐，用于 CI 或 rollout gate 检查

## 6. 排障提示

- 若某条样例无法判分，先检查 fixture 是否缺失 `expectation`
- 若 recall 相关 case 全部失败，先检查 trace 是否捕获到实际 recall 结果
- 若成本指标缺失，先检查 runner 是否记录了 token 和 latency 相关工件
- 若 operator 无法判断信号来源，先检查报告或 quickstart 是否标明了 test double 与真实运行复用的边界
