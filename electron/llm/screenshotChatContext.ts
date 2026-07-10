// electron/llm/screenshotChatContext.ts
//
// Screenshot-with-history context block (user request, 2026-07-08): a screenshot
// question must be analyzed WITH the past chat, not as a standalone image.
//
// Why the existing paths miss this:
//  - Coding / contract-enforced answers REPLACE the rolling context with the
//    answer contract (ipcHandlers `gemini-chat-stream`), so a screenshotted
//    LeetCode follow-up ("now do it in O(n)" + screenshot) lost every prior turn.
//  - Non-coding answers only auto-inject the 100-second `contextItems` window,
//    which is usually empty by the time the user lines up a screenshot.
//
// This module is the single, pure, testable formatter. The caller feeds it the
// DURABLE transcript (SessionTracker.getDurableContext — survives the 120s
// eviction) and gets back a compact, clearly-labeled recent-conversation block
// (or null when there is no usable history). No I/O, no LLM.

export interface ConversationTurn {
  role: 'interviewer' | 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface ScreenshotContextOptions {
  /** Keep at most this many most-recent turns. */
  maxTurns?: number;
  /** Truncate each turn to this many characters (assistant answers can be huge). */
  maxCharsPerTurn?: number;
  /** Hard cap on the whole block. */
  maxTotalChars?: number;
}

export const SCREENSHOT_CONTEXT_DEFAULTS: Required<ScreenshotContextOptions> = {
  maxTurns: 8,
  maxCharsPerTurn: 500,
  maxTotalChars: 3500,
};

const HEADER =
  'RECENT CONVERSATION (the screenshot below is part of this ongoing conversation — ' +
  'interpret it against these prior turns, not as a standalone image):';

const LABELS: Record<ConversationTurn['role'], string> = {
  interviewer: 'INTERVIEWER',
  user: 'ME',
  assistant: 'ASSISTANT (PREVIOUS ANSWER)',
};

/**
 * Build the recent-conversation block for an image-bearing chat request.
 * Returns null when there is no usable history (caller keeps current behavior).
 * Strictly bounded so it can never crowd out the answer contract or the image.
 */
export function buildScreenshotConversationContext(
  turns: ReadonlyArray<ConversationTurn> | null | undefined,
  options?: ScreenshotContextOptions,
): string | null {
  if (!turns || turns.length === 0) return null;
  const opts = { ...SCREENSHOT_CONTEXT_DEFAULTS, ...options };

  const usable = turns
    .filter((t) => t && typeof t.text === 'string' && t.text.trim().length > 0)
    .slice(-opts.maxTurns);
  if (usable.length === 0) return null;

  const lines: string[] = [];
  for (const turn of usable) {
    let text = turn.text.trim().replace(/\s+/g, ' ');
    if (text.length > opts.maxCharsPerTurn) {
      text = `${text.slice(0, opts.maxCharsPerTurn)}…`;
    }
    lines.push(`[${LABELS[turn.role] ?? 'ME'}]: ${text}`);
  }

  let block = `${HEADER}\n${lines.join('\n')}`;
  // Enforce the total cap by dropping the OLDEST turns first (recency wins).
  while (block.length > opts.maxTotalChars && lines.length > 1) {
    lines.shift();
    block = `${HEADER}\n${lines.join('\n')}`;
  }
  return block;
}
