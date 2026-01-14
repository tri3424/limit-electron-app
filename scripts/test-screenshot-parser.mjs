import assert from 'node:assert/strict';
import { parseScreenshotOcrToDraft } from '../src/lib/screenshotQuestionParser.ts';

const sample = `Q1. What is 2 + 2?\nA) 3\nB) 4\nC) 5\nD) 6`;

const draft = parseScreenshotOcrToDraft(sample);

assert.equal(draft.questionText.trim(), 'What is 2 + 2?');
assert.equal(draft.options.length, 4);
assert.equal(draft.options[0].label, 'A');
assert.equal(draft.options[1].text.trim(), '4');

console.log('OK: parseScreenshotOcrToDraft basic case');
