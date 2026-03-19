# 合同：Changeset Entry

## 1. 适用范围

- 本合同定义普通功能改动如何声明“进入下一轮发布”
- 适用于开发者与 agent 在可发布改动中的协作行为

## 2. entry 内容

- 每条 changeset 必须说明：
  - 受影响的公开 package 集合
  - semver bump 类型
  - 面向 release note 的简明摘要

## 3. entry 创建规则

- 可发布改动应在普通功能分支阶段创建 changeset
- docs-only、internal-only 或不影响公开包的改动可以不创建 changeset
- changeset 不能被手工改版本号行为取代
- 只有命中公开 release group 的 changeset entry 才能推动公开 release PR
- 仅命中 ineligible package 的 changeset entry 不得推动公开 release PR

## 4. agent / developer 规则

- agent 必须优先创建 changeset，而不是批量手改多个 `package.json`
- 开发者和 agent 都必须把 changeset 视为 release PR 的输入，而不是可选附属文件

## 5. 质量要求

- 摘要应面向用户或 operator 可理解的发布信息
- 摘要不得只是内部实现碎片列表
- 同一次改动若影响多个公开包，应在统一 entry 中表达完整影响
