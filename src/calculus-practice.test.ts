import { describe, expect, it } from 'vitest';
import { generateDifferentiationQuestion } from '@/lib/practiceGenerators/differentiation';
import { generateIntegrationQuestion } from '@/lib/practiceGenerators/integration';

describe('calculus practice generators', () => {
  it('differentiation is deterministic for a seed', () => {
    const a = generateDifferentiationQuestion({ seed: 12345, difficulty: 'easy' });
    const b = generateDifferentiationQuestion({ seed: 12345, difficulty: 'easy' });
    expect(a).toEqual(b);
  });

  it('differentiation x-axis gradients variant can generate a surd/decimal (3 s.f.) case with calculator hint', () => {
    // Try a small range of seeds to deterministically find the surd branch.
    let q: any = null;
    for (let seed = 2026012900; seed < 2026012950; seed++) {
      const cand: any = generateDifferentiationQuestion({
        seed,
        difficulty: 'medium',
        variantWeights: { linear_minus_rational_xaxis_gradients: 100, basic_polynomial: 0, stationary_points: 0, sqrt_params_point_gradient: 0 },
      });
      if (cand.variantId === 'linear_minus_rational_xaxis_gradients' && String(cand.answerFormat ?? '') === 'decimal_3sf') {
        q = cand;
        break;
      }
    }

    expect(q).not.toBeNull();
    expect(q.topicId).toBe('differentiation');
    expect(q.variantId).toBe('linear_minus_rational_xaxis_gradients');
    expect(String(q.answerFormat ?? '')).toBe('decimal_3sf');
    expect(typeof q.calculatorHint).toBe('string');
    expect(String(q.calculatorHint)).toMatch(/calculator/i);
    expect(Array.isArray(q.expectedParts)).toBe(true);
    expect((q.expectedParts ?? []).length).toBe(2);
    expect(Number(String((q.expectedParts ?? [])[0]))).toBeTypeOf('number');
    expect(Number(String((q.expectedParts ?? [])[1]))).toBeTypeOf('number');
  });

  it('differentiation sqrt-params variant generates (a,b) parts and callouts', () => {
    const q = generateDifferentiationQuestion({
      seed: 20260124,
      difficulty: 'medium',
      variantWeights: { sqrt_params_point_gradient: 100, basic_polynomial: 0, stationary_points: 0 },
    });

    expect(q.topicId).toBe('differentiation');
    expect(q.variantId).toBe('sqrt_params_point_gradient');
    expect(Array.isArray(q.expectedParts)).toBe(true);
    expect((q.expectedParts ?? []).length).toBe(2);
    expect((q.expectedParts ?? [])[0]).toMatch(/^-?\d+(?:\/\d+)?$/);
    expect((q.expectedParts ?? [])[1]).toMatch(/^-?\d+(?:\/\d+)?$/);

    const blocks = q.katexExplanation as any[];
    expect(blocks.some((b) => b && b.kind === 'math_callout')).toBe(true);
  });

  it('differentiation power-linear point gradient variant generates a single numeric answer and callouts', () => {
    const q = generateDifferentiationQuestion({
      seed: 20260125,
      difficulty: 'medium',
      variantWeights: { power_linear_point_gradient: 100, basic_polynomial: 0, stationary_points: 0, sqrt_params_point_gradient: 0 },
    });

    expect(q.topicId).toBe('differentiation');
    expect(q.variantId).toBe('power_linear_point_gradient');
    expect(Array.isArray(q.expectedParts)).toBe(true);
    expect((q.expectedParts ?? []).length).toBe(1);
    expect((q.expectedParts ?? [])[0]).toMatch(/^-?\d+(?:\/\d+)?$/);
    const blocks = q.katexExplanation as any[];
    expect(blocks.some((b) => b && b.kind === 'math_callout')).toBe(true);
  });

  it('differentiation rational y-axis gradient variant expects a simplified fraction', () => {
    const q = generateDifferentiationQuestion({
      seed: 20260126,
      difficulty: 'medium',
      variantWeights: { rational_yaxis_gradient: 100, basic_polynomial: 0, stationary_points: 0, sqrt_params_point_gradient: 0 },
    });

    expect(q.topicId).toBe('differentiation');
    expect(q.variantId).toBe('rational_yaxis_gradient');
    expect(Array.isArray(q.expectedParts)).toBe(true);
    expect((q.expectedParts ?? []).length).toBe(1);
    expect((q.expectedParts ?? [])[0]).toMatch(/^-?\d+(?:\/\d+)?$/);
  });

  it('differentiation x-axis gradients variant expects two simplified fractions', () => {
    const q = generateDifferentiationQuestion({
      seed: 20260127,
      difficulty: 'medium',
      variantWeights: { linear_minus_rational_xaxis_gradients: 100, basic_polynomial: 0, stationary_points: 0, sqrt_params_point_gradient: 0 },
    });

    expect(q.topicId).toBe('differentiation');
    expect(q.variantId).toBe('linear_minus_rational_xaxis_gradients');
    expect(Array.isArray(q.expectedParts)).toBe(true);
    expect((q.expectedParts ?? []).length).toBe(2);
    expect((q.expectedParts ?? [])[0]).toMatch(/^-?\d+(?:\/\d+)?$/);
    expect((q.expectedParts ?? [])[1]).toMatch(/^-?\d+(?:\/\d+)?$/);
  });

  it('differentiation x-axis gradients variant can generate a non-fractional quadratic case', () => {
    const q = generateDifferentiationQuestion({
      seed: 2026012701,
      difficulty: 'easy',
      variantWeights: { linear_minus_rational_xaxis_gradients: 100, basic_polynomial: 0, stationary_points: 0, sqrt_params_point_gradient: 0 },
    });

    expect(q.topicId).toBe('differentiation');
    expect(q.variantId).toBe('linear_minus_rational_xaxis_gradients');
    expect(Array.isArray(q.expectedParts)).toBe(true);
    expect((q.expectedParts ?? []).length).toBe(2);
    // In the quadratic branch these are integers; in the rational branch they may be fractions.
    expect((q.expectedParts ?? [])[0]).toMatch(/^-?\d+(?:\/\d+)?$/);
    expect((q.expectedParts ?? [])[1]).toMatch(/^-?\d+(?:\/\d+)?$/);
  });

  it('differentiation stationary coords (sqrt quadratic) variant expects a coordinate pair', () => {
    const q = generateDifferentiationQuestion({
      seed: 20260128,
      difficulty: 'medium',
      variantWeights: { stationary_points_coords: 100, basic_polynomial: 0, stationary_points: 0, sqrt_params_point_gradient: 0 },
    });

    expect(q.topicId).toBe('differentiation');
    expect(q.variantId).toBe('stationary_points_coords');
    expect(Array.isArray(q.expectedParts)).toBe(true);
    expect((q.expectedParts ?? []).length).toBeGreaterThanOrEqual(2);
    expect((q.expectedParts ?? []).length % 2).toBe(0);
    // All entries should be integers (as strings).
    for (const p of (q.expectedParts ?? []) as any[]) {
      expect(String(p)).toMatch(/^-?\d+$/);
    }
  });

  it('integration is deterministic for a seed', () => {
    const a = generateIntegrationQuestion({ seed: 999, difficulty: 'medium' });
    const b = generateIntegrationQuestion({ seed: 999, difficulty: 'medium' });
    expect(a).toEqual(b);
  });
});
