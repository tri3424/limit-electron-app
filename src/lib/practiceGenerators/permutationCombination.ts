import type { PracticeDifficulty } from '@/lib/practiceGenerators/quadraticFactorization';

type KatexExplanationBlock =
  | { kind: 'text'; content: string }
  | { kind: 'math'; content: string; displayMode?: boolean };

type Rng = {
  next: () => number;
  int: (min: number, max: number) => number;
};

function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  const next = () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (hi <= lo) return lo;
    return lo + Math.floor(next() * (hi - lo + 1));
  };
  return { next, int };
}

function stableId(prefix: string, seed: number, suffix: string) {
  return `${prefix}-${seed}-${suffix}`;
}

function factorialBig(n: number): bigint {
  let r = 1n;
  for (let i = 2; i <= n; i++) r *= BigInt(i);
  return r;
}

function nCrBig(n: number, r: number): bigint {
  if (r < 0 || r > n) return 0n;
  const k = Math.min(r, n - r);
  let num = 1n;
  let den = 1n;
  for (let i = 1; i <= k; i++) {
    num *= BigInt(n - (k - i));
    den *= BigInt(i);
  }
  return num / den;
}

function nPrBig(n: number, r: number): bigint {
  if (r < 0 || r > n) return 0n;
  let out = 1n;
  for (let i = 0; i < r; i++) out *= BigInt(n - i);
  return out;
}

function toSafeNumber(x: bigint): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (x > max) return Number.MAX_SAFE_INTEGER;
  return Number(x);
}

export type PermutationCombinationVariantId =
  | 'team_no_restriction'
  | 'team_group_not_separated'
  | 'digits_even_unique'
  | 'arrange_together'
  | 'arrange_not_together'
  | 'committee_men_women';

export type PermutationCombinationQuestion = {
  kind: 'permutation_combination';
  topicId: 'permutation_combination';
  id: string;
  seed: number;
  difficulty: PracticeDifficulty;
  variantId: PermutationCombinationVariantId;
  katexQuestion: string;
  katexExplanation: KatexExplanationBlock[];
  expectedNumber: number;
};

