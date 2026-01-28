import assert from 'node:assert/strict';
import { mergeParsedOptionsByLabel, parseScreenshotOcrToDraft } from '../src/lib/screenshotQuestionParser.ts';

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

const base = parseScreenshotOcrToDraft(`Q1. Dummy?\nA) Alpha\nB) Beta\nC) Gamma\nD) Delta`).options;
const overrides = [
  { label: 'A', text: 'Alpha (bold)', sourceLines: ['Alpha (bold)'] },
  { label: 'C', text: 'Gamma (bold)', sourceLines: ['Gamma (bold)'] },
];
const merged = mergeParsedOptionsByLabel(base, overrides);
assert.equal(merged.length, 4);
assert.equal(merged[0].label, 'A');
assert.equal(merged[0].text.trim(), 'Alpha (bold)');
assert.equal(merged[1].label, 'B');
assert.equal(merged[1].text.trim(), 'Beta');
assert.equal(merged[2].label, 'C');
assert.equal(merged[2].text.trim(), 'Gamma (bold)');
assert.equal(merged[3].label, 'D');
assert.equal(merged[3].text.trim(), 'Delta');

console.log('OK: mergeParsedOptionsByLabel preserves base order and fills missing labels');

const numeric = `A particle moving with uniform speed in a circular path maintains;\n(1) constant velocity but varying acceleration.\n(2) varying velocity and varying acceleration.\n(3) constant velocity.\n(4) constant acceleration.`;

const q7 = parseScreenshotOcrToDraft(numeric);
assert.equal(q7.questionText.trim(), 'A particle moving with uniform speed in a circular path maintains;');
assert.equal(q7.options.length, 4);
assert.equal(q7.options[0].label, '1');
assert.equal(q7.options[0].text.trim(), 'constant velocity but varying acceleration.');
assert.equal(q7.options[1].label, '2');
assert.equal(q7.options[1].text.trim(), 'varying velocity and varying acceleration.');
assert.equal(q7.options[2].label, '3');
assert.equal(q7.options[2].text.trim(), 'constant velocity.');
assert.equal(q7.options[3].label, '4');
assert.equal(q7.options[3].text.trim(), 'constant acceleration.');

console.log('OK: parseScreenshotOcrToDraft numeric (1)-(4) options');

const numericInlineSingleLine =
  'The quantities which have the same dimensions as those of solid angle are; (1) strain and arc (2) angular speed and stress (3) strain and angle (4) stress and angle';

const q8 = parseScreenshotOcrToDraft(numericInlineSingleLine);
assert.equal(
  q8.questionText.trim(),
  'The quantities which have the same dimensions as those of solid angle are;'
);
assert.equal(q8.options.length, 4);
assert.equal(q8.options[0].label, '1');
assert.equal(q8.options[0].text.trim(), 'strain and arc');
assert.equal(q8.options[1].label, '2');
assert.equal(q8.options[1].text.trim(), 'angular speed and stress');
assert.equal(q8.options[2].label, '3');
assert.equal(q8.options[2].text.trim(), 'strain and angle');
assert.equal(q8.options[3].label, '4');
assert.equal(q8.options[3].text.trim(), 'stress and angle');

console.log('OK: parseScreenshotOcrToDraft numeric inline single-line options');

const glued = `Choose the most appropriate answer from the options given below:\n(1) B,DandE only\n(2) A,BandC only\n(3) A,BandE only\n(4) A,CandE only`;

const q9 = parseScreenshotOcrToDraft(glued);
assert.equal(q9.options.length, 4);
assert.equal(q9.options[0].label, '1');
assert.equal(q9.options[0].text.trim(), 'B, D and E only');
assert.equal(q9.options[1].label, '2');
assert.equal(q9.options[1].text.trim(), 'A, B and C only');
assert.equal(q9.options[2].label, '3');
assert.equal(q9.options[2].text.trim(), 'A, B and E only');
assert.equal(q9.options[3].label, '4');
assert.equal(q9.options[3].text.trim(), 'A, C and E only');

console.log('OK: spacing normalization for glued option lists');

const leadingArticleA = `A piece of steel is taken from the Earth to the Moon for an experiment. The gravitational field strength on the Moon is smaller than on the Earth.\n\nWhich statement about the piece of steel is correct?\n\nA It has less mass on the Moon than on the Earth.\nB It has more mass on the Moon than on the Earth.\nC It weighs less on the Moon than on the Earth.\nD It weighs more on the Moon than on the Earth.`;

const q10 = parseScreenshotOcrToDraft(leadingArticleA);
assert.ok(q10.questionText.includes('A piece of steel is taken from the Earth to the Moon'));
assert.ok(q10.questionText.includes('Which statement about the piece of steel is correct?'));
assert.equal(q10.options.length, 4);
assert.equal(q10.options[0].label, 'A');
assert.equal(q10.options[0].text.trim(), 'It has less mass on the Moon than on the Earth.');
assert.equal(q10.options[1].label, 'B');
assert.equal(q10.options[2].label, 'C');
assert.equal(q10.options[3].label, 'D');

console.log('OK: question leading article "A" does not shift options');

const paragraphy = `If the plates of a parallel plate capacitor connected to a battery are moved close to each other, then\n\nA. the charge stored in it, increase.\nB. the energy stored in it, decreases.\nC. its capacitance increases.\nD. the ratio of charge to its potential remains the same.\nE. the product of charge and voltage increases.\n\nChoose the most appropriate answer from the options given below:\n(1) B,DandE only\n(2) A,BandC only\n(3) A,BandE only\n(4) A,CandE only`;

const q11 = parseScreenshotOcrToDraft(paragraphy);
// Should preserve paragraph breaks between stem and statement block and between statement block and the "Choose" line.
assert.ok(q11.questionText.includes('\n\n'));

console.log('OK: question paragraph breaks preserved for lettered statements');
