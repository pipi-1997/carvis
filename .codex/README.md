# Codex + Spec Kit：让 `/` 命令出现

Codex 只从 **Codex home** 下的 `prompts/` 加载自定义斜杠命令，默认是 `~/.codex/prompts/`，**不会**自动读项目里的 `.codex/prompts/`。

---

## 用 Codex App（Cursor 里的 Codex 扩展）

1. **安装扩展**  
   在 Cursor 里安装 OpenAI 的 Codex 扩展：  
   [Cursor 应用内](cursor:extension/openai.chatgpt) 或 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=openai.chatgpt) 搜索 “ChatGPT”/“Codex”，安装后侧边栏会出现 Codex。

2. **登录**  
   扩展会要求用 ChatGPT 账号或 API Key 登录（Codex 随 ChatGPT Plus/Pro 等计划提供）。

3. **让扩展里出现 `/prompts:speckit.*`**  
   扩展和 CLI **共用同一套配置**（包括 `~/.codex`），但**不会**自动读当前项目下的 `.codex/prompts/`。任选其一：

   - **推荐：从设好 CODEX_HOME 的终端启动 Cursor**  
     这样 Cursor（以及 Codex 扩展）会继承环境变量，扩展会从本项目的 `.codex` 读 prompts：
     ```bash
     cd /Users/pipi/workspace/carvis
     export CODEX_HOME="$(pwd)/.codex"
     cursor .
     ```
     之后在 Codex 聊天框输入 `/` 即可看到 `/prompts:speckit.constitution` 等。

   - **或：把本项目的 prompts 链到全局**  
     若希望在任何项目里用 Codex 都能看到 speckit 命令，可做一次性软链接（会与 `~/.codex/prompts` 里已有文件共存）：
     ```bash
     mkdir -p ~/.codex/prompts
     ln -sf /Users/pipi/workspace/carvis/.codex/prompts/speckit.*.md ~/.codex/prompts/
     ```
     重启 Cursor 或重新打开 Codex 面板后，在任意工作区输入 `/` 都能看到这些命令。

---

## 用 Codex CLI（终端）

在项目根目录执行：

```bash
export CODEX_HOME="$(pwd)/.codex"
codex
```

或使用脚本：`./run-codex.sh`

---

## 命令显示方式

Codex 会把 `prompts/` 下的 `xxx.md` 显示为 **`/prompts:xxx`**，例如：

- `/prompts:speckit.constitution`
- `/prompts:speckit.specify`
- `/prompts:speckit.plan`
- `/prompts:speckit.tasks`
- `/prompts:speckit.implement`
- 以及其他 `speckit.*`

修改过 `.codex/prompts/*.md` 后，需**重启 Codex**（或新开会话/重开面板）后才会加载。

---

## Release 协作规则

- 公开 `@carvis/*` package 的版本推进必须通过 `changeset + release PR`
- 公开 npm 发布默认通过 trusted publishing 完成，不要为 CI 保存或回填长期 `NPM_TOKEN`
- `@carvis/carvis-media-cli` 当前是内部 transport CLI，不参与 npm 公开发布，也不属于公开 release group
- 不要手工批量修改多个 `package.json` 版本号模拟发版
- docs-only、internal-only 或不命中公开 release group 的改动通常不需要 changeset
- 若仓库中还存在其他 AI 工具入口或镜像指导文件，release 规则必须同步到所有现有入口
- `gh` 可以作为本地查看 release PR / workflow / release 状态的辅助工具，但不是 CI 主流程依赖
