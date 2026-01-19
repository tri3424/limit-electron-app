import assert from 'node:assert/strict';
import { parseScreenshotOcrToDraft } from '../src/lib/screenshotQuestionParser.ts';

const sample = `Q1. What is 2 + 2?\nA) 3\nB) 4\nC) 5\nD) 6`;

const draft = parseScreenshotOcrToDraft(sample);

assert.equal(draft.questionText.trim(), 'What is 2 + 2?');
assert.equal(draft.options.length, 4);
assert.equal(draft.options[0].label, 'A');
assert.equal(draft.options[1].text.trim(), '4');

console.log('OK: parseScreenshotOcrToDraft basic case');

const neetSample = `1.0 g of magnesium is burnt with 0.56 g O2 in a closed vessel. Which reactant is left in excess and how much ? [2014]\n(a) Mg, 0.16 g   (b) O2, 0.16 g\n(c) Mg, 0.44 g   (d) O2, 0.28 g`;

const neet = parseScreenshotOcrToDraft(neetSample);

assert.equal(
  neet.questionText.trim(),
  '1.0 g of magnesium is burnt with 0.56 g O2 in a closed vessel. Which reactant is left in excess and how much ?'
);
assert.equal(neet.options.length, 4);
assert.equal(neet.options[0].label, 'A');
assert.equal(neet.options[0].text.trim(), 'Mg, 0.16 g');
assert.equal(neet.options[1].label, 'B');
assert.equal(neet.options[1].text.trim(), 'O2, 0.16 g');
assert.equal(neet.options[2].label, 'C');
assert.equal(neet.options[2].text.trim(), 'Mg, 0.44 g');
assert.equal(neet.options[3].label, 'D');
assert.equal(neet.options[3].text.trim(), 'O2, 0.28 g');

console.log('OK: parseScreenshotOcrToDraft NEET inline (a)-(d)');

const neetSingleLine =
  'The number of moles of KMnO4 reduced by one mole of KI in alkaline medium is: [2005] (a) one (b) two (c) five (d) one fifth';

const neet2 = parseScreenshotOcrToDraft(neetSingleLine);

assert.equal(
  neet2.questionText.trim(),
  'The number of moles of KMnO4 reduced by one mole of KI in alkaline medium is:'
);
assert.equal(neet2.options.length, 4);
assert.equal(neet2.options[0].text.trim(), 'one');
assert.equal(neet2.options[1].text.trim(), 'two');
assert.equal(neet2.options[2].text.trim(), 'five');
assert.equal(neet2.options[3].text.trim(), 'one fifth');

console.log('OK: parseScreenshotOcrToDraft NEET single-line question+options');

const leadingArticle = `In a signalling pathway, which of the following types of protein acts as a\nswitch to release a second messenger?\nA enzyme\nB glycoprotein\nC G protein\nD receptor`;

const q3 = parseScreenshotOcrToDraft(leadingArticle);

assert.equal(
  q3.questionText.trim(),
  'In a signalling pathway, which of the following types of protein acts as a switch to release a second messenger?'
);
assert.equal(q3.options.length, 4);
assert.equal(q3.options[0].label, 'A');
assert.equal(q3.options[0].text.trim(), 'enzyme');
assert.equal(q3.options[1].label, 'B');
assert.equal(q3.options[1].text.trim(), 'glycoprotein');
assert.equal(q3.options[2].label, 'C');
assert.equal(q3.options[2].text.trim(), 'G protein');
assert.equal(q3.options[3].label, 'D');
assert.equal(q3.options[3].text.trim(), 'receptor');

console.log('OK: parseScreenshotOcrToDraft leading "In a" question');

const splitLabel = `During prophase of mitosis, chromosomes consist of two chromatids. At which stage of the cell cycle is the second chromatid made?
A
cytokinesis
B
G1
C
G2
D
S`;

const q4 = parseScreenshotOcrToDraft(splitLabel);

assert.equal(
  q4.questionText.trim(),
  'During prophase of mitosis, chromosomes consist of two chromatids. At which stage of the cell cycle is the second chromatid made?'
);
assert.equal(q4.options.length, 4);
assert.equal(q4.options[0].label, 'A');
assert.equal(q4.options[0].text.trim(), 'cytokinesis');
assert.equal(q4.options[1].label, 'B');
assert.equal(q4.options[1].text.trim(), 'G1');
assert.equal(q4.options[2].label, 'C');
assert.equal(q4.options[2].text.trim(), 'G2');
assert.equal(q4.options[3].label, 'D');
assert.equal(q4.options[3].text.trim(), 'S');

console.log('OK: parseScreenshotOcrToDraft split label lines');

const elasticInline =
  'Which of the following is not a role of elastic fibres in the gas exchange system? A contract to decrease the volume of the alveoli during exhalation B recoil to force air out of the alveoli during exhalation C stretch to accommodate more air in the alveoli during deep breathing D stretch to increase the surface area of the alveoli for gas exchange [1]';

const q5 = parseScreenshotOcrToDraft(elasticInline);

assert.equal(
  q5.questionText.trim(),
  'Which of the following is not a role of elastic fibres in the gas exchange system?'
);
assert.equal(q5.options.length, 4);
assert.equal(q5.options[0].label, 'A');
assert.equal(q5.options[0].text.trim(), 'contract to decrease the volume of the alveoli during exhalation');
assert.equal(q5.options[1].label, 'B');
assert.equal(q5.options[1].text.trim(), 'recoil to force air out of the alveoli during exhalation');
assert.equal(q5.options[2].label, 'C');
assert.equal(q5.options[2].text.trim(), 'stretch to accommodate more air in the alveoli during deep breathing');
assert.equal(q5.options[3].label, 'D');
assert.equal(q5.options[3].text.trim(), 'stretch to increase the surface area of the alveoli for gas exchange');

console.log('OK: parseScreenshotOcrToDraft inline A-D options');

const cellPotency = `Cell potency refers to the varying ability of stem cells to:
A create more copies of themselves
B differentiate into different cell types
C produce different types of blood cells
D stimulate growth of tissues`;

const q6 = parseScreenshotOcrToDraft(cellPotency);
assert.equal(q6.questionText.trim(), 'Cell potency refers to the varying ability of stem cells to:');
assert.equal(q6.options.length, 4);
assert.equal(q6.options[0].label, 'A');
assert.equal(q6.options[0].text.trim(), 'create more copies of themselves');
assert.equal(q6.options[1].label, 'B');
assert.equal(q6.options[1].text.trim(), 'differentiate into different cell types');
assert.equal(q6.options[2].label, 'C');
assert.equal(q6.options[2].text.trim(), 'produce different types of blood cells');
assert.equal(q6.options[3].label, 'D');
assert.equal(q6.options[3].text.trim(), 'stimulate growth of tissues');

console.log('OK: parseScreenshotOcrToDraft standard A-D lines');
