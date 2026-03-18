import type { MediaToolInvocation, ScheduleToolInvocation } from "@carvis/core";

import type { createMediaDeliveryService } from "./media-delivery-service.ts";
import type { createScheduleManagementService } from "./schedule-management-service.ts";
import { parseOriginalScheduleUserPrompt } from "./schedule-management-prompt.ts";

export function createRunToolRouter(input: {
  mediaDeliveryService?: ReturnType<typeof createMediaDeliveryService>;
  scheduleManagementService: ReturnType<typeof createScheduleManagementService>;
  agentId: string;
}) {
  return {
    async execute(inputTool: {
      runId?: string;
      toolName: string;
      invocation: ScheduleToolInvocation | MediaToolInvocation;
      workspace: string;
      sessionId: string;
      chatId: string;
      userId: string | null;
      requestedText: string;
    }) {
      if (inputTool.toolName === "media.send") {
        if (!input.mediaDeliveryService) {
          return {
            status: "failed" as const,
            reason: "tool_unavailable",
            mediaDeliveryId: null,
            targetRef: null,
            summary: "media delivery service unavailable",
          };
        }
        return input.mediaDeliveryService.send({
          runId: inputTool.runId ?? "",
          invocation: inputTool.invocation as MediaToolInvocation,
          sessionId: inputTool.sessionId,
          chatId: inputTool.chatId,
          workspace: inputTool.workspace,
        });
      }

      const scheduleInvocation = inputTool.invocation as ScheduleToolInvocation;
      const invocationWorkspace = scheduleInvocation.workspace?.trim() || inputTool.workspace;
      const normalizedInvocation: ScheduleToolInvocation = {
        ...scheduleInvocation,
        workspace: invocationWorkspace,
      };
      if (invocationWorkspace !== inputTool.workspace) {
        return {
          status: "rejected" as const,
          reason: "workspace_mismatch",
          targetDefinitionId: null,
          summary: "不能跨 workspace 管理定时任务。",
        };
      }
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
