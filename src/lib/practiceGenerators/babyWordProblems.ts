import type { KatexExplanationBlock, PracticeDifficulty } from '@/lib/practiceEngine';

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

function pickName(seed: number, offset: number) {
  const names = ['Jay', 'Jenny', 'Abi', 'Noah', 'Maya', 'Omar', 'Sofia', 'Arjun', 'Aisha', 'Leo', 'Priya', 'Daniel', 'Sam'];
  return names[(seed + offset) % names.length] ?? 'Sam';
}

function money2(n: number) {
  return String(Math.round(Number(n)));
}

export type BabyWordProblemVariantId =
  | 'add_total'
  | 'more_than'
  | 'distance_total'
  | 'score_total'
  | 'money_left'
  | 'stamps_total'
  | 'remaining_distance'
  | 'change_from_amount'
  | 'weight_total'
  | 'inventory_after_order'
  | 'students_per_bus'
  | 'unit_price_total_and_left'
  | 'unit_price_with_extra_item'
  | 'consecutive_three_sum'
  | 'consecutive_even_three_sum'
  | 'reverse_half_destroyed'
  | 'reverse_half_spent_then_earned'
  | 'share_after_taking'
  | 'friends_from_give_each'
  | 'reverse_half_sold_then_bought'
  | 'reverse_half_destroyed_after_buy'
  | 'pies_from_pieces';

export type BabyWordProblemQuestion = {
  kind: 'word_problem';
  variantId: BabyWordProblemVariantId;
  answerKind: 'integer';
  expectedNumber: number;
  id: string;
  topicId: 'baby_word_problems';
  difficulty: PracticeDifficulty;
  seed: number;
  promptText: string;
  katexQuestion: string;
  katexExplanation: KatexExplanationBlock[];
};

function pickVariantByDifficulty(
  rng: Rng,
  avoid?: BabyWordProblemVariantId,
  variantWeights?: Record<string, number>
): BabyWordProblemVariantId {
  const all: BabyWordProblemVariantId[] = [
    'add_total',
    'more_than',
    'distance_total',
    'score_total',
    'money_left',
    'stamps_total',
    'remaining_distance',
    'change_from_amount',
    'weight_total',
    'inventory_after_order',
    'students_per_bus',
    'unit_price_total_and_left',
    'unit_price_with_extra_item',
    'consecutive_three_sum',
    'consecutive_even_three_sum',
    'reverse_half_destroyed',
    'reverse_half_spent_then_earned',
    'share_after_taking',
    'friends_from_give_each',
    'reverse_half_sold_then_bought',
    'reverse_half_destroyed_after_buy',
    'pies_from_pieces',
  ];

  const candidates = all.filter((v) => v !== avoid);
  const pool = candidates.length ? candidates : all;
  const w = variantWeights ?? {};

  let total = 0;
  for (const id of pool) total += Math.max(0, Number(w[id] ?? 1));
  if (!(total > 0)) return pool[rng.int(0, pool.length - 1)] ?? all[0]!;

  let r = rng.next() * total;
  for (const id of pool) {
    r -= Math.max(0, Number(w[id] ?? 1));
    if (r <= 0) return id;
  }
  return pool[pool.length - 1] ?? all[0]!;
}

function ranges(difficulty: PracticeDifficulty) {
  if (difficulty === 'easy') return { count: [5, 120], km: [1, 90], grams: [50, 900], dollars: [1, 20] };
  if (difficulty === 'medium') return { count: [50, 900], km: [20, 700], grams: [150, 2000], dollars: [2, 60] };
  if (difficulty === 'hard') return { count: [200, 6000], km: [100, 4000], grams: [250, 6000], dollars: [5, 180] };
  return { count: [1000, 35000], km: [600, 30000], grams: [500, 15000], dollars: [10, 600] };
}

function longAddSubExplanation(input: {
  title: string;
  story: string;
  aLabel: string;
  bLabel: string;
  a: number;
  b: number;
  op: '+' | '-';
  unit: string;
  answer: number;
}): KatexExplanationBlock[] {
  const opWord = input.op === '+' ? 'add' : 'subtract';
  const meaning = input.op === '+'
    ? 'The word “altogether / total / in all” tells us to combine the two amounts.'
    : 'The words “how many more / how many left / how much further” tell us we need a difference (subtract).';

  return [
    { kind: 'text', content: input.title },
    { kind: 'text', content: 'Step 1: Read the question slowly. Do not calculate yet.' },
    { kind: 'text', content: 'Ask yourself: “What do I start with?” and “What is happening to it?”' },
    { kind: 'text', content: input.story },
    { kind: 'text', content: '' },

    { kind: 'text', content: 'Step 2: List the important information (the numbers and what they mean).' },
    { kind: 'text', content: `- ${input.aLabel} = ${input.a} ${input.unit}` },
    { kind: 'text', content: `- ${input.bLabel} = ${input.b} ${input.unit}` },
    { kind: 'text', content: '' },

    { kind: 'text', content: 'Step 3: Choose the operation (this is the key decision).' },
    { kind: 'text', content: `We will ${opWord} because:` },
    { kind: 'text', content: meaning },
    { kind: 'text', content: '' },

    { kind: 'text', content: 'Step 4: Write a clear number sentence (a math sentence).' },
    { kind: 'math', content: String.raw`\text{Answer} = ${input.a}\ ${input.op}\ ${input.b}`, displayMode: true },
    { kind: 'text', content: '' },

    { kind: 'text', content: 'Step 5: Calculate carefully.' },
    { kind: 'math', content: String.raw`${input.a} ${input.op} ${input.b} = ${input.answer}`, displayMode: true },
    { kind: 'text', content: '' },

    { kind: 'text', content: 'Step 6: Put the answer back into the story (with units).' },
    { kind: 'math', content: String.raw`\boxed{${input.answer}\ \text{${input.unit}}}`, displayMode: true },
    { kind: 'text', content: '' },

    { kind: 'text', content: 'Quick checks (to avoid silly mistakes):' },
    { kind: 'text', content: input.op === '+'
      ? '- A total should be larger than each part.'
      : '- A difference should be smaller than the larger number.' },
    { kind: 'text', content: '- Units should match the question (books, km, grams, dollars, etc.).' },
  ];
}

