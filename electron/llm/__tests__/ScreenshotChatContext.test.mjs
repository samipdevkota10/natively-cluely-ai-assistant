// electron/llm/__tests__/ScreenshotChatContext.test.mjs
//
// Screenshot-with-history context block. Proves the pure formatter:
//  - null on empty/blank history (caller keeps current behavior)
//  - labels roles, keeps only the most recent maxTurns, truncates long turns
//  - enforces the total cap by dropping the OLDEST turns first
// and pins the ipcHandlers wiring at the source level:
//  - block built ONLY for image-bearing requests, BEFORE addTranscript (no echo)
//  - coding/contract path APPENDS the block after the contract
//  - non-coding image path prefers the block over the 100s snapshot

import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildScreenshotConversationContext,
  SCREENSHOT_CONTEXT_DEFAULTS,
} from '../../../dist-electron/electron/llm/screenshotChatContext.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

const turn = (role, text, timestamp = Date.now()) => ({ role, text, timestamp });

describe('buildScreenshotConversationContext — pure formatter', () => {
  test('null on missing/empty/blank history', () => {
    assert.equal(buildScreenshotConversationContext(null), null);
    assert.equal(buildScreenshotConversationContext(undefined), null);
    assert.equal(buildScreenshotConversationContext([]), null);
    assert.equal(buildScreenshotConversationContext([turn('user', '   ')]), null);
  });

  test('labels roles and frames the screenshot as part of the conversation', () => {
    const block = buildScreenshotConversationContext([
      turn('user', 'Solve two sum'),
      turn('assistant', 'Use a hash map for O(n).'),
      turn('interviewer', 'Can you do it without extra space?'),
    ]);
    assert.ok(block);
    assert.match(block, /^RECENT CONVERSATION/);
    assert.match(block, /not as a standalone image/);
    assert.match(block, /\[ME\]: Solve two sum/);
    assert.match(block, /\[ASSISTANT \(PREVIOUS ANSWER\)\]: Use a hash map/);
    assert.match(block, /\[INTERVIEWER\]: Can you do it without extra space\?/);
  });

  test('keeps only the most recent maxTurns', () => {
    const turns = Array.from({ length: 20 }, (_, i) => turn('user', `turn number ${i}`));
    const block = buildScreenshotConversationContext(turns, { maxTurns: 3 });
    assert.ok(block);
    assert.ok(!block.includes('turn number 16'));
    for (const i of [17, 18, 19]) assert.ok(block.includes(`turn number ${i}`), `missing turn ${i}`);
  });

  test('truncates long turns and collapses whitespace', () => {
    const block = buildScreenshotConversationContext(
      [turn('assistant', `line one\n\nline two ${'x'.repeat(1000)}`)],
      { maxCharsPerTurn: 40 },
    );
    assert.ok(block);
    assert.match(block, /line one line two/);
    assert.match(block, /…/);
    const bodyLine = block.split('\n')[1];
    assert.ok(bodyLine.length < 100, 'turn should be truncated');
  });

  test('total cap drops the OLDEST turns first (recency wins)', () => {
    const turns = [
      turn('user', `old ${'a'.repeat(300)}`),
      turn('assistant', `mid ${'b'.repeat(300)}`),
      turn('user', `new ${'c'.repeat(300)}`),
    ];
    const block = buildScreenshotConversationContext(turns, { maxCharsPerTurn: 400, maxTotalChars: 500 });
    assert.ok(block);
    assert.ok(block.includes('new '), 'newest turn must survive');
    assert.ok(!block.includes('old '), 'oldest turn must be dropped first');
    assert.ok(block.length <= 500 + 50, 'block stays near the cap');
  });

  test('defaults are bounded (never crowd out the contract or image)', () => {
    assert.ok(SCREENSHOT_CONTEXT_DEFAULTS.maxTurns <= 12);
    assert.ok(SCREENSHOT_CONTEXT_DEFAULTS.maxTotalChars <= 8000);
  });
});

describe('source pins — ipcHandlers gemini-chat-stream wiring', () => {
  const src = readFileSync(path.join(root, 'electron/ipcHandlers.ts'), 'utf8');

  test('block built only for image-bearing requests, from the durable transcript', () => {
    assert.match(src, /if \(imagePaths && imagePaths\.length > 0\) \{[\s\S]{0,400}buildScreenshotConversationContext\(/);
    assert.match(src, /intelligenceManager\.getDurableContext\(7200\)/);
  });

  test('captured BEFORE addTranscript (echo protection) — build precedes the user-message add', () => {
    const buildIdx = src.indexOf('buildScreenshotConversationContext(');
    const addIdx = src.indexOf('// Now add USER message to IntelligenceManager (after context snapshot)');
    assert.ok(buildIdx > 0 && addIdx > 0);
    assert.ok(buildIdx < addIdx, 'screenshot context must be captured before the user turn is recorded');
  });

  test('coding/contract path appends the block AFTER the contract', () => {
    assert.match(
      src,
      /formatAnswerPlanForPrompt\(answerPlan, isCodingChat && isCodeVerificationEnabled\(\)\);[\s\S]{0,800}if \(screenshotConversationBlock\) \{\s*\n\s*context = `\$\{context\}\\n\\n\$\{screenshotConversationBlock\}`/
    );
  });

  test('non-coding image path prefers the durable block over the 100s snapshot', () => {
    const blockIdx = src.indexOf('else if (!context && screenshotConversationBlock)');
    const snapIdx = src.indexOf('else if (!context && autoContextSnapshot)');
    assert.ok(blockIdx > 0 && snapIdx > 0);
    assert.ok(blockIdx < snapIdx, 'screenshot block branch must come before the snapshot branch');
  });
});

describe('source pins — function-form coding contract', () => {
  const contractSrc = readFileSync(path.join(root, 'electron/llm/codingContract.ts'), 'utf8');

  test('CODING_CONTRACT mandates a named function/method, never top-level script', () => {
    assert.match(contractSrc, /MUST be wrapped in a named function/);
    assert.match(contractSrc, /NEVER loose top-level script code/);
    assert.match(contractSrc, /provides a function\/method signature, use it verbatim/);
  });

  test('tiny contract carries the same function-form rule', () => {
    assert.match(contractSrc, /wrapped in a named function\/method with an explicit return — never loose top-level script/);
  });
});
