import type { FeishuSetupField, FeishuSetupGuideSection, FeishuSetupSpec } from "@carvis/channel-feishu";

import type { PromptFlow } from "./prompt-runtime.ts";

export type GuidancePrompter = {
  note?(message: string, title?: string): void | Promise<void>;
};

export async function presentFeishuFieldHint(
  prompter: GuidancePrompter,
  field: FeishuSetupField,
) {
  if (typeof prompter.note !== "function") {
    return;
  }

  const lines = [
    field.description,
    ...(field.promptHint ?? field.howToGet).map((line) => `- ${line}`),
  ];
  await prompter.note(lines.join("\n"), field.promptHelpTitle ?? field.label);
}

export async function presentFeishuSetupGuide(
  prompter: GuidancePrompter,
  spec: FeishuSetupSpec,
  options: {
    command: "configure" | "onboard";
    flow?: PromptFlow;
  },
) {
  if (typeof prompter.note !== "function") {
    return;
  }

  await prompter.note(buildGuideOverview(spec, options), spec.guide.title);
  for (const section of spec.guide.sections) {
    await prompter.note(buildGuideSection(section), section.title);
  }
}

function buildGuideOverview(
  spec: FeishuSetupSpec,
  options: {
    command: "configure" | "onboard";
    flow?: PromptFlow;
  },
) {
  const scopeLabel = options.command === "onboard" ? "首次接入" : "飞书重配";
  const flowLabel = options.flow === "manual" ? "manual" : "quickstart";

  return [
    `${scopeLabel}会按 ${flowLabel} 流程继续，但飞书准备项保持一致。`,
    spec.guide.summary,
    "",
    "最小闭环建议：",
    ...spec.guide.quickstartChecklist.map((item, index) => `${index + 1}. ${item}`),
    "",
    "参考入口：",
    ...spec.guide.links.map((link) => `- ${link.label}: ${link.url}`),
  ].join("\n");
}

function buildGuideSection(section: FeishuSetupGuideSection) {
  const lines = [
    section.summary,
    "",
    ...section.steps.map((step, index) => `${index + 1}. ${step}`),
  ];

  if (section.checklist && section.checklist.length > 0) {
    lines.push("", "检查项：", ...section.checklist.map((item) => `- ${item}`));
  }

  if (section.links && section.links.length > 0) {
    lines.push("", "参考：", ...section.links.map((link) => `- ${link.label}: ${link.url}`));
  }

  return lines.join("\n");
}
