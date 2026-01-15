import assert from 'node:assert/strict';
import { generateQuadraticByFactorisation } from '../src/lib/practiceGenerators/quadraticFactorization.ts';

function evalPoly(a, b, c, x) {
  return a * x * x + b * x + c;
}

function hasText(blocks, needle) {
  return blocks.some((b) => b.kind === 'text' && b.content.includes(needle));
}

function runOne({ seed, difficulty }) {
  const q1 = generateQuadraticByFactorisation({ seed, difficulty });
  const q2 = generateQuadraticByFactorisation({ seed, difficulty });

  assert.deepEqual(q1, q2, 'Generator must be deterministic for the same seed+difficulty');

  const { a, b, c } = q1.metadata.coefficients;
  assert.ok(Number.isFinite(a) && a !== 0, 'a must be non-zero');

  // Solutions must satisfy ax^2+bx+c = 0.
  for (const x of q1.solutions) {
    const xv = x.n / x.d;
    const val = evalPoly(a, b, c, xv);
    assert.ok(Math.abs(val) < 1e-9, `Solution x=${x} must satisfy the equation (got ${val})`);
  }

  // Repeated root should have exactly 1 solution entry.
  if (q1.metadata.repeatedRoot) {
    assert.equal(q1.solutions.length, 2, 'Repeated-root case must return two entries (same value twice)');
  } else {
    assert.equal(q1.solutions.length, 2, 'Distinct-root case must return two solutions');
  }

  // Must contain key textbook phrases.
  assert.ok(hasText(q1.katexExplanation, 'We want to solve the quadratic equation'), 'Missing intro goal statement');
  assert.ok(hasText(q1.katexExplanation, 'We now look for two numbers that multiply to give ac and add to give b'), 'Missing ac/b statement');
  assert.ok(hasText(q1.katexExplanation, 'We rewrite the middle term using these two numbers'), 'Missing middle-term rewrite statement');
  assert.ok(hasText(q1.katexExplanation, 'Now we group the terms in pairs'), 'Missing grouping statement');
  assert.ok(hasText(q1.katexExplanation, 'A product is zero only if at least one factor is zero'), 'Missing zero-product statement');
}

for (const difficulty of ['easy', 'medium', 'hard']) {
  runOne({ seed: 1, difficulty });
  runOne({ seed: 42, difficulty });
  runOne({ seed: 999, difficulty });
}

console.log('test-quadratic-generator: OK');
