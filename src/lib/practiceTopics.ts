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
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'subtraction',
    title: 'Subtraction',
    description: 'Subtract two numbers.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'multiplication',
    title: 'Multiplication',
    description: 'Multiply two numbers.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'division',
    title: 'Division',
    description: 'Divide two numbers.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'fractions',
    title: 'Fractions',
    description: 'Simplify the fraction expression.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'clock_reading',
    title: 'Clock Reading',
    description: 'Read and interpret time on analogue clocks.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'linear_equations',
    title: 'Linear Equations',
    description: 'Solve linear equations.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'simultaneous_equations',
    title: 'Simultaneous Equations',
    description: 'Solve systems of equations.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'graph_straight_line',
    title: 'Graphs: Straight Line',
    description: 'Interpret straight-line graphs (MCQ).',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'indices',
    title: 'Indices',
    description: 'Apply laws of indices.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'logarithms',
    title: 'Logarithms',
    description: 'Use logarithms and log laws.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'algebraic_factorisation',
    title: 'Factorisation',
    description: 'Factorise expressions.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'quadratics',
    title: 'Quadratics',
    description: 'Solve quadratic equations.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'polynomials',
    title: 'Polynomials',
    description: 'Polynomial factor theorem and related skills.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'graph_quadratic_line',
    title: 'Graphs: Quadratic + Line',
    description: 'Interpret quadratic-line graphs (MCQ).',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'word_problems',
    title: 'Word Problems',
    description: 'Solve word problems.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'graph_unit_circle',
    title: 'Circular Measure',
    description: 'Angles in radians, arc length and sector area.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'permutation_combination',
    title: 'Permutations & Combinations',
    description: 'Count arrangements and selections.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'graph_trigonometry',
    title: 'Trigonometry Graphs',
    description: 'Read values from trig graphs.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'differentiation',
    title: 'Differentiation',
    description: 'Differentiate functions.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
  {
    id: 'integration',
    title: 'Integration',
    description: 'Integrate functions.',
    enabled: true,
    difficulties: ['easy', 'medium', 'hard', 'ultimate'],
  },
];
