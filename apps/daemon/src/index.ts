import { bootstrapCarvisDaemon } from "./bootstrap.ts";

await bootstrapCarvisDaemon({
  env: process.env,
});
