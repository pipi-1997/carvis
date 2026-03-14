import type { OutboundMessage, Session } from "@carvis/core";

export async function handleHelpCommand(input: {
  session: Session;
  chatType: "private" | "group";
  unknownCommand?: string | null;
}): Promise<OutboundMessage> {
  return {
    chatId: input.session.chatId,
    runId: null,
    kind: "status",
    content: formatHelpMessage({
      chatType: input.chatType,
      unknownCommand: input.unknownCommand ?? null,
    }),
  };
}

function formatHelpMessage(input: {
  chatType: "private" | "group";
  unknownCommand: string | null;
}): string {
  const lines = input.unknownCommand ? [`未知命令: ${input.unknownCommand}`, ""] : [];

  lines.push("可用命令:");
  lines.push("/help 查看帮助");
  lines.push("/status 查看当前会话状态");
  lines.push("/mode 查看或切换当前会话 sandbox mode");
  lines.push("/new 重置当前会话续聊上下文");
  lines.push("/abort 取消当前活动运行");
  lines.push("/bind <workspace-key> 绑定已有 workspace，不存在时按 template 创建并绑定");
  lines.push("");
  lines.push("私聊:");
  lines.push("直接发送普通消息或 /命令，默认使用 defaultWorkspace");
  lines.push("");
  lines.push("群聊:");
  lines.push("@机器人 /命令");
  lines.push("群聊未绑定 workspace 时，普通消息不会执行；请先使用 /bind <workspace-key>");

  if (input.chatType === "group") {
    lines.push("");
    lines.push("当前建议: @机器人 /bind <workspace-key>");
  }

  return lines.join("\n");
}
