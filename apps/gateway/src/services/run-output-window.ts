export interface OutputWindowState {
  excerpt: string | null;
  lastRenderedSequence: number | null;
  visibleText: string;
}

export function createRunOutputWindow(options: { maxChars?: number } = {}) {
  const maxChars = options.maxChars ?? 1200;
  let lastSequence: number | null = null;
  let visibleText = "";
  let lastChunk = "";

  return {
    appendDelta(input: { sequence: number; text: string }): OutputWindowState | null {
      if (lastSequence !== null && input.sequence <= lastSequence) {
        return null;
      }

      const nextChunk = input.text;
      if (nextChunk === lastChunk) {
        lastSequence = input.sequence;
        return {
          excerpt: summarizeChunk(nextChunk),
          lastRenderedSequence: lastSequence,
          visibleText,
        };
      }

      visibleText = `${visibleText}${nextChunk}`;
      if (visibleText.length > maxChars) {
        visibleText = visibleText.slice(visibleText.length - maxChars);
      }

      lastChunk = nextChunk;
      lastSequence = input.sequence;

      return {
        excerpt: summarizeChunk(nextChunk),
        lastRenderedSequence: lastSequence,
        visibleText,
      };
    },
  };
}

function summarizeChunk(chunk: string): string | null {
  const trimmed = chunk.trim();
  return trimmed.length > 0 ? trimmed : null;
}
