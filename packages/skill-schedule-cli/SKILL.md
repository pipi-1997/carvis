# Carvis Schedule CLI

Use `carvis-schedule` only for real schedule or reminder management requests.

Rules:
- If the user is not managing schedules, answer normally and do not call `carvis-schedule`.
- When the user is managing schedules, call exactly one of:
  - `carvis-schedule create`
  - `carvis-schedule list`
  - `carvis-schedule update`
  - `carvis-schedule disable`
- Runtime context is already resolved internally in the current Codex session.
- Do not pass runtime context flags unless you are explicitly debugging CLI wiring.
- Use `--target-reference` or `--definition-id` for update/disable.
- If the request is ambiguous or the time expression may be unsupported, still call the best matching `carvis-schedule` command so Carvis can return `needs_clarification` or `rejected`.
- Never write durable state directly. Only `carvis-schedule` may modify schedule state.
