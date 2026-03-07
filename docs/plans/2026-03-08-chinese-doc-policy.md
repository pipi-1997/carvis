# Chinese Documentation Policy Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将仓库内的 spec 与协作文档默认语言切换为简体中文，同时保留稳定的技术标识符。

**Architecture:** 通过三层约束固化语言策略：宪法定义项目级规则，模板决定产物默认语言，`speckit` prompt 明确生成行为。现有架构文档直接翻译为中文，便于后续协作。

**Tech Stack:** Markdown, Speckit prompts, repository templates

---

### Task 1: 语言规则落地

**Files:**
- Modify: `.specify/memory/constitution.md`
- Modify: `.cursor/rules/specify-rules.mdc`

**Step 1:** 在宪法中加入中文文档默认策略  
**Step 2:** 更新 Cursor 规则以反映该策略  
**Step 3:** 复核版本号与同步影响报告

### Task 2: 模板中文化

**Files:**
- Modify: `.specify/templates/spec-template.md`
- Modify: `.specify/templates/plan-template.md`
- Modify: `.specify/templates/tasks-template.md`
- Modify: `.specify/templates/checklist-template.md`
- Modify: `.specify/templates/constitution-template.md`
- Modify: `.specify/templates/agent-file-template.md`

**Step 1:** 将模板标题、说明和注释改为中文  
**Step 2:** 保留路径、命令和结构化 ID 的原文形式  
**Step 3:** 复核模板是否仍可被现有命令消费

### Task 3: Prompt 生成规则

**Files:**
- Modify: `.codex/prompts/speckit.specify.md`
- Modify: `.codex/prompts/speckit.plan.md`
- Modify: `.codex/prompts/speckit.tasks.md`
- Modify: `.codex/prompts/speckit.checklist.md`
- Modify: `.codex/prompts/speckit.clarify.md`
- Modify: `.codex/prompts/speckit.constitution.md`
- Modify: `.cursor/commands/` 下对应镜像文件

**Step 1:** 为相关 prompt 增加 Language Policy 段落  
**Step 2:** 明确输出默认中文、技术标识原文保留  
**Step 3:** 确认 Codex 与 Cursor 两套命令树同步

### Task 4: 现有文档翻译

**Files:**
- Modify: `docs/architecture.md`

**Step 1:** 将文档正文与图说明翻译为中文  
**Step 2:** 保留包名、接口名、协议名与命令名  
**Step 3:** 检查 Mermaid 结构是否保持可读
