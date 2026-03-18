#!/usr/bin/env bun

import { runCarvisMediaCli } from "./index.ts";

const exitCode = await runCarvisMediaCli(process.argv.slice(2));
process.exit(exitCode);
