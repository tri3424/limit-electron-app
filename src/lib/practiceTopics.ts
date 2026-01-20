import { PracticeDifficulty } from '@/lib/practiceGenerators/quadraticFactorization';

export type PracticeTopicId =
  | 'quadratics'
  | 'linear_equations'
  | 'algebraic_factorisation'
  | 'clock_reading'
  | 'addition'
  | 'subtraction'
  | 'multiplication'
  | 'division'
  | 'fractions'
  | 'indices'
  | 'logarithms'
  | 'permutation_combination'
  | 'polynomials'
  | 'simultaneous_equations'
  | 'graph_quadratic_line'
  | 'graph_straight_line'
  | 'graph_trigonometry'
  | 'graph_unit_circle'
  | 'word_problems'
  | 'differentiation'
  | 'integration';

export type PracticeTopic = {
  id: PracticeTopicId;
  title: string;
  description: string;
  enabled: boolean;
  difficulties: PracticeDifficulty[];
};

export const PRACTICE_TOPICS: PracticeTopic[] = [
  {
    id: 'addition',
    title: 'Addition',
    description: 'Add two numbers.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'subtraction',
    title: 'Subtraction',
    description: 'Subtract two numbers.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'multiplication',
    title: 'Multiplication',
    description: 'Multiply two numbers.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'division',
    title: 'Division',
    description: 'Divide two numbers.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'fractions',
    title: 'Fractions',
    description: 'Simplify the fraction expression.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'clock_reading',
    title: 'Clock Reading',
    description: 'Read time, find end times, and calculate durations using analog clocks.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'linear_equations',
    title: 'Linear Equations',
    description: 'Solve for x.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'simultaneous_equations',
    title: 'Simultaneous Equations',
    description: 'Solve for x and y.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'graph_straight_line',
    title: 'Straight Line Graphs',
    description: 'Find the equation of a straight line from a graph.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'indices',
    title: 'Indices',
    description: 'Use index laws to find the final exponent.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'logarithms',
    title: 'Logarithms',
    description: 'Convert between logarithmic and exponential forms and evaluate logs.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'algebraic_factorisation',
    title: 'Algebraic Factorisation',
    description: 'Factorise the expression.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'quadratics',
    title: 'Quadratic Equations',
    description: 'Find the roots using factorisation.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'polynomials',
    title: 'Polynomials',
    description: 'Use the factor theorem to find unknown coefficients.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'graph_quadratic_line',
    title: 'Quadratic Graphs',
    description: 'Read a straight line equation from a graph with a parabola present.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'word_problems',
    title: 'Word Problems',
    description: 'Translate real-world statements into maths and solve step-by-step.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'graph_unit_circle',
    title: 'Circles',
    description: 'Arc length, sector area, and segment area.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'permutation_combination',
    title: 'Permutation Combination',
    description: 'Counting techniques: permutations, combinations, and restrictions.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'graph_trigonometry',
    title: 'Trigonometry',
    description: 'Practice trigonometry.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'differentiation',
    title: 'Differentiation',
    description: 'Differentiate expressions and interpret derivatives.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    id: 'integration',
    title: 'Integration',
    description: 'Find antiderivatives and interpret area under curves.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard'],
  },
];
