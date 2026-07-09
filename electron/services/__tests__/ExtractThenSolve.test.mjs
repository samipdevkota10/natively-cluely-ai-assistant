// electron/services/__tests__/ExtractThenSolve.test.mjs
//
// F2 — extract-then-solve. The text-only coding model (DeepSeek V4 Pro) cannot
// see screenshots, so screenshot-bearing coding requests get the on-screen
// problem transcribed to text first. Proves the pure decision module:
//  - not applicable (no images / no text-only override) → no_op
//  - existing screen text (manual ask pre-understanding) → solve text-only
//    WITHOUT a second vision call (zero added latency)
//  - fresh extraction success → solve text-only, images dropped, problem text
//    composed from extractedText + code blocks
//  - extraction timeout/failure/too-short → keep images, drop override
//    (legacy multimodal path — never a dead end)
//  - setting off → keep images, drop override
// Also pins the coding-problem extraction vision prompt (verbatim, no solving,
// anti-injection) and the vision_direct cache guard in ScreenUnderstandingService.

import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runExtractThenSolve,
  composeScreenProblemText,
  EXTRACT_THEN_SOLVE_BUDGET_MS,
} from '../../../dist-electron/electron/services/screen/extractThenSolve.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LONG_PROBLEM = 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. Constraints: 2 <= nums.length <= 10^4.';

const availableResult = (overrides = {}) => ({
  status: 'available',
  extractedText: LONG_PROBLEM,
  codeBlocks: ['def twoSum(self, nums, target):'],
  providerUsed: 'gemini',
  modelUsed: 'gemini-3.5-flash',
  confidence: 0.9,
  ...overrides,
});

const neverCalled = () => {
  throw new Error('understand() must not be called on this path');
};

describe('runExtractThenSolve — applicability', () => {
  test('no images → no_op (nothing changes)', async () => {
    const out = await runExtractThenSolve({
      requiresTextOnlyInput: true, imagePaths: [], enabled: true, understand: neverCalled,
    });
    assert.equal(out.action, 'no_op');
  });
  test('vision-capable override (not text-only) → no_op', async () => {
    const out = await runExtractThenSolve({
      requiresTextOnlyInput: false, imagePaths: ['/tmp/s.png'], enabled: true, understand: neverCalled,
    });
    assert.equal(out.action, 'no_op');
  });
  test('setting disabled → keep images, drop override (legacy multimodal)', async () => {
    const out = await runExtractThenSolve({
      requiresTextOnlyInput: true, imagePaths: ['/tmp/s.png'], enabled: false, understand: neverCalled,
    });
    assert.equal(out.action, 'keep_images_drop_override');
    assert.equal(out.reason, 'disabled_by_setting');
  });
});

describe('runExtractThenSolve — existing screen text fast path', () => {
  test('substantial pre-extracted text → solve text-only with NO second vision call', async () => {
    let understandCalls = 0;
    const out = await runExtractThenSolve({
      requiresTextOnlyInput: true,
      imagePaths: ['/tmp/s.png'],
      existingScreenText: LONG_PROBLEM,
      enabled: true,
      understand: async () => { understandCalls++; return availableResult(); },
    });
    assert.equal(out.action, 'solve_text_only');
    assert.equal(out.reason, 'existing_screen_text');
    assert.equal(out.screenProblemText, undefined, 'text already rides screenContext — no duplicate block');
    assert.equal(understandCalls, 0, 'zero added latency: no fresh vision call');
  });
  test('trivial pre-existing text (< threshold) still runs fresh extraction', async () => {
    const out = await runExtractThenSolve({
      requiresTextOnlyInput: true,
      imagePaths: ['/tmp/s.png'],
      existingScreenText: 'Chrome',
      enabled: true,
      understand: async () => availableResult(),
    });
    assert.equal(out.action, 'solve_text_only');
    assert.equal(out.reason, 'fresh_extraction');
  });
});

