# 合同：Carvis Daemon Supervision

## 1. daemon 拓扑

### 成功条件

- `apps/daemon` 是唯一被 OS user service 直接托管的 Carvis 长驻进程
- daemon 负责管理 Postgres、Redis、`gateway`、`executor` 四类子组件
- `gateway` 与 `executor` 继续保持独立进程边界

### 边界要求

- daemon 不得把 Feishu 渠道逻辑或 Codex bridge 逻辑内联到自己进程中
- daemon 不能绕过 `gateway -> queue -> executor` 的既有执行链

## 2. 自启动与恢复

### 成功条件

- 主机重启或用户重新登录后，OS user service 会自动拉起 daemon
- daemon 启动后读取 active manifest 并重新收敛 infra 与 runtime
- 收敛结果必须映射为明确的 `ready`、`degraded` 或 `failed`

### 边界要求

- daemon 自身 running 不得被误报为整体 ready
- 若某一子组件恢复失败，必须保留层级失败原因

## 3. 子组件 supervision

### 成功条件

- daemon 能检测子组件退出、健康检查失败和配置漂移
- 在允许的范围内执行受控重启或标记 failed / degraded
- Postgres 与 Redis 的状态独立于 runtime 呈现

### 边界要求

- daemon 不改变 `gateway` / `executor` 的业务生命周期语义
- `CONFIG_DRIFT` 仍作为 runtime 层问题暴露，不被吞并为 daemon 自身失败

## 4. 控制面

### 成功条件

- CLI 可以通过本地控制 socket 请求 daemon 执行 `status`、`restart`、`infra rebuild` 等动作
- daemon 同步刷新持久化状态快照，供 `status` / `doctor` 与离线诊断读取

### 边界要求

- daemon 不可达时，CLI 仍需基于持久化快照和直接 probe 给出可判定结果
- 控制请求必须幂等；重复执行不能制造额外漂移

## 5. 修复与卸载协作

### 成功条件

- `carvis install --repair` 可在 daemon 停止或运行时安全修复安装产物
- `carvis uninstall` 会先停止 daemon，再清理 service definition 和 bundle
- `carvis uninstall --purge` 才删除数据目录

### 非目标行为

- 不支持 Windows service manager
- 不支持 system-wide root service 作为首版强依赖
