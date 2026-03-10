export type FeishuTransformMode = "streaming" | "terminal";

export type RenderableBlock =
  | {
      kind: "text";
      content: string;
      format?: "plain_text" | "lark_md";
    }
  | {
      kind: "rule";
    };

type TransformOutcome = "preserved" | "normalized" | "degraded";

type TransformResult = {
  outcome: TransformOutcome;
  degradedFragments: string[];
  blocks: RenderableBlock[];
};

type TransformInput = {
  mode: FeishuTransformMode;
  text: string;
  maxBlockLength?: number;
};

type RenderedText = {
  content: string;
  format: "plain_text" | "lark_md";
};

type Section = {
  heading: string | null;
  fragments: Fragment[];
};

type Fragment =
  | {
      kind: "text";
      lines: string[];
    }
  | {
      kind: "table";
      rows: string[];
    }
  | {
      kind: "rule";
    }
  | {
      kind: "code";
      language: string | null;
      lines: string[];
      closed: boolean;
    };

const ALLOWED_HTML_TAGS = new Set(["font"]);

export function transformFeishuRichText(input: TransformInput): TransformResult {
  const state = {
    degradedFragments: [] as string[],
    degradedSeen: new Set<string>(),
    normalized: false,
  };
  const sections = parseSections(normalizeNewlines(input.text));
  const blocks = input.mode === "terminal"
    ? renderTerminalBlocks(sections, input.maxBlockLength, state)
    : renderStreamingBlocks(sections, state);

  const nonEmptyBlocks = blocks.filter((block) => block.kind === "rule" || block.content.length > 0);
  const outcome = state.degradedFragments.length > 0
    ? "degraded"
    : state.normalized
      ? "normalized"
      : "preserved";

  return {
    outcome,
    degradedFragments: state.degradedFragments,
    blocks: nonEmptyBlocks.length > 0 ? nonEmptyBlocks : [{ kind: "text", content: "" }],
  };
}

function renderStreamingBlocks(
  sections: Section[],
  state: {
    degradedFragments: string[];
    degradedSeen: Set<string>;
    normalized: boolean;
  },
): RenderableBlock[] {
  const blocks: RenderableBlock[] = [];
  const textParts: RenderedText[] = [];

  for (const section of sections) {
    const sectionBlocks = renderSectionBlocks(section, state);
    for (const block of sectionBlocks) {
      if (block.kind === "rule") {
        flushTextParts(blocks, textParts);
        blocks.push(block);
        continue;
      }

      const rendered = { content: block.content, format: block.format ?? "plain_text" } as RenderedText;
      if (textParts.length > 0 && textParts[textParts.length - 1]?.format !== rendered.format) {
        flushTextParts(blocks, textParts);
      }
      textParts.push(rendered);
    }
  }

  flushTextParts(blocks, textParts);
  return blocks.length > 0 ? blocks : [{ kind: "text", content: "" }];
}

function renderTerminalBlocks(
  sections: Section[],
  maxBlockLength: number | undefined,
  state: {
    degradedFragments: string[];
    degradedSeen: Set<string>;
    normalized: boolean;
  },
): RenderableBlock[] {
  const blocks: RenderableBlock[] = [];
  const effectiveMaxLength = maxBlockLength && maxBlockLength > 0 ? maxBlockLength : undefined;

  for (const section of sections) {
    const sectionBlocks = renderTerminalSection(section, effectiveMaxLength, state);
    if (sectionBlocks.length === 0) {
      continue;
    }

    if (blocks.length > 0) {
      blocks.push({ kind: "rule" });
    }
    blocks.push(...sectionBlocks);
  }

  return blocks.length > 0 ? blocks : [{ kind: "text", content: "" }];
}

function renderTerminalSection(
  section: Section,
  maxBlockLength: number | undefined,
  state: {
    degradedFragments: string[];
    degradedSeen: Set<string>;
    normalized: boolean;
  },
): RenderableBlock[] {
  if (!maxBlockLength) {
    return renderSectionBlocks(section, state);
  }

  const textFragments = section.fragments.filter((fragment) => fragment.kind === "text");
  const codeFragments = section.fragments.filter((fragment) => fragment.kind === "code");
  const hasNonCodeFragments = section.fragments.some((fragment) => {
    if (fragment.kind === "rule" || fragment.kind === "table") {
      return true;
    }
    if (fragment.kind === "text") {
      return trimBlankEdges(fragment.lines).length > 0;
    }
    return false;
  });

  if (codeFragments.length === 1 && !hasNonCodeFragments) {
    return chunkCodeOnlySection(section.heading, codeFragments[0], maxBlockLength);
  }

  const blocks: RenderableBlock[] = [];
  for (const block of renderSectionBlocks(section, state)) {
    if (block.kind === "rule") {
      blocks.push(block);
      continue;
    }
    blocks.push(...chunkPlainSection(block.content, maxBlockLength, block.format ?? "plain_text"));
  }

  return blocks;
}

