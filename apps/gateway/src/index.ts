import { createGatewayApp } from "./app.ts";
import { bootstrapGatewayRuntime, type BootstrapGatewayRuntimeOptions } from "./bootstrap.ts";

type StartGatewayOptions = {
  createFeishuIngress?: BootstrapGatewayRuntimeOptions["createFeishuIngress"];
  createRuntimeServices?: BootstrapGatewayRuntimeOptions["createRuntimeServices"];
  env?: Record<string, string | undefined>;
  serve?: (options: {
    fetch: (request: Request) => Response | Promise<Response>;
    port: number;
  }) => {
    port: number;
    stop?: () => void | Promise<void>;
  };
  transportFactory?: BootstrapGatewayRuntimeOptions["transportFactory"];
};

export async function startGateway(options: StartGatewayOptions = {}) {
  const runtime = await bootstrapGatewayRuntime({
    createFeishuIngress: options.createFeishuIngress,
    createRuntimeServices: options.createRuntimeServices,
    env: options.env,
    transportFactory: options.transportFactory,
  });

  runtime.services.logger.gatewayState("starting", {
    configFingerprint: runtime.services.configFingerprint,
    feishuReady: false,
    feishuIngressReady: false,
  });

  await runtime.ingress.start();
  await runtime.publishFingerprint();

  const serveImpl = options.serve ?? ((input) => Bun.serve(input));
  const server = serveImpl({
    fetch: runtime.app.fetch,
    port: runtime.services.config.gateway.port,
  });
  runtime.health.markHttpListening();

  runtime.services.logger.gatewayState(runtime.health.status(), {
    configFingerprint: runtime.services.configFingerprint,
    feishuReady: runtime.health.state.feishuReady,
    feishuIngressReady: runtime.health.state.feishuIngressReady,
    errorCode: runtime.health.state.lastError?.code,
    errorMessage: runtime.health.state.lastError?.message,
  });

  return {
    app: runtime.app,
    health: runtime.health,
    ingress: runtime.ingress,
    server,
    loggerEntries() {
      return runtime.services.logger.listEntries();
    },
    async stop() {
      await runtime.stop();
      await server.stop?.();
    },
  };
}

export { createGatewayApp };

if (import.meta.main) {
  await startGateway();
}
