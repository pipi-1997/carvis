---
"@carvis/carvis-cli": patch
"@carvis/gateway": patch
---

Fix local runtime restart wiring so repaired installs persist daemon launch arguments, and prevent internal trigger queries from failing when execution timestamps are returned as `Date` values.