function chunkCodeOnlySection(
  heading: string | null,
  fragment: Extract<Fragment, { kind: "code" }>,
  maxBlockLength: number,
): RenderableBlock[] {
  const blocks: RenderableBlock[] = [];
  const codePrefix = fragment.language ? `[${fragment.language}]` : "";

  if (heading) {
    blocks.push({
      kind: "text",
      content: formatHeading(heading),
      format: "lark_md",
    });
  }

  if (fragment.lines.length === 0) {
    const content = codePrefix || "";
    return content ? [{ kind: "text", content, format: "plain_text" }] : [];
  }

  fragment.lines.forEach((line, index) => {
    const prefix = codePrefix;
    const chunk = prefix.length > 0 ? `${prefix}\n${line}` : line;
    if (visualLength(chunk) <= maxBlockLength || blocks.length === 0) {
      blocks.push({ kind: "text", content: chunk, format: "plain_text" });
      return;
    }

    blocks.push({ kind: "text", content: chunk, format: "plain_text" });
  });

  return blocks;
}

function chunkPlainSection(
  content: string,
  maxBlockLength: number,
  format: "plain_text" | "lark_md",
): RenderableBlock[] {
  if (format === "lark_md") {
    return [{ kind: "text", content, format }];
  }

  if (visualLength(content) <= maxBlockLength) {
    return [{ kind: "text", content, format }];
  }

  const blocks: RenderableBlock[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    const nextChunk = takeVisualChunk(remaining, maxBlockLength);
    blocks.push({
      kind: "text",
      content: nextChunk,
      format,
    });
    remaining = remaining.slice(nextChunk.length);
  }

  return blocks;
}

function renderSectionBlocks(
  section: Section,
  state: {
    degradedFragments: string[];
    degradedSeen: Set<string>;
    normalized: boolean;
  },
): RenderableBlock[] {
  const blocks: RenderableBlock[] = [];
  const textParts: RenderedText[] = [];
  let headingPending = section.heading;

  const appendText = (rendered: RenderedText) => {
    if (rendered.content.length === 0) {
      return;
    }

    if (headingPending) {
      state.normalized = true;
      const heading = formatHeading(headingPending);
      if (rendered.format === "lark_md") {
        if (textParts.length > 0 && textParts[textParts.length - 1]?.format !== "lark_md") {
          flushTextParts(blocks, textParts);
        }
        textParts.push({
          content: rendered.content.length > 0 ? `${heading}\n\n${rendered.content}` : heading,
          format: "lark_md",
        });
      } else {
        if (textParts.length > 0 && textParts[textParts.length - 1]?.format !== "lark_md") {
          flushTextParts(blocks, textParts);
        }
        textParts.push({
          content: heading,
          format: "lark_md",
        });
        flushTextParts(blocks, textParts);
        textParts.push(rendered);
      }
      headingPending = null;
      return;
    }

    if (textParts.length > 0 && textParts[textParts.length - 1]?.format !== rendered.format) {
      flushTextParts(blocks, textParts);
    }
    textParts.push(rendered);
  };

  for (const fragment of section.fragments) {
    if (fragment.kind === "rule") {
      flushTextParts(blocks, textParts);
      if (headingPending) {
        state.normalized = true;
        blocks.push({ kind: "text", content: formatHeading(headingPending), format: "lark_md" });
        headingPending = null;
      }
      blocks.push({ kind: "rule" });
      continue;
    }

    const rendered = renderFragmentContent(fragment, state);
    if (!rendered || rendered.content.length === 0) {
      continue;
    }
    appendText(rendered);
  }

  flushTextParts(blocks, textParts);

  if (headingPending) {
    state.normalized = true;
    blocks.push({ kind: "text", content: formatHeading(headingPending), format: "lark_md" });
  }

  return blocks;
}

