---
"@carvis/core": minor
"@carvis/carvis-schedule-cli": minor
"@carvis/gateway": minor
---

feat(schedule): add enable action and structured list results

- Add `schedule.enable` / `carvis-schedule enable` to re-enable disabled schedules.
- `schedule.list` now includes a machine-readable `schedules[]` field while keeping `summary` for backwards compatibility.
- `schedule.update` no longer implicitly re-enables disabled schedules; enabling is explicit.
- CLI validates `--delivery-kind` and prints a more complete `--help`.
