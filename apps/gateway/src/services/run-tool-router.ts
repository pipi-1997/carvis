import type { ScheduleToolInvocation } from "@carvis/core";

import type { createScheduleManagementService } from "./schedule-management-service.ts";
import { parseOriginalScheduleUserPrompt } from "./schedule-management-prompt.ts";

export function createRunToolRouter(input: {
  scheduleManagementService: ReturnType<typeof createScheduleManagementService>;
  agentId: string;
}) {
  return {
    async execute(inputTool: {
      toolName: string;
      invocation: ScheduleToolInvocation;
      workspace: string;
      sessionId: string;
      chatId: string;
      userId: string | null;
      requestedText: string;
    }) {
      const invocationWorkspace = inputTool.invocation.workspace?.trim() || inputTool.workspace;
      if (invocationWorkspace !== inputTool.workspace) {
        return {
          status: "rejected" as const,
          reason: "workspace_mismatch",
          targetDefinitionId: null,
          summary: "不能跨 workspace 管理定时任务。",
        };
      }
      const normalizedInvocation = {
        ...inputTool.invocation,
        workspace: invocationWorkspace,
      };
      const requestedText = parseOriginalScheduleUserPrompt(inputTool.requestedText) ?? inputTool.requestedText;
      const normalizedInput = {
        ...inputTool,
        invocation: normalizedInvocation,
        requestedText,
      };

      switch (inputTool.toolName) {
        case "schedule.create":
          return input.scheduleManagementService.create({
            ...normalizedInput,
            agentId: input.agentId,
          });
        case "schedule.list":
          return input.scheduleManagementService.list(normalizedInput);
        case "schedule.update":
          return input.scheduleManagementService.update(normalizedInput);
        case "schedule.disable":
          return input.scheduleManagementService.disable(normalizedInput);
        default:
          return {
            status: "rejected" as const,
            reason: "unsupported_tool",
            targetDefinitionId: null,
            summary: `不支持的工具：${inputTool.toolName}`,
          };
      }
    },
  };
}
