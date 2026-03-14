# 快速验证：工作区 Codex Sandbox 模式

## 1. 前置条件

- `~/.carvis/config.json` 可用，并且每个测试工作区都配置了默认 sandbox mode
- `POSTGRES_URL`、`REDIS_URL`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET` 已配置
- `gateway` 与 `executor` 可分别启动
- Feishu websocket / webhook 接入正常
- `codex` CLI 可运行

## 2. 配置示例

在 `~/.carvis/config.json` 的 `workspaceResolver` 下为目标工作区增加 sandbox mode 映射，例如：

```json
{
  "workspaceResolver": {
    "registry": {
      "main": "/Users/pipi/workspace/carvis",
      "ops": "/Users/pipi/workspace/ops"
    },
    "sandboxModes": {
      "main": "workspace-write",
      "ops": "danger-full-access"
    }
  }
}
```

## 3. 启动本地 runtime

- 终端 A: `bun run start:gateway`
- 终端 B: `bun run start:executor`

## 4. 验证工作区默认值

在绑定到 `main` 工作区的飞书 `chat` 中发送普通消息：

```text
/status
```

预期结果：

- 返回当前工作区为 `main`
- 当前 sandbox mode 为 `workspace-write`
- 来源为 `workspace_default`

## 5. 验证 chat override

在同一 `chat` 中发送：

```text
/mode danger-full-access
```

随后执行：

```text
/status
```

预期结果：

- `/mode` 返回 override 已建立
- `/status` 显示当前 mode 为 `danger-full-access`
- 来源为 `chat_override`
- 可见剩余有效期，初始窗口为 30 分钟

## 6. 验证 mode 切换触发 fresh

在建立 continuation 后，执行：

```text
/mode workspace-write
```

随后发送一条普通消息。

预期结果：

- 该 run 从 fresh 会话开始，而不是继续复用 `danger-full-access` 下建立的 continuation
- 执行完成后，新的 continuation 绑定记录为 `workspace-write`

## 7. 验证 `/new`

在已有 continuation 与 override 的 `chat` 中发送：

```text
/new
```

随后执行：

```text
/status
```

预期结果：

- continuation 与 override 都已清空
- 当前 mode 回到工作区默认值
- 后续普通消息以 fresh 会话执行

## 8. 验证 override 过期回退

在本地测试环境等待 override 超过 30 分钟，或通过测试夹具注入一个已过期 override，然后执行：

```text
/status
```

预期结果：

- 当前 mode 回到工作区默认值
- `/status` 明确显示 override 已过期或已回退

## 9. 验证 non-chat trigger

为 `ops` 工作区配置一个 scheduled job 或 external webhook，触发一次运行。

预期结果：

- run 使用 `danger-full-access`
- 结果不依赖任何飞书 `chat` override
- trigger 查询面可看到该 run 的 resolved sandbox mode

## 10. 自动化验证范围

本轮任务完成后，自动化测试至少应覆盖：

- runtime config 读取和校验 `workspaceResolver.sandboxModes`
- `gateway` 为飞书消息、scheduled job、external webhook 解析并持久化 sandbox mode
- `/mode`、`/mode reset`、`/status` 和 `/new` 的命令行为
- 现有 allowlist 对 `/mode` 的保护仍然生效
- mode 切换后 continuation 强制 fresh
- `bridge-codex` 按 `resolvedSandboxMode` 映射 CLI 参数
- override 过期回退到工作区默认值
- `/bind` 切换工作区时清除旧 override

## 11. 本次实现完成后的验证命令

- `bun test`
- `bun run lint`
- `bunx tsc --noEmit`
- `git diff --check -- .`
