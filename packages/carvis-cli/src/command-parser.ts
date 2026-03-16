export type CarvisCommand =
  | {
      action: "onboard" | "start" | "stop" | "status" | "doctor";
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
        reason: "invalid_command" | "missing_section";
        summary: string;
      };
    };

const DIRECT_ACTIONS = new Set<CarvisCommand["action"]>(["onboard", "start", "stop", "status", "doctor"]);
const CONFIGURE_SECTIONS = new Set(["feishu", "workspace"]);

export function parseCarvisCommand(argv: string[]): ParsedCarvisCommand {
  const [action, section] = argv;
  if (!action || !DIRECT_ACTIONS.has(action as CarvisCommand["action"]) && action !== "configure") {
    return reject(
      "invalid_command",
      "用法错误：需要 onboard、start、stop、status、doctor 或 configure 子命令。",
    );
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

  return {
    ok: true,
    command: {
      action,
    } as Extract<CarvisCommand, { action: "onboard" | "start" | "stop" | "status" | "doctor" }>,
  };
}

function reject(reason: "invalid_command" | "missing_section", summary: string): ParsedCarvisCommand {
  return {
    ok: false,
    result: {
      reason,
      status: "rejected",
      summary,
    },
  };
}
