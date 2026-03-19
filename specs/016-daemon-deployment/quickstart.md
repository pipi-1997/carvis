# 快速验证：Carvis 托管式本地部署

## 1. 前置条件

- 宿主机是受支持平台：macOS 或 Linux，且支持用户级 `launchd` / `systemd --user`
- 用户已经自行安装并可运行 `codex`
- 用户已经准备好飞书应用凭据：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`
- 宿主机必须已经装好 `docker` 与 `docker compose`，Carvis 之后会通过 Docker Compose 拉起 Postgres/Redis，因此不需要用户单独安装这些服务

## 2. 首次安装

执行：

```bash
carvis install
```

预期结果：

- `~/.carvis` 下生成安装根目录、状态目录、日志目录和版本化 bundle
- 当前平台对应的 user service definition 已写入并启用
- 输出明确提示下一步执行 `carvis onboard`
- 若重复执行，应返回幂等结果；若发现漂移，可提示 `carvis install --repair`

## 3. 首次引导

执行：

```bash
carvis onboard
```

按提示输入或确认：

- Feishu App ID / App Secret
- workspace / managed workspace root
- 其他必要运行配置
- Carvis 不再提示 `POSTGRES_URL` / `REDIS_URL`；这些由 daemon 启动 Docker Compose 后写入 `~/.carvis/runtime.env`

预期结果：

- 写入 `~/.carvis/config.json` 与相关环境配置
- 显式检查 `codex` CLI 和飞书凭据
- daemon 收到首次 reconcile 请求
- 输出最终实例状态为 `ready`、`degraded` 或 `failed`，不得停留在模糊的“已启动”

## 4. 查看分层状态

执行：

```bash
carvis daemon status
carvis infra status
carvis status
carvis doctor
```

预期结果：

- `carvis daemon status` 只表达 daemon 自身 service / process 状态
- `carvis infra status` 明确展示由 Docker Compose 托管的 Postgres 与 Redis 的安装、运行和健康状态
- `carvis status` 至少区分安装层、基础设施层、外部依赖层和 runtime 层
- `carvis doctor` 返回稳定 checkId、失败层级和建议动作

## 5. 验证自启动

在 daemon 已 ready 的前提下，重启主机或退出再登录当前用户会话，然后执行：

```bash
carvis status
```

预期结果：

- daemon 已自动恢复，或给出明确的 install / infra / runtime 层失败原因
- 操作者不需要重新执行完整的 `install` 或 `onboard`

## 6. 验证修复路径

执行：

```bash
carvis install --repair
carvis daemon restart
carvis doctor
```

预期结果：

- repair 不会重复安装出第二份未定义状态
- daemon restart 会重新收敛 infra 与 runtime
- doctor 结果能明确反映修复后的层级状态

## 7. 验证兼容命令

执行：

```bash
carvis start
carvis stop
carvis status
```

预期结果：

- 命令继续可用
- 返回结果中明确说明其实际映射到 `carvis daemon start|stop|status`
- 不再要求操作者理解直接拉起 `gateway` / `executor` 的旧模式

## 8. 验证默认卸载与显式清空

执行默认卸载：

```bash
carvis uninstall
```

预期结果：

- daemon 停止
- service definition 与 active bundle 被移除
- Postgres 数据目录（由 Docker volume 管理）、workspace、日志和历史快照默认保留

执行显式清空：

```bash
carvis uninstall --purge
```

预期结果：

- 删除范围在执行前明确展示
- 持久化数据和状态目录被清理

## 9. 自动化验证范围

本轮任务完成后，自动化测试至少应覆盖：

- `carvis install` / `install --repair` 的幂等与漂移修复
- `carvis onboard` 对 `codex` 和飞书凭据的检查与失败归因
- `carvis daemon ...` 和 `carvis infra ...` 的控制契约
- `carvis status` / `doctor` 的分层输出
- user service manager 适配器的生成与启停逻辑
- 默认卸载保留数据、显式 purge 清空数据
- 旧 `start` / `stop` / `status` 的稳定迁移行为
- 引入 daemon 后不回归 `gateway` / `executor` 的现有 queue/lock/cancel/timeout/heartbeat 语义

## 10. 本次实现完成后的验证命令

- `bun test`
- `bun run lint`
- `bun run --filter @carvis/carvis-cli carvis install --json`
- `bun run --filter @carvis/carvis-cli carvis doctor --json`
- `git diff --check -- .`