function longDivisionExplanation(input: {
  title: string;
  story: string;
  totalLabel: string;
  total: number;
  removedLabel?: string;
  removed?: number;
  groupsLabel: string;
  groups: number;
  unit: string;
  answer: number;
}): KatexExplanationBlock[] {
  const remaining = typeof input.removed === 'number' ? input.total - input.removed : input.total;
  const out: KatexExplanationBlock[] = [
    { kind: 'text', content: input.title },
    { kind: 'text', content: 'Step 1: Read the story and write down what each number means.' },
    { kind: 'text', content: input.story },
    { kind: 'text', content: '' },
    { kind: 'text', content: `- ${input.totalLabel} = ${input.total}` },
    ...(typeof input.removed === 'number' && input.removedLabel
      ? ([{ kind: 'text', content: `- ${input.removedLabel} = ${input.removed}` }] as KatexExplanationBlock[])
      : []),
    { kind: 'text', content: `- ${input.groupsLabel} = ${input.groups}` },
    { kind: 'text', content: '' },
    ...(typeof input.removed === 'number'
      ? ([
        { kind: 'text', content: 'Step 2: First find how many are in the groups we are sharing.' },
        { kind: 'math', content: String.raw`\text{to share} = ${input.total} - ${input.removed} = ${remaining}`, displayMode: true },
      ] as KatexExplanationBlock[])
      : ([{ kind: 'text', content: 'Step 2: We are sharing the total equally.' }] as KatexExplanationBlock[])),
    { kind: 'text', content: 'Step 3: “Equally/shared between” means division.' },
    { kind: 'math', content: String.raw`\text{each group} = \frac{${remaining}}{${input.groups}}`, displayMode: true },
    { kind: 'text', content: 'Step 4: Divide to get the answer.' },
    { kind: 'math', content: String.raw`\frac{${remaining}}{${input.groups}} = ${input.answer}`, displayMode: true },
    { kind: 'text', content: 'Step 5: Final answer with units.' },
    { kind: 'math', content: String.raw`\boxed{${input.answer}\ \text{${input.unit}}}`, displayMode: true },
    { kind: 'text', content: 'Quick check: Multiply back to see if it matches.' },
    { kind: 'math', content: String.raw`${input.answer}\times${input.groups} = ${remaining}`, displayMode: true },
  ];
  return out;
}

function longUnitPriceExplanation(input: {
  title: string;
  story: string;
  totalMoney: number;
  leftMoney?: number;
  extraCost?: number;
  count: number;
  unitName: string;
  answer: number;
}): KatexExplanationBlock[] {
  const spent = typeof input.leftMoney === 'number' ? input.totalMoney - input.leftMoney : input.totalMoney - (input.extraCost ?? 0);
  const out: KatexExplanationBlock[] = [
    { kind: 'text', content: input.title },
    { kind: 'text', content: 'Step 1: Read the story and identify what we are trying to find.' },
    { kind: 'text', content: input.story },
    { kind: 'text', content: 'We want the cost of 1 item, so we need “total cost ÷ number of items”.' },
    { kind: 'text', content: '' },
    ...(typeof input.leftMoney === 'number'
      ? ([
        { kind: 'text', content: 'Step 2: First find how much money was spent.' },
        { kind: 'math', content: String.raw`\text{spent} = ${input.totalMoney} - ${input.leftMoney} = ${spent}`, displayMode: true },
      ] as KatexExplanationBlock[])
      : ([
        { kind: 'text', content: 'Step 2: First remove the cost of the extra item.' },
        { kind: 'math', content: String.raw`\text{spent on ${input.unitName}} = ${input.totalMoney} - ${input.extraCost ?? 0} = ${spent}`, displayMode: true },
      ] as KatexExplanationBlock[])),
    { kind: 'text', content: 'Step 3: Divide the spent amount equally across the number of items.' },
    { kind: 'math', content: String.raw`\text{cost per ${input.unitName}} = \frac{${spent}}{${input.count}}`, displayMode: true },
    { kind: 'text', content: 'Step 4: Do the division.' },
    { kind: 'math', content: String.raw`\frac{${spent}}{${input.count}} = ${input.answer}`, displayMode: true },
    { kind: 'text', content: 'Step 5: Answer with a money symbol.' },
    { kind: 'math', content: String.raw`\boxed{\$${input.answer}}`, displayMode: true },
    { kind: 'text', content: 'Quick check: Multiply back to see the total spent on the items.' },
    { kind: 'math', content: String.raw`${input.answer}\times${input.count} = ${spent}`, displayMode: true },
  ];
  return out;
}

function longConsecutiveExplanation(input: {
  title: string;
  story: string;
  sum: number;
  smallest: number;
  step: number;
}): KatexExplanationBlock[] {
  const a = input.smallest;
  const b = a + input.step;
  const c = a + 2 * input.step;
  const out: KatexExplanationBlock[] = [
    { kind: 'text', content: input.title },
    { kind: 'text', content: input.story },
    { kind: 'text', content: 'Step 1: Let the smallest number be a simple letter (we will use x).' },
    { kind: 'text', content: input.step === 1 ? 'For three consecutive numbers, the next two are x+1 and x+2.' : 'For three consecutive even numbers, the next two are x+2 and x+4.' },
    { kind: 'math', content: input.step === 1 ? String.raw`x,\ x+1,\ x+2` : String.raw`x,\ x+2,\ x+4`, displayMode: true },
    { kind: 'text', content: 'Step 2: Add them and set equal to the given sum.' },
    { kind: 'math', content: input.step === 1
      ? String.raw`x+(x+1)+(x+2)=${input.sum}`
      : String.raw`x+(x+2)+(x+4)=${input.sum}`,
      displayMode: true },
    { kind: 'text', content: 'Step 3: Simplify the left side.' },
    { kind: 'math', content: input.step === 1
      ? String.raw`3x+3=${input.sum}`
      : String.raw`3x+6=${input.sum}`,
      displayMode: true },
    { kind: 'text', content: 'Step 4: Solve for x.' },
    { kind: 'math', content: input.step === 1
      ? String.raw`3x=${input.sum}-3=${input.sum - 3}`
      : String.raw`3x=${input.sum}-6=${input.sum - 6}`,
      displayMode: true },
    { kind: 'math', content: input.step === 1
      ? String.raw`x=\frac{${input.sum - 3}}{3}=${a}`
      : String.raw`x=\frac{${input.sum - 6}}{3}=${a}`,
      displayMode: true },
    { kind: 'text', content: 'Step 5: The smallest number is x.' },
    { kind: 'math', content: String.raw`\boxed{${a}}`, displayMode: true },
    { kind: 'text', content: 'Quick check: add the three numbers to make sure they give the sum.' },
    { kind: 'math', content: String.raw`${a}+${b}+${c}=${input.sum}`, displayMode: true },
  ];
  return out;
}

