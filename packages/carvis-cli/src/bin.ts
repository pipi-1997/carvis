#!/usr/bin/env bun

import { runCarvisCli } from "./index.ts";

const exitCode = await runCarvisCli(process.argv.slice(2));
process.exit(exitCode);
