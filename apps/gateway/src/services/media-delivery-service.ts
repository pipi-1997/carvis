import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import { FeishuMediaStageError, type FeishuAdapter } from "@carvis/channel-feishu";
import type { MediaToolInvocation, MediaToolResult, RepositoryBundle } from "@carvis/core";

function inferMediaKind(input: MediaToolInvocation): "image" | "file" {
  if (input.mediaKind && input.mediaKind !== "auto") {
    return input.mediaKind;
  }
  const target = input.path ?? input.url ?? "";
  const extension = extname(target).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"].includes(extension)) {
    return "image";
  }
  return "file";
}

function inferRemoteFileName(url: string) {
  try {
    const parsed = new URL(url);
    const name = basename(parsed.pathname);
    return name.length > 0 ? name : "remote-resource";
  } catch {
    return "remote-resource";
  }
}

export function createMediaDeliveryService(deps: {
  adapter: FeishuAdapter;
  repositories: RepositoryBundle;
}) {
  return {
    async send(input: {
      runId: string;
      invocation: MediaToolInvocation;
      sessionId: string;
      chatId: string;
      workspace: string;
    }): Promise<MediaToolResult> {
      if (!input.runId || !input.sessionId || !input.chatId) {
        return {
          status: "rejected",
          reason: "invalid_context",
          mediaDeliveryId: null,
          targetRef: null,
          summary: "当前没有可用的会话上下文，不能发送资源。",
        };
      }

      const run = await deps.repositories.runs.getRunById(input.runId);
      if (
        !run
        || run.status !== "running"
        || run.sessionId !== input.sessionId
        || run.workspace !== input.workspace
      ) {
        return {
          status: "rejected",
          reason: "invalid_context",
          mediaDeliveryId: null,
          targetRef: null,
          summary: "当前没有可用的会话上下文，不能发送资源。",
        };
      }

      const session = await deps.repositories.sessions.getSessionById(input.sessionId);
      if (!session || session.status !== "active" || session.chatId !== input.chatId) {
        return {
          status: "rejected",
          reason: "invalid_context",
          mediaDeliveryId: null,
          targetRef: null,
          summary: "当前没有可用的会话上下文，不能发送资源。",
        };
      }

      const mediaKind = inferMediaKind(input.invocation);
      const targetChatId = session.chatId;
      const mediaDelivery = await deps.repositories.runMediaDeliveries.createMediaDelivery({
        runId: input.runId,
        sessionId: input.sessionId,
        chatId: targetChatId,
        sourceType: input.invocation.sourceType,
        sourceRef: input.invocation.path ?? input.invocation.url ?? "",
        mediaKind,
        resolvedFileName: input.invocation.path
          ? basename(input.invocation.path)
          : inferRemoteFileName(input.invocation.url ?? ""),
      });

      let fileName = mediaDelivery.resolvedFileName ?? "resource";
      let content: Uint8Array;
      if (input.invocation.sourceType === "local_path" && input.invocation.path) {
        const localContent = await readFile(input.invocation.path).catch(() => null);
        if (!localContent) {
          await deps.repositories.runMediaDeliveries.updateMediaDelivery({
            mediaDeliveryId: mediaDelivery.id,
            status: "source_failed",
            failureStage: "source",
            failureReason: "source_not_found",
          });
          return {
            status: "failed",
            reason: "source_not_found",
            mediaDeliveryId: mediaDelivery.id,
            targetRef: null,
            summary: "资源不存在或不可读。",
          };
        }
        content = localContent;
      } else if (input.invocation.sourceType === "remote_url" && input.invocation.url) {
        let response: Response;
        try {
          response = await fetch(input.invocation.url);
        } catch {
          await deps.repositories.runMediaDeliveries.updateMediaDelivery({
            mediaDeliveryId: mediaDelivery.id,
            status: "source_failed",
            failureStage: "source",
            failureReason: "fetch_failed",
          });
          return {
            status: "failed",
            reason: "fetch_failed",
            mediaDeliveryId: mediaDelivery.id,
            targetRef: null,
            summary: "远端资源获取失败。",
          };
        }
        if (!response.ok) {
          await deps.repositories.runMediaDeliveries.updateMediaDelivery({
            mediaDeliveryId: mediaDelivery.id,
            status: "source_failed",
            failureStage: "source",
            failureReason: "fetch_failed",
          });
          return {
            status: "failed",
            reason: "fetch_failed",
            mediaDeliveryId: mediaDelivery.id,
            targetRef: null,
            summary: "远端资源获取失败。",
          };
        }
        content = new Uint8Array(await response.arrayBuffer());
        fileName = inferRemoteFileName(input.invocation.url);
      } else {
        await deps.repositories.runMediaDeliveries.updateMediaDelivery({
          mediaDeliveryId: mediaDelivery.id,
          status: "source_failed",
          failureStage: "source",
          failureReason: "missing_source",
        });
        return {
          status: "failed",
          reason: "source_not_found",
          mediaDeliveryId: mediaDelivery.id,
          targetRef: null,
          summary: "资源不存在或不可读。",
        };
      }

      await deps.repositories.runMediaDeliveries.updateMediaDelivery({
        mediaDeliveryId: mediaDelivery.id,
        status: "uploading",
        resolvedFileName: fileName,
        sizeBytes: content.byteLength,
      });

      let uploadTargetRef: string | null = null;
      let outboundDeliveryId: string | null = null;
      try {
        const uploaded = mediaKind === "image"
          ? await deps.adapter.uploadImage({
              chatId: targetChatId,
              runId: input.runId,
              fileName,
              content,
            })
          : await deps.adapter.uploadFile({
              chatId: targetChatId,
              runId: input.runId,
              fileName,
              content,
            });
        uploadTargetRef = uploaded.targetRef;
        await deps.repositories.runMediaDeliveries.updateMediaDelivery({
          mediaDeliveryId: mediaDelivery.id,
          status: "sending",
          targetRef: uploadTargetRef,
          resolvedFileName: fileName,
          sizeBytes: content.byteLength,
        });
        const outboundDelivery = await deps.repositories.deliveries.createDelivery({
          runId: input.runId,
          chatId: targetChatId,
          deliveryKind: mediaKind === "image" ? "media_image" : "media_file",
          content: input.invocation.path ?? input.invocation.url ?? "",
          targetRef: uploadTargetRef,
        });
        outboundDeliveryId = outboundDelivery.id;
        const delivered = mediaKind === "image"
          ? await deps.adapter.deliverImage({
              chatId: targetChatId,
              runId: input.runId,
              targetRef: uploadTargetRef,
            })
          : await deps.adapter.deliverFile({
              chatId: targetChatId,
              runId: input.runId,
              targetRef: uploadTargetRef,
            });
        await deps.repositories.deliveries.markDeliverySent(outboundDelivery.id, undefined, delivered.messageId);
        await deps.repositories.runMediaDeliveries.updateMediaDelivery({
          mediaDeliveryId: mediaDelivery.id,
          status: "sent",
          outboundDeliveryId: outboundDelivery.id,
          targetRef: uploadTargetRef,
          resolvedFileName: fileName,
          sizeBytes: content.byteLength,
        });
        return {
          status: "sent",
          reason: null,
          mediaDeliveryId: mediaDelivery.id,
          targetRef: uploadTargetRef,
          summary: mediaKind === "image" ? "已发送图片。" : "已发送文件。",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof FeishuMediaStageError && error.stage === "upload") {
          await deps.repositories.runMediaDeliveries.updateMediaDelivery({
            mediaDeliveryId: mediaDelivery.id,
            status: "upload_failed",
            failureStage: "upload",
            failureReason: message,
          });
          return {
            status: "failed",
            reason: "upload_failed",
            mediaDeliveryId: mediaDelivery.id,
            targetRef: null,
            summary: message,
          };
        }
        if (error instanceof FeishuMediaStageError && error.stage === "delivery") {
          if (outboundDeliveryId) {
            await deps.repositories.deliveries.markDeliveryFailed(outboundDeliveryId, message);
          }
          await deps.repositories.runMediaDeliveries.updateMediaDelivery({
            mediaDeliveryId: mediaDelivery.id,
            status: "failed",
            failureStage: "delivery",
            failureReason: message,
            outboundDeliveryId,
            targetRef: uploadTargetRef,
          });
          return {
            status: "failed",
            reason: "delivery_failed",
            mediaDeliveryId: mediaDelivery.id,
            targetRef: null,
            summary: message,
          };
        }
        if (outboundDeliveryId) {
          await deps.repositories.deliveries.markDeliveryFailed(outboundDeliveryId, message);
        }
        await deps.repositories.runMediaDeliveries.updateMediaDelivery({
          mediaDeliveryId: mediaDelivery.id,
          status: "failed",
          failureStage: uploadTargetRef ? "delivery" : "upload",
          failureReason: message,
          outboundDeliveryId,
          targetRef: uploadTargetRef,
        });
        return {
          status: "failed",
          reason: uploadTargetRef ? "delivery_failed" : "upload_failed",
          mediaDeliveryId: mediaDelivery.id,
          targetRef: null,
          summary: message,
        };
      }
    },
  };
}
