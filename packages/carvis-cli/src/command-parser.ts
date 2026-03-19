export type CarvisCommand =
  | {
      action: "install";
      repair: boolean;
    }
  | {
      action: "onboard" | "start" | "stop" | "status" | "doctor";
    }
  | {
      action: "daemon";
      operation: "status" | "start" | "stop" | "restart";
    }
  | {
      action: "infra";
      operation: "status" | "start" | "stop" | "restart" | "rebuild";
    }
  | {
      action: "uninstall";
      purge: boolean;
    }
  | {
      action: "configure";
      section: "feishu" | "workspace";
    };

export type ParsedCarvisCommand =
  | {
      ok: true;
      command: CarvisCommand;
    }
  | {
      ok: false;
      result: {
        status: "rejected";
        reason: "invalid_command" | "missing_section" | "missing_subcommand";
        summary: string;
      };
    };

const DIRECT_ACTIONS = new Set(["install", "onboard", "start", "stop", "status", "doctor", "uninstall"]);
const DAEMON_OPERATIONS = new Set(["status", "start", "stop", "restart"]);
const INFRA_OPERATIONS = new Set(["status", "start", "stop", "restart", "rebuild"]);
const CONFIGURE_SECTIONS = new Set(["feishu", "workspace"]);

export function parseCarvisCommand(argv: string[]): ParsedCarvisCommand {
  const [action, ...rest] = argv;
  const flags = new Set(rest.filter((token) => token.startsWith("--")));
  const nonFlagArgs = rest.filter((token) => !token.startsWith("--"));
  const section = nonFlagArgs[0];

  if (!action || !DIRECT_ACTIONS.has(action) && action !== "configure" && action !== "daemon" && action !== "infra") {
    return reject(
      "invalid_command",
      "用法错误：需要 install、onboard、daemon、infra、status、doctor、uninstall、start、stop 或 configure 子命令。",
    );
  }

  if (action === "install") {
    return {
      ok: true,
      command: {
        action: "install",
        repair: flags.has("--repair"),
      },
    };
  }

  if (action === "configure") {
    if (!section || !CONFIGURE_SECTIONS.has(section)) {
      return reject("missing_section", "configure 需要 section：feishu 或 workspace。");
    }
    return {
      ok: true,
      command: {
        action: "configure",
        section: section as "feishu" | "workspace",
      },
    };
  }

  if (action === "daemon") {
    if (!section || !DAEMON_OPERATIONS.has(section)) {
      return reject("missing_subcommand", "daemon 需要子命令：status、start、stop 或 restart。");
    }
    return {
      ok: true,
      command: {
        action: "daemon",
        operation: section as "status" | "start" | "stop" | "restart",
      },
    };
  }

  if (action === "infra") {
    if (!section || !INFRA_OPERATIONS.has(section)) {
      return reject("missing_subcommand", "infra 需要子命令：status、start、stop、restart 或 rebuild。");
    }
    return {
      ok: true,
      command: {
        action: "infra",
        operation: section as "status" | "start" | "stop" | "restart" | "rebuild",
      },
    };
  }

  if (action === "uninstall") {
    return {
      ok: true,
      command: {
        action: "uninstall",
        purge: flags.has("--purge"),
      },
    };
  }

  return {
    ok: true,
    command: {
      action,
    } as Extract<CarvisCommand, { action: "onboard" | "start" | "stop" | "status" | "doctor" }>,
  };
}

function reject(reason: "invalid_command" | "missing_section" | "missing_subcommand", summary: string): ParsedCarvisCommand {
  return {
    ok: false,
    result: {
      reason,
      status: "rejected",
      summary,
    },
  };
}
