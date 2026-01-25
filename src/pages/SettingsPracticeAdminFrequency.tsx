import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Sliders, MoveLeft, RefreshCw } from 'lucide-react';
import { db, AppSettings, initializeSettings, User } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { PRACTICE_TOPICS } from '@/lib/practiceTopics';
import type { PracticeTopicId } from '@/lib/practiceTopics';
import type { PracticeDifficulty } from '@/lib/practiceGenerators/quadraticFactorization';

export default function SettingsPracticeAdminFrequency() {
  const navigate = useNavigate();

  const settings = useLiveQuery(() => db.settings.get('1'), [], null as any);
  const users = useLiveQuery(() => db.users.toArray());

  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null);
  const [freqUserKey, setFreqUserKey] = useState<string>('admin');
  const [freqTopicSearch, setFreqTopicSearch] = useState('');
  const [freqDraftWeights, setFreqDraftWeights] = useState<Record<string, number>>({});
  const [freqDraftMixedWeights, setFreqDraftMixedWeights] = useState<Record<string, number>>({});

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (settings === undefined) return;
    if (!settings) void initializeSettings();
  }, [settings]);

  useEffect(() => {
    setFreqDraftWeights({});
    setFreqDraftMixedWeights({});
  }, [freqUserKey]);

  const handleUpdateSettings = async (updates: Partial<AppSettings>) => {
    if (!localSettings) return;
    const newSettings = { ...localSettings, ...updates };
    setLocalSettings(newSettings);

    try {
      await db.settings.update('1', updates);
      toast.success('Settings updated');
    } catch (error) {
      toast.error('Failed to update settings');
      console.error(error);
    }
  };

  const updatePracticeFrequencies = async (nextByUserKey: any) => {
    await handleUpdateSettings({
      practiceFrequencies: {
        byUserKey: nextByUserKey,
      },
    } as any);
  };

  const topicVariants = useMemo(
    () =>
      PRACTICE_TOPICS.map((t) => {
        const base = { topicId: t.id as PracticeTopicId, label: t.title };
        if (t.id === 'graph_trigonometry') {
          return {
            ...base,
            variants: [
              { key: 'unit_circle', label: 'Unit circle', defaultValue: 70 },
              { key: 'ratio_quadrant', label: 'Quadrant + ratio', defaultValue: 10 },
              { key: 'identity_simplify', label: 'Identity simplify (MCQ)', defaultValue: 35 },
              { key: 'exact_values_special_angles', label: 'Exact values (sec/csc/cot, special angles)', defaultValue: 25 },
              { key: 'solve_trig_equation', label: 'Solve trig equations (multi-solution)', defaultValue: 25 },
              { key: 'compound_angle_expand', label: 'Compound-angle expansion (MCQ)', defaultValue: 25 },
              { key: 'exact_value_identities', label: 'Exact values from identities (MCQ)', defaultValue: 25 },
              { key: 'given_cosx_compound', label: 'Given cos x, find compound angle (MCQ)', defaultValue: 12 },
              { key: 'tan_add_sub_identity', label: 'Tan addition/subtraction exact value (MCQ)', defaultValue: 25 },
              { key: 'sumdiff_from_given_ratios', label: 'Given ratios + quadrants: sin/cos/tan of (A±B) (MCQ)', defaultValue: 22 },
            ],
          };
        }

        if (t.id === 'graph_unit_circle') {
          return {
            ...base,
            variants: [
              { key: 'arc_length_forward', label: 'Arc length (forward)', defaultValue: 10 },
              { key: 'arc_length_inverse_radius', label: 'Arc length (find radius/diameter)', defaultValue: 8 },
              { key: 'arc_length_inverse_theta', label: 'Arc length (find θ)', defaultValue: 6 },

              { key: 'sector_area_forward', label: 'Sector area (forward)', defaultValue: 10 },
              { key: 'sector_area_inverse_radius', label: 'Sector area (find radius/diameter)', defaultValue: 8 },
              { key: 'sector_area_inverse_theta', label: 'Sector area (find θ)', defaultValue: 6 },

              { key: 'sector_perimeter_forward', label: 'Sector perimeter', defaultValue: 7 },
              { key: 'chord_length_forward', label: 'Chord length', defaultValue: 7 },

              { key: 'segment_area_forward', label: 'Segment area (forward)', defaultValue: 6 },
              { key: 'segment_area_inverse_radius', label: 'Segment area (find radius/diameter)', defaultValue: 5 },
              { key: 'segment_area_inverse_theta', label: 'Segment area (find θ)', defaultValue: 4 },

              { key: 'midpoint_shaded_area_forward', label: 'Midpoint shaded area (forward)', defaultValue: 6 },
              { key: 'midpoint_shaded_area_inverse_radius', label: 'Midpoint shaded area (find radius/diameter)', defaultValue: 4 },

              { key: 'diameter_endpoints_equation', label: 'Diameter endpoints -> equation of circle', defaultValue: 8 },
              { key: 'diameter_endpoints_center', label: 'Diameter endpoints -> center coordinates', defaultValue: 5 },
            ],
          };
        }

        if (t.id === 'baby_word_problems') {
          return {
            ...base,
            variants: [
              { key: 'add_total', label: 'Altogether / total (addition)', defaultValue: 40 },
              { key: 'more_than', label: 'How many more? (subtraction)', defaultValue: 35 },
              { key: 'distance_total', label: 'Total distance travelled (addition)', defaultValue: 35 },
              { key: 'remaining_distance', label: 'How much further? (subtraction)', defaultValue: 35 },
              { key: 'score_total', label: 'Total score (addition)', defaultValue: 30 },
              { key: 'stamps_total', label: 'Stamps altogether (addition)', defaultValue: 30 },
              { key: 'weight_total', label: 'Total weight (addition)', defaultValue: 25 },
              { key: 'inventory_after_order', label: 'After ordering more (addition)', defaultValue: 25 },
              { key: 'money_left', label: 'Money left (subtraction)', defaultValue: 25 },
              { key: 'change_from_amount', label: 'Change (subtraction)', defaultValue: 25 },

              { key: 'students_per_bus', label: 'Students per bus (share after cars)', defaultValue: 25 },
              { key: 'unit_price_total_and_left', label: 'Unit price: total and left', defaultValue: 20 },
              { key: 'unit_price_with_extra_item', label: 'Unit price: includes an extra item', defaultValue: 18 },
              { key: 'consecutive_three_sum', label: '3 consecutive numbers: find smallest', defaultValue: 20 },
              { key: 'consecutive_even_three_sum', label: '3 consecutive even numbers: find smallest', defaultValue: 18 },
              { key: 'reverse_half_destroyed', label: 'Work backwards: bought then half destroyed', defaultValue: 18 },
              { key: 'reverse_half_destroyed_after_buy', label: 'Work backwards: half destroyed after buying', defaultValue: 18 },
              { key: 'reverse_half_sold_then_bought', label: 'Work backwards: sold half then bought more', defaultValue: 18 },
              { key: 'reverse_half_spent_then_earned', label: 'Work backwards: half spent then earned', defaultValue: 18 },
              { key: 'share_after_taking', label: 'Sharing: took some then shared equally', defaultValue: 18 },
              { key: 'friends_from_give_each', label: 'Friends count: gave each friend', defaultValue: 18 },
              { key: 'pies_from_pieces', label: 'Pies from pieces (division)', defaultValue: 18 },
            ],
          };
        }

        if (t.id === 'fractions') {
          return {
            ...base,
            variants: [
              { key: 'simplify_fraction', label: 'Simplify a fraction', defaultValue: 35 },
              { key: 'add_sub_fractions', label: 'Add/Subtract fractions', defaultValue: 35 },
              { key: 'fraction_of_number', label: 'Fraction of a number', defaultValue: 20 },
              { key: 'mixed_to_improper', label: 'Mixed -> improper', defaultValue: 10 },
            ],
          };
        }

        if (t.id === 'linear_equations') {
          return {
            ...base,
            variants: [
              { key: 'solve_x', label: 'Solve for x', defaultValue: 60 },
              { key: 'intersection', label: 'Intersection (two lines)', defaultValue: 40 },
            ],
          };
        }

        if (t.id === 'logarithms') {
          return {
            ...base,
            variants: [
              { key: 'exp_to_log', label: 'Convert exponential -> logarithmic', defaultValue: 25 },
              { key: 'exp_to_log_const', label: 'Convert exponential -> logarithmic (constant exponent)', defaultValue: 15 },
              { key: 'exp_to_log_two_vars', label: 'Convert x^y = c -> log_x(c) = y', defaultValue: 12 },
              { key: 'exp_to_log_ab_c', label: 'Convert a^b = c -> log_a(c) = b', defaultValue: 8 },
              { key: 'single_log_sum', label: 'Single log (sum rule)', defaultValue: 14 },
              { key: 'single_log_diff', label: 'Single log (difference rule)', defaultValue: 14 },
              { key: 'single_log_power', label: 'Single log (power rule)', defaultValue: 12 },
              { key: 'single_log_coeff_sum', label: 'Single log (coefficients, sum)', defaultValue: 10 },
              { key: 'single_log_coeff_diff', label: 'Single log (coefficients, difference)', defaultValue: 10 },
              { key: 'single_log_const_plus', label: 'Single log (constant ± log, plus)', defaultValue: 8 },
              { key: 'single_log_const_minus', label: 'Single log (constant ± log, minus)', defaultValue: 8 },
              { key: 'single_log_then_simplify', label: 'Single log then simplify', defaultValue: 10 },
              { key: 'solve_log_equation', label: 'Solve logarithmic equation', defaultValue: 12 },
              { key: 'solve_nested_log', label: 'Solve nested logs', defaultValue: 10 },
              { key: 'exp_inequality_log10', label: 'Solve exponential inequality (log10)', defaultValue: 10 },
              { key: 'solve_exp_sub_u_ax', label: 'Solve exponential (substitution u=a^x)', defaultValue: 10 },
              { key: 'evaluate_ln_3sf', label: 'Evaluate ln (4 s.f.)', defaultValue: 10 },
              { key: 'solve_ln_3sf', label: 'Solve ln equation (4 s.f.)', defaultValue: 10 },
              { key: 'solve_abs_exp_unique', label: 'Solve |a^x - A| = A (unique solution)', defaultValue: 10 },
              { key: 'evaluate_e_3sf', label: 'Evaluate e^x (4 s.f.)', defaultValue: 10 },
              { key: 'solve_exp_ln_exact', label: 'Solve e^(ax+b)=c (in terms of ln)', defaultValue: 10 },
              { key: 'exp_inequality_ln', label: 'Solve e^(ax+b) inequality (in terms of ln)', defaultValue: 10 },
              { key: 'log_to_exp_basic', label: 'Convert log -> exp (basic)', defaultValue: 16 },
              { key: 'log_to_exp_frac', label: 'Convert log -> exp (fraction exponent)', defaultValue: 10 },
              { key: 'log_to_exp_zero', label: 'Convert log -> exp (log(1)=0)', defaultValue: 8 },
              { key: 'log_to_exp_var_rhs', label: 'Convert log -> exp (variable RHS)', defaultValue: 8 },
              { key: 'solve_log_basic', label: 'Solve log_a(x)=k', defaultValue: 16 },
              { key: 'solve_log_linear', label: 'Solve log_a(mx+c)=k', defaultValue: 14 },
              { key: 'solve_log_zero', label: 'Solve log_a(x)=0', defaultValue: 10 },
              { key: 'evaluate_decimal', label: 'Evaluate log (decimal/fraction like 0.125)', defaultValue: 10 },
              { key: 'evaluate_root', label: 'Evaluate log (root -> fraction exponent)', defaultValue: 10 },
              { key: 'simplify_log_power', label: 'Simplify log_a(a^k)', defaultValue: 14 },
              { key: 'solve_exp_3sf', label: 'Solve a^x = b (4 s.f.)', defaultValue: 20 },
              { key: 'log_to_exp', label: 'Convert logarithmic -> exponential', defaultValue: 20 },
              { key: 'evaluate_integer', label: 'Evaluate log (integer)', defaultValue: 25 },
              { key: 'evaluate_fraction', label: 'Evaluate log (fraction input)', defaultValue: 10 },
            ],
          };
        }

        if (t.id === 'clock_reading') {
          return {
            ...base,
            variants: [
              { key: 'read_time', label: 'Read the time (HH:MM)', defaultValue: 35 },
              { key: 'end_time_ampm', label: 'Find end time (AM/PM)', defaultValue: 25 },
              { key: 'end_time_24h', label: 'Find end time (24-hour)', defaultValue: 20 },
              { key: 'duration_hm', label: 'Duration (hours + minutes)', defaultValue: 10 },
              { key: 'duration_minutes', label: 'Duration (total minutes)', defaultValue: 10 },
            ],
          };
        }

        if (t.id === 'permutation_combination') {
          return {
            ...base,
            variants: [
              { key: 'team_no_restriction', label: 'Team selection (no restrictions)', defaultValue: 20 },
              { key: 'team_group_not_separated', label: 'Team selection (group not separated)', defaultValue: 20 },
              { key: 'digits_even_unique', label: 'Digits (even, unique, no leading 0)', defaultValue: 20 },
              { key: 'arrange_together', label: 'Arrangements (two together)', defaultValue: 20 },
              { key: 'arrange_not_together', label: 'Arrangements (two not together)', defaultValue: 20 },
              { key: 'committee_men_women', label: 'Committee (men & women)', defaultValue: 20 },
            ],
          };
        }

        if (t.id === 'graph_straight_line') {
          return {
            ...base,
            variants: [
              { key: 'mcq_graph_equation', label: 'Graph -> equation (MCQ)', defaultValue: 50 },
              { key: 'y_intercept_from_equation', label: 'y-intercept from equation', defaultValue: 40 },
              { key: 'gradient_from_equation', label: 'gradient from equation', defaultValue: 10 },
              { key: 'line_circle_intersections_coords_ab', label: 'Line meets curve: coordinates of A and B', defaultValue: 0 },
              { key: 'line_circle_intersections_length_ab', label: 'Line meets curve: length of AB', defaultValue: 0 },
              { key: 'line_circle_intersections_midpoint_ab', label: 'Line meets curve: midpoint of AB', defaultValue: 0 },
            ],
          };
        }

        if (t.id === 'algebraic_factorisation') {
          return {
            ...base,
            variants: [
              { key: 'simple', label: 'Simple common factor', defaultValue: 5 },
              { key: 'x2', label: 'x^2 common factor', defaultValue: 3 },
              { key: 'x3', label: 'x^3 common factor', defaultValue: 2 },
              { key: 'x3_3term', label: 'x^3 three-term', defaultValue: 2 },
              { key: 'gcf_binomial', label: 'GCF + binomial', defaultValue: 4 },
              { key: 'gcf_quadratic', label: 'GCF + quadratic -> 2 binomials', defaultValue: 4 },
            ],
          };
        }

        if (t.id === 'quadratics') {
          return {
            ...base,
            variants: [
              { key: 'factorisation', label: 'Solve by factorisation', defaultValue: 55 },
              { key: 'complete_square_pqr', label: 'Express in form p(x−q)^2 + r (compare coefficients)', defaultValue: 15 },
              { key: 'complete_square_abc', label: 'Express in form (ax+b)^2 + c (compare coefficients)', defaultValue: 15 },
              { key: 'solve_complete_square_surd', label: 'Solve by completing the square (surd/decimal answers)', defaultValue: 15 },
            ],
          };
        }

        if (t.id === 'differentiation') {
          return {
            ...base,
            variants: [
              { key: 'basic_polynomial', label: 'Basic derivative', defaultValue: 70 },
              { key: 'stationary_points', label: 'Stationary points (double derivation)', defaultValue: 30 },
              { key: 'sqrt_params_point_gradient', label: 'Find a and b (curve through point + gradient)', defaultValue: 20 },
              { key: 'power_linear_point_gradient', label: 'Gradient at point: y=(ax+b)^n', defaultValue: 0 },
              { key: 'rational_yaxis_gradient', label: 'Gradient at y-axis crossing: y=k/(x-a)^2', defaultValue: 0 },
              { key: 'linear_minus_rational_xaxis_gradients', label: 'Gradients at x-axis crossings: y=x-p/(x+q)', defaultValue: 0 },
              { key: 'stationary_points_coords', label: 'Coordinates where gradient is 0 (stationary points)', defaultValue: 0 },
              { key: 'tangent_or_normal_equation', label: 'Equation of tangent/normal at x=a', defaultValue: 0 },
              { key: 'tangent_equation_at_point', label: 'Tangent equation at x=a', defaultValue: 0 },
              { key: 'normal_equation_at_point', label: 'Normal equation at x=a', defaultValue: 0 },
              { key: 'normal_y_intercept_coords', label: 'Normal meets y-axis: coordinates', defaultValue: 0 },
              { key: 'normal_x_intercept_coords', label: 'Normal meets x-axis: coordinates', defaultValue: 0 },
              { key: 'tangents_intersection_coords', label: 'Intersection of two tangents: coordinates', defaultValue: 0 },
            ],
          };
        }

        if (t.id === 'word_problems') {
          return {
            ...base,
            variants: [
              { key: 'probability_complement', label: 'Probability (complement)', defaultValue: 1 },
              { key: 'probability_two_bags_blue', label: 'Probability (two bags)', defaultValue: 1 },
              { key: 'algebra_rectangle_area', label: 'Rectangle area (algebraic sides)', defaultValue: 1 },
              { key: 'algebra_right_triangle_pythagoras', label: 'Right triangle (Pythagoras, solve for x)', defaultValue: 1 },
              { key: 'algebra_trapezium_area', label: 'Trapezium area (algebraic sides, solve for x)', defaultValue: 1 },
              { key: 'unit_conversion_speed', label: 'Unit conversion (speed)', defaultValue: 1 },
              { key: 'number_skills_mix', label: 'Number skills', defaultValue: 1 },
              { key: 'mensuration_cuboid_height', label: 'Mensuration (cuboid)', defaultValue: 1 },
              { key: 'mensuration_cuboid_xy_sum_volume', label: 'Mensuration (cuboid: x+y and volume)', defaultValue: 1 },
              { key: 'mensuration_cylinder_hemisphere_r_h', label: 'Mensuration (cylinder + hemisphere: r and h)', defaultValue: 1 },
              { key: 'greatest_odd_common_factor', label: 'GOCF', defaultValue: 1 },
              { key: 'compound_interest_rate', label: 'Compound interest', defaultValue: 1 },
              { key: 'bus_pass_increases', label: 'Bus pass', defaultValue: 1 },
              { key: 'number_properties_puzzle', label: 'Number puzzle', defaultValue: 1 },
            ],
          };
        }

        if (t.id === 'integration') {
          return {
            ...base,
            variants: [
              { key: 'indefinite', label: 'Indefinite', defaultValue: 55 },
              { key: 'definite', label: 'Definite', defaultValue: 45 },
            ],
          };
        }

        if (t.id === 'simultaneous_equations') {
          return {
            ...base,
            variants: [
              { key: 'two_var', label: '2 variables (2 equations)', defaultValue: 70 },
              { key: 'three_var', label: '3 variables (3 equations)', defaultValue: 30 },
              { key: 'lin_quad', label: 'Linear + quadratic (Ultimate only)', defaultValue: 35 },
            ],
          };
        }

        return {
          ...base,
          variants: [{ key: 'default', label: 'Default', defaultValue: 1 }],
        };
      }),
    []
  );

  const prettyVariantLabel = (raw: string) => {
    const s0 = String(raw ?? '').trim();
    if (!s0) return s0;
    return s0
      .replace(/\s*\(MCQ\)\s*/gi, '')
      .replace(/\s*\(multi-solution\)\s*/gi, '')
      .replace(/\s*\(4 s\.f\.\)\s*/gi, ' (4 s.f.)')
      .replace(/->/g, '→')
      .replace(/\s+/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase());
  };

  const variantDescription = (topicId: string, variantKey: string, label: string) => {
    const l = String(label ?? '').toLowerCase();
    const k = String(variantKey ?? '').toLowerCase();
    if (/(\bmcq\b|multiple choice)/.test(l) || /mcq/.test(k)) return 'Multiple-choice question.';
    if (/unit circle/.test(l)) return 'Identify angles/coordinates on the unit circle.';
    if (/quadrant/.test(l) && /(sin|cos|tan|ratio)/.test(l)) return 'Choose correct trig ratio using quadrant sign rules.';
    if (/solve/.test(l)) return 'Solve for the unknown(s) in an equation.';
    if (/evaluate/.test(l)) return 'Compute the required value.';
    if (/convert/.test(l) || /logarithmic/.test(l) || /exponential/.test(l)) return 'Convert between equivalent mathematical forms.';
    if (/simplify/.test(l)) return 'Simplify the expression to an equivalent form.';
    if (/intersection/.test(l)) return 'Find where two graphs/lines meet.';
    if (/gradient/.test(l) || /slope/.test(l)) return 'Work with gradients/slopes from a graph or equation.';
    if (/y-?intercept/.test(l)) return 'Find the y-intercept from a graph or equation.';
    if (/fraction/.test(l) && (/add|subtract/.test(l) || /add\/subtract/.test(l))) return 'Add or subtract fractions correctly.';
    if (/simplify a fraction/.test(l)) return 'Reduce a fraction to its simplest form.';
    if (/fraction of a number/.test(l)) return 'Find a fraction of a given quantity.';
    if (/mixed/.test(l) && /improper/.test(l)) return 'Convert between mixed and improper fractions.';
    if (/default/.test(l)) return 'General questions for this topic.';
    if (topicId === 'graph_straight_line' && /graph/.test(l) && /equation/.test(l)) return 'Read a straight-line graph and choose the correct equation.';
    return 'Adjust how often this question type appears.';
  };

  if (!localSettings) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  const pf = (localSettings as any)?.practiceFrequencies?.byUserKey ?? {};
  const userCfg = pf[freqUserKey] ?? {};
  const tvw = (userCfg.topicVariantWeights ?? {}) as Record<string, Record<string, number>>;
  const tvak = (userCfg.topicVariantAnswerKinds ?? {}) as Record<string, Record<string, string>>;
  const mmwAll = (userCfg.mixedModuleItemWeights ?? {}) as Record<string, Record<number, number>>;

  const setVariantWeight = async (topicId: string, variantKey: string, value: number) => {
    const next = { ...pf };
    const nextUser = { ...(next[freqUserKey] ?? {}) };
    const nextTvw = { ...(nextUser.topicVariantWeights ?? {}) };
    const nextTopic = { ...((nextTvw as any)[topicId] ?? {}) };
    nextTopic[variantKey] = value;
    (nextTvw as any)[topicId] = nextTopic;
    nextUser.topicVariantWeights = nextTvw;
    next[freqUserKey] = nextUser;
    await updatePracticeFrequencies(next);
  };

  const setVariantAnswerKind = async (topicId: string, variantKey: string, value: string) => {
    const next = { ...pf };
    const nextUser = { ...(next[freqUserKey] ?? {}) };
    const nextTvak = { ...(nextUser.topicVariantAnswerKinds ?? {}) };
    const nextTopic = { ...((nextTvak as any)[topicId] ?? {}) };
    nextTopic[variantKey] = value;
    (nextTvak as any)[topicId] = nextTopic;
    nextUser.topicVariantAnswerKinds = nextTvak;
    next[freqUserKey] = nextUser;
    await updatePracticeFrequencies(next);
  };

  const setMixedItemWeight = async (moduleId: string, idx: number, value: number) => {
    const next = { ...pf };
    const nextUser = { ...(next[freqUserKey] ?? {}) };
    const nextMmw = { ...(nextUser.mixedModuleItemWeights ?? {}) };
    const nextModule = { ...(nextMmw[moduleId] ?? {}) };
    nextModule[idx] = value;
    nextMmw[moduleId] = nextModule;
    nextUser.mixedModuleItemWeights = nextMmw;
    next[freqUserKey] = nextUser;
    await updatePracticeFrequencies(next);
  };

  const q = freqTopicSearch.trim().toLowerCase();
  const filtered = !q
    ? topicVariants
    : topicVariants.filter((t) => t.label.toLowerCase().includes(q) || t.topicId.toLowerCase().includes(q));

  const applyDefaultsForSelectedUser = async () => {
    const next = { ...pf };
    const nextUser = { ...(next[freqUserKey] ?? {}) };

    const nextTvw: Record<string, Record<string, number>> = {};
    for (const t of topicVariants) {
      const byVariant: Record<string, number> = {};
      for (const v of t.variants ?? []) {
        byVariant[v.key] = Number(v.defaultValue ?? 0);
      }
      nextTvw[t.topicId] = byVariant;
    }

    nextUser.topicVariantWeights = nextTvw;
    nextUser.topicVariantAnswerKinds = {};
    next[freqUserKey] = nextUser;
    await updatePracticeFrequencies(next);
    setFreqDraftWeights({});
    setFreqDraftMixedWeights({});
    toast.success('Defaults applied');
  };

  const resetOverridesForSelectedUser = async () => {
    const next = { ...pf };
    delete next[freqUserKey];
    await updatePracticeFrequencies(next);
    setFreqDraftWeights({});
    setFreqDraftMixedWeights({});
    toast.success('Overrides reset');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 px-4 md:px-6 py-8">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/settings/practice-admin')}>
              <MoveLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Frequency Controls</h1>
          </div>
          <p className="text-muted-foreground mt-2 leading-relaxed">
            Control how frequently variants appear for a specific user.
          </p>
        </div>
      </div>

      <Card className="p-6 rounded-2xl shadow-sm border border-border/70 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 rounded-xl border bg-muted/20 p-2.5">
              <Sliders className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold tracking-tight text-foreground">Configuration</div>
              <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                These settings apply to the selected user.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={() => void applyDefaultsForSelectedUser()}>
              Apply defaults
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label="Reset overrides" onClick={() => void resetOverridesForSelectedUser()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>User</Label>
            <Select value={freqUserKey} onValueChange={(v) => setFreqUserKey(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">admin</SelectItem>
                {(users ?? ([] as User[])).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>Search topics</Label>
            <Input value={freqTopicSearch} onChange={(e) => setFreqTopicSearch(e.target.value)} placeholder="Search…" />
          </div>
        </div>

        <Accordion type="single" collapsible>
          {filtered.map((t) => (
            <AccordionItem key={t.topicId} value={t.topicId}>
              <AccordionTrigger>{t.label}</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  {(t.variants ?? []).map((v) => {
                    const persisted = Number((tvw as any)?.[t.topicId]?.[v.key] ?? v.defaultValue ?? 0);
                    const draftKey = `${t.topicId}:${v.key}`;
                    const current = typeof (freqDraftWeights as any)[draftKey] === 'number'
                      ? Number((freqDraftWeights as any)[draftKey])
                      : persisted;
                    const answerKind = String((tvak as any)?.[t.topicId]?.[v.key] ?? '');
                    const displayLabel = prettyVariantLabel(v.label);
                    const desc = variantDescription(t.topicId, v.key, v.label);
                    return (
                      <div key={v.key} className="space-y-2 rounded-xl border border-border/70 bg-muted/10 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{displayLabel}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed truncate">{desc}</div>
                          </div>
                          <div className="text-sm text-muted-foreground tabular-nums">{Math.round(current)}</div>
                        </div>
                        <Slider
                          value={[current]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={(vals) => {
                            const nextVal = Array.isArray(vals) ? Number(vals[0] ?? 0) : 0;
                            setFreqDraftWeights((m) => ({ ...m, [draftKey]: nextVal }));
                          }}
                          onValueCommit={(vals) => {
                            const nextVal = Array.isArray(vals) ? Number(vals[0] ?? 0) : 0;
                            setFreqDraftWeights((m) => {
                              const next = { ...m };
                              delete (next as any)[draftKey];
                              return next;
                            });
                            void setVariantWeight(t.topicId, v.key, nextVal);
                          }}
                        />

                        {t.topicId === 'logarithms' ? (
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm text-muted-foreground">Answer style</div>
                            <Select
                              value={answerKind || '__default__'}
                              onValueChange={(val) => {
                                void setVariantAnswerKind(t.topicId, v.key, val === '__default__' ? '' : val);
                              }}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Default" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__">Default</SelectItem>
                                <SelectItem value="integer">Integer</SelectItem>
                                <SelectItem value="rational">Fraction</SelectItem>
                                <SelectItem value="decimal_3sf">Decimal</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <Accordion type="single" collapsible>
          <AccordionItem value="mixed">
            <AccordionTrigger>Mixed modules</AccordionTrigger>
            <AccordionContent>
              {(localSettings?.mixedPracticeModules ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">No mixed modules yet.</div>
              ) : (
                <Accordion type="single" collapsible>
                  {(localSettings?.mixedPracticeModules ?? []).map((m: any) => (
                    <AccordionItem key={m.id} value={m.id}>
                      <AccordionTrigger>{m.title || 'Untitled mixed module'}</AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4">
                          {(m.items ?? []).map((it: any, idx: number) => {
                            const k = `${m.id}:${idx}`;
                            const persisted = Number((mmwAll?.[m.id]?.[idx] ?? 0));
                            const current = typeof freqDraftMixedWeights[k] === 'number' ? freqDraftMixedWeights[k]! : persisted;
                            return (
                              <div key={idx} className="space-y-2 rounded-xl border border-border/70 bg-muted/10 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-xs text-muted-foreground truncate">
                                    {idx}. {it.topicId} ({it.difficulty})
                                  </div>
                                  <div className="text-xs text-muted-foreground tabular-nums">{Math.round(current)}</div>
                                </div>
                                <Slider
                                  value={[current]}
                                  min={0}
                                  max={100}
                                  step={1}
                                  onValueChange={(vals) => {
                                    const nextVal = Array.isArray(vals) ? Number(vals[0] ?? 0) : 0;
                                    setFreqDraftMixedWeights((m2) => ({ ...m2, [k]: nextVal }));
                                  }}
                                  onValueCommit={(vals) => {
                                    const nextVal = Array.isArray(vals) ? Number(vals[0] ?? 0) : 0;
                                    setFreqDraftMixedWeights((m2) => {
                                      const next = { ...m2 };
                                      delete next[k];
                                      return next;
                                    });
                                    void setMixedItemWeight(m.id, idx, nextVal);
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    </div>
  );
}
