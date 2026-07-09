// electron/services/__tests__/TechnicalTriggerPack.test.mjs
//
// F9 — expanded technical-interview trigger pack. The moments right AFTER the
// initial solution (optimization probes, edge-case probes, walkthrough asks,
// testing asks, behavioral pivots) are where live help matters most in a
// coding interview. Proves each new trigger fires on realistic interviewer
// utterances and stays quiet on near-misses.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const detectorPath = path.join(root, 'dist-electron/electron/services/dynamic-actions/DynamicActionDetector.js');
const { DynamicActionDetector, MODE_TRIGGERS } = await import(pathToFileURL(detectorPath).href);

const detector = new DynamicActionDetector();
const detect = (transcript) =>
  detector.detectTriggers({ transcript, modeTemplateType: 'technical_interview' });
const types = (transcript) => detect(transcript).map((m) => m.trigger.type);

describe('trigger pack shape', () => {
  test('all five new triggers registered under technical_interview', () => {
    const registered = MODE_TRIGGERS.technical_interview.map((t) => t.type);
    for (const t of ['optimization_followup', 'edge_case_probe', 'code_walkthrough', 'testing_probe', 'behavioral_pivot']) {
      assert.ok(registered.includes(t), `${t} missing from TECHNICAL_TRIGGERS`);
    }
  });
  test('priorities match the pack spec', () => {
    const byType = Object.fromEntries(MODE_TRIGGERS.technical_interview.map((t) => [t.type, t.priority]));
    assert.equal(byType.optimization_followup, 0.94);
    assert.equal(byType.edge_case_probe, 0.9);
    assert.equal(byType.code_walkthrough, 0.91);
    assert.equal(byType.testing_probe, 0.86);
    assert.equal(byType.behavioral_pivot, 0.87);
  });
});

describe('optimization_followup', () => {
  const fires = [
    'Okay, but can you do it in O(n) time?',
    'Can you make it faster?',
    'Nice — is there a more efficient way to do this?',
    'Could you solve it without the extra space?',
    'Can we get this down to O(log n)?',
    'How would you reduce the time complexity here?',
    'Can you do that in constant space?',
  ];
  for (const line of fires) {
    test(`fires: "${line}"`, () => {
      assert.ok(types(line).includes('optimization_followup'), `expected fire on: ${line}`);
    });
  }
  test('does not fire on the candidate stating complexity', () => {
    assert.ok(!types('So the overall runtime here ends up quadratic in the worst case.').includes('optimization_followup'));
  });
});

describe('edge_case_probe', () => {
  const fires = [
    'What edge cases should we worry about?',
    'What happens if the array is empty?',
    'Does it handle duplicates correctly?',
    'What about when the input is null?',
    'Have you thought about the boundary conditions?',
    'What if there are no matching elements?',
  ];
  for (const line of fires) {
    test(`fires: "${line}"`, () => {
      assert.ok(types(line).includes('edge_case_probe'), `expected fire on: ${line}`);
    });
  }
  test('does not fire on ordinary conversation', () => {
    assert.ok(!types('In some cases we deploy on Fridays.').includes('edge_case_probe'));
  });
});

describe('code_walkthrough', () => {
  const fires = [
    'Can you walk me through your code?',
    'Walk us through the solution real quick.',
    'Explain your approach step by step.',
    'Why did you choose a heap here?',
    'What does this line do?',
    'Talk me through your thinking.',
  ];
  for (const line of fires) {
    test(`fires: "${line}"`, () => {
      assert.ok(types(line).includes('code_walkthrough'), `expected fire on: ${line}`);
    });
  }
  test('does not fire on a generic explain ask', () => {
    assert.ok(!types('Our team walks to lunch through the park.').includes('code_walkthrough'));
  });
});

describe('testing_probe', () => {
  const fires = [
    'How would you test this?',
    'What test cases would you write?',
    'Can you write some unit tests for it?',
    'How do you know it works?',
  ];
  for (const line of fires) {
    test(`fires: "${line}"`, () => {
      assert.ok(types(line).includes('testing_probe'), `expected fire on: ${line}`);
    });
  }
  test('does not fire on "testing in production" chatter', () => {
    assert.ok(!types('We were testing the new deployment pipeline last week.').includes('testing_probe'));
  });
});

describe('behavioral_pivot', () => {
  const fires = [
    'Tell me about a time you disagreed with a teammate.',
    'Describe a situation where you had to push back on a deadline.',
    'Have you ever led a project end to end?',
    "What's the hardest bug you ever tracked down?",
    'How do you handle conflict on a team?',
  ];
  for (const line of fires) {
    test(`fires: "${line}"`, () => {
      assert.ok(types(line).includes('behavioral_pivot'), `expected fire on: ${line}`);
    });
  }
  test('does not fire on technical discussion', () => {
    assert.ok(!types('The timer tells the worker when to retry the job.').includes('behavioral_pivot'));
  });
});

describe('pack coexistence', () => {
  test('optimization follow-up outranks complexity_analysis when both match', () => {
    const matches = detect('Can you make it faster — what is the time complexity now?');
    const matchedTypes = matches.map((m) => m.trigger.type);
    assert.ok(matchedTypes.includes('optimization_followup'));
    assert.ok(matchedTypes.includes('complexity_analysis'));
    const opt = matches.find((m) => m.trigger.type === 'optimization_followup');
    const cx = matches.find((m) => m.trigger.type === 'complexity_analysis');
    assert.ok(opt.trigger.priority > cx.trigger.priority, 'optimization_followup must outrank complexity_analysis');
  });
  test('original triggers still fire (no pack regression)', () => {
    assert.ok(types('Please implement a function that reverses a linked list.').includes('coding_problem'));
    assert.ok(types('How would you design a system to scale to a million users?').includes('system_design_prompt'));
  });
});
