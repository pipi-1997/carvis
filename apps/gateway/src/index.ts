import { createGatewayApp } from "./app.ts";

export function startGateway(): string {
  return "gateway:not-implemented";
}

export { createGatewayApp };

if (import.meta.main) {
  console.log(startGateway());
}
