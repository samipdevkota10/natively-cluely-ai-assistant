// electron/llm/__tests__/CodingModelRouting.test.mjs
//
// F1 — per-answer-type coding model routing. Proves the pure resolver:
//  - routes coding/DSA/debugging/system-design answers to DeepSeek V4 Pro
//    when a DeepSeek key exists (top LiveCodeBench for LeetCode-style problems)
//  - is a strict no-op (null) with no key, with setting 'off', or for
//    non-coding answer types
//  - lets an explicit user setting win over auto
//  - flags text-only providers so callers can run extract-then-solve for
//    screenshot-bearing requests instead of sending images to DeepSeek

import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import {
  resolveCodingModelOverride,
  CODING_ROUTED_ANSWER_TYPES,
  DEFAULT_CODING_PROVIDER,
  DEFAULT_CODING_MODEL,
} from '../../../dist-electron/electron/llm/codingModelRouting.js';

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
  test('no DeepSeek key → null (strict no-op, other keys irrelevant to auto)', () => {
    assert.equal(resolveCodingModelOverride({ answerType: 'coding_question_answer', availability: NONE }), null);
    assert.equal(
      resolveCodingModelOverride({
        answerType: 'dsa_question_answer',
        availability: { hasDeepseek: false, hasClaude: true, hasOpenai: true },
      }),
      null,
      'auto only targets DeepSeek; without its key current behavior is kept'
    );
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
