// electron/llm/__tests__/CodingModelRouting.test.mjs
//
// F1 — per-answer-type coding model routing. Proves the pure resolver:
//  - routes coding/DSA/debugging/system-design answers down the auto chain:
//    DeepSeek V4 Pro (top LiveCodeBench) → Claude Sonnet → GPT-5.4 → Gemini
//    3.1 Pro, first provider with a configured key wins
//  - is a strict no-op (null) with NO keys at all, with setting 'off', or
//    for non-coding answer types
//  - lets an explicit user setting win over auto
//  - flags text-only providers so callers can run extract-then-solve for
//    screenshot-bearing requests instead of sending images to DeepSeek

import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveCodingModelOverride,
  CODING_ROUTED_ANSWER_TYPES,
  DEFAULT_CODING_PROVIDER,
  DEFAULT_CODING_MODEL,
} from '../../../dist-electron/electron/llm/codingModelRouting.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const NONE = { hasDeepseek: false };
const DEEPSEEK_ONLY = { hasDeepseek: true };
const ALL = { hasDeepseek: true, hasClaude: true, hasOpenai: true, hasGemini: true };

describe('CODING_ROUTED_ANSWER_TYPES', () => {
  test('covers the four coding-adjacent answer types', () => {
    for (const t of ['coding_question_answer', 'dsa_question_answer', 'debugging_question_answer', 'system_design_answer']) {
      assert.ok(CODING_ROUTED_ANSWER_TYPES.has(t), `${t} should be routed`);
    }
  });
  test('does not cover behavioral/general types', () => {
    for (const t of ['behavioral_question_answer', 'general_question_answer', 'identity_question_answer']) {
      assert.ok(!CODING_ROUTED_ANSWER_TYPES.has(t), `${t} should NOT be routed`);
    }
  });
});

describe('resolveCodingModelOverride — auto (default)', () => {
  test('coding answer + DeepSeek key → deepseek-v4-pro, text-only flagged', () => {
    const r = resolveCodingModelOverride({ answerType: 'coding_question_answer', availability: DEEPSEEK_ONLY });
    assert.ok(r);
    assert.equal(r.provider, DEFAULT_CODING_PROVIDER);
    assert.equal(r.model, DEFAULT_CODING_MODEL);
    assert.equal(r.model, 'deepseek-v4-pro');
    assert.equal(r.requiresTextOnlyInput, true, 'DeepSeek cannot accept images — caller must extract-then-solve');
  });
  test('all four coding answer types route under auto', () => {
    for (const answerType of CODING_ROUTED_ANSWER_TYPES) {
      const r = resolveCodingModelOverride({ answerType, availability: DEEPSEEK_ONLY, setting: 'auto' });
      assert.ok(r, `${answerType} should route`);
      assert.equal(r.model, 'deepseek-v4-pro');
    }
  });
  test('no keys at all → null (strict no-op)', () => {
    assert.equal(resolveCodingModelOverride({ answerType: 'coding_question_answer', availability: NONE }), null);
  });
  test('auto fallback chain: no DeepSeek key → strongest configured provider', () => {
    // claude beats openai/gemini
    let r = resolveCodingModelOverride({
      answerType: 'dsa_question_answer',
      availability: { hasDeepseek: false, hasClaude: true, hasOpenai: true, hasGemini: true },
    });
    assert.ok(r);
    assert.equal(r.provider, 'claude');
    assert.equal(r.model, 'claude-sonnet-4-6');
    assert.equal(r.requiresTextOnlyInput, false, 'Claude accepts images');
    // openai beats gemini
    r = resolveCodingModelOverride({
      answerType: 'coding_question_answer',
      availability: { hasDeepseek: false, hasClaude: false, hasOpenai: true, hasGemini: true },
    });
    assert.ok(r);
    assert.equal(r.provider, 'openai');
    assert.equal(r.model, 'gpt-5.4');
    // gemini last
    r = resolveCodingModelOverride({
      answerType: 'coding_question_answer',
      availability: { hasDeepseek: false, hasClaude: false, hasOpenai: false, hasGemini: true },
    });
    assert.ok(r);
    assert.equal(r.provider, 'gemini');
    assert.equal(r.model, 'gemini-3.1-pro-preview');
    assert.equal(r.requiresTextOnlyInput, false, 'Gemini accepts images');
    // deepseek still wins when present
    r = resolveCodingModelOverride({ answerType: 'coding_question_answer', availability: ALL });
    assert.ok(r);
    assert.equal(r.provider, 'deepseek');
  });
  test('non-coding answer type → null even with all keys', () => {
    assert.equal(resolveCodingModelOverride({ answerType: 'behavioral_question_answer', availability: ALL }), null);
    assert.equal(resolveCodingModelOverride({ answerType: 'general_question_answer', availability: ALL }), null);
  });
  test('undefined answer type → null', () => {
    assert.equal(resolveCodingModelOverride({ answerType: undefined, availability: ALL }), null);
  });
});