describe('runExtractThenSolve — fresh extraction', () => {
  test('success → images dropped, problem text composed with code blocks', async () => {
    const out = await runExtractThenSolve({
      requiresTextOnlyInput: true, imagePaths: ['/tmp/s.png'], enabled: true,
      understand: async () => availableResult(),
    });
    assert.equal(out.action, 'solve_text_only');
    assert.ok(out.screenProblemText.includes('two numbers'), 'problem statement present');
    assert.ok(out.screenProblemText.includes('def twoSum'), 'starter code present');
    assert.equal(out.providerUsed, 'gemini');
    assert.equal(out.timedOut, false);
  });
  test('hung extraction → budget-raced timeout → keep images, drop override', async () => {
    const out = await runExtractThenSolve({
      requiresTextOnlyInput: true, imagePaths: ['/tmp/s.png'], enabled: true,
      understand: () => new Promise(() => {}), // hangs forever
      budgetMs: 50,
    });
    assert.equal(out.action, 'keep_images_drop_override');
    assert.equal(out.timedOut, true);
    assert.equal(out.reason, 'extraction_timeout');
  });
  test('vision failure (status !== available) → keep images, drop override', async () => {
    const out = await runExtractThenSolve({
      requiresTextOnlyInput: true, imagePaths: ['/tmp/s.png'], enabled: true,
      understand: async () => ({ status: 'failed' }),
    });
    assert.equal(out.action, 'keep_images_drop_override');
    assert.equal(out.reason, 'extraction_failed');
  });
  test('understand() rejection → keep images, drop override (never throws)', async () => {
    const out = await runExtractThenSolve({
      requiresTextOnlyInput: true, imagePaths: ['/tmp/s.png'], enabled: true,
      understand: async () => { throw new Error('provider exploded'); },
    });
    assert.equal(out.action, 'keep_images_drop_override');
  });
  test('too-short extraction (blank screen) → keep images, drop override', async () => {
    const out = await runExtractThenSolve({
      requiresTextOnlyInput: true, imagePaths: ['/tmp/s.png'], enabled: true,
      understand: async () => availableResult({ extractedText: 'Desktop', codeBlocks: [] }),
    });
    assert.equal(out.action, 'keep_images_drop_override');
    assert.equal(out.reason, 'extraction_too_short');
  });
  test('default budget is 3500ms (pre-first-token latency contract)', () => {
    assert.equal(EXTRACT_THEN_SOLVE_BUDGET_MS, 3500);
  });
});

describe('composeScreenProblemText', () => {
  test('deduplicates code already inlined in extractedText', () => {
    const text = composeScreenProblemText({
      status: 'available',
      extractedText: `Problem...\ndef twoSum(self, nums, target):`,
      codeBlocks: ['def twoSum(self, nums, target):', 'class Solution: pass'],
    });
    const occurrences = text.split('def twoSum').length - 1;
    assert.equal(occurrences, 1, 'inlined code not duplicated');
    assert.ok(text.includes('class Solution: pass'), 'novel code block appended');
  });
});

describe('source pins — extraction prompt + cache guard', () => {
  const visionPromptsSrc = readFileSync(path.resolve(__dirname, '../screen/visionPrompts.ts'), 'utf8');
  const susSrc = readFileSync(path.resolve(__dirname, '../screen/ScreenUnderstandingService.ts'), 'utf8');
  const engineSrc = readFileSync(path.resolve(__dirname, '../../IntelligenceEngine.ts'), 'utf8');

  test('coding extraction prompt: transcribe verbatim, never solve, anti-injection', () => {
    assert.match(visionPromptsSrc, /CODING_PROBLEM_EXTRACTION_SYSTEM_PROMPT/);
    assert.match(visionPromptsSrc, /DO NOT solve the problem/);
    assert.match(visionPromptsSrc, /UNTRUSTED CONTENT/);
    assert.match(visionPromptsSrc, /extractionPurpose === 'coding_problem'/);
  });
  test('extraction requests never reuse a cached vision_direct (solved) result', () => {
    assert.match(susSrc, /request\.extractionPurpose && cached\.source !== 'vision_extract'/);
  });
  test('engine drops the override — not the images — on extraction failure', () => {
    assert.match(engineSrc, /keep_images_drop_override/);
    assert.match(engineSrc, /codingModelOverride = null/);
  });
  test('extracted text rides the untrusted screenContext channel only', () => {
    // The engine folds fresh extractions into effectiveScreenContext (escaped by
    // PromptAssembler), never into promptInstruction or the system prompt.
    assert.match(engineSrc, /effectiveScreenContext = \{/);
    assert.match(engineSrc, /source: 'vision_extract'/);
  });
});
