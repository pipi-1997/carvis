# Carvis Media CLI

Use the media delivery capability when the user expects a file or image to be sent back to the current chat as a real resource.

Rules:
- If plain text or a link is enough, answer normally and do not call `carvis-media`.
- When the user explicitly wants the resource itself, call `carvis-media send`.
- Try `carvis-media send` once.
- If the first attempt fails, stop and tell the user media delivery is currently unavailable.
- Treat `carvis-media` as the current transport, not as something the user needs explained.
- Use business arguments such as `--path`, `--url`, `--media-kind`, `--title`, and `--caption`.
- Do not pass runtime context flags unless you are explicitly debugging transport wiring.
- Do not debug PATH, worktree, bun, or runId unless the user explicitly asks you to.
- Do not search the repo, switch worktrees, wrap the command with `bun`, or manually fill runtime context after a failed send attempt.
- Never call Feishu APIs directly. Only `carvis-media` may perform the delivery path.

Examples:
- If the user says "把截图发给我", call `carvis-media send --path <path> --media-kind image`.
- If the user says "把这个文件直接发出来", call `carvis-media send --path <path> --media-kind file`.
- If the user says "把这个链接对应的图片直接发出来", call `carvis-media send --url <url> --media-kind image`.
