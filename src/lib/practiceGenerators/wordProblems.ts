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
  promptText?: string;
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
    'unit_conversion_speed',
    'number_skills_mix',
    'greatest_odd_common_factor',
    'compound_interest_rate',
    'probability_two_bags_blue',
    'bus_pass_increases',
    'number_properties_puzzle',
  ];

  const probabilityVariants: WordProblemVariantId[] = [
    'probability_complement',
    'probability_two_bags_blue',
  ];

  const avoidProbabilityCategory = !!avoid && probabilityVariants.includes(avoid);
  let pool = all.filter((v) => v !== avoid);
  if (avoidProbabilityCategory) {
    const filtered = pool.filter((v) => !probabilityVariants.includes(v));
    if (filtered.length) pool = filtered;
  }
  return pool[rng.int(0, pool.length - 1)] ?? all[0];
}

function pickVariantByDifficulty(
  rng: Rng,
  difficulty: PracticeDifficulty,
  avoid?: WordProblemVariantId,
  variantWeights?: Record<string, number>
): WordProblemVariantId {
  // Keep difficulty buckets aligned with actual reasoning load.
  // - easy: single-step skills and direct substitutions
  // - medium: multi-step algebra/percent/probability structure
  // - hard: puzzle / more complex multi-constraint reasoning
  const easyPool: WordProblemVariantId[] = [
    'probability_complement',
    'unit_conversion_speed',
    'number_skills_mix',
  ];
  const mediumPool: WordProblemVariantId[] = [
    ...easyPool,
    'mensuration_cuboid_height',
    'greatest_odd_common_factor',
    'compound_interest_rate',
    'probability_two_bags_blue',
    'bus_pass_increases',
  ];
  const hardPool: WordProblemVariantId[] = [
    ...mediumPool,
    'number_properties_puzzle',
  ];

  const base = difficulty === 'easy' ? easyPool : difficulty === 'medium' ? mediumPool : hardPool;
  const pool = base.filter((v) => v !== avoid);
  const candidates = (pool.length ? pool : base);

  const w = variantWeights ?? {};
  let total = 0;
  for (const id of candidates) total += Math.max(0, Number(w[id] ?? 1));
  if (!(total > 0)) {
    return candidates[rng.int(0, candidates.length - 1)] ?? base[0];
  }

  let r = rng.next() * total;
  for (const id of candidates) {
    r -= Math.max(0, Number(w[id] ?? 1));
    if (r <= 0) return id;
  }
  return candidates[candidates.length - 1] ?? base[0];
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
  variantWeights?: Record<string, number>;
}): WordProblemQuestion {
  const rng = mulberry32(input.seed);
  const variantId = pickVariantByDifficulty(rng, input.difficulty, input.avoidVariantId, input.variantWeights);
  const sub = rng.int(0, 9);

  const mk = (payload: {
    idSuffix: string;
    promptText?: string;
    katexQuestion: string;
    katexExplanation: KatexExplanationBlock[];
    answerKind: WordProblemQuestion['answerKind'];
    expectedFraction?: Fraction;
    expectedNumber?: number;
    graphSpec?: any;
    graphAltText?: string;
  }): WordProblemQuestion => {
    const id = stableId('word-problem', input.seed, `${variantId}-${payload.idSuffix}`);
    return {
      kind: 'word_problem',
      id,
      topicId: 'word_problems',
      variantId,
      difficulty: input.difficulty,
      seed: input.seed,
      promptText: payload.promptText,
      katexQuestion: payload.katexQuestion,
      katexExplanation: payload.katexExplanation,
      answerKind: payload.answerKind,
      expectedFraction: payload.expectedFraction,
      expectedNumber: payload.expectedNumber,
      graphSpec: payload.graphSpec,
      graphAltText: payload.graphAltText,
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
        ? String.raw`\text{The total surface area is }${sa}~\mathrm{cm}^{2}\text{.}`
        : String.raw`\text{The volume is }${vol}~\mathrm{cm}^{3}\text{.}`;

    const askLine = String.raw`\text{${stem} the ${unknownLabel} }${unknownSymbol}\text{ cm.}`;
    const NL = String.raw`\\`;
    const q = [knownParts, givenMeasure, askLine].join(NL);

    const promptText = (() => {
      const first =
        unknown === 'l'
          ? `A cuboid has width ${w} cm and height ${h} cm.`
          : unknown === 'w'
            ? `A cuboid has length ${l} cm and height ${h} cm.`
            : `A cuboid has length ${l} cm and width ${w} cm.`;
      const second = measureKind === 'surface_area'
        ? `The total surface area is ${sa} cm².`
        : `The volume is ${vol} cm³.`;
      const third = `${stem} the ${unknownLabel} ${unknownSymbol} cm.`;
      return [first, second, third].join('\n');
    })();

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
      promptText,
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
        ? String.raw`\text{The probability of choosing ${item} ${scenario.context} is }${p}\text{.}`
        : String.raw`\text{An item is chosen at random ${scenario.context}.}`;
    const line2 =
      promptStyle === 0
        ? String.raw`\text{Work out the probability of choosing ${notItem}.}`
        : String.raw`\text{Given that the probability of choosing ${eventName} is }${p}\text{, find the probability of not choosing ${eventName}.}`;
    const NL = String.raw`\\`;
    const q = [line1, line2].join(NL);

    const promptText = promptStyle === 0
      ? `The probability of choosing ${item} ${scenario.context} is ${p}.\nWork out the probability of choosing ${notItem}.`
      : `An item is chosen at random ${scenario.context}.\nGiven that the probability of choosing ${eventName} is ${p}, find the probability of not choosing ${eventName}.`;

    const ans = Number(asFixed2(1 - p));
    const notEventName = `not ${eventName}`;

    const expl: KatexExplanationBlock[] = [
      { kind: 'text', content: '1) Read once (overview)' },
      { kind: 'text', content: 'Identify the event whose probability is given and confirm the question asks for the probability of the opposite outcome (the complement).' },

      { kind: 'text', content: '2) Extract the data (identify events and given probabilities)' },
      { kind: 'math', content: String.raw`A = \text{“${eventName}”}` },
      { kind: 'math', content: String.raw`P(A) = ${p}` },

      { kind: 'text', content: '3) Plan the approach (state the rule)' },
      { kind: 'math', content: String.raw`P(\text{not }A) = 1 - P(A)` },

      { kind: 'text', content: '4) Working — show full steps' },
      { kind: 'math', content: String.raw`\text{not }A = \text{“${notEventName}”}` },
      { kind: 'math', content: String.raw`P(\text{not }A) = 1 - P(A)` },
      { kind: 'math', content: String.raw`P(\text{not }A) = 1 - ${p}` },
      { kind: 'math', content: String.raw`P(\text{not }A) = ${ans}` },
      { kind: 'text', content: 'Subtracting removes the probability of the event happening from the total probability of all outcomes, which is 1.' },

      { kind: 'math', content: String.raw`\textbf{5) Checks (evidence your answer is correct)}` },
      { kind: 'text', content: 'Valid probability check:' },
      { kind: 'math', content: String.raw`0 \le ${ans} \le 1` },
      { kind: 'text', content: 'Complement check:' },
      { kind: 'math', content: String.raw`${p} + ${ans} = 1` },

      { kind: 'math', content: String.raw`\textbf{6) Final statement (clear boxed answer)}` },
      { kind: 'math', content: String.raw`\boxed{P(\text{${notEventName}}) = ${ans}.}` },
    ];

    return mk({
      idSuffix: `${sub}-${p}`,
      promptText,
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
        latex: ({ c }) => `y=\\lvert x\\rvert${c >= 0 ? '+' : ''}${c}`,
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

    const askXIntercept = template.kindLabel === 'line' && (sub % 2 === 1);
    const xIntercept = askXIntercept
      ? (() => {
          // only valid for the linear template where y = mx + c
          const m = (p as any).m as number;
          const c = (p as any).c as number;
          if (!m) return 0;
          return -c / m;
        })()
      : null;

    const noun = template.kindLabel === 'line' ? 'line' : 'graph';
    const q = askXIntercept
      ? String.raw`\text{The ${noun} is }${eqLatex}\text{. Find the }x\text{-intercept value.}`
      : String.raw`\text{The ${noun} is }${eqLatex}\text{. Find the }y\text{-intercept value.}`;

    const xIntShown = Number.isFinite(xIntercept as any) ? asFixed2(xIntercept as number).replace(/\.00$/, '') : '0';

    const expl: KatexExplanationBlock[] = askXIntercept ? [
      { kind: 'text', content: '1) Read once (overview)' },
      { kind: 'text', content: 'A graph may be shown for reference, but the intercept value should be found exactly using algebra.' },

      { kind: 'text', content: '2) Extract the data (identify the equation)' },
      { kind: 'math', content: String.raw`${eqLatex}` },

      { kind: 'text', content: '3) Plan the approach (state the rule)' },
      { kind: 'text', content: 'Points on the x-axis have y = 0. Set y = 0 and solve for x.' },
      { kind: 'math', content: String.raw`y = 0` },

      { kind: 'text', content: '4) Working — show full steps' },
      { kind: 'text', content: 'Substitute y = 0 into the equation and solve:' },
      { kind: 'math', content: String.raw`0 = ${eqLatex.replace(/^y=/, '')}` },
      { kind: 'math', content: String.raw`x = ${xIntShown}` },
      { kind: 'text', content: `Therefore, the x-intercept value is ${xIntShown}.` },

      { kind: 'math', content: String.raw`\textbf{5) Checks (evidence your answer is correct)}` },
      { kind: 'text', content: 'Axis check: x-intercepts occur at y = 0.' },
      { kind: 'text', content: 'Graph consistency check (visual only): the point should match where the graph crosses the x-axis.' },

      { kind: 'math', content: String.raw`\textbf{6) Final statement (clear boxed answer)}` },
      { kind: 'math', content: String.raw`\boxed{\text{The x-intercept is }${xIntShown}.}` },
    ] : [
      { kind: 'text', content: '1) Read once (overview)' },
      { kind: 'text', content: 'A graph may be shown for reference, but the y-intercept value should be found exactly using algebra.' },

      { kind: 'text', content: '2) Extract the data (identify the equation)' },
      { kind: 'math', content: String.raw`${eqLatex}` },

      { kind: 'text', content: '3) Plan the approach (state the rule)' },
      { kind: 'text', content: 'Points on the y-axis have x = 0. Substitute x = 0 into the equation and evaluate y.' },
      { kind: 'math', content: String.raw`x = 0` },

      { kind: 'text', content: '4) Working — show full steps' },
      { kind: 'text', content: 'Substitute x = 0 into the given equation:' },
      {
        kind: 'math',
        content: (() => {
          const rhs = eqLatex.replace(/^y=/, '');
          // Keep the substitution readable:
          // - Use 3(0) for coefficients like 3x
          // - Use 2^0 for exponent forms like 2^x
          // - Use sin(0) for sin(x)
          // - Avoid creating double parentheses in (x-2) -> ((0)-2)
          let out = rhs;
          out = out.replace(/(\d+)\s*x\b/g, '$1(0)');
          out = out.replace(/\^x\b/g, '^0');
          out = out.replace(/\((\s*)x(\s*)\)/g, '($10$2)');
          out = out.replace(/\bx\b/g, '0');
          return String.raw`y = ${out}`;
        })(),
      },
      { kind: 'math', content: String.raw`y = ${Number.isFinite(y0) ? y0 : '0'}` },
      { kind: 'text', content: `Therefore, the y-intercept has y-value ${Number.isFinite(y0) ? y0 : 0}.` },

      { kind: 'math', content: String.raw`\textbf{5) Checks (evidence your answer is correct)}` },
      { kind: 'text', content: 'Axis check: y-intercepts occur at x = 0.' },
      { kind: 'text', content: 'Graph consistency check (visual only): the value should match where the graph crosses the y-axis.' },

      { kind: 'math', content: String.raw`\textbf{6) Final statement (clear boxed answer)}` },
      { kind: 'math', content: String.raw`\boxed{\text{The y-intercept is }${Number.isFinite(y0) ? y0 : 0}.}` },
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
        ...(askXIntercept
          ? [
              { kind: 'point' as const, at: { x: xIntercept as number, y: 0 }, r: 5, fill: '#dc2626', stroke: '#7f1d1d', strokeWidth: 1 },
              { kind: 'label' as const, at: { x: (xIntercept as number) + 0.25, y: 0.7 }, text: `(${asFixed2(xIntercept as number).replace(/\.00$/, '')}, 0)`, fill: '#111827', fontSize: 12, anchor: 'start' },
              { kind: 'label' as const, at: { x: (xIntercept as number) + 0.25, y: -1.2 }, text: 'x-intercept', fill: '#6b7280', fontSize: 12, anchor: 'start' },
            ]
          : [
              { kind: 'point' as const, at: { x: 0, y: y0 }, r: 5, fill: '#dc2626', stroke: '#7f1d1d', strokeWidth: 1 },
              { kind: 'label' as const, at: { x: 0.25, y: y0 + 0.5 }, text: `(0, ${y0})`, fill: '#111827', fontSize: 12, anchor: 'start' },
              { kind: 'label' as const, at: { x: 0.25, y: y0 - 1.2 }, text: 'y-intercept', fill: '#6b7280', fontSize: 12, anchor: 'start' },
            ]),
      ],
      caption: askXIntercept
        ? 'The x-intercept is where the graph crosses the x-axis (y = 0).'
        : 'The y-intercept is where the graph crosses the y-axis (x = 0).',
    };

    const explWithGraph: KatexExplanationBlock[] = [
      { kind: 'graph', graphSpec, altText: `Graph of ${eqLatex} with y-intercept highlighted at (0, ${y0}).` },
      ...expl,
    ];

    return mk({
      idSuffix: `${sub}-coord`,
      katexQuestion: q,
      katexExplanation: explWithGraph,
      answerKind: 'integer',
      expectedNumber: askXIntercept ? (xIntercept as number) : y0,
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
    const q = String.raw`\text{Convert }\mbox{${kmh}\,\mathrm{km/h}}\text{ into }\mbox{\mathrm{m/s}}\text{.}`;
    const promptText = `Convert ${kmh} km/h into m/s.`;

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
      promptText,
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

    const primeFactorMap = (n: number) => {
      let x = n;
      const out = new Map<number, number>();
      let p = 2;
      while (p * p <= x) {
        while (x % p === 0) {
          out.set(p, (out.get(p) ?? 0) + 1);
          x = Math.floor(x / p);
        }
        p = p === 2 ? 3 : p + 2;
      }
      if (x > 1) out.set(x, (out.get(x) ?? 0) + 1);
      return out;
    };

    const primeFactorLatex = (m: Map<number, number>) => {
      const parts = Array.from(m.entries())
        .sort((a1, a2) => a1[0] - a2[0])
        .map(([prime, k]) => (k === 1 ? `${prime}` : `${prime}^{${k}}`));
      return parts.join(' \\times ');
    };

    const primeFactorTableSteps = (n: number) => {
      let x = Math.abs(n);
      const steps: Array<{ p: number; before: number; after: number }> = [];
      let p = 2;
      while (p * p <= x) {
        while (x % p === 0) {
          const before = x;
          x = Math.floor(x / p);
          steps.push({ p, before, after: x });
        }
        p = p === 2 ? 3 : p + 2;
      }
      if (x > 1) {
        const before = x;
        x = 1;
        steps.push({ p: before, before, after: x });
      }
      return steps;
    };

    const primeFactorTableLatex = (n: number) => {
      const steps = primeFactorTableSteps(n);
      const rows = steps.map((s, i) => {
        const shift = (0.35 * i).toFixed(2);
        return `${s.p} & \\hspace{${shift}em}${s.before} \\\\ \\hline`;
      });
      rows.push(`\\, & \\hspace{${(0.35 * steps.length).toFixed(2)}em}1`);
      return String.raw`\begin{array}{r|r}${rows.join('')}\end{array}`;
    };

    const pfa = primeFactorMap(a);
    const pfb = primeFactorMap(b);
    const pfA = primeFactorLatex(pfa);
    const pfB = primeFactorLatex(pfb);

    const commonMinima = (() => {
      const common: Array<{ p: number; k: number }> = [];
      for (const [prime, ka] of pfa.entries()) {
        const kb = pfb.get(prime);
        if (!kb) continue;
        common.push({ p: prime, k: Math.min(ka, kb) });
      }
      common.sort((x1, x2) => x1.p - x2.p);
      return common;
    })();

    const commonMinimaLatex = commonMinima.length
      ? commonMinima.map(({ p: prime, k }) => (k === 1 ? `${prime}` : `${prime}^{${k}}`)).join(',\\;')
      : '';

    const commonProductLatex = commonMinima.length
      ? commonMinima.map(({ p: prime, k }) => (k === 1 ? `${prime}` : `${prime}^{${k}}`)).join(' \\times ')
      : '1';

    const expl: KatexExplanationBlock[] = [
      { kind: 'text', content: '1) Read once (overview)' },
      { kind: 'text', content: 'Read the question carefully and confirm it asks for the greatest (highest) common factor, not the least common multiple.' },

      { kind: 'text', content: '2) Extract the data (write down the given numbers)' },
      { kind: 'math', content: String.raw`a = ${a},\qquad b = ${b}` },

      { kind: 'text', content: '3) Plan the approach (state the method)' },
      { kind: 'text', content: 'Method: prime factorisation.' },
      { kind: 'text', content: 'Break each number into prime factors, identify the common prime factors, and multiply them using the smallest powers.' },

      { kind: 'text', content: '4) Working — show full steps' },

      { kind: 'text', content: 'Step 4.1 — Write each number as a product of prime numbers' },
      { kind: 'text', content: 'Factor each number completely into primes:' },
      { kind: 'text', content: 'Use the table (ladder) method to show every division step:' },
      { kind: 'math', content: String.raw`${a}:\qquad ${primeFactorTableLatex(a)}` },
      { kind: 'math', content: String.raw`${b}:\qquad ${primeFactorTableLatex(b)}` },
      { kind: 'text', content: 'So the complete prime factorisations are:' },
      { kind: 'math', content: String.raw`${a} = ${pfA}` },
      { kind: 'math', content: String.raw`${b} = ${pfB}` },

      { kind: 'text', content: 'Step 4.2 — Identify common prime factors (use the smallest powers)' },
      { kind: 'text', content: 'The common primes are the primes that appear in both factorisations.' },
      { kind: 'math', content: String.raw`${commonMinimaLatex || '\text{(no common primes)}'}` },

      { kind: 'text', content: 'Step 4.3 — Multiply the common factors' },
      { kind: 'math', content: String.raw`\text{GCF} = ${commonProductLatex} = ${fullGcd}` },

      { kind: 'math', content: String.raw`\textbf{5) Checks (evidence your answer is correct)}` },
      { kind: 'text', content: 'Divisibility check:' },
      { kind: 'math', content: String.raw`${a} \div ${fullGcd} = ${a / fullGcd},\qquad ${b} \div ${fullGcd} = ${b / fullGcd}` },
      { kind: 'text', content: 'Both results are integers, so the factor divides both numbers exactly.' },
      { kind: 'text', content: 'No larger common factor can exist because all shared prime factors have already been used (with the smallest powers).' },

      { kind: 'math', content: String.raw`\textbf{6) Final statement (clear boxed answer)}` },
      { kind: 'math', content: String.raw`\boxed{\text{The greatest common factor of }${a}\text{ and }${b}\text{ is }${fullGcd}.}` },
    ];

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

    const P =
      input.difficulty === 'easy'
        ? rng.int(500, 2500)
        : input.difficulty === 'medium'
          ? rng.int(800, 5000)
          : rng.int(1000, 10000);

    const n =
      input.difficulty === 'easy'
        ? rng.int(2, 8)
        : input.difficulty === 'medium'
          ? rng.int(3, 12)
          : rng.int(4, 20);

    const minR = input.difficulty === 'easy' ? 0.8 : input.difficulty === 'medium' ? 0.5 : 0.25;
    const maxR = input.difficulty === 'easy' ? 6 : input.difficulty === 'medium' ? 10 : 14;
    const r = Number(asFixed2(minR + rng.next() * (maxR - minR)));
    const A = Number(asFixed2(P * Math.pow(1 + r / 100, n)));

    const q = String.raw`\text{${who} invests }\$${P}\text{ in an account.}\\
\text{The account pays compound interest at a rate of }r\%\text{ per year.}\\
\text{At the end of }${n}\text{ years the value of the investment is }\$${A}\text{.}\\
\text{Find the value of }r\text{. Give your answer to 2 decimal places.}`;

    const promptText = `${who} invests $${P} in an account.\nThe account pays compound interest at a rate of r% per year.\nAt the end of ${n} years the value of the investment is $${A}.\nFind the value of r. Give your answer to 2 decimal places.`;

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
        'Use the compound interest formula (shown below).',
        'Rearrange to make (1 + r/100) the subject using division and an nth root.',
        'Multiply by 100 to convert from a decimal rate to a percentage rate.',
      ],
      working,
      checks: ['r should be positive in this context.', 'A should be greater than P if r is positive.', 'Substitute r back into the formula to see if you get A (approximately).'],
    });

    const methodIdx = expl.findIndex((b) => b.kind === 'text' && b.content === 'Method:');
    if (methodIdx >= 0) {
      expl.splice(methodIdx + 1, 0, {
        kind: 'math',
        content: String.raw`A = P\left(1+\frac{r}{100}\right)^{n}`,
        displayMode: true,
      });
    }

    return mk({
      idSuffix: `${sub}-${P}-${n}-${A}`,
      promptText,
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

    const promptText = `Bag A and bag B each contain red counters and blue counters only.\n${nameA} picks a counter at random from bag A and ${nameB} picks a counter at random from bag B.\nThe probability that ${nameA} picks a red counter is ${pRedA}.\nThe probability that ${nameA} and ${nameB} both pick a red counter is ${pBothRed}.\nFind the probability that ${nameA} and ${nameB} both pick a blue counter.`;

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
      promptText,
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

    const promptText = [
      'The cost of a bus pass increases every year.',
      `On 1st January ${startYear} a bus pass costs $${baseCost}.`,
      ...increases.map((pct, i) => `On 1st January ${startYear + i + 1} the cost of the bus pass increases by ${pct}%.`),
      `Calculate the cost of the bus pass on 1st January ${targetYear}.`,
    ].join('\n');

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

    const expl: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Use multipliers for percentage increases.' },
      { kind: 'text', content: `Start value (1st Jan ${startYear}): $${baseCost}.` },
      { kind: 'math', content: String.raw`\text{new} = \text{old}\times\left(1+\frac{p}{100}\right)`, displayMode: true },
      { kind: 'math', content: String.raw`V_0 = ${baseCost}`, displayMode: true },
      ...increases.flatMap((pct, idx) => {
        const year = startYear + idx + 1;
        const mult = 1 + pct / 100;
        const prev = idx === 0 ? baseCost : Number(asFixed2(baseCost * increases.slice(0, idx).reduce((acc, p) => acc * (1 + p / 100), 1)));
        const next = Number(asFixed2(prev * mult));
        return [
          { kind: 'text' as const, content: `1st Jan ${year}: increase by ${pct}%  →  multiply by ${asFixed2(mult)}.` },
          { kind: 'math' as const, content: String.raw`V_${idx + 1} = ${asFixed2(prev)}\times ${asFixed2(mult)} = ${asFixed2(next)}`, displayMode: true },
        ];
      }),
      { kind: 'text', content: 'Final step: round to 2 decimal places.' },
      { kind: 'math', content: String.raw`\text{Cost on 1st Jan ${targetYear}} = \$${asFixed2(finalCost)}`, displayMode: true },
    ];

    return mk({
      idSuffix: `${sub}-${startYear}-${baseCost}-${increases.join('-')}`,
      promptText,
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

    const q = String.raw`\text{The ${role} is }x\text{ years old. }x\text{ is a prime number. }x\!+\!${a}\text{ is a square number. }x\!-\!${b}\text{ is a multiple of }${m}\text{. Find the value of~}x\text{.}`;

    const primeCandidates = candidatesFromSquare.filter(isPrime);

    const expl: KatexExplanationBlock[] = [
      { kind: 'text', content: '1) Read once (overview)' },
      { kind: 'text', content: 'There is one unknown number x, and all conditions must be satisfied at the same time.' },

      { kind: 'text', content: '2) Extract the data (write down conditions clearly)' },
      { kind: 'text', content: `Let x be the ${role}’s age.` },
      { kind: 'math', content: String.raw`x\text{ is prime}` },
      { kind: 'math', content: String.raw`x + ${a}\text{ is a perfect square}` },
      { kind: 'math', content: String.raw`x - ${b}\text{ is a multiple of }${m}` },

      { kind: 'text', content: '3) Plan the approach (state the strategy)' },

      { kind: 'text', content: '4) Working — show full steps' },
      { kind: 'text', content: 'Step 4.1 — Use the square condition to generate candidates' },
      { kind: 'math', content: String.raw`x + ${a} = s^{2}\;\Rightarrow\; x = s^{2} - ${a}` },
      { kind: 'math', content: String.raw`s^{2}\in\{${squaresToTry.join(', ')}\}` },
      { kind: 'math', content: String.raw`x\in\{${candidatesFromSquare.join(', ')}\}` },

      { kind: 'text', content: 'Step 4.2 — Keep only the prime candidates' },
      { kind: 'math', content: String.raw`\{${primeCandidates.join(', ') || '\\text{none}'}\}` },

      { kind: 'text', content: 'Step 4.3 — Apply the divisibility condition' },
      { kind: 'math', content: String.raw`x - ${b} \equiv 0\pmod{${m}}\;\Rightarrow\; x \equiv ${b}\pmod{${m}}` },
      { kind: 'math', content: String.raw`\text{After filtering: }\{${filtered.join(', ') || '\\text{none}'}\}` },
      { kind: 'text', content: 'Only one value remains, so:' },
      { kind: 'math', content: String.raw`x = ${x}` },

      { kind: 'math', content: String.raw`\textbf{5) Checks (evidence your answer is correct)}` },
      { kind: 'text', content: 'Prime check:' },
      { kind: 'math', content: String.raw`${x}\text{ is prime}` },
      { kind: 'text', content: 'Square check:' },
      { kind: 'math', content: String.raw`${x} + ${a} = ${x + a} = ${sq} = ${Math.round(Math.sqrt(sq))}^{2}` },
      { kind: 'text', content: 'Divisibility check:' },
      { kind: 'math', content: String.raw`${x} - ${b} = ${x - b} = ${(x - b) / m}\times ${m}` },

      { kind: 'math', content: String.raw`\textbf{6) Final statement (clear boxed answer)}` },
      { kind: 'math', content: String.raw`\boxed{x = ${x}.}` },
    ];

    return mk({
      idSuffix: `${sub}-${x}-${a}-${b}-${m}`,
      katexQuestion: q,
      katexExplanation: expl,
      answerKind: 'integer',
      expectedNumber: x,
    });
  }

  // number_skills_mix (10 deterministic variants)
  const mixSub = (() => {
    const r = rng.int(0, 9);
    return r <= 3 ? 4 : r;
  })();

  if (mixSub === 0) {
    const max = input.difficulty === 'easy' ? 9 : input.difficulty === 'medium' ? 15 : 25;
    const a = rng.int(2, max);
    const b = rng.int(2, max);
    const q = String.raw`\text{Find the reciprocal of }\frac{${a}}{${b}}\text{.}`;
    const promptText = `Find the reciprocal of ${a}/${b}.`;
    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Use the rule: to find a reciprocal, swap numerator and denominator.' },
      { kind: 'math', content: String.raw`\frac{${a}}{${b}} \Rightarrow \frac{${b}}{${a}}`, displayMode: true },
      { kind: 'text', content: 'Check by multiplying.' },
      { kind: 'math', content: String.raw`\frac{${a}}{${b}}\times\frac{${b}}{${a}}=1`, displayMode: true },
    ];
    const expl = scaffoldExplanation({
      title: 'Number skill: reciprocal of a fraction.',
      givens: [`fraction = ${a}/${b}`],
      goal: 'Find the reciprocal.',
      method: ['Swap the numerator and denominator.'],
      working,
      checks: ['A number multiplied by its reciprocal equals 1.'],
    });
    return mk({
      idSuffix: `mini-recip-${a}-${b}`,
      promptText,
      katexQuestion: q,
      katexExplanation: expl,
      answerKind: 'rational',
      expectedFraction: frac(b, a),
    });
  }

  if (mixSub === 1) {
    const rng2 = mulberry32(input.seed + 100_001);
    const digits = rng2.int(1, 5);
    const min = digits === 1 ? 1 : Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    const x = rng2.int(min, max);

    // Choose a rounding place of 10, 100, 1000, or 10000, but not bigger than the number's scale.
    // For 1-digit numbers we still allow rounding to the nearest 10.
    const maxExp = Math.max(1, Math.min(4, digits - 1));
    const exp = rng2.int(1, maxExp);
    const place = Math.pow(10, exp);
    const placeName = exp === 1 ? 'ten' : exp === 2 ? 'hundred' : exp === 3 ? 'thousand' : 'ten thousand';

    const lower = Math.floor(x / place) * place;
    const upper = lower + place;
    const dLower = x - lower;
    const dUpper = upper - x;
    const rounded = Math.round(x / place) * place;

    const q = String.raw`\text{Write }${x}\text{ correct to the nearest ${placeName}.}`;

    const hundredsDigit = Math.floor((x % (place * 10)) / place);
    const tensDigit = Math.floor((x % place) / (place / 10));
    const lastDigit = exp === 1 ? x % 10 : tensDigit;

    const expl: KatexExplanationBlock[] = [
      { kind: 'text', content: '1) Read once (overview)' },
      { kind: 'text', content: `We are rounding a whole number to the nearest ${placeName}.` },
      { kind: 'text', content: '' },

      { kind: 'text', content: '2) Extract the data (write the number clearly)' },
      { kind: 'math', content: String.raw`n = ${x}` },
      { kind: 'text', content: '' },

      { kind: 'text', content: '3) Plan the approach (state the rule or method)' },
      { kind: 'text', content: `Method A: compare the two nearest multiples of ${place} and choose the closer one.` },
      { kind: 'text', content: `Alternative: use the place-value rule (look at the next digit to decide round up or down).` },
      { kind: 'text', content: '' },

      { kind: 'text', content: '4) Working — show full steps' },
      { kind: 'text', content: `Method A: nearest multiples of ${place}` },
      { kind: 'math', content: String.raw`${lower} < ${x} < ${upper}` },
      { kind: 'text', content: 'Distances:' },
      { kind: 'math', content: String.raw`${x} - ${lower} = ${dLower}` },
      { kind: 'math', content: String.raw`${upper} - ${x} = ${dUpper}` },
      { kind: 'math', content: String.raw`${Math.min(dLower, dUpper)} < ${Math.max(dLower, dUpper)}` },
      { kind: 'text', content: `So ${upper} is closer than ${lower}, therefore:` },
      { kind: 'math', content: String.raw`${x}\text{ rounds to }${rounded}` },
      { kind: 'text', content: '' },

      { kind: 'text', content: 'Alternative method (place-value rule)' },
      { kind: 'text', content: exp === 1
        ? `Look at the units digit of ${x}.`
        : exp === 2
          ? `Look at the tens digit of ${x}.`
          : exp === 3
            ? `Look at the hundreds digit of ${x}.`
            : `Look at the thousands digit of ${x}.` },
      { kind: 'math', content: String.raw`\text{Next digit} = ${lastDigit}` },
      { kind: 'text', content: `Since ${lastDigit} \ge 5, we round up to ${rounded}.` },
      { kind: 'text', content: '' },

      { kind: 'math', content: String.raw`\textbf{5) Checks (evidence your answer is correct)}` },
      { kind: 'text', content: `The rounded value must be a multiple of ${place}:` },
      { kind: 'math', content: String.raw`${rounded} \div ${place} = ${rounded / place}` },
      { kind: 'text', content: 'Closeness check:' },
      { kind: 'math', content: String.raw`${upper} - ${x} = ${dUpper}\quad\text{and}\quad ${x} - ${lower} = ${dLower}` },
      { kind: 'math', content: String.raw`${dUpper} < ${dLower}` },
      { kind: 'text', content: '' },

      { kind: 'math', content: String.raw`\textbf{6) Final statement (clear boxed answer)}` },
      { kind: 'math', content: String.raw`\boxed{${x}\text{ rounds to }${rounded}\text{ to the nearest ${placeName}}}` },
    ];
    return mk({
      idSuffix: `mini-round-${digits}d-${placeName}-${x}`,
      katexQuestion: q,
      katexExplanation: expl,
      answerKind: 'integer',
      expectedNumber: rounded,
    });
  }

  if (mixSub === 2) {
    const rng2 = mulberry32(input.seed + 100_002);
    const bank = [5, 10, 12, 15, 20, 25, 28, 30, 35, 40, 45, 50, 60, 70, 75, 80, 90];
    const p = bank[rng2.int(0, bank.length - 1)];
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
    return mk({ idSuffix: `mini-pct-${p}`, katexQuestion: q, katexExplanation: expl, answerKind: 'decimal_2dp', expectedNumber: Number(asFixed2(dec)) });
  }

  if (mixSub === 3) {
    const rng2 = mulberry32(input.seed + 100_003);
    // Generate a terminating decimal a/b where denominator is 10, 100, or 1000.
    // Avoid always repeating the same decimal.
    const denomPow = rng2.int(1, input.difficulty === 'easy' ? 2 : input.difficulty === 'medium' ? 3 : 3);
    const denom = Math.pow(10, denomPow);
    let num = rng2.int(1, denom - 1);
    // Prefer decimals that reduce (so simplification is meaningful).
    if (num % 2 !== 0 && num % 5 !== 0) num = Math.min(denom - 1, num + 1);
    const d = Number((num / denom).toFixed(denomPow));
    const q = String.raw`\text{Write }${d}\text{ as a fraction in its simplest form.}`;
    const f = normalizeFraction({ n: num, d: denom });
    const g = (() => {
      let A = Math.abs(num);
      let B = Math.abs(denom);
      while (B !== 0) {
        const t = A % B;
        A = B;
        B = t;
      }
      return A;
    })();
    const sn = num / g;
    const sd = denom / g;
    const expl: KatexExplanationBlock[] = [
      { kind: 'text', content: '1) Read once (overview)' },
      { kind: 'text', content: 'We are asked to write a terminating decimal as a fraction in simplest form.' },
      { kind: 'text', content: '“Simplest form” means the numerator and denominator have no common factor greater than 1.' },

      { kind: 'text', content: '2) Extract the data (write the decimal clearly)' },
      { kind: 'math', content: String.raw`\text{decimal} = ${d}` },

      { kind: 'text', content: '3) Plan the approach (state the rule)' },
      { kind: 'text', content: 'Count decimal places, write the number over 10, 100, or 1000, then simplify.' },

      { kind: 'text', content: '4) Working — show full steps' },
      { kind: 'text', content: 'Step 4.1 — Write the decimal as a fraction' },
      { kind: 'text', content: `${d} has ${denomPow} decimal place${denomPow === 1 ? '' : 's'}, so we write it over ${denom}:` },
      { kind: 'math', content: String.raw`${d} = \frac{${num}}{${denom}}` },

      { kind: 'text', content: 'Step 4.2 — Simplify the fraction' },
      { kind: 'text', content: `Find the HCF of ${num} and ${denom}. Here the HCF is ${g}.` },
      { kind: 'math', content: String.raw`\frac{${num}}{${denom}} = \frac{${num}\div ${g}}{${denom}\div ${g}} = \frac{${sn}}{${sd}}` },

      { kind: 'math', content: String.raw`\textbf{5) Checks (evidence your answer is correct)}` },
      { kind: 'text', content: 'Convert back to a decimal:' },
      { kind: 'math', content: String.raw`\frac{${sn}}{${sd}} = ${d}` },
      { kind: 'text', content: 'Also, 4 and 5 have no common factor greater than 1, so the fraction is in simplest form.' },

      { kind: 'math', content: String.raw`\textbf{6) Final statement (clear boxed answer)}` },
      { kind: 'math', content: String.raw`\boxed{${d} = \frac{${sn}}{${sd}}}` },
    ];
    return mk({ idSuffix: `mini-decfrac-${num}-${denom}`, katexQuestion: q, katexExplanation: expl, answerKind: 'rational', expectedFraction: f });
  }

  if (mixSub === 4) {
    const monday =
      input.difficulty === 'easy'
        ? rng.int(-20, 20)
        : input.difficulty === 'medium'
          ? rng.int(-30, 30)
          : rng.int(-40, 40);

    const delta =
      input.difficulty === 'easy'
        ? rng.int(5, 15)
        : input.difficulty === 'medium'
          ? rng.int(5, 20)
          : rng.int(10, 25);

    const isHigher = rng.int(0, 1) === 1;
    const tuesday = isHigher ? monday + delta : monday - delta;

    const q = String.raw`\text{The temperature on Monday is }${monday}^{\circ}\text{C. The temperature on Tuesday is }${delta}^{\circ}\text{C ${isHigher ? 'higher' : 'lower'}. Work out the temperature on Tuesday.}`;
    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: `Translate the words into an operation: “${isHigher ? 'higher' : 'lower'}” means ${isHigher ? 'add' : 'subtract'}.` },
      { kind: 'math', content: String.raw`\text{Tuesday} = ${monday} ${isHigher ? '+' : '-'} ${delta}`, displayMode: true },
      { kind: 'text', content: 'Calculate.' },
      { kind: 'math', content: String.raw`${monday} ${isHigher ? '+' : '-'} ${delta} = ${tuesday}`, displayMode: true },
    ];
    const expl = scaffoldExplanation({
      title: 'Number skill: integer change in temperature.',
      givens: [`Monday = ${monday}°C`, `Tuesday is ${delta}°C ${isHigher ? 'higher' : 'lower'}`],
      goal: 'Find Tuesday’s temperature.',
      method: [
        isHigher
          ? `Add ${delta} to ${monday} because “higher” means increase.`
          : `Subtract ${delta} from ${monday} because “lower” means decrease.`,
      ],
      working,
      checks: [
        isHigher
          ? 'Tuesday should be greater than Monday because the temperature increased.'
          : 'Tuesday should be less than Monday because the temperature decreased.',
      ],
    });
    return mk({
      idSuffix: 'mini-temp',
      promptText: `The temperature on Monday is ${monday}°C. The temperature on Tuesday is ${delta}°C ${isHigher ? 'higher' : 'lower'}. Work out the temperature on Tuesday.`,
      katexQuestion: q,
      katexExplanation: expl,
      answerKind: 'integer',
      expectedNumber: tuesday,
    });
  }

  if (mixSub === 5) {
    const rng2 = mulberry32(input.seed + 100_005);
    const bank = input.difficulty === 'easy'
      ? [0.1, 0.2, 0.25, 0.3, 0.4, 0.6, 0.7, 0.75, 0.8, 0.9]
      : input.difficulty === 'medium'
        ? [0.15, 0.2, 0.35, 0.45, 0.55, 0.65, 0.25, 0.75, 0.85, 0.95]
        : [0.12, 0.18, 0.27, 0.33, 0.41, 0.58, 0.63, 0.74, 0.86, 0.93];
    const p = bank[rng2.int(0, bank.length - 1)];
    const q = String.raw`\text{The probability of picking a wooden toy is }${p}.\;\text{Work out the probability that the toy is not wooden.}`;
    const ans = 1 - p;
    const expl: KatexExplanationBlock[] = [
      { kind: 'text', content: '1) Read once (overview)' },
      { kind: 'text', content: 'Identify the event whose probability is given, and confirm we are asked for the probability of the opposite event (the complement).' },

      { kind: 'text', content: '2) Extract the data (identify given probabilities)' },
      { kind: 'math', content: String.raw`P(\text{wooden}) = ${p}` },

      { kind: 'text', content: '3) Plan the approach (state the rule)' },
      { kind: 'math', content: String.raw`P(\text{not }A) = 1 - P(A)` },

      { kind: 'text', content: '4) Working — show full steps' },
      { kind: 'math', content: String.raw`P(\text{not wooden}) = 1 - P(\text{wooden})` },
      { kind: 'math', content: String.raw`P(\text{not wooden}) = 1 - ${p} = ${asFixed2(ans)}` },
      { kind: 'text', content: 'The subtraction removes the probability of the event happening from the total probability of all outcomes, which is 1.' },

      { kind: 'math', content: String.raw`\textbf{5) Checks (evidence your answer is correct)}` },
      { kind: 'text', content: 'Valid probability check:' },
      { kind: 'math', content: String.raw`0 \le ${asFixed2(ans)} \le 1` },
      { kind: 'text', content: 'Complement check:' },
      { kind: 'math', content: String.raw`${p} + ${asFixed2(ans)} = 1` },

      { kind: 'math', content: String.raw`\textbf{6) Final statement (clear boxed answer)}` },
      { kind: 'math', content: String.raw`\boxed{P(\text{not wooden}) = ${asFixed2(ans)}.}` },
    ];
    return mk({ idSuffix: `mini-prob-${p}`, katexQuestion: q, katexExplanation: expl, answerKind: 'decimal_2dp', expectedNumber: Number(asFixed2(ans)) });
  }

  if (mixSub === 6) {
    const rng2 = mulberry32(input.seed + 100_006);
    // Always vary. Choose a multiple of 3.6 to keep clean conversions.
    const base = input.difficulty === 'easy' ? 3.6 : input.difficulty === 'medium' ? 7.2 : 10.8;
    const step = 3.6;
    const kMax = input.difficulty === 'easy' ? 12 : input.difficulty === 'medium' ? 16 : 22;
    const k = rng2.int(1, kMax);
    const kmh = Number(asFixed2(base + k * step));
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
    return mk({ idSuffix: `mini-kmh-${kmh}`, katexQuestion: q, katexExplanation: expl, answerKind: 'decimal_2dp', expectedNumber: Number(asFixed2(ms)) });
  }

  if (mixSub === 8) {
    const gcdInt = (x: number, y: number): number => {
      let A = Math.abs(x);
      let B = Math.abs(y);
      while (B !== 0) {
        const t = A % B;
        A = B;
        B = t;
      }
      return A;
    };

    const makeReducibleFraction = () => {
      const factorMax = input.difficulty === 'easy' ? 9 : input.difficulty === 'medium' ? 12 : 18;
      const aMax = input.difficulty === 'easy' ? 12 : input.difficulty === 'medium' ? 18 : 25;
      const bMax = input.difficulty === 'easy' ? 14 : input.difficulty === 'medium' ? 22 : 35;

      let tries = 0;
      while (tries < 200) {
        tries += 1;
        const k = rng.int(2, factorMax);
        const a = rng.int(1, aMax);
        const b = rng.int(2, bMax);
        if (gcdInt(a, b) !== 1) continue;
        const n = a * k;
        const d = b * k;
        if (d === 0) continue;
        if (n === d) continue;
        if (n > d * 3) continue;
        return { n, d, k, a, b };
      }
      return { n: 12, d: 30, k: 6, a: 2, b: 5 };
    };

    const f = makeReducibleFraction();
    const hcf = gcdInt(f.n, f.d);
    const sn = f.n / hcf;
    const sd = f.d / hcf;

    const q = String.raw`\text{Write~}\frac{${f.n}}{${f.d}}\text{~in~its~simplest~form.}`;
    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: `Find the highest common factor (HCF) of ${f.n} and ${f.d}.` },
      { kind: 'text', content: `The HCF is ${hcf}.` },
      { kind: 'math', content: String.raw`\frac{${f.n}}{${f.d}} = \frac{${f.n}\div ${hcf}}{${f.d}\div ${hcf}}`, displayMode: true },
      { kind: 'math', content: String.raw`= \frac{${sn}}{${sd}}`, displayMode: true },
    ];
    const expl = scaffoldExplanation({
      title: 'Number skill: simplifying a fraction.',
      givens: [`fraction = ${f.n}/${f.d}`],
      goal: 'Write the fraction in simplest form.',
      method: ['Find the HCF of numerator and denominator.', 'Divide numerator and denominator by the HCF.'],
      working,
      checks: [`${sn} and ${sd} have no common factor greater than 1, so it is simplest.`],
    });
    return mk({ idSuffix: `mini-simplify-${f.n}-${f.d}`, katexQuestion: q, katexExplanation: expl, answerKind: 'rational', expectedFraction: frac(sn, sd) });
  }

  // mixSub === 9
  {
    const count = input.difficulty === 'easy' ? rng.int(5, 7) : input.difficulty === 'medium' ? rng.int(6, 8) : rng.int(6, 9);
    const knownCount = count - 1;

    const mean = input.difficulty === 'easy' ? rng.int(6, 16) : input.difficulty === 'medium' ? rng.int(4, 22) : rng.int(-5, 28);
    const total = count * mean;

    const missing = (() => {
      const lo = input.difficulty === 'easy' ? -10 : input.difficulty === 'medium' ? -18 : -30;
      const hi = input.difficulty === 'easy' ? 30 : input.difficulty === 'medium' ? 45 : 60;
      let v = rng.int(lo, hi);
      // keep the sums readable and avoid very large totals
      let tries = 0;
      while ((Math.abs(total - v) > 250 || (input.difficulty === 'easy' && v < -5)) && tries < 40) {
        tries += 1;
        v = rng.int(lo, hi);
      }
      return v;
    })();

    const knownSum = total - missing;
    const q = String.raw`\text{The mean of ${count} numbers is }${mean}\text{. The sum of ${knownCount} of the numbers is }${knownSum}\text{. Find the remaining number.}`;
    const working: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Use: total = mean × number of values.' },
      { kind: 'math', content: String.raw`\text{total} = ${mean}\times ${count} = ${total}`, displayMode: true },
      { kind: 'text', content: `Subtract the sum of the ${knownCount} known numbers to get the remaining number.` },
      { kind: 'math', content: String.raw`\text{missing} = ${total} - ${knownSum} = ${missing}`, displayMode: true },
    ];
    const expl = scaffoldExplanation({
      title: 'Statistics: mean and total.',
      givens: [`mean of ${count} numbers = ${mean}`, `sum of ${knownCount} numbers = ${knownSum}`],
      goal: 'Find the missing number.',
      method: ['Convert mean to total using total = mean × number.', 'Subtract the known sum to find the missing value.'],
      working,
      checks: [`The missing number should make the total equal to ${total}.`, `If you add the missing number to ${knownSum} you should get ${total}.`],
    });
    return mk({ idSuffix: `mini-mean-${count}-${mean}-${knownSum}`, katexQuestion: q, katexExplanation: expl, answerKind: 'integer', expectedNumber: missing });
  }
}