function renderFragmentContent(
  fragment: Fragment,
  state: {
    degradedFragments: string[];
    degradedSeen: Set<string>;
    normalized: boolean;
  },
): RenderedText | null {
  if (fragment.kind === "text") {
    const renderedLines = trimBlankRenderedTextEdges(renderTextLines(fragment.lines, state));
    const content = renderedLines.map((line) => line.content).join("\n");
    const format = renderedLines.some((line) => line.format === "lark_md") ? "lark_md" : "plain_text";
    return { content, format };
  }

  if (fragment.kind === "table") {
    state.normalized = true;
    return {
      content: fragment.rows.map((row) => normalizeTableRow(row)).join("\n"),
      format: "plain_text",
    };
  }

  if (fragment.kind === "rule") {
    return null;
  }

  if (!fragment.closed) {
    state.normalized = true;
  }

  if (fragment.language) {
    return {
      content: [`[${fragment.language}]`, ...fragment.lines].join("\n"),
      format: "plain_text",
    };
  }

  return {
    content: [...fragment.lines].join("\n"),
    format: "plain_text",
  };
}

function renderTextLines(
  lines: string[],
  state: {
    degradedFragments: string[];
    degradedSeen: Set<string>;
    normalized: boolean;
  },
): RenderedText[] {
  return lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return { content: "", format: "plain_text" };
    }

    const unorderedMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (unorderedMatch) {
      const normalized = normalizeInline(unorderedMatch[2], state);
      state.normalized = true;
      return {
        content: `${unorderedMatch[1]}• ${normalized.content}`,
        format: normalized.format,
      };
    }

    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      const normalized = normalizeInline(orderedMatch[3], state);
      return {
        content: `${orderedMatch[1]}${orderedMatch[2]}. ${normalized.content}`,
        format: normalized.format,
      };
    }

    const quoteMatch = line.match(/^(\s*)>\s?(.*)$/);
    if (quoteMatch) {
      const normalized = normalizeInline(quoteMatch[2], state);
      state.normalized = true;
      return {
        content: `${quoteMatch[1]}│ ${normalized.content}`.trimEnd(),
        format: normalized.format,
      };
    }

    return normalizeInline(line, state);
  });
}

function normalizeInline(
  value: string,
  state: {
    degradedFragments: string[];
    degradedSeen: Set<string>;
    normalized: boolean;
  },
): RenderedText {
  let normalized = escapeUnsupportedHtml(value, state);
  let format: "plain_text" | "lark_md" = "plain_text";

  normalized = normalized.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, url: string) => {
    state.normalized = true;
    format = "lark_md";
    return alt.trim().length > 0 ? `[图片: ${alt.trim()}](${url.trim()})` : `[图片](${url.trim()})`;
  });

  normalized = normalized.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text: string, url: string) => {
    state.normalized = true;
    format = "lark_md";
    return `[${text.trim()}](${url.trim()})`;
  });

  normalized = normalized.replace(/(?<!\()https?:\/\/[^\s<>()]+/g, (url: string) => {
    format = "lark_md";
    return `[${url}](${url})`;
  });

  normalized = normalized.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    state.normalized = true;
    return `[${code}]`;
  });

  if (hasMarkdownEmphasis(normalized)) {
    format = "lark_md";
    state.normalized = true;
  }

  return {
    content: normalized,
    format,
  };
}

function hasMarkdownEmphasis(value: string): boolean {
  return (
    /\*\*([^*]+)\*\*/.test(value) ||
    /__([^_]+)__/.test(value) ||
    /~~([^~]+)~~/.test(value) ||
    /\*([^*\n]+)\*/.test(value) ||
    /_([^_\n]+)_/.test(value)
  );
}

function escapeUnsupportedHtml(
  value: string,
  state: {
    degradedFragments: string[];
    degradedSeen: Set<string>;
    normalized: boolean;
  },
): string {
  return value.replace(/<\/?([A-Za-z][\w:-]*)\b[^>]*>/g, (match, tagName: string) => {
    const normalizedTag = tagName.toLowerCase();
    if (ALLOWED_HTML_TAGS.has(normalizedTag)) {
      return match;
    }

    if (!state.degradedSeen.has(normalizedTag)) {
      state.degradedSeen.add(normalizedTag);
      state.degradedFragments.push(normalizedTag);
    }
    return escapeAngleBrackets(match);
  });
}

