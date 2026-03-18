# 任务清单：飞书会话内资源发送

**输入**: `/specs/014-feishu-media-delivery/` 下的修订设计文档
**前置条件**: `plan.md`、`spec.md`、`research.md`、`data-model.md`、`contracts/`

**说明**: 本任务清单按当前分支已有实现编排，只覆盖 2026-03-18 e2e 暴露出的剩余差距。已经落地的 media durable audit、Feishu 上传/发送分层、本地与远端 source 支持、session server-side 边界校验不再重复拆成从零建设任务。

**测试要求**: 本功能触及 `ChannelAdapter`、`AgentBridge`、gateway internal run tool、skill/prompt 契约与运行生命周期语义，因此所有剩余任务都必须同时覆盖：
- skill / prompt / shell transport 的契约测试
- gateway / service 的集成测试
- 真实 Feishu 或等价 e2e 验证步骤

## Phase 1：修正文档与 agent-facing 契约

**目的**: 先把产品主路径说清楚，避免继续围绕错误心智模型开发

- [ ] T001 修订 feature spec 套件，明确“agent 发送当前会话资源”是主契约，`carvis-media` 只是 transport / 调试入口 in `specs/014-feishu-media-delivery/spec.md`, `specs/014-feishu-media-delivery/data-model.md`, `specs/014-feishu-media-delivery/contracts/media-skill.md`, `specs/014-feishu-media-delivery/contracts/media-delivery-tools.md`, `specs/014-feishu-media-delivery/contracts/media-delivery-service.md`, `specs/014-feishu-media-delivery/contracts/feishu-media-delivery.md`, `specs/014-feishu-media-delivery/research.md`, `specs/014-feishu-media-delivery/quickstart.md`
- [ ] T002 修正实际 skill 与普通 run prompt 文案，移除对“上下文已自动解决”的过度承诺，改成只暴露资源业务参数的 agent 指引 in `packages/skill-media-cli/SKILL.md`, `apps/gateway/src/services/schedule-management-prompt.ts`
- [ ] T003 [P] 为 prompt / skill 文案补齐测试，确保不会再要求 agent 拼接 `runId`、`chatId`、`workspace`、`bun` 或 worktree 路径 in `tests/unit/schedule-management-prompt.test.ts`, `tests/contract/media-delivery-tools.contract.test.ts`

**检查点**: 到这里，文档、skill 和 prompt 对 agent 的要求已经与真实目标一致

---

## Phase 2：产品化零配置 transport 主路径

**目的**: 让 `carvis-media` 在当前 agent shell 中真正可直接使用，不再依赖环境考古

- [ ] T004 确保 `carvis-media` 在当前 Codex shell 会话里可直接执行，不能要求 agent 手工切换到特定 worktree 或显式包装 `bun` in `packages/bridge-codex/src/cli-transport.ts`, `packages/carvis-media-cli/bin/carvis-media.cjs`, `packages/carvis-media-cli/package.json`
- [ ] T005 收敛 transport 的上下文注入与解析，保证 `runId`、`sessionId`、`chatId`、`workspace` 等由可信 runtime 恢复，而不是让 agent 补全 in `packages/bridge-codex/src/cli-transport.ts`, `packages/carvis-media-cli/src/command-parser.ts`, `packages/carvis-media-cli/src/gateway-client.ts`, `apps/executor/src/gateway-tool-client.ts`
- [ ] T006 [P] 补齐“真实 shell 路径”测试，覆盖 PATH 可执行性、缺少 transport 时的快速失败，以及上下文缺失时的结构化结果 in `tests/unit/carvis-media-cli.test.ts`, `tests/contract/bridge-codex-media.contract.test.ts`, `tests/contract/carvis-media-cli.contract.test.ts`

**检查点**: 到这里，agent 在 happy path 下无需讨论 PATH / worktree / `bun` / `runId` 即可进入发送链路

---

## Phase 3：收紧当前会话发送的用户体验闭环

**目标**: 把“能发出去”收紧成“agent 会直接发、失败会直接说清楚”

### Phase 3 的测试 ⚠️

- [ ] T007 [P] 新增或修订集成测试，覆盖用户直接说“把截图发送给我”时 agent 走稳定媒体发送路径，而不是先做环境排查 in `tests/integration/feishu-media-send-session.test.ts`, `tests/contract/media-delivery-tools.contract.test.ts`
- [ ] T008 [P] 新增 transport wiring 缺陷测试，区分 `invalid_context`、`missing_context`、`missing_transport` 与真正的 source / upload / delivery 失败 in `tests/contract/carvis-media-cli.contract.test.ts`, `tests/integration/feishu-media-send-failures.test.ts`

### Phase 3 的实现

- [ ] T009 调整 CLI 失败摘要与 gateway 返回语义，让 agent 能把 transport 缺陷表述为“当前发送能力不可用”，而不是继续自发排查环境 in `packages/carvis-media-cli/src/command-parser.ts`, `packages/carvis-media-cli/src/index.ts`, `apps/gateway/src/services/media-delivery-service.ts`
- [ ] T010 完善 operator 查询面和 runbook，用于从 `mediaDeliveryId` 追到失败阶段、Feishu 目标消息引用和 transport wiring 状态 in `apps/gateway/src/services/run-media-presenter.ts`, `apps/gateway/src/routes/internal-run-media.ts`, `docs/runbooks/feishu-media-delivery.md`

**检查点**: 到这里，成功路径与失败路径都已具备真实、低心智负担的用户体验

---

## Phase 4：回归验证与文档收尾

**目的**: 确保修订后的 spec 与现有实现、运维文档和测试结果完全对齐

- [ ] T011 [P] 更新架构文档和 quickstart，记录“skill 是主契约、CLI 是 transport、debug flags 仅限排障”的最终口径 in `docs/architecture.md`, `specs/014-feishu-media-delivery/quickstart.md`
- [ ] T012 [P] 运行本功能相关测试与全量回归，并把真实验证步骤写回 quickstart / runbook in `bun test`, `bun run lint`, `git diff --check -- .`
- [ ] T013 完成一次真实 Feishu e2e，验证“把截图发送给我”或“把文件直接发出来”在当前分支上无需额外环境排查即可完成 in `specs/014-feishu-media-delivery/quickstart.md`, `docs/runbooks/feishu-media-delivery.md`

---

## 依赖与执行顺序

### Phase Dependencies

- **Phase 1（契约修正）**: 无前置依赖，必须先完成
- **Phase 2（零配置 transport）**: 依赖 Phase 1 的目标口径稳定
- **Phase 3（用户体验闭环）**: 依赖 Phase 2 提供真实可执行的 happy path
- **Phase 4（回归收尾）**: 依赖前面各阶段完成

### Parallel Opportunities

- Phase 1 中 `T002`、`T003` 可并行
- Phase 2 中 `T004`、`T005`、`T006` 可并行
- Phase 3 中 `T007`、`T008` 与 `T010` 可并行

## Notes

- 所有任务都遵循 `- [ ] Txxx ...` 的 checklist 格式
- 正常路径不得让 agent 手工传 `chatId` / `sessionId` / `runId`
- `RunMediaDelivery` 和 `OutboundDelivery` 的职责边界保持不变
- 本次修订的关键不是增加更多命令，而是让已有媒体发送能力成为 agent 可直接学会的稳定路径
