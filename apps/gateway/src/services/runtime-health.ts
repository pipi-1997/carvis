import type { GatewayRuntimeState, RuntimeErrorState, RuntimeStatus } from "@carvis/core";

type GatewayRuntimeHealthOptions = {
  configFingerprint: string;
};

type GatewayRuntimeSnapshot = {
  ok: boolean;
  state: {
    http_listening: boolean;
    config_valid: boolean;
    feishu_ready: boolean;
    feishu_ingress_ready: boolean;
    config_fingerprint: string;
    ready: boolean;
    last_error: RuntimeErrorState | null;
  };
};

export function createGatewayRuntimeHealth(options: GatewayRuntimeHealthOptions) {
  const state: GatewayRuntimeState = {
    httpListening: false,
    configValid: true,
    feishuReady: false,
    feishuIngressReady: false,
    configFingerprint: options.configFingerprint,
    ready: false,
    lastError: null,
  };

  function recalculateReady() {
    state.ready =
      state.httpListening &&
      state.configValid &&
      state.feishuReady &&
      state.feishuIngressReady &&
      state.lastError?.code !== "CONFIG_DRIFT";
  }

  function setError(error: RuntimeErrorState | null) {
    state.lastError = error;
    recalculateReady();
  }

  return {
    markHttpListening(value = true) {
      state.httpListening = value;
      recalculateReady();
    },
    markConfigInvalid(message: string) {
      state.configValid = false;
      setError({
        code: "INVALID_CONFIG",
        message,
      });
    },
    markFeishuReady(value = true) {
      state.feishuReady = value;
      recalculateReady();
    },
    markFeishuIngressReady(value = true) {
      state.feishuIngressReady = value;
      recalculateReady();
    },
    markFailure(code: string, message: string) {
      setError({ code, message });
    },
    markConfigDrift(message: string) {
      setError({
        code: "CONFIG_DRIFT",
        message,
      });
    },
    clearError() {
      setError(null);
    },
    snapshot(): GatewayRuntimeSnapshot {
      return {
        ok: true,
        state: {
          http_listening: state.httpListening,
          config_valid: state.configValid,
          feishu_ready: state.feishuReady,
          feishu_ingress_ready: state.feishuIngressReady,
          config_fingerprint: state.configFingerprint,
          ready: state.ready,
          last_error: state.lastError,
        },
      };
    },
    status(): RuntimeStatus {
      if (!state.configValid || state.lastError?.code === "INVALID_CONFIG") {
        return "failed";
      }
      if (state.ready) {
        return "ready";
      }
      if (state.lastError) {
        return "degraded";
      }
      return "starting";
    },
    state,
  };
}