function parseSections(text: string): Section[] {
  const lines = text.split("\n");
  const sections: Section[] = [];
  let currentSection: Section = { heading: null, fragments: [] };
  let index = 0;

  const pushCurrentSection = () => {
    sections.push(currentSection);
    currentSection = { heading: null, fragments: [] };
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const headingMatch = line.match(/^\s*#{1,6}\s+(.+?)\s*$/);
    if (headingMatch) {
      if (currentSection.heading !== null || currentSection.fragments.length > 0) {
        pushCurrentSection();
      }
      currentSection.heading = headingMatch[1].trim();
      index += 1;
      continue;
    }

    const fenceMatch = line.match(/^\s*```([^`\s]+)?\s*$/);
    if (fenceMatch) {
      const language = fenceMatch[1]?.trim() || null;
      const codeLines: string[] = [];
      let cursor = index + 1;
      let closed = false;

      while (cursor < lines.length) {
        const currentLine = lines[cursor] ?? "";
        if (/^\s*```\s*$/.test(currentLine)) {
          closed = true;
          cursor += 1;
          break;
        }
        codeLines.push(currentLine);
        cursor += 1;
      }

      currentSection.fragments.push({
        kind: "code",
        language,
        lines: trimBlankEdges(codeLines),
        closed,
      });
      index = cursor;
      continue;
    }

    if (isHorizontalRule(line)) {
      currentSection.fragments.push({ kind: "rule" });
      index += 1;
      continue;
    }

    if (isTableHeaderLine(line) && isTableSeparatorLine(lines[index + 1] ?? "")) {
      const rows: string[] = [line];
      let cursor = index + 2;
      while (cursor < lines.length && isTableHeaderLine(lines[cursor] ?? "")) {
        rows.push(lines[cursor] ?? "");
        cursor += 1;
      }

      currentSection.fragments.push({
        kind: "table",
        rows,
      });
      index = cursor;
      continue;
    }

    const textLines: string[] = [];
    let cursor = index;
    while (cursor < lines.length) {
      const currentLine = lines[cursor] ?? "";
      if (
        /^\s*#{1,6}\s+(.+?)\s*$/.test(currentLine) ||
        /^\s*```([^`\s]+)?\s*$/.test(currentLine) ||
        isHorizontalRule(currentLine) ||
        (isTableHeaderLine(currentLine) && isTableSeparatorLine(lines[cursor + 1] ?? ""))
      ) {
        break;
      }
      textLines.push(currentLine);
      cursor += 1;
    }

    currentSection.fragments.push({
      kind: "text",
      lines: textLines,
    });
    index = cursor;
  }

  if (currentSection.heading !== null || currentSection.fragments.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start]?.trim().length === 0) {
    start += 1;
  }
  while (end > start && lines[end - 1]?.trim().length === 0) {
    end -= 1;
  }

  return lines.slice(start, end);
}

function trimBlankRenderedTextEdges(lines: RenderedText[]): RenderedText[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start]?.content.trim().length === 0) {
    start += 1;
  }
  while (end > start && lines[end - 1]?.content.trim().length === 0) {
    end -= 1;
  }

  return lines.slice(start, end);
}

function normalizeNewlines(value: string): string {
  return value.replaceAll("\r\n", "\n").trim();
}

function escapeAngleBrackets(value: string): string {
  return value.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function flushTextParts(blocks: RenderableBlock[], textParts: RenderedText[]) {
  if (textParts.length === 0) {
    return;
  }

  const format = textParts.some((part) => part.format === "lark_md") ? "lark_md" : "plain_text";
  blocks.push({
    kind: "text",
    content: textParts.map((part) => part.content).join("\n\n"),
    format,
  });
  textParts.length = 0;
}

function formatHeading(heading: string): string {
  return `**${heading}**`;
}

function normalizeTableRow(row: string): string {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
    .join(" | ");
}

function isHorizontalRule(line: string): boolean {
  return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

function isTableHeaderLine(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isTableSeparatorLine(line: string): boolean {
  return /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
}

function takeVisualChunk(value: string, maxWidth: number): string {
  if (visualLength(value) <= maxWidth) {
    return value;
  }

  let chunk = "";
  let currentWidth = 0;
  for (const character of value) {
    const charWidth = visualLength(character);
    if (currentWidth > 0 && currentWidth + charWidth > maxWidth) {
      break;
    }
    chunk += character;
    currentWidth += charWidth;
  }

  return chunk || value[0] || "";
}

function visualLength(value: string): number {
  let width = 0;
  for (const character of value) {
    width += character.codePointAt(0)! > 0xff ? 2 : 1;
  }
  return width;
}
