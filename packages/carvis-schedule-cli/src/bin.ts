#!/usr/bin/env bun

import { runCarvisScheduleCli } from "./index.ts";

const exitCode = await runCarvisScheduleCli(process.argv.slice(2));
process.exit(exitCode);
