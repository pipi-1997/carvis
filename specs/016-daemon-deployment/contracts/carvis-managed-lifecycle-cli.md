# 合同：Carvis 托管式本地部署 CLI

## 1. `carvis install`

### 支持形式

- `carvis install`
- `carvis install --repair`
- `carvis install --json`

### 成功条件

- 安装版本化 bundle、控制面目录、状态目录和日志目录
- 生成并启用当前平台对应的 user service definition
- 返回 install 层结果，而不是直接伪装成 runtime 已 ready
- `--repair` 在发现 manifest、bundle 或 service definition 漂移时执行对齐修复

### 边界要求

- 不负责安装 `Codex CLI`
- 不负责创建飞书应用或代填飞书凭据
- 重复执行必须幂等

## 2. `carvis onboard`

### 成功条件

- 写入运行所需配置
- 检查 `Codex CLI` 与飞书凭据
- 请求 daemon 首次或再次 reconcile
- 返回最终可判定的 `ready`、`degraded` 或 `failed`

### 边界要求

- `onboard` 可以在 install 之后独立重复执行
- 若 install 层缺失，应明确拒绝并指向 `carvis install`

## 3. `carvis infra ...`

### 支持形式

- `carvis infra status`
- `carvis infra start`
- `carvis infra stop`
- `carvis infra restart`
- `carvis infra rebuild`

### 成功条件

- 返回 Postgres 与 Redis 的明确状态
- `rebuild` 可修复或重建 infra 产物，但默认不误删数据
- 结果可稳定输出为人类文本和 JSON

### 边界要求

- infra 状态不得与 daemon / runtime 状态混淆
- infra 不可用时，`status` / `doctor` 必须归因为基础设施层

## 4. `carvis daemon ...`

### 支持形式

- `carvis daemon status`
- `carvis daemon start`
- `carvis daemon stop`
- `carvis daemon restart`

### 成功条件

- 显示 daemon 自身 service/process 状态、版本、socket 与最近失败原因
- `restart` 会触发 daemon 重启并重新收敛 infra + runtime
- daemon running 不等价于 runtime ready

### 边界要求

- daemon 命令必须保留与 runtime 状态的层级区分
- daemon 无法启动时，CLI 不能回退成直接托管 `gateway` / `executor`

## 5. `carvis doctor`

### 成功条件

- 按安装层、基础设施层、外部依赖层和 runtime 层返回检查结果
- 每个检查项都有稳定 `checkId`
- 能输出建议动作，例如 `carvis install --repair`、`carvis daemon restart`

### 边界要求

- 不得把 Postgres / Redis 归类为 external dependency
- 必须保留 `CONFIG_DRIFT`、渠道未就绪、依赖不可达等既有失败语义

## 6. `carvis uninstall`

### 支持形式

- `carvis uninstall`
- `carvis uninstall --purge`

### 成功条件

- 默认路径停止 daemon、移除 service definition 与 active bundle
- 默认路径保留持久化数据、workspace、日志与历史状态
- `--purge` 在显式确认后删除数据目录和状态目录

### 边界要求

- 默认卸载不得误删数据
- CLI 必须在执行前后都明确展示清理范围

## 7. 兼容命令

### 支持形式

- `carvis start`
- `carvis stop`
- `carvis status`

### 成功条件

- 继续返回稳定结果
- 明确声明其映射到 `carvis daemon start|stop|status`

### 非目标行为

- 不继续暴露“CLI 直接托管 runtime 进程”的旧实现模型
