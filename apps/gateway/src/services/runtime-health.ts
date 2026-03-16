import type { GatewayRuntimeState, RuntimeErrorState, RuntimeStatus } from "@carvis/core";

type GatewayRuntimeHealthOptions = {
  configFingerprint: string;
  onStateChange?: (input: {
    snapshot: GatewayRuntimeSnapshot;
    status: RuntimeStatus;
  }) => void;
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

  function snapshot(): GatewayRuntimeSnapshot {
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
  }

  function status(): RuntimeStatus {
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
  }

  function publishState() {
    options.onStateChange?.({
      snapshot: snapshot(),
      status: status(),
    });
  }

  function setError(error: RuntimeErrorState | null) {
    state.lastError = error;
    recalculateReady();
    publishState();
  }

  return {
    markHttpListening(value = true) {
      state.httpListening = value;
      recalculateReady();
      publishState();
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
      publishState();
    },
    markFeishuIngressReady(value = true) {
      state.feishuIngressReady = value;
      recalculateReady();
      publishState();
    },
    markFeishuDisconnected(message: string) {
      state.feishuIngressReady = false;
      setError({
        code: "FEISHU_WS_DISCONNECTED",
        message,
      });
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
    snapshot,
    status,
    state,
  };
}
