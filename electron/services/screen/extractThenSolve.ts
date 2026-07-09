// electron/services/screen/extractThenSolve.ts
//
// Extract-then-solve (F2, coding-interview optimization).
//
// Problem: the strongest LeetCode-style coding model (DeepSeek V4 Pro) is
// TEXT-ONLY. When a coding answer request carries a screenshot, we either had
// to drop the screenshot or drop the model. This module decides — per request —
// whether the on-screen problem can be delivered to the text-only model as
// transcribed text instead of pixels:
//
//   solve_text_only          → drop the images, keep the coding-model override.
//                              Screen text rides the existing untrusted
//                              screenContext channel (PromptAssembler escapes it).
//   keep_images_drop_override → extraction unavailable/timed out — keep today's
//                              multimodal path and cancel the override.
//   no_op                    → decision doesn't apply (no images / no text-only
//                              override); caller changes nothing.
//
// Pure decision logic with an injected `understand` thunk — no Electron, no
// singletons — so it is directly unit-testable with a stubbed vision service.

export const EXTRACT_THEN_SOLVE_BUDGET_MS = 3500;

/** Minimum characters before pre-existing screen text counts as "the problem". */
const MIN_USABLE_SCREEN_TEXT_CHARS = 80;

export interface ExtractionResultLike {
  status: string;
  extractedText?: string;
  codeBlocks?: string[];
  providerUsed?: string;
  modelUsed?: string;
  confidence?: number;
  screenType?: string;
}

export interface ExtractThenSolveInput {
  /** From CodingModelOverride.requiresTextOnlyInput. */
  requiresTextOnlyInput: boolean;
  imagePaths: string[] | undefined;
  /**
   * Screen text already available on the request (e.g. the generate-what-to-say
   * IPC handler pre-runs ScreenUnderstandingService and passes its result as
   * screenContext). When substantial, no second vision call is needed at all.
   */
  existingScreenText?: string;
  /** SettingsManager `codingExtractThenSolve` — default ON (`!== false`). */
  enabled: boolean;
  /** Thunk that runs the vision extraction (injected; budget-raced here). */
  understand: () => Promise<ExtractionResultLike>;
  budgetMs?: number;
}

export interface ExtractThenSolveOutcome {
  action: 'solve_text_only' | 'keep_images_drop_override' | 'no_op';
  /**
   * Set only when a fresh extraction ran. Undefined for the
   * existing-screen-text fast path (text is already in screenContext).
   * UNTRUSTED — must ride the screenContext channel, never a trusted prompt slot.
   */
  screenProblemText?: string;
  providerUsed?: string;
  modelUsed?: string;
  confidence?: number;
  timedOut: boolean;
  reason: string;
}

/** Compose extraction output into one problem text (statement + visible code). */
export function composeScreenProblemText(result: ExtractionResultLike): string {
  const parts: string[] = [];
  const text = (result.extractedText || '').trim();
  if (text) parts.push(text);
  for (const block of result.codeBlocks || []) {
    const code = (block || '').trim();
    // Skip code the model already inlined in extractedText verbatim.
    if (code && !text.includes(code)) {
      parts.push('```\n' + code + '\n```');
    }
  }
  return parts.join('\n\n').trim();
}

async function raceWithBudget<T>(promise: Promise<T>, ms: number): Promise<{ value: T | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    // NOTE: deliberately NOT unref'd. An unref'd timer racing a never-settling
    // promise deadlocks once the event loop drains (observed under node:test on
    // Node 20). A ref'd timer holds the process for at most `ms` — acceptable.
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ value: null, timedOut: true });
    }, ms);
    promise.then(
      (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ value, timedOut: false }); } },
      () => { if (!settled) { settled = true; clearTimeout(timer); resolve({ value: null, timedOut: false }); } },
    );
  });
}

export async function runExtractThenSolve(input: ExtractThenSolveInput): Promise<ExtractThenSolveOutcome> {
  const hasImages = Boolean(input.imagePaths && input.imagePaths.length > 0);
  if (!input.requiresTextOnlyInput || !hasImages) {
    return { action: 'no_op', timedOut: false, reason: 'not_applicable' };
  }
  if (!input.enabled) {
    return { action: 'keep_images_drop_override', timedOut: false, reason: 'disabled_by_setting' };
  }

  // Fast path: the request already carries substantial screen text (the manual
  // ask path pre-runs vision understanding). Zero added latency — just drop
  // the images so the text-only coding model engages.
  if ((input.existingScreenText || '').trim().length >= MIN_USABLE_SCREEN_TEXT_CHARS) {
    return { action: 'solve_text_only', timedOut: false, reason: 'existing_screen_text' };
  }

  const budget = input.budgetMs ?? EXTRACT_THEN_SOLVE_BUDGET_MS;
  const { value, timedOut } = await raceWithBudget(input.understand(), budget);
  if (timedOut) {
    return { action: 'keep_images_drop_override', timedOut: true, reason: 'extraction_timeout' };
  }
  if (!value || value.status !== 'available') {
    return { action: 'keep_images_drop_override', timedOut: false, reason: 'extraction_failed' };
  }
  const problemText = composeScreenProblemText(value);
  if (problemText.length < MIN_USABLE_SCREEN_TEXT_CHARS) {
    return { action: 'keep_images_drop_override', timedOut: false, reason: 'extraction_too_short' };
  }
  return {
    action: 'solve_text_only',
    screenProblemText: problemText,
    providerUsed: value.providerUsed,
    modelUsed: value.modelUsed,
    confidence: value.confidence,
    timedOut: false,
    reason: 'fresh_extraction',
  };
}