function pickVariant(
  rng: Rng,
  avoid?: PermutationCombinationVariantId,
  variantWeights?: Record<string, number>
): PermutationCombinationVariantId {
  const all: PermutationCombinationVariantId[] = [
    'team_no_restriction',
    'team_group_not_separated',
    'digits_even_unique',
    'arrange_together',
    'arrange_not_together',
    'committee_men_women',
  ];

  const pool = all.filter((v) => v !== avoid);
  const weights = pool.map((k) => Math.max(0, Number((variantWeights as any)?.[k] ?? 1)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return pool[rng.int(0, pool.length - 1)]!;
  let r = rng.next() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

export function generatePermutationCombinationQuestion(input: {
  seed: number;
  difficulty: PracticeDifficulty;
  avoidVariantId?: PermutationCombinationVariantId;
  variantWeights?: Record<string, number>;
}): PermutationCombinationQuestion {
  const rng = mulberry32(input.seed);
  const variantId = pickVariant(rng, input.avoidVariantId, input.variantWeights);

  const mk = (payload: {
    idSuffix: string;
    katexQuestion: string;
    katexExplanation: KatexExplanationBlock[];
    expectedNumber: number;
  }): PermutationCombinationQuestion => {
    return {
      kind: 'permutation_combination',
      topicId: 'permutation_combination',
      id: stableId('permcomb', input.seed, `${variantId}-${payload.idSuffix}`),
      seed: input.seed,
      difficulty: input.difficulty,
      variantId,
      katexQuestion: payload.katexQuestion,
      katexExplanation: payload.katexExplanation,
      expectedNumber: payload.expectedNumber,
    };
  };

  if (variantId === 'team_no_restriction') {
    const N = rng.int(input.difficulty === 'easy' ? 10 : 12, input.difficulty === 'hard' ? 22 : 18);
    const r = rng.int(input.difficulty === 'easy' ? 4 : 6, Math.min(N - 2, input.difficulty === 'hard' ? 12 : 10));
    const ans = nCrBig(N, r);

    const q = String.raw`\text{A team of ${r} players is to be chosen from ${N} players.\\Find the number of different teams that can be chosen if there are no restrictions.}`;
    const expl: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Step 1: Decide if order matters.' },
      { kind: 'text', content: 'A team is just a group. The order you pick the players does not create a new team.' },
      { kind: 'text', content: 'So this is a COMBINATION problem.' },
      { kind: 'text', content: 'Key idea: combinations count selections; permutations count arrangements.' },
      { kind: 'text', content: 'Here we only care which players are in the team, not the order they were chosen.' },

      { kind: 'text', content: 'Step 2: Identify n and r.' },
      { kind: 'math', content: String.raw`n=${N},\quad r=${r}`, displayMode: true },

      { kind: 'text', content: 'Step 3: Write the counting expression.' },
      { kind: 'text', content: 'The number of ways to choose r objects from n objects is written as “n choose r”.' },

      { kind: 'math', content: String.raw`\binom{${N}}{${r}}`, displayMode: true },

      { kind: 'text', content: 'Step 4: Use the factorial formula for combinations.' },
      { kind: 'math', content: String.raw`\binom{n}{r}=\frac{n!}{r!(n-r)!}`, displayMode: true },
      { kind: 'text', content: 'Explanation of the formula (why it works):' },
      { kind: 'text', content: 'If order mattered, there would be nPr = n!/(n-r)! ways.' },
      { kind: 'text', content: 'But each team of r people can be arranged in r! orders, which all represent the same team.' },
      { kind: 'text', content: 'So we divide by r! to remove that overcounting.' },
      { kind: 'math', content: String.raw`\binom{n}{r}=\frac{{}^nP_r}{r!}=\frac{\frac{n!}{(n-r)!}}{r!}=\frac{n!}{r!(n-r)!}`, displayMode: true },

      { kind: 'text', content: 'Step 5: Substitute values.' },
      { kind: 'math', content: String.raw`\binom{${N}}{${r}}=\frac{${N}!}{${r}!\,(${N - r})!}`, displayMode: true },
      { kind: 'text', content: 'Step 6: (Optional) Cancel factorial terms if you want to compute by hand.' },
      { kind: 'text', content: 'Write the factorials as products and cancel common factors.' },

      { kind: 'text', content: 'Step 6: Evaluate (this gives the count of distinct teams).' },
      { kind: 'math', content: String.raw`\binom{${N}}{${r}}=${ans.toString()}`, displayMode: true },

      { kind: 'text', content: `Final answer: ${ans.toString()} different teams.` },
    ];
    return mk({ idSuffix: `${N}-${r}`, katexQuestion: q, katexExplanation: expl, expectedNumber: toSafeNumber(ans) });
  }

  if (variantId === 'team_group_not_separated') {
    const N = rng.int(input.difficulty === 'easy' ? 12 : 14, input.difficulty === 'hard' ? 24 : 20);
    const g = rng.int(2, 4);
    const rMin = Math.max(5, g + 3);
    const r = rng.int(rMin, Math.min(N - 1, input.difficulty === 'hard' ? 14 : 12));

    // group must not be separated -> either all included or all excluded.
    const remaining = N - g;
    const includeAll = nCrBig(remaining, r - g);
    const includeNone = nCrBig(remaining, r);
    const ans = includeAll + includeNone;

    const groupLabel = g === 2 ? '2 sisters' : g === 3 ? '3 sisters' : `${g} sisters`;
    const q = String.raw`\text{A team of ${r} players is to be chosen from ${N} players.\\The ${N} players include ${groupLabel} who must not be separated.\\Find the number of different teams that can be chosen.}`;

    const expl: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Step 1: This is still a team selection, so order does not matter (combinations).' },
      { kind: 'text', content: `The ${groupLabel} must not be separated, meaning we are not allowed to include only some of them.` },
      { kind: 'text', content: 'So we split into two non-overlapping cases.' },
      { kind: 'text', content: 'Reason: “must not be separated” means either all members of the group are selected or none are selected.' },

      { kind: 'text', content: `There are ${remaining} other players (not in that group).` },
      { kind: 'math', content: String.raw`\text{other players}=${N}-${g}=${remaining}`, displayMode: true },

      { kind: 'text', content: 'We now count each valid case separately, then add.' },

      { kind: 'text', content: `Case 1: all ${g} are included.` },
      { kind: 'text', content: `Then we have already chosen ${g} people, so we need ${r - g} more from the remaining ${remaining}.` },
      { kind: 'math', content: String.raw`\text{Case 1} = \binom{${remaining}}{${r - g}} = ${includeAll.toString()}`, displayMode: true },

      { kind: 'text', content: 'Why this is correct:' },
      { kind: 'text', content: `Once the group is fixed “in”, the only freedom is choosing the remaining ${r - g} people from the ${remaining} others.` },

      { kind: 'text', content: `Case 2: none of the ${groupLabel} are included.` },
      { kind: 'text', content: `Then we must choose all ${r} people from the remaining ${remaining}.` },
      { kind: 'math', content: String.raw`\text{Case 2} = \binom{${remaining}}{${r}} = ${includeNone.toString()}`, displayMode: true },

      { kind: 'text', content: 'Why we add cases:' },
      { kind: 'text', content: 'A valid team is either in Case 1 or Case 2, and cannot be in both.' },

      { kind: 'text', content: 'Step 2: Add the cases (they cannot overlap).' },
      { kind: 'math', content: String.raw`\text{Total} = ${includeAll.toString()} + ${includeNone.toString()} = ${ans.toString()}`, displayMode: true },
      { kind: 'text', content: `Final answer: ${ans.toString()} different teams.` },
    ];

    return mk({ idSuffix: `${N}-${r}-g${g}`, katexQuestion: q, katexExplanation: expl, expectedNumber: toSafeNumber(ans) });
  }

  if (variantId === 'digits_even_unique') {
    const digits = 10;
    const len = rng.int(5, 7);

    // Must not start with 0, all digits distinct, and even.
    // We'll count by last digit cases.
    // Case A: last digit is 0.
    // Case B: last digit is one of {2,4,6,8}.

    const caseA = nPrBig(9, len - 1); // first digit: 1-9 then choose remaining len-2 from remaining 8? Actually last fixed 0.
    // Let's compute precisely using permutations with exclusions.
    // If last digit 0: first digit can be 1-9 => 9 choices.
    // Remaining (len-2) middle digits choose from remaining 8 digits (1-9 except first used): permutations 8P(len-2).
    const caseAExact = BigInt(9) * nPrBig(8, len - 2);

    // If last digit in {2,4,6,8}: 4 choices for last digit.
    // First digit: can be 1-9 excluding last digit if last digit !=0 (still 8 choices).
    // Remaining (len-2) middle digits: choose from remaining 8 digits (including 0) minus used two => 8 digits -> 8P(len-2)?
    const caseBExact = BigInt(4) * BigInt(8) * nPrBig(8, len - 2);

    const ans = caseAExact + caseBExact;

    const q = String.raw`\text{A ${len}-digit number is to be formed using the digits 0,1,2,3,4,5,6,7,8,9.\\The number cannot start with 0 and all digits must be different.\\How many such ${len}-digit numbers are even?}`;

    const expl: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Step 1: Understand the restrictions.' },
      { kind: 'text', content: 'The number must be even, so the last digit must be even.' },
      { kind: 'text', content: 'The first digit cannot be 0.' },
      { kind: 'text', content: 'All digits must be different, so once a digit is used it cannot be used again.' },
      { kind: 'text', content: 'Because we are forming a number (a sequence of digits), order matters, so we use permutations.' },

      { kind: 'text', content: 'Step 2: Use casework on the last digit (because “even” depends only on the last digit).' },

      { kind: 'text', content: 'Reminder:' },
      { kind: 'math', content: String.raw`{}^nP_r = n(n-1)(n-2)\cdots (n-r+1)`, displayMode: true },

      { kind: 'text', content: 'Case A: last digit is 0.' },
      { kind: 'text', content: 'Then the first digit can be any of 1–9 (9 choices), because it cannot be 0.' },
      { kind: 'text', content: `After fixing first digit and last digit, there are 8 digits left for the remaining ${len - 2} middle positions.` },
      { kind: 'text', content: `Those middle positions are filled by arranging ${len - 2} digits from the 8 remaining digits.` },
      { kind: 'math', content: String.raw`\text{Case A} = 9\times {}^{8}P_{${len - 2}} = 9\times \frac{8!}{(${10 - len})!} = ${caseAExact.toString()}`, displayMode: true },

      { kind: 'text', content: 'Case B: last digit is one of 2,4,6,8.' },
      { kind: 'text', content: 'There are 4 choices for the last digit.' },
      { kind: 'text', content: 'Now the first digit can be any of 1–9 except the chosen last digit (8 choices).' },
      { kind: 'text', content: `After fixing first and last, there are again 8 digits left for the remaining ${len - 2} middle positions.` },
      { kind: 'text', content: 'Again, fill the middle using permutations of the remaining digits.' },
      { kind: 'math', content: String.raw`\text{Case B} = 4\times 8\times {}^{8}P_{${len - 2}} = ${caseBExact.toString()}`, displayMode: true },

      { kind: 'text', content: 'Step 3: Add the cases (they do not overlap).' },
      { kind: 'math', content: String.raw`${caseAExact.toString()}+${caseBExact.toString()}=${ans.toString()}`, displayMode: true },
      { kind: 'text', content: `Final answer: ${ans.toString()} even ${len}-digit numbers.` },
    ];

    return mk({ idSuffix: `digits-even-${len}`, katexQuestion: q, katexExplanation: expl, expectedNumber: toSafeNumber(ans) });
  }

  if (variantId === 'arrange_together') {
    const n = rng.int(5, input.difficulty === 'easy' ? 6 : input.difficulty === 'hard' ? 10 : 8);
    // two particular people together
    const ans = factorialBig(n - 1) * 2n;

    const q = String.raw`\text{In how many ways can ${n} children be arranged in a line such that two particular children are always together?}`;

    const expl: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Step 1: Recognize this is an arrangement in a line, so order matters (permutations).' },
      { kind: 'text', content: 'The condition says the two particular children must be next to each other.' },
      { kind: 'text', content: 'Step 2: Use the block method.' },
      { kind: 'text', content: 'Treat the two children who must stay together as one single “block”.' },
      { kind: 'text', content: `Now we are arranging ${n - 1} objects in a line: the block + the other ${n - 2} children.` },
      { kind: 'math', content: String.raw`\text{Arrangements of the }(${n - 1})\text{ objects} = (${n - 1})!`, displayMode: true },
      { kind: 'text', content: 'Step 3: Arrange inside the block.' },
      { kind: 'text', content: 'Inside the block, the two children can be in 2 orders: AB or BA.' },
      { kind: 'math', content: String.raw`\text{Internal arrangements} = 2`, displayMode: true },
      { kind: 'text', content: 'Step 4: Multiply independent choices.' },
      { kind: 'math', content: String.raw`\text{Total} = 2\times (${n - 1})! = ${ans.toString()}`, displayMode: true },
      { kind: 'text', content: 'Reason we multiply:' },
      { kind: 'text', content: 'For each arrangement of the (n−1) objects, there are 2 internal orders of the block.' },
      { kind: 'text', content: `Final answer: ${ans.toString()} arrangements.` },
    ];

    return mk({ idSuffix: `together-${n}`, katexQuestion: q, katexExplanation: expl, expectedNumber: toSafeNumber(ans) });
  }

  if (variantId === 'arrange_not_together') {
    const n = rng.int(5, input.difficulty === 'easy' ? 6 : input.difficulty === 'hard' ? 10 : 8);
    const total = factorialBig(n);
    const together = factorialBig(n - 1) * 2n;
    const ans = total - together;

    const q = String.raw`\text{In how many ways can ${n} children be arranged in a line such that two particular children are never together?}`;

    const expl: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Step 1: Start from all arrangements (no restriction).' },
      { kind: 'text', content: `Arranging ${n} children in a line means order matters, so there are:` },
      { kind: 'math', content: String.raw`${n}! = ${total.toString()}`, displayMode: true },

      { kind: 'text', content: 'Step 2: Use complementary counting.' },
      { kind: 'text', content: 'It is easier to count “together” and subtract than to count “not together” directly.' },

      { kind: 'text', content: 'Step 2: Count the unwanted arrangements where the two particular children ARE together.' },
      { kind: 'text', content: 'Use the block method: treat the two children as one block.' },
      { kind: 'text', content: `Then we are arranging ${n - 1} objects: the block + the other ${n - 2} children.` },
      { kind: 'text', content: 'Inside the block, the two children can swap in 2 ways.' },
      { kind: 'math', content: String.raw`\text{Together} = 2\times (${n - 1})! = ${together.toString()}`, displayMode: true },

      { kind: 'text', content: 'Step 3: Subtract to get the arrangements where they are never together.' },
      { kind: 'math', content: String.raw`${total.toString()}-${together.toString()}=${ans.toString()}`, displayMode: true },
      { kind: 'text', content: `Final answer: ${ans.toString()} arrangements where they are not together.` },
    ];

    return mk({ idSuffix: `apart-${n}`, katexQuestion: q, katexExplanation: expl, expectedNumber: toSafeNumber(ans) });
  }

  // committee_men_women
  {
    const men = rng.int(input.difficulty === 'easy' ? 5 : 7, input.difficulty === 'hard' ? 12 : 10);
    const women = rng.int(input.difficulty === 'easy' ? 4 : 5, input.difficulty === 'hard' ? 10 : 8);
    const mPick = rng.int(2, Math.min(5, men - 1));
    const wPick = rng.int(1, Math.min(4, women - 1));

    const waysMen = nCrBig(men, mPick);
    const waysWomen = nCrBig(women, wPick);
    const ans = waysMen * waysWomen;

    const q = String.raw`\text{In how many ways can a committee consisting of ${mPick} men and ${wPick} women be chosen from ${men} men and ${women} women?}`;

    const expl: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Step 1: Decide if order matters.' },
      { kind: 'text', content: 'A committee is just a selection of people. Order does not matter.' },
      { kind: 'text', content: 'So we will use combinations.' },

      { kind: 'text', content: 'Key idea: choose the men and women separately, then combine the choices.' },
      { kind: 'text', content: 'This is the multiplication principle: if one choice can be made in A ways and another in B ways, then together they can be made in A×B ways.' },

      { kind: 'text', content: `Step 2: Choose the men. We need ${mPick} men out of ${men}.` },
      { kind: 'math', content: String.raw`\binom{${men}}{${mPick}} = ${waysMen.toString()}`, displayMode: true },

      { kind: 'text', content: `Step 3: Choose the women. We need ${wPick} women out of ${women}.` },
      { kind: 'math', content: String.raw`\binom{${women}}{${wPick}} = ${waysWomen.toString()}`, displayMode: true },

      { kind: 'text', content: 'Step 4: Multiply the results (independent choices).' },
      { kind: 'math', content: String.raw`\text{Total} = \binom{${men}}{${mPick}}\times\binom{${women}}{${wPick}}`, displayMode: true },
      { kind: 'math', content: String.raw`= ${waysMen.toString()}\times ${waysWomen.toString()} = ${ans.toString()}`, displayMode: true },

      { kind: 'text', content: `Final answer: ${ans.toString()} committees.` },
    ];

    return mk({ idSuffix: `committee-${men}-${women}-${mPick}-${wPick}`, katexQuestion: q, katexExplanation: expl, expectedNumber: toSafeNumber(ans) });
  }
}
