import { describe, expect, it } from 'vitest';
import { generateDifferentiationQuestion } from '@/lib/practiceGenerators/differentiation';
import { generateIntegrationQuestion } from '@/lib/practiceGenerators/integration';

describe('calculus practice generators', () => {
  it('differentiation is deterministic for a seed', () => {
    const a = generateDifferentiationQuestion({ seed: 12345, difficulty: 'easy' });
    const b = generateDifferentiationQuestion({ seed: 12345, difficulty: 'easy' });
    expect(a).toEqual(b);
  });

  it('integration is deterministic for a seed', () => {
    const a = generateIntegrationQuestion({ seed: 999, difficulty: 'medium' });
    const b = generateIntegrationQuestion({ seed: 999, difficulty: 'medium' });
    expect(a).toEqual(b);
  });
});