function longReverseHalfExplanation(input: {
  title: string;
  story: string;
  final: number;
  boughtOrAdded: number;
  startLabel: string;
  answer: number;
}): KatexExplanationBlock[] {
  const out: KatexExplanationBlock[] = [
    { kind: 'text', content: input.title },
    { kind: 'text', content: input.story },
    { kind: 'text', content: 'Step 1: Work backwards because something happened and we only know the end.' },
    { kind: 'text', content: `At the end there were ${input.final}. Before the “half were destroyed/sold/spent” step, there must have been double that amount.` },
    { kind: 'math', content: String.raw`\text{before half} = 2\times${input.final} = ${2 * input.final}`, displayMode: true },
    { kind: 'text', content: `Step 2: Before that, ${input.boughtOrAdded} were added (or bought). So subtract to find the start.` },
    { kind: 'math', content: String.raw`\text{start} = ${2 * input.final} - ${input.boughtOrAdded} = ${input.answer}`, displayMode: true },
    { kind: 'text', content: `Step 3: Final answer.` },
    { kind: 'math', content: String.raw`\boxed{${input.answer}}`, displayMode: true },
  ];
  return out;
}

function longHalfThenEarnedExplanation(input: {
  title: string;
  story: string;
  earned: number;
  final: number;
  answer: number;
}): KatexExplanationBlock[] {
  const out: KatexExplanationBlock[] = [
    { kind: 'text', content: input.title },
    { kind: 'text', content: input.story },
    { kind: 'text', content: 'Step 1: After spending half, the amount left is (allowance ÷ 2).' },
    { kind: 'text', content: 'Step 2: Then money was earned, so we add that to get the final amount.' },
    { kind: 'math', content: String.raw`\frac{x}{2} + ${input.earned} = ${input.final}`, displayMode: true },
    { kind: 'text', content: 'Step 3: Subtract the earned money first.' },
    { kind: 'math', content: String.raw`\frac{x}{2} = ${input.final} - ${input.earned} = ${input.final - input.earned}`, displayMode: true },
    { kind: 'text', content: 'Step 4: Multiply by 2 to undo “half”.' },
    { kind: 'math', content: String.raw`x = 2\times${input.final - input.earned} = ${input.answer}`, displayMode: true },
    { kind: 'text', content: 'Step 5: Final answer.' },
    { kind: 'math', content: String.raw`\boxed{\$${input.answer}}`, displayMode: true },
  ];
  return out;
}

function longAgeEquationExplanation(input: {
  title: string;
  story: string;
  constant: number;
  multiplier: number;
  result: number;
  answer: number;
}): KatexExplanationBlock[] {
  const out: KatexExplanationBlock[] = [
    { kind: 'text', content: input.title },
    { kind: 'text', content: input.story },
    { kind: 'text', content: 'Step 1: Write the sentence as an equation. Let age = x.' },
    { kind: 'math', content: String.raw`${input.constant} - ${input.multiplier}x = ${input.result}`, displayMode: true },
    { kind: 'text', content: 'Step 2: Subtract the constant from both sides (or move it to the other side).' },
    { kind: 'math', content: String.raw`-${input.multiplier}x = ${input.result} - ${input.constant} = ${input.result - input.constant}`, displayMode: true },
    { kind: 'text', content: 'Step 3: Multiply by -1 to make x positive.' },
    { kind: 'math', content: String.raw`${input.multiplier}x = ${input.constant - input.result}`, displayMode: true },
    { kind: 'text', content: 'Step 4: Divide by the multiplier.' },
    { kind: 'math', content: String.raw`x = \frac{${input.constant - input.result}}{${input.multiplier}} = ${input.answer}`, displayMode: true },
    { kind: 'text', content: 'Step 5: Final answer.' },
    { kind: 'math', content: String.raw`\boxed{${input.answer}\ \text{years}}`, displayMode: true },
  ];
  return out;
}

function longMoneyExplanation(input: {
  title: string;
  story: string;
  start: number;
  change: number;
  op: '-' | '+';
  answer: number;
  goalLabel: string;
}): KatexExplanationBlock[] {
  const opWord = input.op === '-' ? 'subtract' : 'add';
  const meaning = input.op === '-'
    ? 'Money spent means the amount goes down, so we subtract.'
    : 'Money received means the amount goes up, so we add.';

  return [
    { kind: 'text', content: input.title },
    { kind: 'text', content: 'Step 1: Read the question and picture the situation.' },
    { kind: 'text', content: input.story },
    { kind: 'text', content: '' },

    { kind: 'text', content: 'Step 2: Identify start and change amounts.' },
    { kind: 'text', content: `- Start: $${money2(input.start)}` },
    { kind: 'text', content: `- Change: $${money2(input.change)}` },
    { kind: 'text', content: '' },

    { kind: 'text', content: 'Step 3: Choose the operation.' },
    { kind: 'text', content: `We ${opWord} because: ${meaning}` },
    { kind: 'text', content: '' },

    { kind: 'text', content: 'Step 4: Write the calculation with dollars.' },
    { kind: 'math', content: String.raw`\text{${input.goalLabel}} = ${money2(input.start)}\ ${input.op}\ ${money2(input.change)}`, displayMode: true },

    { kind: 'text', content: 'Step 5: Calculate using whole dollars.' },
    { kind: 'math', content: String.raw`${money2(input.start)} ${input.op} ${money2(input.change)} = ${money2(input.answer)}`, displayMode: true },

    { kind: 'text', content: 'Step 6: Final answer (include the $ sign).' },
    { kind: 'math', content: String.raw`\boxed{\$${money2(input.answer)}}`, displayMode: true },

    { kind: 'text', content: 'Quick check:' },
    { kind: 'text', content: input.op === '-' ? '- If you spend money, you should have less left than you started with.' : '- If you receive money, you should have more than you started with.' },
  ];
}

