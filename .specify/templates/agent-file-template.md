# [PROJECT NAME] 开发指南

根据所有 feature plan 自动生成。最后更新时间：[DATE]

## 宪法约束

- Preserve `ChannelAdapter` and `AgentBridge` boundaries
- Treat Postgres as durable state and Redis as coordination only
- Keep one active run per workspace with explicit queue/lock semantics
- Preserve operator-visible lifecycle state, logging, and heartbeat behavior
- Require contract plus integration coverage for adapter, bridge, and run-flow changes

## 当前技术栈

[EXTRACTED FROM ALL PLAN.MD FILES]

## 项目结构

```text
[ACTUAL STRUCTURE FROM PLANS]
```

## 常用命令

[ONLY COMMANDS FOR ACTIVE TECHNOLOGIES]

## 代码风格

[LANGUAGE-SPECIFIC, ONLY FOR LANGUAGES IN USE]

## 最近变更

[LAST 3 FEATURES AND WHAT THEY ADDED]

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