describe("resolveCodingModelOverride — setting 'off'", () => {
  test('never overrides, even with keys and coding answer type', () => {
    assert.equal(
      resolveCodingModelOverride({ answerType: 'coding_question_answer', availability: ALL, setting: 'off' }),
      null
    );
  });
});

describe('resolveCodingModelOverride — explicit setting wins', () => {
  test('explicit claude pick beats auto-deepseek', () => {
    const r = resolveCodingModelOverride({
      answerType: 'coding_question_answer',
      availability: ALL,
      setting: { provider: 'claude', model: 'claude-sonnet-4-6' },
    });
    assert.ok(r);
    assert.equal(r.provider, 'claude');
    assert.equal(r.model, 'claude-sonnet-4-6');
    assert.equal(r.requiresTextOnlyInput, false, 'Claude accepts images');
  });
  test('explicit deepseek pick flags text-only', () => {
    const r = resolveCodingModelOverride({
      answerType: 'dsa_question_answer',
      availability: DEEPSEEK_ONLY,
      setting: { provider: 'deepseek', model: 'deepseek-v4-pro' },
    });
    assert.ok(r);
    assert.equal(r.requiresTextOnlyInput, true);
  });
  test('explicit pick for an unavailable provider → null (no silent wrong-provider call)', () => {
    assert.equal(
      resolveCodingModelOverride({
        answerType: 'coding_question_answer',
        availability: DEEPSEEK_ONLY,
        setting: { provider: 'claude', model: 'claude-sonnet-4-6' },
      }),
      null
    );
  });
  test('malformed explicit setting (missing model) → null', () => {
    assert.equal(
      resolveCodingModelOverride({
        answerType: 'coding_question_answer',
        availability: ALL,
        setting: { provider: 'claude', model: '' },
      }),
      null
    );
  });
  test('unknown provider in explicit setting → null', () => {
    assert.equal(
      resolveCodingModelOverride({
        answerType: 'coding_question_answer',
        availability: ALL,
        setting: { provider: 'mystery', model: 'x' },
      }),
      null
    );
  });
});

describe('source pins — manual chat path wiring (ipcHandlers gemini-chat-stream)', () => {
  const src = readFileSync(path.join(repoRoot, 'electron/ipcHandlers.ts'), 'utf8');

  test('manual path resolves the coding override from real key availability + setting', () => {
    assert.match(src, /manualCodingOverride = resolveCodingModelOverride\(\{/);
    assert.match(src, /hasDeepseek: llmHelper\.hasDeepseek\?\.\(\) \?\? false/);
    assert.match(src, /get\('codingModelOverride'\)/);
  });

  test('text-only provider + screenshot drops the override (images win)', () => {
    assert.match(
      src,
      /manualCodingOverride\?\.requiresTextOnlyInput && imagePaths && imagePaths\.length > 0[\s\S]{0,120}manualCodingOverride = null/
    );
  });

  test('override is threaded into streamChat routeOptions (never currentModelId)', () => {
    assert.match(
      src,
      /modelOverride: \{ provider: manualCodingOverride\.provider, model: manualCodingOverride\.model \}/
    );
    assert.ok(!src.includes('currentModelId = manualCodingOverride'), 'must never mutate currentModelId');
  });
});
