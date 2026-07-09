// electron/llm/__tests__/FactCheckPrompt.test.mjs
//
// F5 — Fact Check action (Cluely parity). The model has NO live internet
// access, so the prompt must (a) constrain output to one claim + a
// Accurate/Inaccurate/Unverifiable verdict, (b) MANDATE uncertainty language
// instead of confident fabrication, (c) cap length. Also proves FactCheckLLM
// routes through streamChat with the fact-check prompt override, the
// fact_check dynamic-action trigger fires in GENERAL/SALES/TEAM packs, and the
// engine/IPC wiring exists.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const dist = (p) => pathToFileURL(path.join(root, 'dist-electron', p)).href;

const { UNIVERSAL_FACT_CHECK_PROMPT } = await import(dist('electron/llm/prompts.js'));
const { FactCheckLLM } = await import(dist('electron/llm/FactCheckLLM.js'));
const { DynamicActionDetector, MODE_TRIGGERS } = await import(dist('electron/services/dynamic-actions/DynamicActionDetector.js'));

describe('UNIVERSAL_FACT_CHECK_PROMPT contract', () => {
  test('verdict taxonomy: Accurate | Inaccurate | Unverifiable', () => {
    assert.match(UNIVERSAL_FACT_CHECK_PROMPT, /Accurate \| Inaccurate \| Unverifiable/);
  });
  test('uncertainty language is MANDATORY (no live internet, no false confidence)', () => {
    assert.match(UNIVERSAL_FACT_CHECK_PROMPT, /MUST use uncertainty language/);
    assert.match(UNIVERSAL_FACT_CHECK_PROMPT, /no live internet access/i);
    assert.match(UNIVERSAL_FACT_CHECK_PROMPT, /NEVER assert a correction with false confidence/);
  });
  test('length cap: under 120 words', () => {
    assert.match(UNIVERSAL_FACT_CHECK_PROMPT, /under 120 words/i);
  });
  test('one claim only, never invent sources', () => {
    assert.match(UNIVERSAL_FACT_CHECK_PROMPT, /Check ONE claim only/);
    assert.match(UNIVERSAL_FACT_CHECK_PROMPT, /Never invent sources/);
  });
  test('opinions are not claims → Unverifiable', () => {
    assert.match(UNIVERSAL_FACT_CHECK_PROMPT, /Opinions, predictions, and preferences are NOT claims/);
  });
});

describe('FactCheckLLM', () => {
  const makeStubHelper = (tokens, record) => ({
    fitContextForCurrentModel: (ctx) => { record.fitted = ctx; return ctx; },
    streamChat: async function* (content, _img, _sig, promptOverride) {
      record.content = content;
      record.promptOverride = promptOverride;
      for (const t of tokens) yield t;
    },
  });

  test('generate() streams via streamChat with the fact-check prompt override', async () => {
    const record = {};
    const llm = new FactCheckLLM(makeStubHelper(['- Claim: "X"', '\n- Verdict: Accurate'], record));
    const out = await llm.generate('interviewer: I am pretty sure JavaScript has 9 primitive types.');
    assert.equal(out, '- Claim: "X"\n- Verdict: Accurate');
    assert.equal(record.promptOverride, UNIVERSAL_FACT_CHECK_PROMPT);
    assert.ok(record.content.includes('primitive types'), 'conversation context handed to the model');
  });
  test('empty context → empty result, no LLM call', async () => {
    const record = {};
    const llm = new FactCheckLLM(makeStubHelper(['x'], record));
    assert.equal(await llm.generate('   '), '');
    assert.equal(record.promptOverride, undefined, 'streamChat never invoked');
  });
  test('provider failure → empty string, never throws', async () => {
    const llm = new FactCheckLLM({
      fitContextForCurrentModel: (c) => c,
      streamChat: async function* () { throw new Error('provider exploded'); },
    });
    assert.equal(await llm.generate('some claim'), '');
  });
  test('generateStream yields tokens with the same prompt override', async () => {
    const record = {};
    const llm = new FactCheckLLM(makeStubHelper(['a', 'b'], record));
    const got = [];
    for await (const t of llm.generateStream('ctx')) got.push(t);
    assert.deepEqual(got, ['a', 'b']);
    assert.equal(record.promptOverride, UNIVERSAL_FACT_CHECK_PROMPT);
  });
});

describe('fact_check dynamic-action trigger', () => {
  const detector = new DynamicActionDetector();
  const typesFor = (transcript, modeTemplateType) =>
    detector.detectTriggers({ transcript, modeTemplateType }).map((m) => m.trigger.type);

  test('registered in general, sales, and team_meeting packs', () => {
    for (const pack of ['general', 'sales', 'team_meeting']) {
      assert.ok(
        MODE_TRIGGERS[pack].some((t) => t.type === 'fact_check'),
        `fact_check missing from ${pack} pack`,
      );
    }
  });
  const fires = [
    'Wait, is that actually true?',
    'Hmm, that doesn\'t sound right to me.',
    'Are you sure about that?',
    'I read somewhere that this framework is twice as fast.',
    'According to a study, most migrations fail.',
    'Can you fact check that real quick?',
  ];
  for (const line of fires) {
    test(`fires (general): "${line}"`, () => {
      assert.ok(typesFor(line, 'general').includes('fact_check'), `expected fire on: ${line}`);
    });
  }
  test('quiet on ordinary conversation', () => {
    assert.ok(!typesFor('Let\'s sync with the team tomorrow morning.', 'general').includes('fact_check'));
    assert.ok(!typesFor('The deploy finished and everything looks fine.', 'team_meeting').includes('fact_check'));
  });
  test('instruction mandates uncertainty language and the verdict taxonomy', () => {
    const trig = MODE_TRIGGERS.general.find((t) => t.type === 'fact_check');
    assert.match(trig.promptInstruction, /uncertainty language/);
    assert.match(trig.promptInstruction, /Accurate, Inaccurate, or Unverifiable/);
    assert.match(trig.promptInstruction, /no live internet access/);
  });
});

describe('source pins — engine + IPC wiring', () => {
  const engineSrc = readFileSync(path.join(root, 'electron/IntelligenceEngine.ts'), 'utf8');
  const ipcSrc = readFileSync(path.join(root, 'electron/ipcHandlers.ts'), 'utf8');
  const preloadSrc = readFileSync(path.join(root, 'electron/preload.ts'), 'utf8');
  const mainSrc = readFileSync(path.join(root, 'electron/main.ts'), 'utf8');

  test('engine: runFactCheck streams fact_check_token → fact_check final', () => {
    assert.match(engineSrc, /async runFactCheck\(\)/);
    assert.match(engineSrc, /this\.emit\('fact_check_token', token\)/);
    assert.match(engineSrc, /this\.emit\('fact_check', fullResult\)/);
  });
  test('IPC: generate-fact-check handler + validated action-button-mode', () => {
    assert.match(ipcSrc, /safeHandle\('generate-fact-check'/);
    assert.match(ipcSrc, /mode !== 'recap' && mode !== 'brainstorm' && mode !== 'fact_check'/);
  });
  test('preload: generateFactCheck + onIntelligenceFactCheck bridges', () => {
    assert.match(preloadSrc, /generateFactCheck: \(\) => ipcRenderer\.invoke\('generate-fact-check'\)/);
    assert.match(preloadSrc, /intelligence-fact-check/);
  });
  test('main: fact_check rides the batched token channel', () => {
    assert.match(mainSrc, /queueBatch\('fact_check', \{ token \}\)/);
    assert.match(mainSrc, /'intelligence-fact-check', \{ result \}/);
  });
});
