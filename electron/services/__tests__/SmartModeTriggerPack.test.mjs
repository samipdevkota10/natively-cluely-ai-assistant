// electron/services/__tests__/SmartModeTriggerPack.test.mjs
//
// F3 — Smart Mode dual-pack dynamic actions. When Smart Mode is on, the
// technical_interview trigger pack is evaluated on every transcript segment
// REGARDLESS of the ambient mode (a coding question can arrive mid
// "team_meeting"). The per-session store dedupe must suppress any trigger
// type shared between the ambient pack and the technical pack so no duplicate
// cards render. Engine wiring is pinned at the source level.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..' , '..');
const dist = (p) => pathToFileURL(path.join(root, 'dist-electron', p)).href;

const { DynamicActionEngine } = await import(dist('electron/services/dynamic-actions/DynamicActionEngine.js'));
const { MODE_TRIGGERS } = await import(dist('electron/services/dynamic-actions/DynamicActionDetector.js'));

const detect = (engine, transcript, modeTemplateType, sessionId = 's1') =>
  engine.detectActions({ transcript, speaker: 'them', modeTemplateType, modeId: 'm1', sessionId });

describe('dual-pack evaluation semantics (engine-level)', () => {
  test('general pack alone misses a technical probe; technical pack catches it', () => {
    const engine = new DynamicActionEngine();
    const line = 'Okay, but can you do it in O(n) time instead?';
    const generalTypes = detect(engine, line, 'general').map((a) => a.type);
    assert.ok(!generalTypes.includes('optimization_followup'), 'general pack should not contain the tech trigger');
    const techTypes = detect(engine, line, 'technical_interview').map((a) => a.type);
    assert.ok(techTypes.includes('optimization_followup'), 'second (smart-mode) pass must catch it');
  });

  test('store dedupe suppresses the same trigger type across the two passes', () => {
    const engine = new DynamicActionEngine();
    const line = 'Okay, but can you do it in O(n) time instead?';
    const first = detect(engine, line, 'technical_interview');
    const firstTypes = first.map((a) => a.type);
    assert.ok(firstTypes.includes('optimization_followup'));
    // Re-running the same segment (as the smart-mode second pass would for a
    // shared type) mints nothing new within the dedupe window.
    const second = detect(engine, line, 'technical_interview');
    assert.equal(second.length, 0, 'duplicate types within the window must be suppressed');
  });

  test('dual-pass merge surfaces both ambient and technical actions in top actions', () => {
    const engine = new DynamicActionEngine();
    // One line that fires fact_check (general pack) and one technical probe.
    detect(engine, 'Wait, is that actually true?', 'general');
    detect(engine, 'Can you walk me through your code?', 'technical_interview');
    const top = engine.getTopActions('s1').map((a) => a.type);
    assert.ok(top.includes('fact_check'), 'ambient-pack action missing');
    assert.ok(top.includes('code_walkthrough'), 'technical-pack action missing');
  });

  test('technical_interview pack exists and carries the F9 probes', () => {
    const types = MODE_TRIGGERS.technical_interview.map((t) => t.type);
    for (const expected of ['optimization_followup', 'edge_case_probe', 'code_walkthrough', 'testing_probe', 'behavioral_pivot']) {
      assert.ok(types.includes(expected), `technical pack missing ${expected}`);
    }
  });
});

describe('source pins — engine smart-mode wiring', () => {
  const engineSrc = readFileSync(path.join(root, 'electron/IntelligenceEngine.ts'), 'utf8');

  test('isSmartModeEnabled reads settings defensively (false on failure)', () => {
    assert.match(engineSrc, /private isSmartModeEnabled\(\): boolean/);
    assert.match(engineSrc, /get\('smartModeEnabled'\) === true/);
    assert.match(engineSrc, /catch \{ return false; \}/);
  });
  test('detectAndEmitDynamicActions runs a second technical_interview pass when smart mode is on', () => {
    assert.match(engineSrc, /this\.currentDynamicActionTemplateType !== 'technical_interview' && this\.isSmartModeEnabled\(\)/);
    assert.match(engineSrc, /modeTemplateType: 'technical_interview'/);
  });
});
