import type { RenderableBlock } from "./feishu-rich-text-transformer.ts";

export function mapBlocksToFeishuCardElements(blocks: RenderableBlock[], baseElementId: string) {
  const elements: Array<Record<string, unknown>> = [];
  let textIndex = 0;

  for (const block of blocks) {
    if (block.kind === "rule") {
      elements.push({ tag: "hr" });
      continue;
    }

    const elementId = textIndex === 0 ? baseElementId : `${baseElementId}-section-${textIndex}`;
    textIndex += 1;
    elements.push({
      tag: "div",
      element_id: elementId,
      text: {
        tag: block.format ?? "plain_text",
        content: block.content,
      },
    });
  }

  return elements;
}
