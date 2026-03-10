# Research: Feishu 稳定富文本适配

## 决策 1：在 `packages/channel-feishu` 内新增统一转换入口

- **Decision**: 在 `packages/channel-feishu` 内增加统一的富文本稳定化转换层，由 sender 在 Feishu 消息实际发送前调用。
- **Rationale**: 这满足“agent 输出之后、适配器内部完成转换”的目标，同时保持 `ChannelAdapter` / `AgentBridge` 边界清晰，不让 `gateway` 或 `bridge-codex` 感知 Feishu 富文本细节。
- **Alternatives considered**:
  - 把转换放在 `apps/gateway`: 更容易拿到运行上下文，但会把渠道细节泄漏到应用层。
  - 把转换放在 `bridge-codex`: 会把渠道渲染规则和智能体桥接耦合，违反边界约束。

## 决策 2：流式与终态共用同一套转换主流程

- **Decision**: 使用一个共享的“解析 -> 归一化 -> 映射”主流程，只通过 `streaming` / `terminal` 模式参数区分少量策略差异。
- **Rationale**: 这样可以避免运行中和终态卡片出现两套渲染规则漂移，同时复用测试样例和兼容性规则。
- **Alternatives considered**:
  - 两套独立 renderer: 易于快速堆规则，但后续维护和测试容易分叉。
  - 完全无模式差异: 对流式残缺结构的容错不足，终态也无法更严格地恢复完整分段。

## 决策 3：输入始终使用累计完整文本，而不是单条 delta

- **Decision**: 保持 `gateway` 的累计输出窗口逻辑不变，`channel-feishu` 每次只接收当前完整可见文本并重新转换。
- **Rationale**: 这样即使前几次流式更新因结构未闭合而被保守降级，后续累计文本完整后也能自然收敛到更稳定的结构表达，不需要在渠道层维护额外的 Feishu 专属增量状态机。
- **Alternatives considered**:
  - 在 `channel-feishu` 直接消费单条 delta: 需要额外维护状态和纠错逻辑，复杂度更高。
  - 在 `gateway` 先产出 Feishu 专属结构: 会打破适配层职责边界。

## 决策 4：只做稳定渲染转换，不做摘要或内容润色

- **Decision**: 转换层只负责稳定渲染、白名单语法保留、未知标签转义和必要分段，不负责压缩、总结、去套话或重写 agent 原文。
- **Rationale**: 用户已经明确要求“只做 Feishu 可稳定渲染的 `lark_md` / 卡片结构”，不希望适配器演变成内容后处理器。
- **Alternatives considered**:
  - 适配层顺便做轻量摘要: 可读性会更高，但会引入语义漂移风险。
  - 适配层按固定模板重写终态: 能统一视觉，但会覆盖 agent 原始结构。

## 决策 5：采用白名单保留 + 未知语法降级，而不是尝试完整 CommonMark / HTML 兼容

- **Decision**: 对常见 Markdown 结构和飞书明确支持的标签做白名单保留；对未知、未闭合或飞书不稳定的 HTML / XML / 标签语法统一降级为可读文本或转义文本。
- **Rationale**: 飞书卡片不是完整浏览器渲染环境。白名单策略更符合“稳定可读”目标，也更容易形成可验证的契约测试。
- **Alternatives considered**:
  - 尝试完整 Markdown 兼容: 实现复杂且容易出现边缘不稳定渲染。
  - 尝试任意 HTML 透传: 与飞书支持边界不符，渲染风险高。

## 决策 6：标题统一归一化为 section，而不是依赖原始标题语法

- **Decision**: 对标题类结构统一归一化为 section 概念，并映射为多个 `div + lark_md` 块，必要时插入 `hr`，而不是直接依赖 `##` 等原始 Markdown 标题语法稳定生效。
- **Rationale**: 现有实现和飞书文档都显示标题语法存在不稳定边界；section 化后更容易在流式与终态中维持一致。
- **Alternatives considered**:
  - 原样保留标题 Markdown: 实现简单，但在 Feishu 卡片中稳定性不足。
  - 直接丢弃标题: 可避免兼容性问题，但用户阅读层次会丢失。

## 决策 7：优先避免新增持久化模型或运行拓扑改动

- **Decision**: 本轮以 `packages/channel-feishu` 内部转换和现有 `RunPresentation` / `OutboundDelivery` 可观测链路为主，不新增新的持久化实体或执行路径。
- **Rationale**: 该功能核心是渠道渲染边界收敛，不需要改变 durable lifecycle 真值来源或工作区串行化规则。
- **Alternatives considered**:
  - 新增单独的“转换任务”或“渲染队列”: 对本轮问题过度设计。
  - 新增数据库表记录每次转换细节: 可观察性更强，但当前收益不足以支撑复杂度。

## 决策 8：验证以 unit + contract + integration 三层覆盖

- **Decision**: 单元测试覆盖转换规则与边界输入，契约测试覆盖 sender 对 Feishu 稳定结构的输出，集成测试覆盖 run event 到单消息卡片结果的完整链路。
- **Rationale**: 该功能风险主要在 adapter seam 和渲染降级边界，必须避免只靠单元测试证明完成。
- **Alternatives considered**:
  - 只写单元测试: 无法验证单消息语义和降级路径。
  - 只写集成测试: 失败定位成本过高，规则回归不够可诊断。
