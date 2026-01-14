import { Fraction, fractionToLatex, normalizeFraction, parseFraction } from '@/lib/fraction';

export type PracticeDifficulty = 'easy' | 'medium' | 'hard';

export type KatexExplanationBlock =
  | { kind: 'text'; content: string }
  | { kind: 'math'; content: string; displayMode?: boolean }
  | { kind: 'graph'; graphSpec: any; altText: string };

export type WordProblemVariantId =
  | 'mensuration_cuboid_height'
  | 'probability_complement'
  | 'coordinate_intercept'
  | 'unit_conversion_speed'
  | 'number_skills_mix'
  | 'greatest_odd_common_factor'
  | 'compound_interest_rate'
  | 'probability_two_bags_blue'
  | 'bus_pass_increases'
  | 'number_properties_puzzle';

export type WordProblemQuestion = {
  kind: 'word_problem';
  variantId: WordProblemVariantId;
  answerKind: 'integer' | 'rational' | 'decimal_2dp';
  expectedFraction?: Fraction;
  expectedNumber?: number;
  graphSpec?: any;
  graphAltText?: string;
  id: string;
  topicId: 'word_problems';
  difficulty: PracticeDifficulty;
  seed: number;
  katexQuestion: string;
  katexExplanation: KatexExplanationBlock[];
};

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
    return lo + Math.floor(next() * (hi - lo + 1));
  };
  return { next, int };
}

function stableId(prefix: string, seed: number, suffix: string) {
  return `${prefix}-${seed}-${suffix}`;
}

function frac(n: number, d: number): Fraction {
  return normalizeFraction({ n, d });
}

function pickFrom<T>(arr: T[], idx: number): T {
  return arr[Math.max(0, Math.min(arr.length - 1, idx))];
}

function pickName(seed: number, sub: number, offset: number) {
  const names = [
    'Amir',
    'Aisha',
    'Stephan',
    'Jen',
    'Meera',
    'Kabir',
    'Noah',
    'Lina',
    'Omar',
    'Sofia',
    'Riya',
    'Ethan',
    'Zara',
    'Arjun',
    'Maya',
    'Leo',
    'Isha',
    'Hassan',
    'Priya',
    'Daniel',
  ];
  const i = (seed + sub + offset) % names.length;
  return names[i];
}

function pickTwoDistinctNames(seed: number, sub: number) {
  const a = pickName(seed, sub, 1);
  let b = pickName(seed, sub, 2);
  let tries = 0;
  while (b === a && tries < 10) {
    tries += 1;
    b = pickName(seed, sub, 2 + tries);
  }
  return { a, b };
}

function pickVariant(rng: Rng, avoid?: WordProblemVariantId): WordProblemVariantId {
  const all: WordProblemVariantId[] = [
    'mensuration_cuboid_height',
    'probability_complement',
    'coordinate_intercept',
    'unit_conversion_speed',
    'number_skills_mix',
    'greatest_odd_common_factor',
    'compound_interest_rate',
    'probability_two_bags_blue',
    'bus_pass_increases',
    'number_properties_puzzle',
  ];
  const pool = avoid ? all.filter((v) => v !== avoid) : all;
  return pool[rng.int(0, pool.length - 1)];
}

function asFixed2(n: number) {
  return Number(n).toFixed(2);
}

function scaffoldExplanation(input: {
  title: string;
  givens: string[];
  goal: string;
  method: string[];
  working: KatexExplanationBlock[];
  checks: string[];
}): KatexExplanationBlock[] {
  return [
    { kind: 'text', content: input.title },
    { kind: 'text', content: 'This is a word problem.' },
    { kind: 'text', content: 'Micro-step 1: Read the question once without doing any calculations.' },
    { kind: 'text', content: 'Micro-step 2: Underline/identify the quantities given and the quantity you must find.' },
    { kind: 'text', content: 'Micro-step 3: Decide on the formula or rule to use before substituting any numbers.' },
    { kind: 'text', content: 'Given information:' },
    ...input.givens.map((g) => ({ kind: 'text' as const, content: `- ${g}` })),
    { kind: 'text', content: 'We are asked to find:' },
    { kind: 'text', content: input.goal },
    { kind: 'text', content: 'Method:' },
    ...input.method.map((m) => ({ kind: 'text' as const, content: `- ${m}` })),
    { kind: 'text', content: 'Micro-step 4: Substitute carefully and keep units consistent.' },
    { kind: 'text', content: 'Working (step-by-step):' },
    ...input.working,
    { kind: 'text', content: 'Checks:' },
    ...input.checks.map((c) => ({ kind: 'text' as const, content: `- ${c}` })),
    { kind: 'text', content: 'Final answer: the value that satisfies the question.' },
  ];
}

