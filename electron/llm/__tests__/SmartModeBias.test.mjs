// electron/llm/__tests__/SmartModeBias.test.mjs
//
// F3 — Smart Mode (coding-interview bias). The planner may rewrite ONLY the
// classification FLOOR types (unknown/general/follow_up) to coding/DSA answer
// types when a technical cue is present AND smartMode is on. Explicit routes
// (behavioral, identity, negotiation, profile, …) are NEVER overridden, and
// smartMode off/absent keeps behavior byte-for-byte. Also pins the IPC/
// preload/settings wiring so the toggle can't silently unwire.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const dist = (p) => pathToFileURL(path.join(root, 'dist-electron', p)).href;

const { planAnswer } = await import(dist('electron/llm/AnswerPlanner.js'));

const plan = (q, smartMode, extra = {}) => planAnswer({
  question: q,
  source: 'what_to_answer',
  speakerPerspective: 'interviewer',
  smartMode,
  ...extra,
});

describe('Smart Mode bias — floor types with technical cues', () => {
  // Ambiguous fragments that (without explicit coding keywords like "solve" /
  // "implement two sum") land on a floor type, but carry a technical cue.
  const dsaCases = [
    'and the time complexity there?',
    'what about big O for that?',
  ];
  for (const q of dsaCases) {
    test(`DSA cue → dsa_question_answer: "${q}"`, () => {
      const off = plan(q, false).answerType;
      const on = plan(q, true).answerType;
      // Only assert the rewrite when the question actually floored — if the
      // cascade already routed it technically, smart mode must not change it.
      if (['unknown_answer', 'general_meeting_answer', 'follow_up_answer'].includes(off)) {
        assert.equal(on, 'dsa_question_answer', `expected DSA rewrite for: ${q} (off=${off})`);
      } else {
        assert.equal(on, off, `non-floor type must be untouched: ${q}`);
      }
    });
  }

  const codingCases = [
    'and the edge cases?',
    'hmm, what about recursion here?',
  ];
  for (const q of codingCases) {
    test(`coding cue → coding_question_answer: "${q}"`, () => {
      const off = plan(q, false).answerType;
      const on = plan(q, true).answerType;
      if (['unknown_answer', 'general_meeting_answer', 'follow_up_answer'].includes(off)) {
        assert.equal(on, 'coding_question_answer', `expected coding rewrite for: ${q} (off=${off})`);
      } else {
        assert.equal(on, off, `non-floor type must be untouched: ${q}`);
      }
    });
  }

  test('at least one realistic ambiguous fragment actually exercises the rewrite', () => {
    // Guard against the suite silently passing because every case short-circuits
    // through the "already technical" branch.
    const exercised = [...dsaCases, ...codingCases].some((q) => {
      const off = plan(q, false).answerType;
      return ['unknown_answer', 'general_meeting_answer', 'follow_up_answer'].includes(off);
    });
    assert.ok(exercised, 'no test case landed on a floor type — cues need updating');
  });
});

describe('Smart Mode bias — never overrides explicit routes', () => {
  const explicit = [
    ['Tell me about a time you handled conflict on your team.', 'behavioral'],
    ['What is your name?', 'identity'],
    ['What salary are you expecting?', 'negotiation'],
    ['Tell me about your projects.', 'projects'],
  ];
  for (const [q, label] of explicit) {
    test(`${label} route unchanged by smart mode: "${q}"`, () => {
      const off = plan(q, false, { hasCandidateProfile: true, hasNegotiationContext: true });
      const on = plan(q, true, { hasCandidateProfile: true, hasNegotiationContext: true });
      assert.equal(on.answerType, off.answerType);
      assert.notEqual(on.answerType, 'coding_question_answer');
      assert.notEqual(on.answerType, 'dsa_question_answer');
    });
  }

  test('non-technical ambiguous fragment stays on its floor type', () => {
    const q = 'so what do you think about all that?';
    const off = plan(q, false).answerType;
    const on = plan(q, true).answerType;
    assert.equal(on, off);
  });

  test('smartMode absent === smartMode false (byte-for-byte default)', () => {
    for (const q of ['and the edge cases?', 'what about big O for that?', 'so what do you think?']) {
      const absent = planAnswer({ question: q, source: 'what_to_answer', speakerPerspective: 'interviewer' });
      const off = plan(q, false);
      assert.equal(absent.answerType, off.answerType);
    }
  });
});

describe('Smart Mode bias — derived plan fields follow the rewrite', () => {
  test('rewritten answer gets the coding profile-context policy (profile forbidden)', () => {
    const q = 'and the edge cases?';
    const off = plan(q, false).answerType;
    if (['unknown_answer', 'general_meeting_answer', 'follow_up_answer'].includes(off)) {
      const on = plan(q, true);
      assert.equal(on.answerType, 'coding_question_answer');
      assert.equal(on.profileContextPolicy, 'forbidden', 'coding answers must not ground in profile');
    }
  });
});

describe('source pins — settings/IPC/preload/renderer wiring', () => {
  const settingsSrc = readFileSync(path.join(root, 'electron/services/SettingsManager.ts'), 'utf8');
  const ipcSrc = readFileSync(path.join(root, 'electron/ipcHandlers.ts'), 'utf8');
  const preloadSrc = readFileSync(path.join(root, 'electron/preload.ts'), 'utf8');
  const engineSrc = readFileSync(path.join(root, 'electron/IntelligenceEngine.ts'), 'utf8');

  test('SettingsManager persists smartModeEnabled', () => {
    assert.match(settingsSrc, /smartModeEnabled\?: boolean/);
  });
  test('IPC: get/set-smart-mode with boolean validation + broadcast', () => {
    assert.match(ipcSrc, /safeHandle\('get-smart-mode'/);
    assert.match(ipcSrc, /safeHandle\('set-smart-mode'/);
    assert.match(ipcSrc, /typeof enabled !== 'boolean'/);
    assert.match(ipcSrc, /smart-mode-changed/);
  });
  test('IPC: manual chat path passes smartMode into planAnswer', () => {
    assert.match(ipcSrc, /smartMode: manualSmartMode/);
  });
  test('preload: getSmartMode/setSmartMode/onSmartModeChanged bridges', () => {
    assert.match(preloadSrc, /getSmartMode: \(\) => ipcRenderer\.invoke\('get-smart-mode'\)/);
    assert.match(preloadSrc, /setSmartMode: \(enabled: boolean\) => ipcRenderer\.invoke\('set-smart-mode', enabled\)/);
    assert.match(preloadSrc, /ipcRenderer\.on\('smart-mode-changed', subscription\)/);
  });
  test('engine: every planAnswer call site passes smartMode', () => {
    const calls = engineSrc.match(/planAnswer\(\{[\s\S]*?\}\)/g) ?? [];
    assert.ok(calls.length >= 3, `expected >=3 planAnswer call sites, got ${calls.length}`);
    for (const call of calls) {
      assert.match(call, /smartMode: this\.isSmartModeEnabled\(\)/, `call site missing smartMode: ${call.slice(0, 120)}…`);
    }
  });
});
