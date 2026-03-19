# 合同：Carvis 分层状态与诊断

## 1. 层级模型

### 必须输出的层

- 安装层
- 基础设施层
- 外部依赖层
- daemon 层
- runtime 层

### 边界要求

- Postgres / Redis 只能属于基础设施层
- `Codex CLI` 与飞书凭据只能属于外部依赖层
- daemon 层与 runtime 层必须分开表达

## 2. `carvis status`

### 成功条件

- 返回各层 `status`、`summary`、最近失败原因和建议动作
- overall status 可以聚合，但不得掩盖层级细节
- JSON 与人类输出必须基于同一份聚合模型

### 最低可见信息

- 安装层：bundle / service definition / manifest 是否完整
- 基础设施层：Postgres、Redis 是否 installed/running/healthy
- 外部依赖层：`codex` 与飞书凭据是否可用
- daemon 层：service 状态、pid、socket、最近失败原因
- runtime 层：`gateway` ready、`executor` ready、`CONFIG_DRIFT`、last error

## 3. `carvis doctor`

### 成功条件

- 每个检查项带稳定 `checkId`
- 检查项必须归属某一层
- 失败时提供明确建议动作

### 边界要求

- 不能把“daemon running 但 gateway 不 ready”判定为整体健康
- 不能把“飞书凭据错误”判定为 infra 问题

## 4. 配置漂移

### 成功条件

- 配置已写入但尚未重启相关托管层时，`status` / `doctor` 必须能识别为 drift
- drift 的提示必须明确指出需要 `carvis daemon restart` 或等价动作

### 边界要求

- 现有 `CONFIG_DRIFT` 语义必须保留
- drift 不得静默隐藏在“running”或“installed”之下

## 5. 卸载可见性

### 成功条件

- 默认卸载前后，用户都能看到“哪些目录会保留”
- `--purge` 前后，用户都能看到“哪些目录会被删除”

### 非目标行为

- 不要求在状态命令中展示完整日志内容
- 不要求暴露底层 OS service manager 的所有原始字段