export function generateWordProblemQuestion(input: {
  seed: number;
  difficulty: PracticeDifficulty;
  avoidVariantId?: WordProblemVariantId;
}): WordProblemQuestion {
  const rng = mulberry32(input.seed);
  const variantId = pickVariant(rng, input.avoidVariantId);
  const sub = rng.int(0, 9);

  const mk = (payload: {
    idSuffix: string;
    katexQuestion: string;
    katexExplanation: KatexExplanationBlock[];
    answerKind: WordProblemQuestion['answerKind'];
    expectedFraction?: Fraction;
    expectedNumber?: number;
  }): WordProblemQuestion => {
    return {
      kind: 'word_problem',
      variantId,
      id: stableId('word', input.seed, `${variantId}-${payload.idSuffix}`),
      topicId: 'word_problems',
      difficulty: input.difficulty,
      seed: input.seed,
      katexQuestion: payload.katexQuestion,
      katexExplanation: payload.katexExplanation,
      answerKind: payload.answerKind,
      expectedFraction: payload.expectedFraction,
      expectedNumber: payload.expectedNumber,
    };
  };

  if (variantId === 'mensuration_cuboid_height') {
    // Exactly 10 variants total (sub = 0..9). Difficulty only adjusts number size.
    const base = [
      { l: 15, w: 6, h: 9 },
      { l: 12, w: 5, h: 8 },
      { l: 10, w: 4, h: 7 },
      { l: 18, w: 7, h: 6 },
      { l: 14, w: 8, h: 5 },
      { l: 16, w: 4, h: 10 },
      { l: 9, w: 6, h: 7 },
      { l: 20, w: 5, h: 6 },
      { l: 11, w: 7, h: 4 },
      { l: 13, w: 6, h: 8 },
    ];

    const b = base[sub];
    const bump = input.difficulty === 'easy' ? 0 : input.difficulty === 'medium' ? 6 : 12;
    const bumpH = input.difficulty === 'easy' ? 0 : input.difficulty === 'medium' ? 3 : 6;

    const l = b.l + bump;
    const w = b.w + (bump / 2);
    const h = b.h + bumpH;

    // Add variety: sometimes surface area, sometimes volume; ask for any missing dimension.
    const measureKind: 'surface_area' | 'volume' = sub % 2 === 0 ? 'surface_area' : 'volume';
    const unknown: 'l' | 'w' | 'h' = (sub % 3 === 0 ? 'h' : sub % 3 === 1 ? 'l' : 'w');

    const sa = 2 * (l * w + l * h + w * h);
    const vol = l * w * h;

    const stem =
      input.difficulty === 'easy'
        ? 'Work out'
        : input.difficulty === 'medium'
          ? 'Calculate'
          : 'Determine';
    const unknownLabel = unknown === 'l' ? 'length' : unknown === 'w' ? 'width' : 'height';
    const unknownSymbol = unknown;
    const knownParts = (() => {
      if (unknown === 'l') {
        return String.raw`\text{A cuboid has width }${w}\text{ cm and height }${h}\text{ cm.}`;
      }
      if (unknown === 'w') {
        return String.raw`\text{A cuboid has length }${l}\text{ cm and height }${h}\text{ cm.}`;
      }
      return String.raw`\text{A cuboid has length }${l}\text{ cm and width }${w}\text{ cm.}`;
    })();

    const givenMeasure =
      measureKind === 'surface_area'
        ? String.raw`\text{The total surface area is }${sa}~\mathrm{cm}^{2}.`
        : String.raw`\text{The volume is }${vol}~\mathrm{cm}^{3}.`;

    const askLine = String.raw`\text{${stem} the ${unknownLabel} }${unknownSymbol}\text{ cm.}`;
    const NL = String.raw`\\`;
    const q = [knownParts, givenMeasure, askLine].join(NL);

    const working: KatexExplanationBlock[] = (() => {
      if (measureKind === 'volume') {
        const known1 = unknown === 'l' ? w : l;
        const known2 = unknown === 'h' ? w : h;
        const known3 = unknown === 'w' ? l : (unknown === 'l' ? h : l);
        // Explicitly compute the product of the known dimensions (order doesn't matter).
        const knownProduct = unknown === 'l' ? w * h : unknown === 'w' ? l * h : l * w;
        const ans = unknown === 'l' ? l : unknown === 'w' ? w : h;

        return [
          { kind: 'text', content: 'This is a cuboid volume question.' },
          { kind: 'text', content: 'Volume of a cuboid is length × width × height.' },
          { kind: 'math', content: String.raw`V = lwh`, displayMode: true },
          { kind: 'text', content: 'Substitute the known values.' },
          { kind: 'math', content: String.raw`${vol} = ${l}\cdot ${w}\cdot ${h}`, displayMode: true },
          { kind: 'text', content: `We are finding ${unknownSymbol}, so divide the volume by the product of the other two dimensions.` },
          { kind: 'math', content: String.raw`${unknownSymbol} = \frac{${vol}}{${knownProduct}}`, displayMode: true },
          { kind: 'text', content: 'Now calculate.' },
          { kind: 'math', content: String.raw`${unknownSymbol} = ${ans}`, displayMode: true },
        ];
      }

      // surface area
      const ans = unknown === 'l' ? l : unknown === 'w' ? w : h;

      if (unknown === 'h') {
        return [
          { kind: 'text', content: 'This is a cuboid surface-area question.' },
          { kind: 'text', content: 'Start with the cuboid surface-area formula.' },
          { kind: 'math', content: String.raw`S = 2(lw + lh + wh)`, displayMode: true },
          { kind: 'text', content: 'Substitute the given values for S, l and w.' },
          { kind: 'math', content: String.raw`${sa} = 2(${l}\cdot ${w} + ${l}h + ${w}h)`, displayMode: true },
          { kind: 'text', content: 'Divide both sides by 2.' },
          { kind: 'math', content: String.raw`\frac{${sa}}{2} = ${l * w} + ${l}h + ${w}h`, displayMode: true },
          { kind: 'text', content: 'Subtract lw from both sides.' },
          { kind: 'math', content: String.raw`\frac{${sa}}{2} - ${l * w} = ${l}h + ${w}h`, displayMode: true },
          { kind: 'text', content: 'Factorise h.' },
          { kind: 'math', content: String.raw`\frac{${sa}}{2} - ${l * w} = h(${l}+${w})`, displayMode: true },
          { kind: 'text', content: 'Divide by (l+w).' },
          { kind: 'math', content: String.raw`h = \frac{\frac{${sa}}{2} - ${l * w}}{${l}+${w}}`, displayMode: true },
          { kind: 'text', content: 'Calculate.' },
          { kind: 'math', content: String.raw`h = ${ans}`, displayMode: true },
        ];
      }

      if (unknown === 'l') {
        // Solve for l: S/2 = l(w+h) + wh
        return [
          { kind: 'text', content: 'This is a cuboid surface-area question.' },
          { kind: 'math', content: String.raw`S = 2(lw + lh + wh)`, displayMode: true },
          { kind: 'text', content: 'Substitute the given values (w and h known, l unknown).' },
          { kind: 'math', content: String.raw`${sa} = 2(l\cdot ${w} + l\cdot ${h} + ${w}\cdot ${h})`, displayMode: true },
          { kind: 'text', content: 'Divide both sides by 2.' },
          { kind: 'math', content: String.raw`\frac{${sa}}{2} = l(${w}+${h}) + ${w * h}`, displayMode: true },
          { kind: 'text', content: 'Subtract wh from both sides.' },
          { kind: 'math', content: String.raw`\frac{${sa}}{2} - ${w * h} = l(${w}+${h})`, displayMode: true },
          { kind: 'text', content: 'Divide by (w+h) to solve for l.' },
          { kind: 'math', content: String.raw`l = \frac{\frac{${sa}}{2} - ${w * h}}{${w}+${h}}`, displayMode: true },
          { kind: 'text', content: 'Calculate.' },
          { kind: 'math', content: String.raw`l = ${ans}`, displayMode: true },
        ];
      }

      // unknown === 'w'
      return [
        { kind: 'text', content: 'This is a cuboid surface-area question.' },
        { kind: 'math', content: String.raw`S = 2(lw + lh + wh)`, displayMode: true },
        { kind: 'text', content: 'Substitute the given values (l and h known, w unknown).' },
        { kind: 'math', content: String.raw`${sa} = 2(${l}\cdot w + ${l}\cdot ${h} + w\cdot ${h})`, displayMode: true },
        { kind: 'text', content: 'Divide both sides by 2.' },
        { kind: 'math', content: String.raw`\frac{${sa}}{2} = w(${l}+${h}) + ${l * h}`, displayMode: true },
        { kind: 'text', content: 'Subtract lh from both sides.' },
        { kind: 'math', content: String.raw`\frac{${sa}}{2} - ${l * h} = w(${l}+${h})`, displayMode: true },
        { kind: 'text', content: 'Divide by (l+h) to solve for w.' },
        { kind: 'math', content: String.raw`w = \frac{\frac{${sa}}{2} - ${l * h}}{${l}+${h}}`, displayMode: true },
        { kind: 'text', content: 'Calculate.' },
        { kind: 'math', content: String.raw`w = ${ans}`, displayMode: true },
      ];
    })();

    const expl = scaffoldExplanation({
      title: measureKind === 'surface_area'
        ? 'Mensuration: find a missing cuboid dimension from surface area.'
        : 'Mensuration: find a missing cuboid dimension from volume.',
      givens:
        measureKind === 'surface_area'
          ? [`l=${l} cm`, `w=${w} cm`, `h=${h} cm`, `S=${sa} cm² (one dimension is unknown in the question)`]
          : [`l=${l} cm`, `w=${w} cm`, `h=${h} cm`, `V=${vol} cm³ (one dimension is unknown in the question)`],
      goal: `Find the ${unknownLabel} ${unknownSymbol} (in cm).`,
      method:
        measureKind === 'surface_area'
          ? [
              'Use the surface area formula S = 2(lw + lh + wh).',
              'Substitute the known dimensions and the given surface area.',
              'Rearrange to isolate the missing dimension.',
            ]
          : [
              'Use the volume formula V = lwh.',
              'Substitute the known dimensions and the given volume.',
              'Divide by the product of the two known dimensions to get the missing one.',
            ],
      working,
      checks: [
        `${unknownSymbol} must be positive because it is a length.`,
        `Units: ${unknownSymbol} should be in cm.`,
        measureKind === 'surface_area'
          ? 'Substitute the answer back into S = 2(lw+lh+wh) to check you get the given surface area.'
          : 'Substitute the answer back into V = lwh to check you get the given volume.',
      ],
    });

    return mk({
      idSuffix: `${sub}-${measureKind}-${unknown}-${l}-${w}-${h}`,
      katexQuestion: q,
      katexExplanation: expl,
      answerKind: 'integer',
      expectedNumber: unknown === 'l' ? l : unknown === 'w' ? w : h,
    });
  }

  if (variantId === 'probability_complement') {
    // P(not A) = 1 - P(A)
    const easy = [0.1, 0.2, 0.25, 0.3, 0.4, 0.6, 0.7, 0.75, 0.8, 0.9];
    const medium = [0.15, 0.2, 0.35, 0.45, 0.55, 0.65, 0.25, 0.75, 0.85, 0.95];
    const hard = [0.12, 0.18, 0.27, 0.33, 0.41, 0.58, 0.63, 0.74, 0.86, 0.93];
    const p = (input.difficulty === 'easy' ? easy : input.difficulty === 'medium' ? medium : hard)[sub];

    const scenarios =
      input.difficulty === 'easy'
        ? [
            { item: 'a wooden toy', context: 'from a box of toys' },
            { item: 'a red sweet', context: 'from a bag of sweets' },
            { item: 'a blue ball', context: 'from a basket of balls' },
            { item: 'a book with a blue cover', context: 'from a shelf' },
            { item: 'a cat sticker', context: 'from a sticker pack' },
            { item: 'a triangle card', context: 'from a pack of cards' },
            { item: 'a green pen', context: 'from a pencil case' },
            { item: 'a chocolate biscuit', context: 'from a tin of biscuits' },
            { item: 'a pencil', context: 'from a pot of stationery' },
            { item: 'a toy car', context: 'from a toy box' },
          ]
        : input.difficulty === 'medium'
          ? [
              { item: 'a blue marble', context: 'from a bag of marbles' },
              { item: 'a black sock', context: 'from a drawer of socks' },
              { item: 'a striped card', context: 'from a deck of cards' },
              { item: 'a green bead', context: 'from a jar of beads' },
              { item: 'a lemon sweet', context: 'from a sweet jar' },
              { item: 'a small toy', context: 'from a box of toys' },
              { item: 'a sports sticker', context: 'from a sticker pack' },
              { item: 'a science book', context: 'from a pile of books' },
              { item: 'a red counter', context: 'from a bag of counters' },
              { item: 'a square tile', context: 'from a bag of tiles' },
            ]
          : [
              { item: 'a faulty component', context: 'from a batch of components' },
              { item: 'a defective bulb', context: 'from a box of bulbs' },
              { item: 'a scratched phone screen', context: 'from a shipment' },
              { item: 'a wrong ticket', context: 'from a stack of tickets' },
              { item: 'a damaged package', context: 'from a delivery' },
              { item: 'a misprinted label', context: 'from a roll of labels' },
              { item: 'a bent coin', context: 'from a coin jar' },
              { item: 'a broken key', context: 'from a bunch of keys' },
              { item: 'a cracked tile', context: 'from a box of tiles' },
              { item: 'a leaking bottle', context: 'from a crate of bottles' },
            ];

    const scenario = scenarios[sub];
    const item = scenario.item;
    const notItem = `not ${item}`;
    const eventName = item.replace(/^a\s+/i, '');

    const promptStyle = sub % 2;
    const line1 =
      promptStyle === 0
        ? String.raw`\text{The probability of picking ${item} ${scenario.context} is }${p}.`
        : String.raw`\text{A random item is chosen ${scenario.context}.}`;
    const line2 =
      promptStyle === 0
        ? String.raw`\text{Work out the probability of picking ${notItem}.}`
        : String.raw`\text{Given that }P(\text{${eventName}})=${p}\text{, find }P(\text{not ${eventName}})\text{.}`;
    const NL = String.raw`\\`;
    const q = [line1, line2].join(NL);

    const ans = Number(asFixed2(1 - p));
    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Micro-step: identify the event and its complement.' },
      { kind: 'math', content: String.raw`A = \text{“${eventName}”}`, displayMode: true },
      { kind: 'math', content: String.raw`\text{complement of }A = \text{“not ${eventName}”}`, displayMode: true },
      { kind: 'text', content: 'Write the complement rule.' },
      { kind: 'math', content: String.raw`P(\text{not }A) = 1 - P(A)`, displayMode: true },
      { kind: 'text', content: 'Substitute the given probability.' },
      { kind: 'math', content: String.raw`P(\text{not }A) = 1 - ${p}`, displayMode: true },
      { kind: 'text', content: 'Calculate the subtraction.' },
      { kind: 'math', content: String.raw`P(\text{not }A) = ${asFixed2(1 - p)}`, displayMode: true },
    ];

    const expl = scaffoldExplanation({
      title: 'Probability: using the complement.',
      givens: [`P(${eventName}) = ${p}`, '“Event” and “not event” cover all outcomes, so probabilities add to 1'],
      goal: `Find P(not ${eventName}).`,
      method: ['Use P(not A) = 1 − P(A).', 'Substitute the given value and subtract.'],
      working,
      checks: ['Your answer must be between 0 and 1.', 'P(A) + P(not A) should equal 1.'],
    });

    return mk({
      idSuffix: `${sub}-${p}`,
      katexQuestion: q,
      katexExplanation: expl,
      answerKind: 'decimal_2dp',
      expectedNumber: ans,
    });
  }

  if (variantId === 'coordinate_intercept') {
    // 10 variants total (sub = 0..9) with different equation forms.
    // The y-intercept is always found by setting x = 0 and computing y = f(0).

    const templates: Array<{
      kindLabel: string;
      latex: (p: any) => string;
      fn: (p: any) => (x: number) => number;
      params: (difficulty: PracticeDifficulty) => any;
    }> = [
      // 0) linear
      {
        kindLabel: 'line',
        params: (d) => {
          const mBank = d === 'easy' ? [2, 3, 4] : d === 'medium' ? [-5, -3, 2, 4, 6] : [-7, -5, -4, 3, 8];
          const cBank = d === 'easy' ? [-6, -3, 4, 7] : d === 'medium' ? [-10, -6, -2, 3, 8] : [-12, -9, -4, 5, 11];
          return { m: mBank[sub % mBank.length], c: cBank[sub % cBank.length] };
        },
        latex: ({ m, c }) => `y=${m}x${c >= 0 ? '+' : ''}${c}`,
        fn: ({ m, c }) => (x) => m * x + c,
      },
      // 1) quadratic ax^2 + c
      {
        kindLabel: 'curve',
        params: (d) => {
          const aBank = d === 'easy' ? [1, 2] : d === 'medium' ? [-2, -1, 1, 3] : [-3, -2, 2, 4];
          const cBank = d === 'easy' ? [-6, -2, 3, 7] : d === 'medium' ? [-10, -5, 4, 9] : [-12, -8, 5, 11];
          return { a: aBank[sub % aBank.length], c: cBank[sub % cBank.length] };
        },
        latex: ({ a, c }) => `y=${a}x^2${c >= 0 ? '+' : ''}${c}`,
        fn: ({ a, c }) => (x) => a * x * x + c,
      },
      // 2) cubic ax^3 + c
      {
        kindLabel: 'curve',
        params: (d) => {
          const aBank = d === 'easy' ? [1, 2] : d === 'medium' ? [-2, 1, 3] : [-3, -2, 2, 4];
          const cBank = d === 'easy' ? [-5, 0, 6] : d === 'medium' ? [-9, -3, 4, 10] : [-12, -6, 5, 11];
          return { a: aBank[sub % aBank.length], c: cBank[sub % cBank.length] };
        },
        latex: ({ a, c }) => `y=${a}x^3${c >= 0 ? '+' : ''}${c}`,
        fn: ({ a, c }) => (x) => a * x * x * x + c,
      },
      // 3) absolute value |x| + c
      {
        kindLabel: 'graph',
        params: (d) => {
          const cBank = d === 'easy' ? [-4, 2, 6] : d === 'medium' ? [-7, -2, 3, 8] : [-10, -4, 5, 12];
          return { c: cBank[sub % cBank.length] };
        },
        latex: ({ c }) => `y=|x|${c >= 0 ? '+' : ''}${c}`,
        fn: ({ c }) => (x) => Math.abs(x) + c,
      },
      // 4) shifted quadratic (x-2)^2 + c
      {
        kindLabel: 'curve',
        params: (d) => {
          const cBank = d === 'easy' ? [-6, -1, 4, 8] : d === 'medium' ? [-10, -4, 3, 9] : [-12, -7, 5, 11];
          return { c: cBank[sub % cBank.length] };
        },
        latex: ({ c }) => `y=(x-2)^2${c >= 0 ? '+' : ''}${c}`,
        fn: ({ c }) => (x) => (x - 2) * (x - 2) + c,
      },
      // 5) reciprocal 2/(x+1) + c
      {
        kindLabel: 'graph',
        params: (d) => {
          const cBank = d === 'easy' ? [-4, 0, 5] : d === 'medium' ? [-7, -2, 3, 8] : [-10, -5, 4, 11];
          return { c: cBank[sub % cBank.length] };
        },
        latex: ({ c }) => `y=\\frac{2}{x+1}${c >= 0 ? '+' : ''}${c}`,
        fn: ({ c }) => (x) => 2 / (x + 1) + c,
      },
      // 6) exponential 2^x + c
      {
        kindLabel: 'curve',
        params: (d) => {
          const cBank = d === 'easy' ? [-2, 0, 3, 6] : d === 'medium' ? [-5, -1, 4, 8] : [-8, -3, 5, 10];
          return { c: cBank[sub % cBank.length] };
        },
        latex: ({ c }) => `y=2^x${c >= 0 ? '+' : ''}${c}`,
        fn: ({ c }) => (x) => Math.pow(2, x) + c,
      },
      // 7) square root sqrt(x+4) + c
      {
        kindLabel: 'curve',
        params: (d) => {
          const cBank = d === 'easy' ? [-3, 0, 4] : d === 'medium' ? [-6, -2, 3, 7] : [-9, -4, 5, 10];
          return { c: cBank[sub % cBank.length] };
        },
        latex: ({ c }) => `y=\\sqrt{x+4}${c >= 0 ? '+' : ''}${c}`,
        fn: ({ c }) => (x) => Math.sqrt(Math.max(0, x + 4)) + c,
      },
      // 8) sine sin(x) + c
      {
        kindLabel: 'curve',
        params: (d) => {
          const cBank = d === 'easy' ? [-2, 1, 4] : d === 'medium' ? [-5, -1, 3, 7] : [-8, -3, 5, 10];
          return { c: cBank[sub % cBank.length] };
        },
        latex: ({ c }) => `y=\\sin(x)${c >= 0 ? '+' : ''}${c}`,
        fn: ({ c }) => (x) => Math.sin(x) + c,
      },
      // 9) mixed polynomial ax^2 + bx + c
      {
        kindLabel: 'curve',
        params: (d) => {
          const aBank = d === 'easy' ? [1, 2] : d === 'medium' ? [-2, -1, 1, 3] : [-3, -2, 2, 4];
          const bBank = d === 'easy' ? [-3, -1, 2, 4] : d === 'medium' ? [-6, -3, 2, 5] : [-8, -5, 3, 7];
          const cBank = d === 'easy' ? [-5, -2, 3, 7] : d === 'medium' ? [-9, -4, 4, 10] : [-12, -6, 5, 12];
          return {
            a: aBank[sub % aBank.length],
            b: bBank[sub % bBank.length],
            c: cBank[sub % cBank.length],
          };
        },
        latex: ({ a, b, c }) => {
          const bTerm = b === 0 ? '' : `${b >= 0 ? '+' : ''}${b}x`;
          return `y=${a}x^2${bTerm}${c >= 0 ? '+' : ''}${c}`;
        },
        fn: ({ a, b, c }) => (x) => a * x * x + b * x + c,
      },
    ];

    const template = templates[sub];
    const p = template.params(input.difficulty);
    const eqLatex = template.latex(p);
    const fn = template.fn(p);
    const y0 = fn(0);

    const noun = template.kindLabel === 'line' ? 'line' : 'graph';
    const q = String.raw`\text{The ${noun} is }${eqLatex}\\\text{Find the }y\text{-intercept value.}`;

    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Micro-step: recall what the y-axis represents.' },
      { kind: 'math', content: String.raw`\text{On the }y\text{-axis, }x=0`, displayMode: true },
      { kind: 'text', content: 'So to find the y-intercept, we substitute x = 0 into the equation.' },
      { kind: 'math', content: String.raw`y = f(0)`, displayMode: true },
      { kind: 'text', content: 'Substitute x = 0 into the given equation.' },
      { kind: 'math', content: String.raw`y = ${eqLatex.replace(/^y=/, '')}\;\text{ with }x=0`, displayMode: true },
      { kind: 'text', content: 'Now evaluate the expression.' },
      { kind: 'math', content: String.raw`y = ${Number.isFinite(y0) ? y0 : '0'}`, displayMode: true },
      { kind: 'text', content: 'So the y-intercept value is the y-value when x = 0.' },
      { kind: 'text', content: 'Micro-step: interpret the result. The graph crosses the y-axis at the point (0, y-intercept).' },
    ];

    const pad = input.difficulty === 'easy' ? 6 : input.difficulty === 'medium' ? 8 : 10;
    const xMin = -6;
    const xMax = 6;
    const sampleN = 25;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < sampleN; i++) {
      const x = xMin + (i / (sampleN - 1)) * (xMax - xMin);
      const y = fn(x);
      if (!Number.isFinite(y)) continue;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
      minY = y0 - 10;
      maxY = y0 + 10;
    }
    const yMin = Math.floor(Math.min(minY, y0) - pad);
    const yMax = Math.ceil(Math.max(maxY, y0) + pad);

    const graphSpec = {
      width: 620,
      height: 360,
      window: { xMin, xMax, yMin, yMax },
      plot: [
        { kind: 'function' as const, fn, stroke: '#111827', strokeWidth: 2 },
        { kind: 'point' as const, at: { x: 0, y: y0 }, r: 5, fill: '#dc2626', stroke: '#7f1d1d', strokeWidth: 1 },
        { kind: 'label' as const, at: { x: 0.25, y: y0 + 0.5 }, text: `(0, ${y0})`, fill: '#111827', fontSize: 12, anchor: 'start' },
        { kind: 'label' as const, at: { x: 0.25, y: y0 - 1.2 }, text: 'y-intercept', fill: '#6b7280', fontSize: 12, anchor: 'start' },
      ],
      caption: 'The y-intercept is where the graph crosses the y-axis (x = 0).',
    };

    const expl = scaffoldExplanation({
      title: 'Coordinate geometry: finding the y-intercept value.',
      givens: [`Equation: ${eqLatex}`],
      goal: 'Find the y-intercept value.',
      method: ['Use the fact that points on the y-axis have x = 0.', 'Substitute x = 0 into the equation.', 'Evaluate to get the y-value.'],
      working,
      checks: ['Your answer should match the highlighted point on the graph at x = 0.'],
    });

    const explWithGraph: KatexExplanationBlock[] = [
      { kind: 'graph', graphSpec, altText: `Graph of ${eqLatex} with y-intercept highlighted at (0, ${y0}).` },
      ...expl,
    ];

    return mk({
      idSuffix: `${sub}-coord`,
      katexQuestion: q,
      katexExplanation: explWithGraph,
      answerKind: 'integer',
      expectedNumber: y0,
    });
  }

  if (variantId === 'unit_conversion_speed') {
    // km/h to m/s: multiply by 1000/3600 = 5/18
    // Choose km/h values that convert to clean m/s values.
    // Since m/s = km/h ÷ 3.6, choosing km/h in multiples of 3.6 often yields integers.
    const easy = [3.6, 7.2, 10.8, 14.4, 18.0, 21.6, 25.2, 28.8, 32.4, 36.0];
    const medium = [7.2, 10.8, 14.4, 18.0, 21.6, 25.2, 28.8, 32.4, 36.0, 39.6];
    const hard = [10.8, 14.4, 18.0, 21.6, 25.2, 28.8, 32.4, 36.0, 39.6, 43.2];
    const kmh = (input.difficulty === 'easy' ? easy : input.difficulty === 'medium' ? medium : hard)[sub];
    const ms = (kmh * 5) / 18;
    const q = String.raw`\text{Convert }${kmh}~\mathrm{km/h}\text{ into }\mathrm{m/s}\text{.}`;

    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Micro-step: write the speed as a fraction to see the unit conversion clearly.' },
      { kind: 'math', content: String.raw`${kmh}~\mathrm{km/h} = \frac{${kmh}\,\mathrm{km}}{1\,\mathrm{h}}`, displayMode: true },
      { kind: 'text', content: 'Write the key conversions.' },
      { kind: 'math', content: String.raw`1\text{ km} = 1000\text{ m}`, displayMode: true },
      { kind: 'math', content: String.raw`1\text{ h} = 3600\text{ s}`, displayMode: true },
      { kind: 'text', content: 'Convert km/h to m/s by multiplying by 1000 and dividing by 3600.' },
      { kind: 'math', content: String.raw`${kmh}~\mathrm{km/h} = \frac{${kmh}\times 1000}{3600}\,\mathrm{m/s}`, displayMode: true },
      { kind: 'text', content: 'Simplify the conversion factor:' },
      { kind: 'math', content: String.raw`\frac{1000}{3600} = \frac{5}{18}`, displayMode: true },
      { kind: 'text', content: 'Now multiply:' },
      { kind: 'math', content: String.raw`${kmh}\times \frac{5}{18} = ${asFixed2(ms)}\,\mathrm{m/s}`, displayMode: true },
      { kind: 'text', content: 'Micro-step: round to 2 decimal places as requested.' },
    ];

    const expl = scaffoldExplanation({
      title: 'Units: converting speed from km/h to m/s.',
      givens: [`speed = ${kmh} km/h`],
      goal: 'Find the speed in m/s.',
      method: ['Convert km to m (×1000).', 'Convert h to s (÷3600).', 'Combine the steps into one calculation.'],
      working,
      checks: ['km/h usually becomes a smaller number in m/s.', 'Final unit must be m/s.'],
    });

    return mk({
      idSuffix: `${kmh}`,
      katexQuestion: q,
      katexExplanation: expl,
      answerKind: 'decimal_2dp',
      expectedNumber: Number(asFixed2(ms)),
    });
  }

  if (variantId === 'greatest_odd_common_factor') {
    const bank: Array<{ a: number; b: number }> = [
      { a: 140, b: 210 },
      { a: 84, b: 126 },
      { a: 96, b: 144 },
      { a: 90, b: 210 },
      { a: 150, b: 210 },
      { a: 72, b: 180 },
      { a: 120, b: 168 },
      { a: 200, b: 260 },
      { a: 132, b: 198 },
      { a: 108, b: 162 },
    ];

    const pair = bank[sub];
    const a = pair.a;
    const b = pair.b;

    const gcd = (x: number, y: number): number => {
      let A = Math.abs(x);
      let B = Math.abs(y);
      while (B !== 0) {
        const t = A % B;
        A = B;
        B = t;
      }
      return A;
    };

    const fullGcd = gcd(a, b);

    const q = String.raw`\text{Find the greatest common factor of }${a}\text{ and }${b}\text{.}`;

    const listFactors = (n: number) => {
      const out: number[] = [];
      for (let i = 1; i <= Math.floor(Math.sqrt(n)); i += 1) {
        if (n % i !== 0) continue;
        out.push(i);
        const j = n / i;
        if (j !== i) out.push(j);
      }
      out.sort((x, y) => x - y);
      return out;
    };

    const fa = listFactors(a);
    const fb = listFactors(b);
    const fmt = (xs: number[]) => xs.join(', ');

    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: `The factors of ${a} are: ${fmt(fa)}` },
      { kind: 'text', content: `The factors of ${b} are: ${fmt(fb)}` },
      { kind: 'text', content: `The greatest common factor is ${fullGcd}.` },
    ];

    const expl = scaffoldExplanation({
      title: 'Number theory: greatest common factor (GCF/HCF).',
      givens: [`Numbers: ${a} and ${b}`],
      goal: 'Find the greatest common factor (largest number that divides both).',
      method: [
        'List the factors of each number.',
        'Find the largest factor that appears in both lists.',
      ],
      working,
      checks: ['It must divide both numbers with no remainder.', 'It cannot be larger than either number.'],
    });

    return mk({
      idSuffix: `${a}-${b}`,
      katexQuestion: q,
      katexExplanation: expl,
      answerKind: 'integer',
      expectedNumber: fullGcd,
    });
  }

  if (variantId === 'compound_interest_rate') {
    const who = pickName(input.seed, sub, 0);

    const bank: Array<{ p: number; years: number; r: number }> = [
      { p: 1500, years: 8, r: 1.25 },
      { p: 1200, years: 6, r: 2.5 },
      { p: 2000, years: 5, r: 3.0 },
      { p: 1750, years: 10, r: 1.5 },
      { p: 900, years: 4, r: 4.0 },
      { p: 2500, years: 7, r: 2.0 },
      { p: 1600, years: 9, r: 1.75 },
      { p: 1100, years: 3, r: 5.0 },
      { p: 3000, years: 12, r: 1.2 },
      { p: 1400, years: 6, r: 2.25 },
    ];

    const row = bank[sub];
    const P = row.p;
    const n = row.years;
    const r = row.r;
    const A = Number(asFixed2(P * Math.pow(1 + r / 100, n)));

    const q = String.raw`\text{${who} invests }\$${P}\text{ in an account.}\\
\text{The account pays compound interest at a rate of }r\%\text{ per year.}\\
\text{At the end of }${n}\text{ years the value of the investment is }\$${A}\text{.}\\
\text{Find the value of }r\text{.}`;

    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Micro-step: identify the compound interest formula.' },
      { kind: 'math', content: String.raw`A = P\left(1+\frac{r}{100}\right)^{n}`, displayMode: true },
      { kind: 'text', content: 'Substitute the values from the question.' },
      { kind: 'math', content: String.raw`${A} = ${P}\left(1+\frac{r}{100}\right)^{${n}}`, displayMode: true },
      { kind: 'text', content: 'Divide both sides by P to isolate the power term.' },
      { kind: 'math', content: String.raw`\frac{${A}}{${P}} = \left(1+\frac{r}{100}\right)^{${n}}`, displayMode: true },
      { kind: 'text', content: 'Take the nth root of both sides to remove the power.' },
      { kind: 'math', content: String.raw`\left(\frac{${A}}{${P}}\right)^{\frac{1}{${n}}} = 1+\frac{r}{100}`, displayMode: true },
      { kind: 'text', content: 'Subtract 1 from both sides.' },
      { kind: 'math', content: String.raw`\left(\frac{${A}}{${P}}\right)^{\frac{1}{${n}}} - 1 = \frac{r}{100}`, displayMode: true },
      { kind: 'text', content: 'Multiply by 100 to get r.' },
      { kind: 'math', content: String.raw`r = 100\left(\left(\frac{${A}}{${P}}\right)^{\frac{1}{${n}}} - 1\right) \approx ${asFixed2(r)}`, displayMode: true },
      { kind: 'text', content: 'Final answer: the interest rate r (% per year).' },
    ];

    const expl = scaffoldExplanation({
      title: 'Finance: compound interest (solve for the rate).',
      givens: [`Initial amount P = $${P}`, `Final amount A = $${A}`, `Time n = ${n} years`],
      goal: 'Find the annual interest rate r%.',
      method: [
        'Use A = P(1 + r/100)^n.',
        'Rearrange to make (1 + r/100) the subject using division and an nth root.',
        'Multiply by 100 to convert from a decimal rate to a percentage rate.',
      ],
      working,
      checks: ['r should be positive in this context.', 'A should be greater than P if r is positive.', 'Substitute r back into the formula to see if you get A (approximately).'],
    });

    return mk({
      idSuffix: `${sub}-${P}-${n}-${A}`,
      katexQuestion: q,
      katexExplanation: expl,
      answerKind: 'decimal_2dp',
      expectedNumber: Number(asFixed2(r)),
    });
  }

  if (variantId === 'probability_two_bags_blue') {
    const picked = pickTwoDistinctNames(input.seed, sub);
    const nameA = picked.a;
    const nameB = picked.b;

    // Pick values that keep all derived probabilities "nice".
    // pRedB = pBothRed / pRedA, and we want pRedB and pBothBlue to be simple decimals.
    const bank: Array<{ pRedA: number; pBothRed: number }> = [
      // pRedA=0.4, pRedB=0.5
      { pRedA: 0.4, pBothRed: 0.20 },
      // pRedA=0.25, pRedB=0.6
      { pRedA: 0.25, pBothRed: 0.15 },
      // pRedA=0.5, pRedB=0.4
      { pRedA: 0.5, pBothRed: 0.20 },
      // pRedA=0.6, pRedB=0.5
      { pRedA: 0.6, pBothRed: 0.30 },
      // pRedA=0.2, pRedB=0.75
      { pRedA: 0.2, pBothRed: 0.15 },
      // pRedA=0.75, pRedB=0.4
      { pRedA: 0.75, pBothRed: 0.30 },
      // pRedA=0.3, pRedB=0.5
      { pRedA: 0.3, pBothRed: 0.15 },
      // pRedA=0.8, pRedB=0.25
      { pRedA: 0.8, pBothRed: 0.20 },
      // pRedA=0.4, pRedB=0.25
      { pRedA: 0.4, pBothRed: 0.10 },
      // pRedA=0.5, pRedB=0.75
      { pRedA: 0.5, pBothRed: 0.375 },
    ];

    const row = bank[sub];
    const pRedA = row.pRedA;
    const pBothRed = row.pBothRed;
    const pRedB = pBothRed / pRedA;
    const pBlueA = 1 - pRedA;
    const pBlueB = 1 - pRedB;
    const pBothBlue = Number(asFixed2(pBlueA * pBlueB));

    const q = String.raw`\text{Bag }A\text{ and bag }B\text{ each contain red counters and blue counters only.}\\
\text{${nameA} picks a counter at random from bag }A\text{ and ${nameB} picks a counter at random from bag }B\text{.}\\
\text{The probability that ${nameA} picks a red counter is }${pRedA}\text{.}\\
\text{The probability that ${nameA} and ${nameB} both pick a red counter is }${pBothRed}\text{.}\\
\text{Find the probability that ${nameA} and ${nameB} both pick a blue counter.}`;

    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Micro-step: write down what you know.' },
      { kind: 'math', content: String.raw`P(\text{${nameA} red}) = ${pRedA}`, displayMode: true },
      { kind: 'math', content: String.raw`P(\text{both red}) = ${pBothRed}`, displayMode: true },
      { kind: 'text', content: 'Assumption used in this standard model: the two picks are independent because they come from different bags.' },
      { kind: 'text', content: 'So:' },
      { kind: 'math', content: String.raw`P(\text{both red}) = P(\text{${nameA} red})\times P(\text{${nameB} red})`, displayMode: true },
      { kind: 'text', content: 'Rearrange to find P(nameB red).' },
      { kind: 'math', content: String.raw`P(\text{${nameB} red}) = \frac{P(\text{both red})}{P(\text{${nameA} red})} = \frac{${pBothRed}}{${pRedA}} = ${asFixed2(pRedB)}`, displayMode: true },
      { kind: 'text', content: 'Now convert red to blue using the complement rule (only red or blue).' },
      { kind: 'math', content: String.raw`P(\text{${nameA} blue}) = 1 - ${pRedA} = ${asFixed2(pBlueA)}`, displayMode: true },
      { kind: 'math', content: String.raw`P(\text{${nameB} blue}) = 1 - ${asFixed2(pRedB)} = ${asFixed2(pBlueB)}`, displayMode: true },
      { kind: 'text', content: 'Multiply to get the probability both are blue.' },
      { kind: 'math', content: String.raw`P(\text{both blue}) = ${asFixed2(pBlueA)}\times ${asFixed2(pBlueB)} = ${asFixed2(pBlueA * pBlueB)}`, displayMode: true },
      { kind: 'text', content: 'Final answer: probability both pick a blue counter.' },
    ];

    const expl = scaffoldExplanation({
      title: 'Probability: two independent picks (two bags).',
      givens: [`Only red or blue in each bag`, `P(${nameA} red) = ${pRedA}`, `P(both red) = ${pBothRed}`],
      goal: `Find P(${nameA} blue and ${nameB} blue).`,
      method: [
        'Use independence: P(both red) = P(A red) × P(B red).',
        'Rearrange to find P(B red).',
        'Use complements to find P(A blue) and P(B blue).',
        'Multiply to get P(both blue).',
      ],
      working,
      checks: ['All probabilities must be between 0 and 1.', 'P(B red) should also be between 0 and 1.', 'The final probability should not exceed either individual blue probability.'],
    });

    return mk({
      idSuffix: `${sub}-${pRedA}-${pBothRed}`,
      katexQuestion: q,
      katexExplanation: expl,
      answerKind: 'decimal_2dp',
      expectedNumber: pBothBlue,
    });
  }

  if (variantId === 'bus_pass_increases') {
    // 10 deterministic variants. Vary start year, base cost, and annual % increases.
    // Use friendly numbers so the final answer is usually an integer or a simple .00/.20/.25/.50/.75 style decimal.
    // Percent increases are mostly 5/10/20 to keep multipliers simple.
    const bank: Array<{ startYear: number; baseCost: number; increases: number[] }> = [
      { startYear: 2022, baseCost: 50, increases: [10, 5] }, // 57.75
      { startYear: 2021, baseCost: 40, increases: [10, 10] }, // 48.40
      { startYear: 2020, baseCost: 60, increases: [5, 5] }, // 66.15
      { startYear: 2019, baseCost: 80, increases: [20] }, // 96.00
      { startYear: 2023, baseCost: 40, increases: [5] }, // 42.00
      { startYear: 2018, baseCost: 100, increases: [10, 5, 5] }, // 121.28
      { startYear: 2022, baseCost: 30, increases: [10, 20] }, // 39.60
      { startYear: 2020, baseCost: 75, increases: [10, 10, 10] }, // 99.83
      { startYear: 2021, baseCost: 120, increases: [5, 10] }, // 138.60
      { startYear: 2017, baseCost: 50, increases: [20, 5] }, // 63.00
    ];

    const row = bank[sub];
    const startYear = row.startYear;
    const baseCost = row.baseCost;
    const increases = row.increases;
    const targetYear = startYear + increases.length;

    let value = baseCost;
    for (const pct of increases) {
      value = value * (1 + pct / 100);
    }
    const finalCost = Number(asFixed2(value));

    const lines: string[] = [];
    lines.push(String.raw`\text{The cost of a bus pass increases every year.}`);
    lines.push(String.raw`\text{On 1st January ${startYear} a bus pass costs }\$${baseCost}\text{.}`);
    increases.forEach((pct, idx) => {
      const y = startYear + idx + 1;
      lines.push(String.raw`\text{On 1st January ${y} the cost of the bus pass increases by }${pct}\%\text{.}`);
    });
    lines.push(String.raw`\text{Calculate the cost of the bus pass on 1st January ${targetYear}.}`);

    const q = lines.join('\\\n');

    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'A percentage increase means multiply by a multiplier.' },
      { kind: 'text', content: 'If something increases by p%, the multiplier is (1 + p/100).' },
      { kind: 'math', content: String.raw`\text{new} = \text{old}\times\left(1+\frac{p}{100}\right)`, displayMode: true },
      { kind: 'text', content: `Start value (on 1st Jan ${startYear}) is $${baseCost}.` },
      { kind: 'math', content: String.raw`V_0 = ${baseCost}`, displayMode: true },
      ...increases.flatMap((pct, idx) => {
        const year = startYear + idx + 1;
        const mult = 1 + pct / 100;
        const prev = idx === 0 ? baseCost : Number(asFixed2(baseCost * increases.slice(0, idx).reduce((acc, p) => acc * (1 + p / 100), 1)));
        const next = Number(asFixed2(prev * mult));
        return [
          { kind: 'text' as const, content: `Year ${year}: increase by ${pct}%, so multiply by ${asFixed2(mult)}.` },
          { kind: 'math' as const, content: String.raw`V_${idx + 1} = V_${idx}\times\left(1+\frac{${pct}}{100}\right) = ${asFixed2(prev)}\times ${asFixed2(mult)} = ${asFixed2(next)}`, displayMode: true },
        ];
      }),
      { kind: 'text', content: 'After applying all increases, round the final answer to 2 decimal places.' },
      { kind: 'math', content: String.raw`\text{Cost on 1st Jan ${targetYear}} = \$${asFixed2(finalCost)}`, displayMode: true },
    ];

    const expl = scaffoldExplanation({
      title: 'Percentages: repeated percentage increases (multi-step).',
      givens: [`Base cost on 1st Jan ${startYear}: $${baseCost}`, `Yearly increases: ${increases.map((p) => `${p}%`).join(', ')}`],
      goal: `Find the bus pass cost on 1st Jan ${targetYear}. Give the answer to 2 decimal places.`,
      method: [
        'Convert each percentage increase into a multiplier (1 + p/100).',
        'Apply the multipliers one year at a time in the correct order.',
        'Round the final cost to 2 decimal places.',
      ],
      working,
      checks: ['Each percentage increase should make the cost go up (multiplier > 1).', 'The final cost should be greater than the starting cost if increases are positive.'],
    });

    return mk({
      idSuffix: `${sub}-${startYear}-${baseCost}-${increases.join('-')}`,
      katexQuestion: q,
      katexExplanation: expl,
      answerKind: 'decimal_2dp',
      expectedNumber: finalCost,
    });
  }

  if (variantId === 'number_properties_puzzle') {
    const who = pickName(input.seed, sub, 3);
    const roles = [
      'shop owner',
      'teacher',
      'coach',
      'chef',
      'driver',
      'musician',
      'doctor',
      'engineer',
      'artist',
      'photographer',
    ];
    const role = roles[sub % roles.length];

    // Deterministic set of solvable puzzles (unique solution).
    // Conditions: x is prime; x + a is a square; x - b is a multiple of m.
    // We also store the square value to make explanations clearer.
    const bank: Array<{ x: number; a: number; b: number; m: number; square: number }> = [
      { x: 23, a: 2, b: 5, m: 9, square: 25 },
      { x: 47, a: 2, b: 2, m: 5, square: 49 },
      { x: 71, a: 10, b: 8, m: 7, square: 81 },
      { x: 97, a: 3, b: 7, m: 10, square: 100 },
      { x: 19, a: 17, b: 3, m: 4, square: 36 },
      { x: 59, a: 5, b: 5, m: 6, square: 64 },
      { x: 89, a: 32, b: 9, m: 8, square: 121 },
      { x: 43, a: 6, b: 13, m: 10, square: 49 },
      { x: 31, a: 18, b: 1, m: 3, square: 49 },
      { x: 79, a: 2, b: 4, m: 5, square: 81 },
    ];

    const row = bank[sub];
    const x = row.x;
    const a = row.a;
    const b = row.b;
    const m = row.m;
    const sq = row.square;

    // We show a small search method in the explanation.
    // Candidate x from the square condition: x = square - a. We try a small list of squares.
    const squaresToTry = Array.from({ length: 8 }, (_, i) => {
      const k = Math.max(2, Math.round(Math.sqrt(sq)) - 3 + i);
      return k * k;
    });
    const candidatesFromSquare = Array.from(new Set(squaresToTry.map((S) => S - a))).filter((v) => v > 1);
    const modTarget = ((b % m) + m) % m;

    const isPrime = (n: number) => {
      if (n < 2) return false;
      if (n % 2 === 0) return n === 2;
      for (let d = 3; d * d <= n; d += 2) {
        if (n % d === 0) return false;
      }
      return true;
    };

    const filtered = candidatesFromSquare
      .filter((v) => isPrime(v))
      .filter((v) => v % m === modTarget);

    const NL = String.raw`\\`;
    const qLines = [
      String.raw`\text{The ${role} is }x\text{ years old.}`,
      String.raw`x\text{ is a prime number.}`,
      String.raw`x+${a}\text{ is a square number.}`,
      String.raw`x-${b}\text{ is a multiple of }${m}\text{.}`,
      String.raw`\text{Find the value of }x\text{.}`,
    ];
    const q = qLines.join(NL);

    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: `We are looking for a number x (the age of ${who}, the ${role}).` },
      { kind: 'text', content: 'We must satisfy ALL conditions at the same time.' },
      { kind: 'text', content: 'Condition 1: x is prime.' },
      { kind: 'text', content: `Condition 2: x + ${a} is a perfect square.` },
      { kind: 'text', content: `Condition 3: x − ${b} is a multiple of ${m}.` },
      { kind: 'text', content: 'Step 1: Use the square condition to generate candidates.' },
      { kind: 'text', content: `If x + ${a} is a square, then x = (square) − ${a}.` },
      { kind: 'math', content: String.raw`x = S - ${a}\quad\text{where }S\text{ is a square number}`, displayMode: true },
      { kind: 'text', content: 'Try the nearby square numbers:' },
      { kind: 'math', content: String.raw`S\in\{${squaresToTry.join(', ')}\}`, displayMode: true },
      { kind: 'text', content: 'This gives possible x values:' },
      { kind: 'math', content: String.raw`x\in\{${candidatesFromSquare.join(', ')}\}`, displayMode: true },
      { kind: 'text', content: 'Step 2: Keep only the prime candidates.' },
      { kind: 'math', content: String.raw`\text{prime candidates }=\{${candidatesFromSquare.filter(isPrime).join(', ') || '\\text{none}'}\}`, displayMode: true },
      { kind: 'text', content: `Step 3: Use the multiple condition. “x − ${b} is a multiple of ${m}” means:` },
      { kind: 'math', content: String.raw`x-${b}\equiv 0\pmod{${m}}\quad\Rightarrow\quad x\equiv ${b}\pmod{${m}}`, displayMode: true },
      { kind: 'text', content: 'Filter the prime candidates using this condition.' },
      { kind: 'math', content: String.raw`\text{candidates after mod check }=\{${filtered.join(', ') || '\\text{none}'}\}`, displayMode: true },
      { kind: 'text', content: 'Only one value satisfies all conditions, so that must be x.' },
      { kind: 'math', content: String.raw`x=${x}`, displayMode: true },
      { kind: 'text', content: 'Quick check:' },
      { kind: 'math', content: String.raw`x+${a}=${x + a}=${sq}\text{ (a square)}`, displayMode: true },
      { kind: 'math', content: String.raw`x-${b}=${x - b}=${(x - b) / m}\times ${m}\text{ (a multiple of }${m}\text{)}`, displayMode: true },
    ];

    const expl = scaffoldExplanation({
      title: 'Number properties: prime + square + multiple conditions.',
      givens: [`${who} is x years old`, 'x is prime', `x+${a} is a square`, `x-${b} is a multiple of ${m}`],
      goal: 'Find x.',
      method: [
        'Use the square condition to generate a short list of possible x values.',
        'Filter the list using “x is prime”.',
        'Filter again using the multiple condition (a modular arithmetic check).',
      ],
      working,
      checks: ['The final x must be prime.', `x+${a} must be a perfect square.`, `x-${b} must be divisible by ${m}.`],
    });

    return mk({
      idSuffix: `${sub}-${x}-${a}-${b}-${m}`,
      katexQuestion: q,
      katexExplanation: expl,
      answerKind: 'integer',
      expectedNumber: x,
    });
  }

  // number_skills_mix (10 deterministic variants)
  if (sub === 0) {
    const q = String.raw`\text{Find the reciprocal of }\frac{4}{5}\text{.}`;
    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Use the rule: to find a reciprocal, swap numerator and denominator.' },
      { kind: 'math', content: String.raw`\frac{4}{5} \Rightarrow \frac{5}{4}`, displayMode: true },
      { kind: 'text', content: 'Check by multiplying.' },
      { kind: 'math', content: String.raw`\frac{4}{5}\times\frac{5}{4}=1`, displayMode: true },
    ];
    const expl = scaffoldExplanation({
      title: 'Number skill: reciprocal of a fraction.',
      givens: ['fraction = 4/5'],
      goal: 'Find the reciprocal.',
      method: ['Swap the numerator and denominator.'],
      working,
      checks: ['A number multiplied by its reciprocal equals 1.'],
    });
    return mk({ idSuffix: 'mini-recip', katexQuestion: q, katexExplanation: expl, answerKind: 'rational', expectedFraction: frac(5, 4) });
  }

  if (sub === 1) {
    const x = 4876;
    const q = String.raw`\text{Write }${x}\text{ correct to the nearest hundred.}`;
    const rounded = 4900;
    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'List the nearest hundreds around the number.' },
      { kind: 'math', content: String.raw`4800 < 4876 < 4900`, displayMode: true },
      { kind: 'text', content: 'Compute distances to each candidate.' },
      { kind: 'math', content: String.raw`4876-4800=76`, displayMode: true },
      { kind: 'math', content: String.raw`4900-4876=24`, displayMode: true },
      { kind: 'text', content: 'The smaller distance means the closer value.' },
      { kind: 'math', content: String.raw`24 < 76 \Rightarrow 4876\text{ rounds to }4900`, displayMode: true },
    ];
    const expl = scaffoldExplanation({
      title: 'Number skill: rounding to the nearest hundred.',
      givens: [`number = ${x}`],
      goal: 'Round to the nearest hundred.',
      method: ['Find the two nearest multiples of 100.', 'Choose the closer one (smallest distance).'],
      working,
      checks: ['The rounded value must be a multiple of 100.', 'It should be close to the original number.'],
    });
    return mk({ idSuffix: 'mini-round100', katexQuestion: q, katexExplanation: expl, answerKind: 'integer', expectedNumber: rounded });
  }

  if (sub === 2) {
    const p = 28;
    const q = String.raw`\text{Write }${p}\%\text{ as a decimal.}`;
    const dec = p / 100;
    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Convert percent to a fraction over 100.' },
      { kind: 'math', content: String.raw`${p}\% = \frac{${p}}{100}`, displayMode: true },
      { kind: 'text', content: 'Divide by 100 (move the decimal point two places left).' },
      { kind: 'math', content: String.raw`\frac{${p}}{100} = ${asFixed2(dec)}`, displayMode: true },
    ];
    const expl = scaffoldExplanation({
      title: 'Number skill: percentage to decimal.',
      givens: [`${p}%`],
      goal: 'Write the percentage as a decimal.',
      method: ['Divide by 100.', 'Write the result as a decimal.'],
      working,
      checks: ['Because the percent is less than 100%, the decimal should be less than 1.'],
    });
    return mk({ idSuffix: 'mini-pct28', katexQuestion: q, katexExplanation: expl, answerKind: 'decimal_2dp', expectedNumber: Number(asFixed2(dec)) });
  }

  if (sub === 3) {
    const d = 0.8;
    const q = String.raw`\text{Write }${d}\text{ as a fraction in its simplest form.}`;
    const f = parseFraction(String(d));
    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Because 0.8 has 1 decimal place, write it over 10.' },
      { kind: 'math', content: String.raw`0.8 = \frac{8}{10}`, displayMode: true },
      { kind: 'text', content: 'Simplify by dividing top and bottom by 2.' },
      { kind: 'math', content: String.raw`\frac{8}{10} = \frac{4}{5}`, displayMode: true },
    ];
    const expl = scaffoldExplanation({
      title: 'Number skill: decimal to fraction.',
      givens: [`decimal = ${d}`],
      goal: 'Write the decimal as a fraction in simplest form.',
      method: ['Write the decimal as an integer over a power of 10.', 'Simplify the fraction.'],
      working,
      checks: ['Convert back: 4/5 = 0.8, so the fraction is correct.'],
    });
    return mk({ idSuffix: 'mini-decfrac-0.8', katexQuestion: q, katexExplanation: expl, answerKind: 'rational', expectedFraction: f ?? frac(4, 5) });
  }

  if (sub === 4) {
    const q = String.raw`\text{The temperature on Monday is }-27^{\circ}\text{C. The temperature on Tuesday is }15^{\circ}\text{C higher. Work out the temperature on Tuesday.}`;
    const ans = -12;
    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Translate the words into an operation: “higher” means add.' },
      { kind: 'math', content: String.raw`\text{Tuesday} = -27 + 15`, displayMode: true },
      { kind: 'text', content: 'Calculate.' },
      { kind: 'math', content: String.raw`-27 + 15 = -12`, displayMode: true },
    ];
    const expl = scaffoldExplanation({
      title: 'Number skill: integer change in temperature.',
      givens: ['Monday = −27°C', 'Tuesday is 15°C higher'],
      goal: 'Find Tuesday’s temperature.',
      method: ['Add 15 to −27 because “higher” means increase.'],
      working,
      checks: ['The answer should be less negative than −27 because the temperature increased.'],
    });
    return mk({ idSuffix: 'mini-temp', katexQuestion: q, katexExplanation: expl, answerKind: 'integer', expectedNumber: ans });
  }

  if (sub === 5) {
    const p = 0.6;
    const q = String.raw`\text{The probability of picking a wooden toy is }${p}.\;\text{Work out the probability that the toy is not wooden.}`;
    const ans = 1 - p;
    const working: KatexExplanationBlock[] = [
      { kind: 'math', content: String.raw`P(\text{not wooden}) = 1 - P(\text{wooden})`, displayMode: true },
      { kind: 'math', content: String.raw`= 1 - ${p} = ${asFixed2(ans)}`, displayMode: true },
    ];
    const expl = scaffoldExplanation({
      title: 'Probability: complement (short form).',
      givens: [`P(wooden) = ${p}`],
      goal: 'Find P(not wooden).',
      method: ['Use P(not A) = 1 − P(A).'],
      working,
      checks: ['Answer must be between 0 and 1.', 'Probabilities of complements add to 1.'],
    });
    return mk({ idSuffix: 'mini-prob', katexQuestion: q, katexExplanation: expl, answerKind: 'decimal_2dp', expectedNumber: Number(asFixed2(ans)) });
  }

  if (sub === 6) {
    const kmh = 9.6;
    const ms = (kmh * 5) / 18;
    const q = String.raw`\text{Convert }${kmh}\text{ km/h into m/s.}`;
    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Use km/h → m/s factor 5/18.' },
      { kind: 'math', content: String.raw`${kmh}\times \frac{5}{18} = ${asFixed2(ms)}\text{ m/s}`, displayMode: true },
    ];
    const expl = scaffoldExplanation({
      title: 'Units: km/h to m/s (using the shortcut factor).',
      givens: [`speed = ${kmh} km/h`, 'conversion factor = 5/18'],
      goal: 'Find the speed in m/s.',
      method: ['Multiply the km/h value by 5/18.'],
      working,
      checks: ['Answer should be smaller than 9.6 because m/s is a smaller unit per second.'],
    });
    return mk({ idSuffix: 'mini-kmh', katexQuestion: q, katexExplanation: expl, answerKind: 'decimal_2dp', expectedNumber: Number(asFixed2(ms)) });
  }

  if (sub === 7) {
    const q = String.raw`\text{Find the coordinates where }y=3x-5\text{ crosses the }y\text{-axis.}`;
    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'At the y-axis, x = 0.' },
      { kind: 'math', content: String.raw`y = 3(0) - 5`, displayMode: true },
      { kind: 'math', content: String.raw`y = -5`, displayMode: true },
    ];
    const expl = scaffoldExplanation({
      title: 'Coordinate geometry: where a line crosses the y-axis.',
      givens: ['Line: y = 3x − 5'],
      goal: 'Find the y-intercept (the y-value at x=0).',
      method: ['Substitute x=0 to find y.', 'The y-intercept point is (0, y).'],
      working,
      checks: ['Because the constant term is −5, the graph crosses below the origin.'],
    });
    // We keep answer entry as the y-intercept value only (consistent with other coordinate_intercept type)
    return mk({ idSuffix: 'mini-yint', katexQuestion: q, katexExplanation: expl, answerKind: 'integer', expectedNumber: -5 });
  }

  if (sub === 8) {
    const q = String.raw`\text{Write }\frac{12}{30}\text{ in its simplest form.}`;
    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Find the highest common factor (HCF) of 12 and 30.' },
      { kind: 'text', content: 'The HCF is 6.' },
      { kind: 'math', content: String.raw`\frac{12}{30} = \frac{12\div 6}{30\div 6}`, displayMode: true },
      { kind: 'math', content: String.raw`= \frac{2}{5}`, displayMode: true },
    ];
    const expl = scaffoldExplanation({
      title: 'Number skill: simplifying a fraction.',
      givens: ['fraction = 12/30'],
      goal: 'Write the fraction in simplest form.',
      method: ['Find the HCF of numerator and denominator.', 'Divide numerator and denominator by the HCF.'],
      working,
      checks: ['2 and 5 have no common factor greater than 1, so it is simplest.'],
    });
    return mk({ idSuffix: 'mini-simplify', katexQuestion: q, katexExplanation: expl, answerKind: 'rational', expectedFraction: frac(2, 5) });
  }

  // sub === 9
  {
    const q = String.raw`\text{The mean of 6 numbers is }12\text{. The sum of 5 of the numbers is }55\text{. Find the sixth number.}`;
    const total = 6 * 12;
    const sixth = total - 55;
    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Use: total = mean × number of values.' },
      { kind: 'math', content: String.raw`\text{total} = 12\times 6 = ${total}`, displayMode: true },
      { kind: 'text', content: 'Subtract the sum of the 5 known numbers to get the sixth.' },
      { kind: 'math', content: String.raw`\text{sixth} = ${total} - 55 = ${sixth}`, displayMode: true },
    ];
    const expl = scaffoldExplanation({
      title: 'Statistics: mean and total.',
      givens: ['mean of 6 numbers = 12', 'sum of 5 numbers = 55'],
      goal: 'Find the 6th number.',
      method: ['Convert mean to total using total = mean × number.', 'Subtract the known sum to find the missing value.'],
      working,
      checks: ['The missing number should make the total equal to 72.', 'If you add the sixth number to 55 you should get 72.'],
    });
    return mk({ idSuffix: 'mini-mean', katexQuestion: q, katexExplanation: expl, answerKind: 'integer', expectedNumber: sixth });
  }
}