export function generateBabyWordProblemQuestion(input: {
  seed: number;
  difficulty: PracticeDifficulty;
  avoidVariantId?: BabyWordProblemVariantId;
  variantWeights?: Record<string, number>;
}): BabyWordProblemQuestion {
  const rng = mulberry32(input.seed);
  const variantId = pickVariantByDifficulty(rng, input.avoidVariantId, input.variantWeights);
  const r = ranges(input.difficulty);

  const who = pickName(input.seed, rng.int(0, 50));
  const who2 = pickName(input.seed, rng.int(51, 120));

  const mk = (payload: {
    idSuffix: string;
    promptText: string;
    katexQuestion: string;
    katexExplanation: KatexExplanationBlock[];
    answerKind: BabyWordProblemQuestion['answerKind'];
    expectedNumber: number;
  }): BabyWordProblemQuestion => {
    return {
      kind: 'word_problem',
      id: stableId('baby-word-problem', input.seed, `${variantId}-${payload.idSuffix}`),
      topicId: 'baby_word_problems',
      variantId,
      difficulty: input.difficulty,
      seed: input.seed,
      promptText: payload.promptText,
      katexQuestion: payload.katexQuestion,
      katexExplanation: payload.katexExplanation,
      answerKind: payload.answerKind,
      expectedNumber: payload.expectedNumber,
    };
  };

  if (variantId === 'add_total') {
    const a = rng.int(r.count[0], r.count[1]);
    const b = rng.int(r.count[0], r.count[1]);
    const contexts = [
      { item: 'books', place1: 'one classroom', place2: 'the other classroom' },
      { item: 'stamps', place1: 'a box', place2: 'a book' },
      { item: 'bottles', place1: 'a crate', place2: 'another crate' },
      { item: 'cards', place1: 'one pile', place2: 'another pile' },
      { item: 'marbles', place1: 'a bag', place2: 'a box' },
    ];
    const c = contexts[rng.int(0, contexts.length - 1)]!;
    const ans = a + b;

    const promptText = `There are ${a} ${c.item} in ${c.place1} and ${b} ${c.item} in ${c.place2}. How many ${c.item} are there altogether?`;
    const katexQuestion = String.raw`\text{There are ${a} ${c.item} in ${c.place1} and ${b} ${c.item} in ${c.place2}. How many ${c.item} are there altogether?}`;

    return mk({
      idSuffix: `${a}-${b}-${c.item}`,
      promptText,
      katexQuestion,
      katexExplanation: longAddSubExplanation({
        title: 'Baby word problem: total (addition).',
        story: `We have two groups of ${c.item}. We want the total number of ${c.item}.`,
        aLabel: `${c.place1}`,
        bLabel: `${c.place2}`,
        a,
        b,
        op: '+',
        unit: c.item,
        answer: ans,
      }),
      answerKind: 'integer',
      expectedNumber: ans,
    });
  }

  if (variantId === 'more_than') {
    const bigger = rng.int(r.count[0], r.count[1]);
    const smaller = rng.int(r.count[0], Math.max(r.count[0], bigger - rng.int(1, Math.max(2, Math.floor(bigger * 0.7)))));
    const contexts = [
      { item: 'football cards', owner1: who, owner2: who2 },
      { item: 'stickers', owner1: who, owner2: who2 },
      { item: 'toy cars', owner1: who, owner2: who2 },
      { item: 'pencils', owner1: who, owner2: who2 },
    ];
    const c = contexts[rng.int(0, contexts.length - 1)]!;
    const ans = bigger - smaller;

    const promptText = `${c.owner1} has ${bigger} ${c.item} and ${c.owner2} has ${smaller}. How many more ${c.item} does ${c.owner1} have?`;
    const katexQuestion = String.raw`\text{${c.owner1} has ${bigger} ${c.item} and ${c.owner2} has ${smaller}. How many more ${c.item} does ${c.owner1} have?}`;

    return mk({
      idSuffix: `${bigger}-${smaller}-${c.item}`,
      promptText,
      katexQuestion,
      katexExplanation: longAddSubExplanation({
        title: 'Baby word problem: how many more (subtraction).',
        story: `We compare ${c.owner1} and ${c.owner2}. “How many more” means difference = bigger − smaller.`,
        aLabel: `${c.owner1}`,
        bLabel: `${c.owner2}`,
        a: bigger,
        b: smaller,
        op: '-',
        unit: c.item,
        answer: ans,
      }),
      answerKind: 'integer',
      expectedNumber: ans,
    });
  }

  if (variantId === 'distance_total') {
    const d1 = rng.int(r.km[0], r.km[1]);
    const d2 = rng.int(r.km[0], r.km[1]);
    const routes = [
      { from: 'Melbourne', mid: 'Werribee', to: 'Sunshine' },
      { from: 'Canberra', mid: 'Sydney', to: 'Newcastle' },
      { from: 'Adelaide', mid: 'Gawler', to: 'Nuriootpa' },
      { from: 'Perth', mid: 'Mandurah', to: 'Bunbury' },
      { from: 'Brisbane', mid: 'Ipswich', to: 'Toowoomba' },
    ];
    const rr = routes[rng.int(0, routes.length - 1)]!;
    const ans = d1 + d2;

    const promptText = `A family drives ${d1} km from ${rr.from} to ${rr.mid}, and then ${d2} km on to ${rr.to}. How far did they travel altogether?`;
    const katexQuestion = String.raw`\text{A family drives ${d1}\text{ km from ${rr.from} to ${rr.mid}, and then ${d2}\text{ km on to ${rr.to}. How far did they travel altogether?}}`;

    return mk({
      idSuffix: `${d1}-${d2}-${rr.from}-${rr.to}`,
      promptText,
      katexQuestion,
      katexExplanation: longAddSubExplanation({
        title: 'Baby word problem: total distance (addition).',
        story: 'The trip has two parts. “Altogether” tells us to add the distances.',
        aLabel: `First part (${rr.from} to ${rr.mid})`,
        bLabel: `Second part (${rr.mid} to ${rr.to})`,
        a: d1,
        b: d2,
        op: '+',
        unit: 'km',
        answer: ans,
      }),
      answerKind: 'integer',
      expectedNumber: ans,
    });
  }

  if (variantId === 'score_total') {
    const s1 = rng.int(r.count[0], r.count[1]);
    const s2 = rng.int(r.count[0], r.count[1]);
    const sport = ['cricket', 'basketball', 'netball', 'football'][rng.int(0, 3)]!;
    const ans = s1 + s2;

    const promptText = `A ${sport} team scored ${s1} in the first game and ${s2} in the second game. How many did they score altogether?`;
    const katexQuestion = String.raw`\text{A ${sport} team scored ${s1} in the first game and ${s2} in the second game. How many did they score altogether?}`;

    return mk({
      idSuffix: `${sport}-${s1}-${s2}`,
      promptText,
      katexQuestion,
      katexExplanation: longAddSubExplanation({
        title: 'Baby word problem: total score (addition).',
        story: 'Two separate scores are being combined into one total.',
        aLabel: 'First game score',
        bLabel: 'Second game score',
        a: s1,
        b: s2,
        op: '+',
        unit: 'points',
        answer: ans,
      }),
      answerKind: 'integer',
      expectedNumber: ans,
    });
  }

  if (variantId === 'money_left') {
    const start = rng.int(r.dollars[0], r.dollars[1]);
    const spend = rng.int(1, Math.max(1, start - 1));
    const ans = start - spend;

    const promptText = `${who} has $${money2(start)}. They spend $${money2(spend)}. How much money do they have left?`;
    const katexQuestion = String.raw`\text{${who} has \$${money2(start)}. They spend \$${money2(spend)}. How much money do they have left?}`;

    return mk({
      idSuffix: `${money2(start)}-${money2(spend)}`,
      promptText,
      katexQuestion,
      katexExplanation: longMoneyExplanation({
        title: 'Baby word problem: money left (subtraction).',
        story: 'When you spend money, the amount you have goes down.',
        start,
        change: spend,
        op: '-',
        answer: ans,
        goalLabel: 'Money left',
      }),
      answerKind: 'integer',
      expectedNumber: ans,
    });
  }

  if (variantId === 'stamps_total') {
    const a = rng.int(r.count[0], r.count[1]);
    const b = rng.int(r.count[0], r.count[1]);
    const ans = a + b;

    const promptText = `${who} collects stamps. They have ${a} in a box and ${b} in a book. How many stamps do they have altogether?`;
    const katexQuestion = String.raw`\text{${who} collects stamps. They have ${a} in a box and ${b} in a book. How many stamps do they have altogether?}`;

    return mk({
      idSuffix: `${a}-${b}`,
      promptText,
      katexQuestion,
      katexExplanation: longAddSubExplanation({
        title: 'Baby word problem: stamps altogether (addition).',
        story: 'Two places contain stamps. We want the total number of stamps.',
        aLabel: 'In the box',
        bLabel: 'In the book',
        a,
        b,
        op: '+',
        unit: 'stamps',
        answer: ans,
      }),
      answerKind: 'integer',
      expectedNumber: ans,
    });
  }

  if (variantId === 'remaining_distance') {
    const total = rng.int(r.km[0], r.km[1]);
    const done = rng.int(r.km[0], Math.max(r.km[0], total - 1));
    const ans = total - done;

    const promptText = `A driver has a ${total} km journey. They stop for a break after ${done} km. How much further do they have to travel?`;
    const katexQuestion = String.raw`\text{A driver has a ${total}\text{ km journey. They stop for a break after ${done}\text{ km. How much further do they have to travel?}}`;

    return mk({
      idSuffix: `${total}-${done}`,
      promptText,
      katexQuestion,
      katexExplanation: longAddSubExplanation({
        title: 'Baby word problem: remaining distance (subtraction).',
        story: 'We start with the whole trip, then subtract the part already travelled to find what is left.',
        aLabel: 'Total journey',
        bLabel: 'Distance already travelled',
        a: total,
        b: done,
        op: '-',
        unit: 'km',
        answer: ans,
      }),
      answerKind: 'integer',
      expectedNumber: ans,
    });
  }

  if (variantId === 'change_from_amount') {
    const paid = rng.int(r.dollars[0], r.dollars[1]);
    const price = rng.int(1, Math.max(1, paid - 1));
    const ans = paid - price;

    const promptText = `A snack costs $${money2(price)}. If you pay with $${money2(paid)}, how much change should you get?`;
    const katexQuestion = String.raw`\text{A snack costs \$${money2(price)}. If you pay with \$${money2(paid)}, how much change should you get?}`;

    return mk({
      idSuffix: `${money2(paid)}-${money2(price)}`,
      promptText,
      katexQuestion,
      katexExplanation: longMoneyExplanation({
        title: 'Baby word problem: change (subtraction).',
        story: 'Change means the money you get back. It is what you paid minus the price.',
        start: paid,
        change: price,
        op: '-',
        answer: ans,
        goalLabel: 'Change',
      }),
      answerKind: 'integer',
      expectedNumber: ans,
    });
  }

  if (variantId === 'students_per_bus') {
    const buses = rng.int(3, input.difficulty === 'easy' ? 7 : 12);
    const inCars = rng.int(2, input.difficulty === 'easy' ? 25 : 80);
    const perBus = rng.int(input.difficulty === 'easy' ? 10 : 15, input.difficulty === 'ultimate' ? 80 : 60);
    const total = buses * perBus + inCars;

    const promptText = `${total} students went on a field trip. ${buses} buses were filled and ${inCars} students travelled in cars. How many students were in each bus?`;
    const katexQuestion = String.raw`\text{${total} students went on a field trip. ${buses} buses were filled and ${inCars} students travelled in cars. How many students were in each bus?}`;

    return mk({
      idSuffix: `${total}-${buses}-${inCars}`,
      promptText,
      katexQuestion,
      katexExplanation: longDivisionExplanation({
        title: 'Baby word problem: students per bus (division).',
        story: 'Some students are in cars, and the rest are split equally into the buses.',
        totalLabel: 'Total students',
        total,
        removedLabel: 'Students in cars',
        removed: inCars,
        groupsLabel: 'Buses',
        groups: buses,
        unit: 'students',
        answer: perBus,
      }),
      answerKind: 'integer',
      expectedNumber: perBus,
    });
  }

  if (variantId === 'unit_price_total_and_left') {
    const count = rng.int(3, input.difficulty === 'easy' ? 9 : 15);
    const unit = rng.int(1, input.difficulty === 'easy' ? 6 : 15);
    const spent = count * unit;
    const left = rng.int(1, input.difficulty === 'easy' ? 15 : 60);
    const totalMoney = spent + left;
    const item = ['pencils', 'erasers', 'markers', 'notebooks'][rng.int(0, 3)]!;
    const who3 = pickName(input.seed, rng.int(121, 200));

    const promptText = `${who3} had $${totalMoney} to spend on ${count} ${item}. After buying them, ${who3} had $${left} left. How much did each ${item.slice(0, -1)} cost?`;
    const katexQuestion = String.raw`\text{${who3} had \$${totalMoney} to spend on ${count} ${item}. After buying them, ${who3} had \$${left} left. How much did each ${item.slice(0, -1)} cost?}`;

    return mk({
      idSuffix: `${totalMoney}-${left}-${count}`,
      promptText,
      katexQuestion,
      katexExplanation: longUnitPriceExplanation({
        title: 'Baby word problem: unit price (total and left).',
        story: `We know the starting money and the money left. The difference is what was spent on the ${item}.`,
        totalMoney,
        leftMoney: left,
        count,
        unitName: item.slice(0, -1),
        answer: unit,
      }),
      answerKind: 'integer',
      expectedNumber: unit,
    });
  }

  if (variantId === 'unit_price_with_extra_item') {
    const count = rng.int(2, input.difficulty === 'easy' ? 8 : 15);
    const unit = rng.int(1, input.difficulty === 'easy' ? 10 : 25);
    const extra = rng.int(1, input.difficulty === 'easy' ? 12 : 30);
    const totalCost = count * unit + extra;
    const item = ['erasers', 'pencils', 'stickers', 'snacks'][rng.int(0, 3)]!;
    const extraItem = ['magazine', 'ruler', 'drink', 'toy'][rng.int(0, 3)]!;

    const promptText = `You bought a ${extraItem} for $${extra} and ${count} ${item}. You spent a total of $${totalCost}. How much did each ${item.slice(0, -1)} cost?`;
    const katexQuestion = String.raw`\text{You bought a ${extraItem} for \$${extra} and ${count} ${item}. You spent a total of \$${totalCost}. How much did each ${item.slice(0, -1)} cost?}`;

    return mk({
      idSuffix: `${extra}-${count}-${totalCost}`,
      promptText,
      katexQuestion,
      katexExplanation: longUnitPriceExplanation({
        title: 'Baby word problem: unit price (remove the extra item first).',
        story: `The total includes the ${extraItem} AND the ${item}. Subtract the ${extraItem} cost first.`,
        totalMoney: totalCost,
        extraCost: extra,
        count,
        unitName: item.slice(0, -1),
        answer: unit,
      }),
      answerKind: 'integer',
      expectedNumber: unit,
    });
  }

  if (variantId === 'consecutive_three_sum') {
    const smallest = rng.int(input.difficulty === 'easy' ? 1 : 10, input.difficulty === 'ultimate' ? 200 : 120);
    const sum = smallest + (smallest + 1) + (smallest + 2);
    const promptText = `The sum of three consecutive numbers is ${sum}. What is the smallest of these numbers?`;
    const katexQuestion = String.raw`\text{The sum of three consecutive numbers is ${sum}. What is the smallest of these numbers?}`;

    return mk({
      idSuffix: `${sum}`,
      promptText,
      katexQuestion,
      katexExplanation: longConsecutiveExplanation({
        title: 'Baby word problem: consecutive numbers.',
        story: 'Consecutive numbers go up by 1 each time.',
        sum,
        smallest,
        step: 1,
      }),
      answerKind: 'integer',
      expectedNumber: smallest,
    });
  }

  if (variantId === 'consecutive_even_three_sum') {
    const smallest = 2 * rng.int(input.difficulty === 'easy' ? 1 : 10, input.difficulty === 'ultimate' ? 250 : 150);
    const sum = smallest + (smallest + 2) + (smallest + 4);
    const promptText = `The sum of three consecutive even numbers is ${sum}. What is the smallest of these numbers?`;
    const katexQuestion = String.raw`\text{The sum of three consecutive even numbers is ${sum}. What is the smallest of these numbers?}`;

    return mk({
      idSuffix: `${sum}`,
      promptText,
      katexQuestion,
      katexExplanation: longConsecutiveExplanation({
        title: 'Baby word problem: consecutive even numbers.',
        story: 'Consecutive even numbers go up by 2 each time.',
        sum,
        smallest,
        step: 2,
      }),
      answerKind: 'integer',
      expectedNumber: smallest,
    });
  }

  if (variantId === 'reverse_half_destroyed') {
    const bought = rng.int(2, input.difficulty === 'easy' ? 12 : 30);
    const final = rng.int(input.difficulty === 'easy' ? 8 : 20, input.difficulty === 'ultimate' ? 250 : 120);
    const start = 2 * final - bought;
    const item = ['boxes', 'hats', 'comic books', 'cards'][rng.int(0, 3)]!;
    const who3 = pickName(input.seed, rng.int(121, 200));

    const promptText = `${who3} bought ${bought} ${item}. Later, half of all their ${item} were destroyed. Now there are only ${final} left. How many did ${who3} start with?`;
    const katexQuestion = String.raw`\text{${who3} bought ${bought} ${item}. Later, half of all their ${item} were destroyed. Now there are only ${final} left. How many did ${who3} start with?}`;

    return mk({
      idSuffix: `${bought}-${final}`,
      promptText,
      katexQuestion,
      katexExplanation: longReverseHalfExplanation({
        title: 'Baby word problem: work backwards (half destroyed).',
        story: 'Half were destroyed, and we know the final amount. Work backwards to find the start.',
        final,
        boughtOrAdded: bought,
        startLabel: 'start',
        answer: start,
      }),
      answerKind: 'integer',
      expectedNumber: start,
    });
  }

  if (variantId === 'reverse_half_spent_then_earned') {
    const earned = rng.int(1, input.difficulty === 'easy' ? 10 : 25);
    const base = rng.int(input.difficulty === 'easy' ? 6 : 15, input.difficulty === 'ultimate' ? 200 : 120);
    const final = 2 * base + earned;
    const allowance = 2 * base;
    const who3 = pickName(input.seed, rng.int(121, 200));

    const promptText = `${who3} spent half of their weekly allowance. To earn more money, ${who3} was paid $${earned} for a job. ${who3} ended with $${final}. What was the weekly allowance?`;
    const katexQuestion = String.raw`\text{${who3} spent half of their weekly allowance. To earn more money, ${who3} was paid \$${earned} for a job. ${who3} ended with \$${final}. What was the weekly allowance?}`;

    return mk({
      idSuffix: `${earned}-${final}`,
      promptText,
      katexQuestion,
      katexExplanation: longHalfThenEarnedExplanation({
        title: 'Baby word problem: half spent then earned (equation).',
        story: 'After spending half, you have x/2 left. Then you add the earned money to get the final amount.',
        earned,
        final,
        answer: allowance,
      }),
      answerKind: 'integer',
      expectedNumber: allowance,
    });
  }

  if (variantId === 'share_after_taking') {
    const kids = rng.int(2, input.difficulty === 'easy' ? 6 : 10);
    const each = rng.int(1, input.difficulty === 'easy' ? 6 : 15);
    const took = rng.int(1, input.difficulty === 'easy' ? 20 : 50);
    const total = took + kids * each;
    const item = ['candies', 'cookies', 'stickers'][rng.int(0, 2)]!;
    const who3 = pickName(input.seed, rng.int(121, 200));

    const promptText = `${who3} had some ${item} to share with ${kids} children. ${who3} first took ${took} for themself and then shared the rest equally. Each child received ${each}. How many ${item} did ${who3} start with?`;
    const katexQuestion = String.raw`\text{${who3} had some ${item} to share with ${kids} children. ${who3} first took ${took} for themself and then shared the rest equally. Each child received ${each}. How many ${item} did ${who3} start with?}`;

    const shared = kids * each;
    const steps: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Baby word problem: work backwards (took some, then shared equally).' },
      { kind: 'text', content: 'Step 1: Work out how many were shared in total.' },
      { kind: 'math', content: String.raw`\text{shared} = ${kids}\times${each} = ${shared}`, displayMode: true },
      { kind: 'text', content: 'Step 2: Add back the amount taken at the start.' },
      { kind: 'math', content: String.raw`\text{start} = ${shared} + ${took} = ${total}`, displayMode: true },
      { kind: 'text', content: 'Step 3: Final answer.' },
      { kind: 'math', content: String.raw`\boxed{${total}}`, displayMode: true },
    ];

    return mk({
      idSuffix: `${kids}-${each}-${took}`,
      promptText,
      katexQuestion,
      katexExplanation: steps,
      answerKind: 'integer',
      expectedNumber: total,
    });
  }

  if (variantId === 'friends_from_give_each') {
    const giveEach = rng.int(1, input.difficulty === 'easy' ? 6 : 12);
    const friends = rng.int(2, input.difficulty === 'easy' ? 10 : 25);
    const remaining = rng.int(0, input.difficulty === 'easy' ? 15 : 60);
    const start = remaining + giveEach * friends;
    const item = ['bouncy balls', 'stickers', 'lollies'][rng.int(0, 2)]!;
    const who3 = pickName(input.seed, rng.int(121, 200));

    const promptText = `${who3} won ${start} ${item}. Later, ${who3} gave ${giveEach} to each of their friends. Now ${who3} has ${remaining} left. How many friends does ${who3} have?`;
    const katexQuestion = String.raw`\text{${who3} won ${start} ${item}. Later, ${who3} gave ${giveEach} to each of their friends. Now ${who3} has ${remaining} left. How many friends does ${who3} have?}`;

    const steps: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Baby word problem: find number of friends (division).' },
      { kind: 'text', content: 'Step 1: Find how many items were given away.' },
      { kind: 'math', content: String.raw`\text{given away} = ${start} - ${remaining} = ${start - remaining}`, displayMode: true },
      { kind: 'text', content: 'Step 2: If each friend got the same amount, divide to find the number of friends.' },
      { kind: 'math', content: String.raw`\text{friends} = \frac{${start - remaining}}{${giveEach}} = ${friends}`, displayMode: true },
      { kind: 'text', content: 'Step 3: Final answer.' },
      { kind: 'math', content: String.raw`\boxed{${friends}}`, displayMode: true },
    ];

    return mk({
      idSuffix: `${start}-${giveEach}-${remaining}`,
      promptText,
      katexQuestion,
      katexExplanation: steps,
      answerKind: 'integer',
      expectedNumber: friends,
    });
  }

  if (variantId === 'reverse_half_sold_then_bought') {
    const final = rng.int(input.difficulty === 'easy' ? 20 : 40, input.difficulty === 'ultimate' ? 500 : 200);
    const bought = rng.int(2, input.difficulty === 'easy' ? 30 : 80);
    const start = 2 * (final - bought);
    const item = ['comic books', 'cards', 'stickers'][rng.int(0, 2)]!;
    const who3 = pickName(input.seed, rng.int(121, 200));

    const promptText = `${who3} sold half of their ${item} and then bought ${bought} more. Now ${who3} has ${final}. How many did ${who3} begin with?`;
    const katexQuestion = String.raw`\text{${who3} sold half of their ${item} and then bought ${bought} more. Now ${who3} has ${final}. How many did ${who3} begin with?}`;

    const steps: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Baby word problem: sold half then bought more (work backwards).' },
      { kind: 'text', content: 'Step 1: Undo the “bought more” step by subtracting.' },
      { kind: 'math', content: String.raw`\text{after selling half} = ${final} - ${bought} = ${final - bought}`, displayMode: true },
      { kind: 'text', content: 'Step 2: Undo “sold half” by doubling.' },
      { kind: 'math', content: String.raw`\text{begin} = 2\times${final - bought} = ${start}`, displayMode: true },
      { kind: 'text', content: 'Step 3: Final answer.' },
      { kind: 'math', content: String.raw`\boxed{${start}}`, displayMode: true },
    ];

    return mk({
      idSuffix: `${final}-${bought}`,
      promptText,
      katexQuestion,
      katexExplanation: steps,
      answerKind: 'integer',
      expectedNumber: start,
    });
  }

  if (variantId === 'reverse_half_destroyed_after_buy') {
    const bought = rng.int(2, input.difficulty === 'easy' ? 12 : 30);
    const final = rng.int(input.difficulty === 'easy' ? 8 : 20, input.difficulty === 'ultimate' ? 250 : 120);
    const start = 2 * final - bought;
    const item = ['boxes', 'hats', 'toys'][rng.int(0, 2)]!;
    const day1 = ['Monday', 'Tuesday', 'Wednesday'][rng.int(0, 2)]!;

    const promptText = `On ${day1} ${who} bought ${bought} ${item}. On the next day, half of all the ${item} were destroyed. Now there are only ${final} left. How many did ${who} have on ${day1} before buying more?`;
    const katexQuestion = String.raw`\text{On ${day1} ${who} bought ${bought} ${item}. On the next day, half of all the ${item} were destroyed. Now there are only ${final} left. How many did ${who} have on ${day1} before buying more?}`;

    return mk({
      idSuffix: `${bought}-${final}-${day1}`,
      promptText,
      katexQuestion,
      katexExplanation: longReverseHalfExplanation({
        title: 'Baby word problem: bought some, then half destroyed (work backwards).',
        story: 'After half were destroyed, we know the final amount. Work backwards to find the starting amount.',
        final,
        boughtOrAdded: bought,
        startLabel: 'start',
        answer: start,
      }),
      answerKind: 'integer',
      expectedNumber: start,
    });
  }

  if (variantId === 'pies_from_pieces') {
    const piecesPerPie = rng.int(2, input.difficulty === 'easy' ? 8 : 12);
    const pies = rng.int(4, input.difficulty === 'easy' ? 20 : 60);
    const totalPieces = pies * piecesPerPie;

    const promptText = `Each pie was cut into ${piecesPerPie} pieces. There were ${totalPieces} pieces in total. How many pies were there?`;
    const katexQuestion = String.raw`\text{Each pie was cut into ${piecesPerPie} pieces. There were ${totalPieces} pieces in total. How many pies were there?}`;

    return mk({
      idSuffix: `${piecesPerPie}-${totalPieces}`,
      promptText,
      katexQuestion,
      katexExplanation: longDivisionExplanation({
        title: 'Baby word problem: pies from pieces (division).',
        story: 'Total pieces equals (pies) × (pieces per pie). So pies = total ÷ pieces per pie.',
        totalLabel: 'Total pieces',
        total: totalPieces,
        groupsLabel: 'Pieces per pie',
        groups: piecesPerPie,
        unit: 'pies',
        answer: pies,
      }),
      answerKind: 'integer',
      expectedNumber: pies,
    });
  }

  if (variantId === 'weight_total') {
    const w1 = rng.int(r.grams[0], r.grams[1]);
    const w2 = rng.int(r.grams[0], r.grams[1]);
    const items = [
      { a: 'lentils', b: 'kidney beans' },
      { a: 'rice', b: 'pasta' },
      { a: 'apples', b: 'oranges' },
      { a: 'flour', b: 'sugar' },
    ];
    const it = items[rng.int(0, items.length - 1)]!;
    const ans = w1 + w2;

    const promptText = `A packet of ${it.a} weighs ${w1} g and a packet of ${it.b} weighs ${w2} g. What is their total weight?`;
    const katexQuestion = String.raw`\text{A packet of ${it.a} weighs ${w1}\text{ g and a packet of ${it.b} weighs ${w2}\text{ g. What is their total weight?}}`;

    return mk({
      idSuffix: `${w1}-${w2}-${it.a}`,
      promptText,
      katexQuestion,
      katexExplanation: longAddSubExplanation({
        title: 'Baby word problem: total weight (addition).',
        story: 'We are combining two weights. “Total weight” means add them.',
        aLabel: `Weight of ${it.a}`,
        bLabel: `Weight of ${it.b}`,
        a: w1,
        b: w2,
        op: '+',
        unit: 'g',
        answer: ans,
      }),
      answerKind: 'integer',
      expectedNumber: ans,
    });
  }

  // inventory_after_order
  {
    const have = rng.int(r.count[0], r.count[1]);
    const more = rng.int(r.count[0], r.count[1]);
    const items = ['bottles of lemonade', 'packets of chips', 'boxes of tissues', 'cans of drink', 'toy blocks'];
    const it = items[rng.int(0, items.length - 1)]!;
    const ans = have + more;

    const promptText = `A shopkeeper has ${have} ${it}. They order ${more} more. How many ${it} will they have now?`;
    const katexQuestion = String.raw`\text{A shopkeeper has ${have} ${it}. They order ${more} more. How many ${it} will they have now?}`;

    return mk({
      idSuffix: `${have}-${more}-${it}`,
      promptText,
      katexQuestion,
      katexExplanation: longAddSubExplanation({
        title: 'Baby word problem: inventory after ordering (addition).',
        story: 'Ordering more increases the amount you have, so we add.',
        aLabel: 'Starting amount',
        bLabel: 'Ordered amount',
        a: have,
        b: more,
        op: '+',
        unit: it,
        answer: ans,
      }),
      answerKind: 'integer',
      expectedNumber: ans,
    });
  }
}
