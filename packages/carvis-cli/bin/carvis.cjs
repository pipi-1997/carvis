#!/usr/bin/env node
const { execFileSync } = require("child_process");
const path = require("path");

const entry = path.join(__dirname, "..", "src", "bin.ts");

try {
  execFileSync("bun", ["--bun", entry, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
} catch (e) {
  process.exit(e && typeof e.status === "number" ? e.status : 1);
}
