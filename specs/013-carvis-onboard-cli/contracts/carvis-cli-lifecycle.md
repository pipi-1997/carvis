# 合同：Carvis CLI 生命周期命令

## 目标

定义 `carvis onboard`、`carvis start`、`carvis stop`、`carvis status` 和 `carvis doctor` 的稳定行为边界。

## 命令合同

### `carvis onboard`

- 负责采集首次运行所需配置
- 必须在完成后自动调用 `carvis start`
- 若已有配置存在，必须先提示复用、重配或取消
- 若前置检查失败，必须停止在可诊断位置，不得伪造“配置成功”

### `carvis start`

- 负责启动本地 `gateway` 与 `executor`
- 必须阻止重复启动
- 必须在失败时给出明确错误码和可定位信息
- 必须在成功时写入本地 state/log 元信息

### `carvis stop`

- 负责安全停止本地 `gateway` 与 `executor`
- 必须能处理部分进程已退出的场景
- 必须清理 stale state

### `carvis status`

- 必须同时展示 `gateway` 与 `executor` 的状态
- 必须区分：
  - 进程未运行
  - 进程运行中但 runtime 未 ready
  - runtime ready

### `carvis doctor`

- 必须复用现有 runtime 真实检查点
- 至少覆盖：
  - 配置可解析
  - Feishu 配置可验证
  - Postgres 可连通
  - Redis 可连通
  - `codex` 可执行
  - `carvis-schedule` 可执行

## 失败语义

| 场景 | 预期 |
| --- | --- |
| `gateway` 启动失败 | `start` 立即失败，不再继续启动 `executor` |
| `gateway` 存活但不 ready | `start` 失败，`status` 明确显示未 ready |
| `executor` startup report 为 failed | `start` 失败，并停止或标注整体未 ready |
| stale pid/state 存在 | `start` 先清理，再继续 |
| `stop` 遇到已退出进程 | 清理状态并报告部分资源已不存在 |
