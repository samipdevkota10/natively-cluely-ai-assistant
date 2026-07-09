// electron/llm/codingModelRouting.ts
//
// Per-answer-type coding model routing (Cluely-parity, coding-interview focus).
//
// LeetCode-style coding answers benefit from the strongest available coding
// model rather than whatever the user's general-purpose model is. As of
// 2026-06, DeepSeek V4 Pro leads LiveCodeBench (fresh LeetCode/Codeforces
// problems), so when the user has a DeepSeek key we default coding answer
// types to `deepseek-v4-pro` for THAT STREAM ONLY. The override is threaded
// through `StreamRouteOptions.modelOverride` into the execution choke-point
// (`LLMHelper._streamChatInner`) and never mutates `currentModelId`, so
// concurrent streams (recap/brainstorm) and the meeting-end model revert are
// unaffected.
//
// This module is the single, pure, testable policy. No LLM, no I/O.

import type { AnswerType } from './AnswerPlanner';

/**
 * Answer types that get the coding-model override. Mirrors the answer types
 * that already receive a coding thinking budget / sectioned templates:
 * coding + DSA (the coding contract), debugging, and system design.
 */
export const CODING_ROUTED_ANSWER_TYPES: ReadonlySet<AnswerType> = new Set<AnswerType>([
  'coding_question_answer',
  'dsa_question_answer',
  'debugging_question_answer',
  'system_design_answer',
]);

/** Providers whose coding models cannot accept images. */
const TEXT_ONLY_PROVIDERS: ReadonlySet<string> = new Set(['deepseek']);

/**
 * Default coding model: DeepSeek V4 Pro — tops LiveCodeBench (contamination-
 * free LeetCode/Codeforces problems) as of June 2026. The generic DeepSeek
 * default elsewhere in the app stays `deepseek-v4-flash` (speed); coding
 * answers are the one place correctness dominates TTFT.
 */
export const DEFAULT_CODING_PROVIDER = 'deepseek';
export const DEFAULT_CODING_MODEL = 'deepseek-v4-pro';

export interface CodingProviderAvailability {
  hasDeepseek: boolean;
  hasClaude?: boolean;
  hasOpenai?: boolean;
  hasGemini?: boolean;
}

/**
 * User setting (SettingsManager `codingModelOverride`):
 *  - undefined / 'auto' → prefer DeepSeek V4 Pro when a DeepSeek key exists
 *  - 'off'              → never override (legacy routing)
 *  - { provider, model } → explicit pick, wins over auto
 */
export type CodingModelOverrideSetting =
  | { provider: string; model: string }
  | 'off'
  | 'auto'
  | undefined;

export interface CodingModelOverride {
  provider: string;
  model: string;
  /**
   * True when the resolved provider cannot accept images. The caller must
   * either run extract-then-solve (vision model extracts the on-screen
   * problem as text first) or drop the override for image-bearing requests.
   */
  requiresTextOnlyInput: boolean;
}

function providerAvailable(provider: string, availability: CodingProviderAvailability): boolean {
  switch (provider) {
    case 'deepseek': return Boolean(availability.hasDeepseek);
    case 'claude': return Boolean(availability.hasClaude);
    case 'openai': return Boolean(availability.hasOpenai);
    case 'gemini': return Boolean(availability.hasGemini);
    default: return false;
  }
}

/**
 * Resolve the model override for one answer stream. Returns null whenever the
 * current behavior should be kept — non-coding answer type, setting off, or
 * no suitable provider available. Strictly null-safe: a null result is a
 * no-op for the caller.
 */
export function resolveCodingModelOverride(input: {
  answerType: AnswerType | undefined;
  availability: CodingProviderAvailability;
  setting?: CodingModelOverrideSetting;
}): CodingModelOverride | null {
  const { answerType, availability, setting } = input;
  if (!answerType || !CODING_ROUTED_ANSWER_TYPES.has(answerType)) return null;
  if (setting === 'off') return null;

  // Explicit user pick wins over auto.
  if (setting && typeof setting === 'object') {
    if (!setting.provider || !setting.model) return null;
    if (!providerAvailable(setting.provider, availability)) return null;
    return {
      provider: setting.provider,
      model: setting.model,
      requiresTextOnlyInput: TEXT_ONLY_PROVIDERS.has(setting.provider),
    };
  }

  // Auto: strongest LeetCode-style model with an available key.
  if (availability.hasDeepseek) {
    return {
      provider: DEFAULT_CODING_PROVIDER,
      model: DEFAULT_CODING_MODEL,
      requiresTextOnlyInput: true,
    };
  }
  return null;
}
