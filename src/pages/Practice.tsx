import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Dexie from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Katex } from '@/components/Katex';
import { PolynomialLongDivision } from '@/components/PolynomialLongDivision';
import { PromptBlocksFlow } from '@/components/PromptBlocksFlow';
import { ArrowLeft, Bug, CircleHelp } from 'lucide-react';
import MathLiveInput from '@/components/MathLiveInput';
import InteractiveGraph from '@/components/InteractiveGraph';
import { PRACTICE_TOPICS, PracticeTopicId } from '@/lib/practiceTopics';
import { Fraction, fractionToDisplay, fractionToLatex, fractionsEqual, normalizeFraction, parseFraction } from '@/lib/fraction';
import { db } from '@/lib/db';
import { PracticeDifficulty } from '@/lib/practiceGenerators/quadraticFactorization';
import { generatePracticeQuestion, PracticeQuestion, GraphPracticeQuestion } from '@/lib/practiceEngine';
import { normalizeUniversalMathAnswer } from '@/lib/universalMathNormalize';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { HOME_ROUTE } from '@/constants/routes';

type PracticeVariantOverride = {
  topicId: PracticeTopicId;
  variantId: string;
} | null;

type PracticeVariantMultiOverride = {
  topicId: PracticeTopicId;
  variantIds: string[];
} | null;

const PRACTICE_VARIANTS: Partial<Record<PracticeTopicId, string[]>> = {
  quadratics: ['factorisation', 'complete_square_pqr', 'complete_square_abc', 'solve_complete_square_surd'],
  clock_reading: ['read_time', 'end_time_ampm', 'end_time_24h', 'duration_hm', 'duration_minutes'],
  linear_equations: ['linear'],
  indices: ['mul', 'div', 'pow'],
  logarithms: [
    'exp_to_log',
    'exp_to_log_const',
    'exp_to_log_two_vars',
    'exp_to_log_ab_c',
    'single_log_sum',
    'single_log_diff',
    'single_log_power',
    'single_log_coeff_sum',
    'single_log_coeff_diff',
    'single_log_const_plus',
    'single_log_const_minus',
    'single_log_then_simplify',
    'solve_log_equation',
    'solve_nested_log',
    'exp_inequality_log10',
    'solve_exp_sub_u_ax',
    'evaluate_ln_3sf',
    'solve_ln_3sf',
    'solve_abs_exp_unique',
    'evaluate_e_3sf',
    'solve_exp_ln_exact',
    'exp_inequality_ln',
    'log_to_exp_basic',
    'log_to_exp_frac',
    'log_to_exp_zero',
    'log_to_exp_var_rhs',
    'solve_log_basic',
    'solve_log_linear',
    'solve_log_zero',
    'evaluate_decimal',
    'evaluate_root',
    'simplify_log_power',
    'log_to_exp',
    'solve_exp_3sf',
    'evaluate_integer',
    'evaluate_fraction',
  ],
  fractions: ['simplify_fraction', 'add_sub_fractions', 'fraction_of_number', 'mixed_to_improper'],
  algebraic_factorisation: ['simple', 'x2', 'x3', 'x3_3term', 'gcf_binomial', 'gcf_quadratic'],
  simultaneous_equations: ['two_var', 'three_var', 'lin_quad'],
  permutation_combination: [
    'team_no_restriction',
    'team_group_not_separated',
    'digits_even_unique',
    'arrange_together',
    'arrange_not_together',
    'committee_men_women',
  ],
  polynomials: ['factor_theorem'],
  graph_straight_line: [
    'mcq_graph_equation',
    'y_intercept_from_equation',
    'gradient_from_equation',
    'line_circle_intersections_coords_ab',
    'line_circle_intersections_length_ab',
    'line_circle_intersections_midpoint_ab',
  ],
  word_problems: [
    'mensuration_cuboid_height',
    'probability_complement',
    'algebra_rectangle_area',
    'algebra_right_triangle_pythagoras',
    'algebra_trapezium_area',
    'mensuration_cuboid_xy_sum_volume',
    'mensuration_cylinder_hemisphere_r_h',
    'unit_conversion_speed',
    'number_skills_mix',
    'greatest_odd_common_factor',
    'compound_interest_rate',
    'probability_two_bags_blue',
    'bus_pass_increases',
    'number_properties_puzzle',
  ],
  baby_word_problems: [
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
  ],
  graph_trigonometry: [
    'unit_circle',
    'ratio_quadrant',
    'identity_simplify',
    'exact_values_special_angles',
    'solve_trig_equation',
    'compound_angle_expand',
    'exact_value_identities',
    'given_cosx_compound',
    'tan_add_sub_identity',
    'sumdiff_from_given_ratios',
  ],
  graph_unit_circle: [
    'arc_length_forward',
    'arc_length_inverse_radius',
    'arc_length_inverse_theta',
    'sector_area_forward',
    'sector_area_inverse_radius',
    'sector_area_inverse_theta',
    'sector_perimeter_forward',
    'chord_length_forward',
    'midpoint_shaded_area_forward',
    'midpoint_shaded_area_inverse_radius',
    'segment_area_forward',
    'segment_area_inverse_radius',
    'segment_area_inverse_theta',
    'diameter_endpoints_equation',
    'diameter_endpoints_center',
  ],
  differentiation: [
    'basic_polynomial',
    'stationary_points',
    'sqrt_params_point_gradient',
    'power_linear_point_gradient',
    'rational_yaxis_gradient',
    'linear_minus_rational_xaxis_gradients',
    'stationary_points_coords',
    'tangent_or_normal_equation',
    'tangent_equation_at_point',
    'normal_equation_at_point',
    'normal_y_intercept_coords',
    'normal_x_intercept_coords',
    'tangents_intersection_coords',
  ],
  integration: ['indefinite', 'definite'],
};

function buildForcedVariantWeights(topicId: PracticeTopicId, variantId: string): Record<string, number> | null {
  const variants = PRACTICE_VARIANTS[topicId];
  if (!variants || variants.length === 0) return null;
  if (!variants.includes(variantId)) return null;
  const out: Record<string, number> = {};
  for (const v of variants) out[v] = v === variantId ? 1 : 0;
  return out;
}

function buildMultiVariantWeights(topicId: PracticeTopicId, variantIds: string[]): Record<string, number> | null {
  const variants = PRACTICE_VARIANTS[topicId];
  if (!variants || variants.length === 0) return null;
  const picked = (variantIds ?? []).map(String).map((s) => s.trim()).filter(Boolean);
  if (!picked.length) return null;
  const valid = picked.filter((v) => variants.includes(v));
  if (!valid.length) return null;
  const out: Record<string, number> = {};
  for (const v of variants) out[v] = valid.includes(v) ? 1 : 0;
  return out;
}

function normalizeCommandToken(s: string): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function editDistance(a: string, b: string): number {
  const s = normalizeCommandToken(a);
  const t = normalizeCommandToken(b);
  if (s === t) return 0;
  if (!s) return t.length;
  if (!t) return s.length;
  const dp = new Array(t.length + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const tmp = dp[j];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[j] = Math.min(
        dp[j] + 1, // deletion
        dp[j - 1] + 1, // insertion
        prev + cost // substitution
      );
      prev = tmp;
    }
  }
  return dp[t.length] as number;
}

function bestFuzzyMatch(input: string, candidates: string[]): { value: string; score: number } | null {
  const q = normalizeCommandToken(input);
  if (!q) return null;
  let best: { value: string; score: number } | null = null;
  for (const c of candidates) {
    const cn = normalizeCommandToken(c);
    if (!cn) continue;
    // Higher is better.
    let score = 0;
    if (cn === q) score += 1000;
    if (cn.startsWith(q) || q.startsWith(cn)) score += 400;
    if (cn.includes(q) || q.includes(cn)) score += 250;
    const dist = editDistance(q, cn);
    score += Math.max(0, 120 - dist * 12);
    // Prefer shorter candidates when equal.
    score += Math.max(0, 20 - cn.length);
    if (!best || score > best.score) best = { value: c, score };
  }
  return best;
}

function resolveTopicAndVariant(input: {
  rawTopicId: string | null;
  rawVariantId: string;
  currentTopicId: PracticeTopicId | null;
}): { topicId: PracticeTopicId; variantId: string; resolvedBy: 'exact' | 'fuzzy' | 'global' } | null {
  const topicKeys = Object.keys(PRACTICE_VARIANTS) as PracticeTopicId[];
  const rawTopic = input.rawTopicId ? normalizeCommandToken(input.rawTopicId) : '';
  const rawVar = normalizeCommandToken(input.rawVariantId);

  // 1) Exact / fuzzy topic
  const topicId: PracticeTopicId | null = (() => {
    if (rawTopic) {
      const exact = topicKeys.find((t) => normalizeCommandToken(t) === rawTopic) ?? null;
      if (exact) return exact;
      const fuzzy = bestFuzzyMatch(rawTopic, topicKeys)?.value ?? null;
      return (fuzzy as PracticeTopicId | null);
    }
    return input.currentTopicId;
  })();

  // 2) If we have a topic, try within that topic first.
  if (topicId) {
    const variants = PRACTICE_VARIANTS[topicId] ?? [];
    const exactV = variants.find((v) => normalizeCommandToken(v) === rawVar) ?? null;
    if (exactV) return { topicId, variantId: exactV, resolvedBy: rawTopic ? 'exact' : 'exact' };
    const fuzzyV = bestFuzzyMatch(rawVar, variants);
    if (fuzzyV && fuzzyV.score >= 200) {
      return { topicId, variantId: fuzzyV.value, resolvedBy: rawTopic ? 'fuzzy' : 'fuzzy' };
    }
  }

  // 3) Global search across all topic variants.
  const allPairs: Array<{ topicId: PracticeTopicId; variantId: string }> = [];
  for (const t of topicKeys) {
    const vars = PRACTICE_VARIANTS[t] ?? [];
    for (const v of vars) allPairs.push({ topicId: t, variantId: v });
  }
  const best = (() => {
    let bestPair: { topicId: PracticeTopicId; variantId: string; score: number } | null = null;
    for (const p of allPairs) {
      const label = `${p.topicId}:${p.variantId}`;
      const score = bestFuzzyMatch(rawVar, [p.variantId, label])?.score ?? 0;
      if (!bestPair || score > bestPair.score) bestPair = { ...p, score };
    }
    return bestPair;
  })();
  if (best && best.score >= 220) {
    return { topicId: best.topicId, variantId: best.variantId, resolvedBy: 'global' };
  }
  return null;
}

export default function Practice() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const settings = useLiveQuery(() => db.settings.get('1'));

  const recentPracticeEvents = useLiveQuery(async () => {
    if (!user?.id) return [];
    try {
      return db.practiceEvents
        .where('[userId+shownAt]')
        .between([user.id, Dexie.minKey], [user.id, Dexie.maxKey])
        .reverse()
        .limit(250)
        .toArray();
    } catch {
      return [];
    }
  }, [user?.id]) || [];

  const [mode, setMode] = useState<'individual' | 'mixed'>('individual');
  const [step, setStep] = useState<'chooser' | 'session'>('chooser');
  const [topicId, setTopicId] = useState<PracticeTopicId | null>(null);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>('easy');

  const [sessionSeed, setSessionSeed] = useState(() => {
    try {
      const buf = new Uint32Array(1);
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(buf);
        return buf[0] as number;
      }
    } catch {
      // ignore
    }
    return Date.now();
  });
  const pendingKeywordSeedRef = useRef<number | null>(null);
  const [keywordApplyNonce, setKeywordApplyNonce] = useState(0);
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [mixedModuleId, setMixedModuleId] = useState<string | null>(null);
  const [mixedCursor, setMixedCursor] = useState(0);
  const [answer1, setAnswer1] = useState('');
  const [answer2, setAnswer2] = useState('');
  const [answer3, setAnswer3] = useState('');
  const [extraAnswers, setExtraAnswers] = useState<string[]>([]);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const [lastVariantByTopic, setLastVariantByTopic] = useState<Record<string, string | undefined>>({});
  const [recentQuestionIds, setRecentQuestionIds] = useState<string[]>([]);
  const [recentQuestionKeys, setRecentQuestionKeys] = useState<string[]>([]);
  const [recentWordProblemCategories, setRecentWordProblemCategories] = useState<string[]>([]);

  const practiceHistoryLoadedRef = useRef(false);
  const practiceHistoryPersistTimerRef = useRef<number | null>(null);

  const practiceContentRef = useRef<HTMLDivElement | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportHelpOpen, setReportHelpOpen] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [reportScreenshotDataUrl, setReportScreenshotDataUrl] = useState<string | undefined>(undefined);
  const [isCapturingReportScreenshot, setIsCapturingReportScreenshot] = useState(false);
  const [reportScreenshotError, setReportScreenshotError] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportCaptureMode, setReportCaptureMode] = useState<'practice_full' | 'screen'>('practice_full');

  const [commandModalOpen, setCommandModalOpen] = useState(false);
  const [commandText, setCommandText] = useState('');
  const [variantOverride, setVariantOverride] = useState<PracticeVariantOverride>(null);
  const [variantMultiOverride, setVariantMultiOverride] = useState<PracticeVariantMultiOverride>(null);
  const [onlyQuestionTextQuery, setOnlyQuestionTextQuery] = useState<string>('');
  const [onlyQuestionTextTopicScope, setOnlyQuestionTextTopicScope] = useState<PracticeTopicId | null>(null);

  const activePracticeEventIdRef = useRef<string | null>(null);
  const activePracticeEventQuestionIdRef = useRef<string | null>(null);
  const activePracticeEventShownAtRef = useRef<number | null>(null);

  const finalizeActivePracticeEvent = useCallback(async (payload: { submittedAt: number; nextAt: number; userAnswer: string; isCorrect: boolean }) => {
    const id = activePracticeEventIdRef.current;
    if (!id) return;
    try {
      const existing = await db.practiceEvents.get(id);
      const alreadySubmitted = !!existing?.submittedAt;
      await db.practiceEvents.update(
        id,
        (alreadySubmitted
          ? {
              nextAt: payload.nextAt,
            }
          : {
              submittedAt: payload.submittedAt,
              nextAt: payload.nextAt,
              userAnswer: payload.userAnswer,
              isCorrect: payload.isCorrect,
            }) as any
      );
    } catch (e) {
      console.error(e);
    }
    activePracticeEventIdRef.current = null;
    activePracticeEventQuestionIdRef.current = null;
    activePracticeEventShownAtRef.current = null;
  }, []);

  const findScrollableAncestor = (el: HTMLElement | null): HTMLElement | null => {
    let cur: HTMLElement | null = el;
    while (cur) {
      const style = window.getComputedStyle(cur);
      const overflowY = style.overflowY;
      const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') && cur.scrollHeight > cur.clientHeight + 2;
      if (isScrollable) return cur;
      cur = cur.parentElement;
    }
    return null;
  };

  const equalsTo3SigFigs = (expected: number, raw: string): boolean => {
    const s = sanitizeNumericInput(String(raw ?? ''), { maxDecimals: 12 }).trim();
    if (!s) return false;
    const sf = countSigFigs(s);
    if (sf !== 3) return false;
    const v = Number(s);
    if (!Number.isFinite(v)) return false;
    const eRounded = Number(expected.toPrecision(3));
    const vRounded = Number(v.toPrecision(3));
    return vRounded === eRounded;
  };

  const equalsTo3SigFigsLenient = (expected: number, raw: string): boolean => {
    // Accept any numeric input (including integers) as long as it matches the expected value
    // when both are rounded to 3 significant figures.
    const s = sanitizeNumericInput(String(raw ?? ''), { maxDecimals: 12 }).trim();
    if (!s) return false;
    const v = Number(s);
    if (!Number.isFinite(v)) return false;
    const eRounded = Number(expected.toPrecision(3));
    const vRounded = Number(v.toPrecision(3));
    return vRounded === eRounded;
  };

  const captureAppVisualStateScreenshotDataUrl = async (scrollContainer?: HTMLElement | null): Promise<string> => {
    if (typeof window !== 'undefined' && (window as any).examProctor?.captureViewportScreenshot) {
      const res = await (window as any).examProctor.captureViewportScreenshot();
      if (res && typeof res.dataUrl === 'string' && res.dataUrl.startsWith('data:image/')) {
        return res.dataUrl;
      }
      throw new Error('Viewport screenshot failed');
    }

    const root = document.documentElement;
    const docWidth = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0, root.clientWidth);
    const docHeight = Math.max(root.scrollHeight, document.body?.scrollHeight ?? 0, root.clientHeight);
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;
    const clone = root.cloneNode(true) as HTMLElement;
    const originalScrollContainer = scrollContainer ?? null;
    let cloneScrollContainer: HTMLElement | null = null;

    const originalWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    const cloneWalker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
    let originalNode = originalWalker.nextNode() as Element | null;
    let cloneNode = cloneWalker.nextNode() as Element | null;

    while (originalNode && cloneNode) {
      const style = window.getComputedStyle(originalNode);
      let cssText = '';
      for (let i = 0; i < style.length; i++) {
        const prop = style[i];
        cssText += `${prop}:${style.getPropertyValue(prop)};`;
      }
      (cloneNode as HTMLElement).setAttribute('style', cssText);
      if (originalNode instanceof HTMLElement && cloneNode instanceof HTMLElement) {
        cloneNode.scrollTop = originalNode.scrollTop;
        cloneNode.scrollLeft = originalNode.scrollLeft;
        if (originalScrollContainer && originalNode === originalScrollContainer) {
          cloneScrollContainer = cloneNode;
        }
      }

      originalNode = originalWalker.nextNode() as Element | null;
      cloneNode = cloneWalker.nextNode() as Element | null;
    }

    if (originalScrollContainer && cloneScrollContainer) {
      const y = originalScrollContainer.scrollTop;
      const x = originalScrollContainer.scrollLeft;
      const wrapper = document.createElement('div');
      wrapper.setAttribute('style', `width:100%;height:100%;transform:translate(${-x}px,${-y}px);will-change:transform;`);
      while (cloneScrollContainer.firstChild) {
        wrapper.appendChild(cloneScrollContainer.firstChild);
      }
      cloneScrollContainer.appendChild(wrapper);
    }

    await (document as any).fonts?.ready;

    const serialized = new XMLSerializer().serializeToString(clone);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${viewportWidth}" height="${viewportHeight}">\n  <foreignObject x="0" y="0" width="100%" height="100%">\n    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${docWidth}px;height:${docHeight}px;transform:translate(${-scrollX}px,${-scrollY}px);">${serialized}</div>\n  </foreignObject>\n</svg>`;

    const img = new Image();
    img.decoding = 'async';
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewportWidth * dpr);
    canvas.height = Math.round(viewportHeight * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    ctx.scale(dpr, dpr);
    const bg = window.getComputedStyle(document.body).backgroundColor || window.getComputedStyle(root).backgroundColor || '#ffffff';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    ctx.drawImage(img, 0, 0, viewportWidth, viewportHeight);
    return canvas.toDataURL('image/png');
  };

  const cropDataUrl = async (dataUrl: string, crop: { x: number; y: number; w: number; h: number }): Promise<string> => {
    const img = new Image();
    img.decoding = 'async';
    img.src = dataUrl;
    await img.decode();

    const x = Math.max(0, Math.min(img.naturalWidth - 1, Math.round(crop.x)));
    const y = Math.max(0, Math.min(img.naturalHeight - 1, Math.round(crop.y)));
    const w = Math.max(1, Math.min(img.naturalWidth - x, Math.round(crop.w)));
    const h = Math.max(1, Math.min(img.naturalHeight - y, Math.round(crop.h)));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  };

  const capturePracticeContentScreenshotDataUrl = async (): Promise<string> => {
    const el = practiceContentRef.current;
    if (!el) return captureAppVisualStateScreenshotDataUrl();

    const rect = el.getBoundingClientRect();
    const pad = 16;
    const viewportW = Math.max(1, window.innerWidth);
    const viewportH = Math.max(1, window.innerHeight);

    const x = Math.max(0, rect.left - pad);
    const y = Math.max(0, rect.top - pad);
    const w = Math.min(viewportW - x, rect.width + pad * 2);
    const h = Math.min(viewportH - y, rect.height + pad * 2);

    const dataUrl = await captureAppVisualStateScreenshotDataUrl();
    const img = new Image();
    img.decoding = 'async';
    img.src = dataUrl;
    await img.decode();

    const scaleX = img.naturalWidth / viewportW;
    const scaleY = img.naturalHeight / viewportH;
    return cropDataUrl(dataUrl, { x: x * scaleX, y: y * scaleY, w: w * scaleX, h: h * scaleY });
  };

  const capturePracticeContentFullScreenshotDataUrl = async (): Promise<string> => {
    const el = practiceContentRef.current;
    if (!el) return capturePracticeContentScreenshotDataUrl();

    const container = findScrollableAncestor(el);
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);

    const pad = 16;
    const rect = el.getBoundingClientRect();

    const containerRect = container ? container.getBoundingClientRect() : null;
    const topStripHeight = containerRect ? Math.max(0, Math.min(viewportHeight, Math.floor(containerRect.top))) : 0;

    const xCss = (() => {
      if (containerRect) return Math.max(0, (rect.left - containerRect.left) + (container?.scrollLeft ?? 0) - pad);
      return Math.max(0, (rect.left + (window.scrollX || 0)) - pad);
    })();
    const yCss = (() => {
      if (containerRect) return Math.max(0, (rect.top - containerRect.top) + (container?.scrollTop ?? 0) - pad);
      return Math.max(0, (rect.top + (window.scrollY || 0)) - pad);
    })();

    const wCss = Math.max(1, rect.width + pad * 2);
    const hCss = Math.max(1, rect.height + pad * 2);

    const stitchedDataUrl = await captureFullContentScreenshotDataUrl(container);
    const stitchedImg = new Image();
    stitchedImg.decoding = 'async';
    stitchedImg.src = stitchedDataUrl;
    await stitchedImg.decode();

    const scale = containerRect
      ? (stitchedImg.naturalWidth / Math.max(1, containerRect.width))
      : (stitchedImg.naturalWidth / viewportWidth);

    const cropX = xCss * scale;
    const cropY = (topStripHeight + yCss) * scale;
    const cropW = wCss * scale;
    const cropH = hCss * scale;

    return cropDataUrl(stitchedDataUrl, { x: cropX, y: cropY, w: cropW, h: cropH });
  };

  const captureFullContentScreenshotDataUrl = async (scrollContainer?: HTMLElement | null): Promise<string> => {
    const container = scrollContainer ?? null;
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);

    const hideFixedTopBars = () => {
      const hidden: Array<{ el: HTMLElement; visibility: string }> = [];
      const all = Array.from(document.querySelectorAll<HTMLElement>('body *'));
      for (const el of all) {
        const style = window.getComputedStyle(el);
        if (style.position !== 'fixed' && style.position !== 'sticky') continue;
        const rect = el.getBoundingClientRect();
        if (!(rect.height > 0 && rect.width > viewportWidth * 0.5)) continue;
        // Only hide elements that are anchored to the top of the viewport.
        if (rect.top > 1) continue;
        hidden.push({ el, visibility: el.style.visibility });
        el.style.visibility = 'hidden';
      }
      return () => {
        for (const h of hidden) {
          h.el.style.visibility = h.visibility;
        }
      };
    };

    const restoreFixed = hideFixedTopBars();
    const containerRect = container ? container.getBoundingClientRect() : null;
    const topStripHeight = containerRect ? Math.max(0, Math.min(viewportHeight, Math.floor(containerRect.top))) : 0;
    const containerViewportHeight = containerRect ? Math.max(1, Math.floor(containerRect.height)) : viewportHeight;
    const totalHeight = container
      ? Math.max(container.scrollHeight, container.clientHeight)
      : Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
    // Add overlap between tiles to avoid gaps due to rounding/layout jitter.
    const overlapCss = 24;
    const strideCss = Math.max(1, containerViewportHeight - overlapCss);
    const steps = Math.max(1, Math.ceil(totalHeight / strideCss));

    const originalWindowX = window.scrollX;
    const originalWindowY = window.scrollY;
    const originalContainerScrollTop = container ? container.scrollTop : 0;

    const tiles: { y: number; dataUrl: string; width: number; height: number; cropTopCss: number }[] = [];
    let topStripTile: { dataUrl: string; width: number; height: number } | null = null;
    let scale = 1;
    try {
      for (let i = 0; i < steps; i++) {
        const yTarget = Math.min(i * strideCss, Math.max(0, totalHeight - containerViewportHeight));
        if (container) {
          container.scrollTop = yTarget;
        } else {
          window.scrollTo(originalWindowX, yTarget);
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const yActual = container ? container.scrollTop : (window.scrollY || 0);
        const dataUrl = await captureAppVisualStateScreenshotDataUrl(container);
        const img = new Image();
        img.decoding = 'async';
        img.src = dataUrl;
        await img.decode();
        if (i === 0) {
          scale = viewportWidth > 0 ? img.naturalWidth / viewportWidth : 1;
          if (!Number.isFinite(scale) || scale <= 0) scale = 1;
          if (topStripHeight > 0) {
            topStripTile = { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
          }
        }
        tiles.push({ y: yActual, dataUrl, width: img.naturalWidth, height: img.naturalHeight, cropTopCss: i === 0 ? 0 : overlapCss });
      }
    } finally {
      restoreFixed();
      if (container) {
        container.scrollTop = originalContainerScrollTop;
      } else {
        window.scrollTo(originalWindowX, originalWindowY);
      }
    }

    if (!tiles.length) throw new Error('No screenshot tiles captured');

    const canvas = document.createElement('canvas');
    if (containerRect) {
      canvas.width = Math.max(1, Math.round(containerRect.width * scale));
      canvas.height = Math.max(1, Math.round((totalHeight + topStripHeight) * scale));
    } else {
      canvas.width = tiles[0].width;
      canvas.height = Math.max(1, Math.round(totalHeight * scale));
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (topStripTile) {
      const stripImg = new Image();
      stripImg.decoding = 'async';
      stripImg.src = topStripTile.dataUrl;
      await stripImg.decode();
      const stripPxH = Math.max(1, Math.round(topStripHeight * scale));
      ctx.drawImage(stripImg, 0, 0, topStripTile.width, stripPxH, 0, 0, canvas.width, stripPxH);
    }

    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const img = new Image();
      img.decoding = 'async';
      img.src = t.dataUrl;
      await img.decode();
      const cropTopPx = Math.max(0, Math.round(t.cropTopCss * scale));
      const srcY = cropTopPx;
      const srcH = Math.max(1, t.height - cropTopPx);
      const destY = Math.round((t.y + topStripHeight + t.cropTopCss) * scale);
      ctx.drawImage(img, 0, srcY, t.width, srcH, 0, destY, canvas.width, srcH);
    }

    return canvas.toDataURL('image/png');
  };

  const openReportDialogWithCapture = useCallback(async (mode?: 'practice_full' | 'screen') => {
    if (isCapturingReportScreenshot) return;
    setReportDialogOpen(false);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    setReportScreenshotDataUrl(undefined);
    setReportScreenshotError(null);
    setIsCapturingReportScreenshot(true);
    void (async () => {
      try {
        const m = mode ?? reportCaptureMode;
        const url = m === 'screen'
          ? await captureAppVisualStateScreenshotDataUrl()
          : await capturePracticeContentFullScreenshotDataUrl();
        setReportScreenshotDataUrl(url);
      } catch (e) {
        console.error('Failed to capture screenshot for report preview:', e);
        setReportScreenshotError('Screenshot capture failed');
      } finally {
        setIsCapturingReportScreenshot(false);
        setReportDialogOpen(true);
      }
    })();
  }, [isCapturingReportScreenshot, reportCaptureMode]);

  const submitErrorReport = useCallback(async () => {
    if (!reportMessage.trim()) {
      toast.error('Please describe the issue.');
      return;
    }
    try {
      setIsSubmittingReport(true);
      const now = Date.now();
      let screenshotDataUrl: string | undefined = reportScreenshotDataUrl;
      const scrollEl = findScrollableAncestor(practiceContentRef.current) ?? practiceContentRef.current;
      const effectiveScrollY = scrollEl ? scrollEl.scrollTop : window.scrollY;
      if (!screenshotDataUrl) {
        try {
          screenshotDataUrl = await capturePracticeContentFullScreenshotDataUrl();
        } catch (e) {
          console.error('Failed to capture screenshot for report:', e);
          setReportScreenshotError('Screenshot capture failed');
        }
      }
      await db.transaction('rw', db.errorReports, async () => {
        await db.errorReports.add({
          id: uuidv4(),
          status: 'new',
          message: reportMessage.trim(),
          screenshotDataUrl,
          createdAt: now,
          updatedAt: now,
          route: location.pathname,
          moduleId: undefined,
          moduleTitle: undefined,
          questionId: (question as any)?.id,
          questionCode: (question as any)?.code,
          questionTags: (question as any)?.tags,
          attemptId: undefined,
          currentQuestionIndex: undefined,
          scrollY: effectiveScrollY,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          phase: 'practice',
          appState: {
            practiceMode: mode,
            topicId,
            difficulty,
          },
          reporterUserId: user?.id,
          reporterUsername: user?.username,
        });
      });
      setReportDialogOpen(false);
      setReportMessage('');
      setReportScreenshotDataUrl(undefined);
      setReportScreenshotError(null);
      toast.success('Report sent');
    } catch (e) {
      console.error(e);
      toast.error('Failed to submit report');
    } finally {
      setIsSubmittingReport(false);
    }
  }, [difficulty, mode, question, reportMessage, reportScreenshotDataUrl, topicId, user?.id, user?.username]);

  const wpKatexOuterRef = useRef<HTMLDivElement | null>(null);
  const wpKatexInnerRef = useRef<HTMLDivElement | null>(null);
  const [wpKatexScale, setWpKatexScale] = useState(1);

  const nextSeedRef = useRef<number>(Date.now());
  const computeNextSeed = () => {
    const now = Date.now();
    const next = Math.max(now, (nextSeedRef.current ?? now) + 1);
    nextSeedRef.current = next;
    return next;
  };

  const escapeKatexText = (s: string) =>
    String(s ?? '')
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\$/g, '\\$')
      .replace(/%/g, '\\%')
      .replace(/&/g, '\\&')
      .replace(/#/g, '\\#')
      .replace(/_/g, '\\_')
      .replace(/\^/g, '\\^{}')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\r\n|\r|\n/g, ' \\ ');

  type AnswerFieldSpec = {
    id: string;
    label: string;
    labelIsLatex?: boolean;
    inputKind: 'mathlive' | 'input';
    inputMode?: 'none' | 'text' | 'decimal' | 'numeric';
    ariaLabel?: string;
    sanitize?: (raw: string) => string;
  };

  const getAnswerValueAt = (idx: number) => {
    const values = [answer1, answer2, answer3, ...extraAnswers];
    return String(values[idx] ?? '');
  };

  const setAnswerValueAt = (idx: number, next: string) => {
    if (idx === 0) return setAnswer1(next);
    if (idx === 1) return setAnswer2(next);
    if (idx === 2) return setAnswer3(next);
    const j = idx - 3;
    setExtraAnswers((prev) => {
      const out = prev.slice();
      while (out.length <= j) out.push('');
      out[j] = next;
      return out;
    });
  };

  const getAnswerFieldSpecs = (q: PracticeQuestion | null): AnswerFieldSpec[] => {
    if (!q) return [];
    const qAny: any = q as any;

    // Differentiation multi-part answers.
    if (qAny.kind === 'calculus' && qAny.topicId === 'differentiation' && Array.isArray(qAny.expectedParts) && qAny.expectedParts.length > 0) {
      const parts = qAny.expectedParts as string[];
      const v = String(qAny.variantId ?? '');

      if (v === 'sqrt_params_point_gradient' && parts.length === 2) {
        return [
          { id: 'a', label: 'a', inputKind: 'input', inputMode: 'decimal', sanitize: sanitizeRationalInput },
          { id: 'b', label: 'b', inputKind: 'input', inputMode: 'decimal', sanitize: sanitizeRationalInput },
        ];
      }

      // Coordinate response for tangent/normal applications: always x,y.
      if (['normal_y_intercept_coords', 'normal_x_intercept_coords', 'tangents_intersection_coords'].includes(v) && parts.length === 2) {
        return [
          { id: 'x', label: 'x', inputKind: 'input', inputMode: 'decimal', sanitize: sanitizeRationalInput },
          { id: 'y', label: 'y', inputKind: 'input', inputMode: 'decimal', sanitize: sanitizeRationalInput },
        ];
      }

      if (['power_linear_point_gradient', 'rational_yaxis_gradient'].includes(v) && parts.length === 1) {
        return [{ id: 'grad', label: 'Gradient', inputKind: 'input', inputMode: 'decimal', sanitize: sanitizeRationalInput }];
      }

      if (v === 'linear_minus_rational_xaxis_gradients' && parts.length === 2) {
        const is3sf = String(qAny.answerFormat ?? '') === 'decimal_3sf';
        return [
          {
            id: 'grad1',
            label: 'Gradient 1',
            inputKind: 'input',
            inputMode: 'decimal',
            sanitize: is3sf ? ((raw: string) => sanitizeNumericInput(raw, { maxDecimals: 12 })) : sanitizeRationalInput,
          },
          {
            id: 'grad2',
            label: 'Gradient 2',
            inputKind: 'input',
            inputMode: 'decimal',
            sanitize: is3sf ? ((raw: string) => sanitizeNumericInput(raw, { maxDecimals: 12 })) : sanitizeRationalInput,
          },
        ];
      }

      if (v === 'stationary_points_coords') {
        // expectedParts is [x1,y1,x2,y2,...]
        const count = Math.max(2, parts.length);
        return Array.from({ length: count }).map((_, idx) => {
          const pointIdx = Math.floor(idx / 2) + 1;
          const isX = idx % 2 === 0;
          const label = `${isX ? 'x' : 'y'}${pointIdx}`;
          return { id: label, label, inputKind: 'input', inputMode: 'decimal', sanitize: sanitizeRationalInput };
        });
      }

      if (v === 'stationary_points') {
        return parts.map((_, idx: number) => ({
          id: `x${idx + 1}`,
          label: `x${idx + 1}`,
          inputKind: 'input',
          inputMode: 'decimal',
          sanitize: sanitizeRationalInput,
        }));
      }
    }

    // Fallback: coordinate-pair style multi-part calculus questions.
    // Some prompts ask for coordinates of point(s) where gradient is m, which can yield multiple points.
    // If expectedParts looks like [x1,y1,x2,y2,...], render 2*n inputs with x/y labels.
    if (qAny.kind === 'calculus' && Array.isArray(qAny.expectedParts) && qAny.expectedParts.length >= 4 && qAny.expectedParts.length % 2 === 0) {
      const v = String(qAny.variantId ?? '');
      const code = String(qAny.code ?? '');
      const hintText = `${v} ${code} ${String(qAny.katexQuestion ?? '')}`.toLowerCase();
      const looksLikeCoords = hintText.includes('coord') || hintText.includes('point') || hintText.includes('gradient');
      if (looksLikeCoords) {
        const count = qAny.expectedParts.length as number;
        return Array.from({ length: count }).map((_, idx) => {
          const pointIdx = Math.floor(idx / 2) + 1;
          const isX = idx % 2 === 0;
          const label = `${isX ? 'x' : 'y'}${pointIdx}`;
          return { id: label, label, inputKind: 'input', inputMode: 'decimal', sanitize: sanitizeRationalInput };
        });
      }
    }

    // Fallback: two-gradient answers (e.g. gradients at two x-intercepts).
    if (qAny.kind === 'calculus' && Array.isArray(qAny.expectedParts) && qAny.expectedParts.length === 2) {
      const v = String(qAny.variantId ?? '');
      const code = String(qAny.code ?? '');
      const hintText = `${v} ${code} ${String(qAny.katexQuestion ?? '')}`.toLowerCase();
      const looksLikeTwoGradients = hintText.includes('gradient') && (hintText.includes('points') || hintText.includes('point'));
      if (looksLikeTwoGradients) {
        const is3sf = String(qAny.answerFormat ?? '') === 'decimal_3sf' || hintText.includes('3 s.f');
        return [
          {
            id: 'grad1',
            label: 'Gradient 1',
            inputKind: 'input',
            inputMode: 'decimal',
            sanitize: is3sf ? ((raw: string) => sanitizeNumericInput(raw, { maxDecimals: 12 })) : sanitizeRationalInput,
          },
          {
            id: 'grad2',
            label: 'Gradient 2',
            inputKind: 'input',
            inputMode: 'decimal',
            sanitize: is3sf ? ((raw: string) => sanitizeNumericInput(raw, { maxDecimals: 12 })) : sanitizeRationalInput,
          },
        ];
      }
    }

    // Fallback: single numeric gradient answer (avoid MathLive for plain numeric entry).
    if (qAny.kind === 'calculus' && Array.isArray(qAny.expectedParts) && qAny.expectedParts.length === 1) {
      const v = String(qAny.variantId ?? '');
      const code = String(qAny.code ?? '');
      const hintText = `${v} ${code} ${String(qAny.katexQuestion ?? '')}`.toLowerCase();
      const looksLikeSingleGradient = hintText.includes('gradient') && !hintText.includes('coordinates');
      if (looksLikeSingleGradient) {
        return [{ id: 'grad', label: 'Gradient', inputKind: 'input', inputMode: 'decimal', sanitize: sanitizeRationalInput }];
      }
    }

    return [];
  };

  const renderAnswerFields = (specs: AnswerFieldSpec[]) => {
    const cols = specs.length <= 1 ? 1 : specs.length <= 2 ? 2 : specs.length <= 4 ? 4 : 6;
    const colClass = cols === 1
      ? 'grid-cols-1'
      : cols === 2
        ? 'grid-cols-2'
        : cols === 4
          ? 'grid-cols-4'
          : 'grid-cols-6';
    const gridClass = `grid ${colClass} gap-3 max-w-4xl mx-auto`;

    return (
      <div className={gridClass}>
        {specs.map((f, idx) => {
          const value = getAnswerValueAt(idx);
          const setValue = (next: string) => setAnswerValueAt(idx, next);
          const labelHasMath = !!f.labelIsLatex || /[_^\\]/.test(String(f.label ?? ''));
          return (
            <div key={f.id} className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {labelHasMath ? <Katex latex={String(f.label)} displayMode={false} /> : String(f.label)}
              </Label>
              {f.inputKind === 'mathlive' ? (
                <MathLiveInput
                  value={value}
                  onChange={setValue as any}
                  disabled={submitted}
                  className="text-2xl font-normal text-left tk-expr-input"
                />
              ) : (
                <Input
                  value={value}
                  inputMode={f.inputMode}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const next = typeof f.sanitize === 'function' ? f.sanitize(raw) : raw;
                    setValue(next);
                  }}
                  disabled={submitted}
                  aria-label={f.ariaLabel}
                  className="h-12 text-2xl font-normal text-center py-1 font-slab"
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const preventScrollCapture = (e: React.WheelEvent | React.TouchEvent | React.KeyboardEvent) => {
    // Keep scrollbars visible (for overflow affordance) but prevent the user from scrolling the KaTeX container.
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement | null;
    if (!el) return;
    if (el.scrollLeft !== 0) el.scrollLeft = 0;
    if (el.scrollTop !== 0) el.scrollTop = 0;
  };

  const selectedTopic = useMemo(() => PRACTICE_TOPICS.find((t) => t.id === topicId) ?? null, [topicId]);

  const mixedModules = useMemo(() => settings?.mixedPracticeModules ?? [], [settings?.mixedPracticeModules]);
  const practiceTopicLocks = useMemo(() => settings?.practiceTopicLocks ?? {}, [settings?.practiceTopicLocks]);
  const practiceTopicLocksByUserKey = useMemo(
    () => (settings as any)?.practiceTopicLocksByUserKey ?? {},
    [settings]
  );
  const practiceTopicHidden = useMemo(() => (settings as any)?.practiceTopicHidden ?? {}, [settings]);
  const practiceTopicHiddenByUserKey = useMemo(
    () => (settings as any)?.practiceTopicHiddenByUserKey ?? {},
    [settings]
  );
  const selectedMixedModule = useMemo(
    () => (mixedModuleId ? mixedModules.find((m) => m.id === mixedModuleId) ?? null : null),
    [mixedModules, mixedModuleId]
  );

  const parseHHMM = (value: string | undefined): null | { h: number; m: number } => {
    const v = String(value ?? '').trim();
    const m = v.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return { h: hh, m: mm };
  };

  const isMixedModuleAssignedToUser = useCallback((m: any) => {
    if (isAdmin) return true;
    const ids = Array.isArray(m?.assignedUserIds) ? (m.assignedUserIds as string[]) : [];
    if (!user?.id) return false;
    return ids.includes(user.id);
  }, [isAdmin, user?.id]);

  const isMixedModuleOpenNow = useCallback((m: any, nowMs: number) => {
    const sched: any = m?.schedule;
    if (!sched?.enabled) return true;

    // Legacy date-time window
    if (typeof sched.opensAt === 'number' && typeof sched.closesAt === 'number') {
      return nowMs >= sched.opensAt && nowMs <= sched.closesAt;
    }

    // Day-of-week + time window
    const days = Array.isArray(sched.daysOfWeek) ? (sched.daysOfWeek as number[]) : [];
    const openT = parseHHMM(sched.opensTime);
    const closeT = parseHHMM(sched.closesTime);
    if (!days.length || !openT || !closeT) return true;

    const now = new Date(nowMs);
    const day = now.getDay();
    if (!days.includes(day)) return false;

    const cur = now.getHours() * 60 + now.getMinutes();
    const o = openT.h * 60 + openT.m;
    const c = closeT.h * 60 + closeT.m;
    if (o === c) return true;
    if (c > o) return cur >= o && cur <= c;
    // crosses midnight
    return cur >= o || cur <= c;
  }, [parseHHMM]);

  const userKey = user?.role === 'admin' ? 'admin' : (user?.id || user?.username || 'anonymous');

  const isTopicLocked = (id: PracticeTopicId) => {
    const globalLocked = !!(practiceTopicLocks as any)?.[id];
    const perUser = (practiceTopicLocksByUserKey as any)?.[userKey] ?? {};
    const userLocked = !!(perUser as any)?.[id];
    return globalLocked || userLocked;
  };

  const isTopicHidden = (id: PracticeTopicId) => {
    if (isAdmin) return false;
    const globalHidden = !!(practiceTopicHidden as any)?.[id];
    const perUser = (practiceTopicHiddenByUserKey as any)?.[userKey] ?? {};
    const userHidden = !!(perUser as any)?.[id];
    return globalHidden || userHidden;
  };

  const resetAttemptState = () => {
    setAnswer1('');
    setAnswer2('');
    setAnswer3('');
    setExtraAnswers([]);
    setSelectedOptionIndex(null);
    setSubmitted(false);
    setIsCorrect(null);
  };

  useEffect(() => {
    if (!settings) return;
    if (practiceHistoryLoadedRef.current) return;

    const ph = (settings as any).practiceHistory;
    if (ph && Array.isArray(ph.recentQuestionIds) && Array.isArray(ph.recentWordProblemCategories)) {
      setRecentQuestionIds(ph.recentQuestionIds.slice(0, 1000));
      setRecentWordProblemCategories(ph.recentWordProblemCategories.slice(0, 50));
    }
    if (ph && Array.isArray(ph.recentQuestionKeys)) {
      setRecentQuestionKeys(ph.recentQuestionKeys.slice(0, 1200));
    }
    practiceHistoryLoadedRef.current = true;
  }, [settings]);

  useEffect(() => {
    if (!practiceHistoryLoadedRef.current) return;
    if (practiceHistoryPersistTimerRef.current) {
      window.clearTimeout(practiceHistoryPersistTimerRef.current);
    }

    practiceHistoryPersistTimerRef.current = window.setTimeout(() => {
      void db.settings.update('1', {
        practiceHistory: {
          recentQuestionIds: recentQuestionIds.slice(0, 1000),
          recentQuestionKeys: recentQuestionKeys.slice(0, 1200),
          recentWordProblemCategories: recentWordProblemCategories.slice(0, 50),
          updatedAt: Date.now(),
        },
      });
    }, 600);

    return () => {
      if (practiceHistoryPersistTimerRef.current) {
        window.clearTimeout(practiceHistoryPersistTimerRef.current);
        practiceHistoryPersistTimerRef.current = null;
      }
    };
  }, [recentQuestionIds, recentQuestionKeys, recentWordProblemCategories]);

  const rememberQuestionId = (id: string) => {
    if (!id) return;
    setRecentQuestionIds((prev) => {
      const next = [id, ...prev];
      return next.length > 1000 ? next.slice(0, 1000) : next;
    });
  };

  const rememberQuestionKey = (key: string) => {
    if (!key) return;
    setRecentQuestionKeys((prev) => {
      const next = [key, ...prev];
      return next.length > 1200 ? next.slice(0, 1200) : next;
    });
  };

  const rememberTrigKind = (q: PracticeQuestion) => {
    const anyQ: any = q as any;
    if (anyQ?.topicId !== 'graph_trigonometry') return;
    const k = String(anyQ?.generatorParams?.kind ?? '');
    if (!k) return;
    rememberQuestionKey(`graph_trigonometry_kind:${k}`);
  };

  const getQuestionDedupKey = useCallback((q: PracticeQuestion): string => {
    const anyQ: any = q as any;
    const stableStringify = (value: any): string => {
      const seen = new WeakSet<object>();
      const norm = (v: any): any => {
        if (v == null) return v;
        const t = typeof v;
        if (t === 'string' || t === 'number' || t === 'boolean') return v;
        if (Array.isArray(v)) return v.map(norm);
        if (t === 'object') {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
          const out: Record<string, any> = {};
          const keys = Object.keys(v).sort();
          for (const k of keys) {
            if (
              k === 'id' ||
              k === 'seed' ||
              k === 'createdAt' ||
              k === 'updatedAt' ||
              k === 'image' ||
              k === 'imageUrl' ||
              k === 'imageDataUrl' ||
              k === 'attachments' ||
              k === 'svgDataUrl'
            ) {
              continue;
            }
            out[k] = norm(v[k]);
          }
          return out;
        }
        return String(v);
      };
      try {
        return JSON.stringify(norm(value));
      } catch {
        return '';
      }
    };

    const keyObj = {
      topicId: anyQ.topicId,
      difficulty: anyQ.difficulty,
      variantId: anyQ.variantId,
      generatorParams: anyQ.generatorParams,
      katexQuestion: anyQ.katexQuestion,
      promptKatex: anyQ.promptKatex,
      promptText: anyQ.promptText,
      katexOptions: anyQ.katexOptions,
      options: anyQ.options,
      choices: anyQ.choices,
      answers: anyQ.answers,
      inputFields: anyQ.inputFields,
    };

    const body = stableStringify(keyObj);
    if (!body) return '';
    let h = 2166136261;
    for (let i = 0; i < body.length; i++) {
      h ^= body.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `${String(anyQ.topicId ?? 'q')}:${(h >>> 0).toString(16)}`;
  }, []);

  const wordProblemCategory = (variantId: unknown) => {
    const v = String(variantId ?? '');
    if (!v) return 'other';
    if (v.startsWith('probability_')) return 'probability';
    return 'other';
  };

  const rememberWordProblemCategory = (variantId: unknown) => {
    const cat = wordProblemCategory(variantId);
    setRecentWordProblemCategories((prev) => {
      const next = [cat, ...prev];
      return next.length > 50 ? next.slice(0, 50) : next;
    });
  };

  const generateNext = (seedValue: number) => {
    const freq = (settings as any)?.practiceFrequencies?.byUserKey?.[userKey] ?? null;
    const topicVariantWeights = (freq?.topicVariantWeights ?? {}) as Record<string, Record<string, number>>;
    const topicVariantAnswerKinds = (freq?.topicVariantAnswerKinds ?? {}) as Record<string, Record<string, string>>;
    const mixedModuleItemWeights = (freq?.mixedModuleItemWeights ?? {}) as Record<string, Record<number, number>>;

    const hasTextFilter = Boolean(onlyQuestionTextQuery.trim());

    const adminFilterOverridesFrequencies = Boolean(isAdmin && activeTopicScope);

    const hasConfiguredWeights = (w: unknown) => {
      if (!w || typeof w !== 'object') return false;
      const obj = w as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (!keys.length) return false;
      // Only treat as configured when it has at least one positive weight.
      for (const k of keys) {
        const v = Number((obj as any)[k]);
        if (Number.isFinite(v) && v > 0) return true;
      }
      return false;
    };

    const weightedPickIndex = (weightsByIndex: Record<number, number>, n: number, seed: number) => {
      const rng = (() => {
        let t = (seed ^ 0x5bd1e995) >>> 0;
        const next = () => {
          t += 0x6d2b79f5;
          let x = Math.imul(t ^ (t >>> 15), 1 | t);
          x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
          return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
        return { next };
      })();

      let total = 0;
      for (let i = 0; i < n; i++) total += Math.max(0, Number(weightsByIndex[i] ?? 0));
      if (!(total > 0)) return null;
      let r = rng.next() * total;
      for (let i = 0; i < n; i++) {
        const w = Math.max(0, Number(weightsByIndex[i] ?? 0));
        r -= w;
        if (r <= 0) return i;
      }
      return n - 1;
    };

    const weightedPick = <T,>(items: T[], getWeight: (it: T, idx: number) => number, seed: number): T | null => {
      const rng = (() => {
        let t = (seed ^ 0x6c8e9cf5) >>> 0;
        const next = () => {
          t += 0x6d2b79f5;
          let x = Math.imul(t ^ (t >>> 15), 1 | t);
          x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
          return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
        return { next };
      })();

      let total = 0;
      for (let i = 0; i < items.length; i++) total += Math.max(0, Number(getWeight(items[i]!, i) ?? 0));
      if (!(total > 0)) return null;
      let r = rng.next() * total;
      for (let i = 0; i < items.length; i++) {
        const w = Math.max(0, Number(getWeight(items[i]!, i) ?? 0));
        r -= w;
        if (r <= 0) return items[i]!;
      }
      return items[items.length - 1] ?? null;
    };

    const autoDifficultyForTopic = (topic: PracticeTopicId) => {
      const ev = recentPracticeEvents.filter((e) => e.topicId === topic).slice(0, 40);
      if (ev.length < 8) return 'easy' as PracticeDifficulty;
      const recent = ev.slice(0, 12);
      const wrongStreak = (() => {
        let s = 0;
        for (const e of recent) {
          if (e.isCorrect === false) s += 1;
          else break;
        }
        return s;
      })();
      if (wrongStreak >= 2) return 'easy' as PracticeDifficulty;

      const scored = recent.filter((e) => typeof e.isCorrect === 'boolean');
      const correct = scored.reduce((acc, e) => acc + (e.isCorrect ? 1 : 0), 0);
      const acc = scored.length ? correct / scored.length : 0;
      if (acc >= 0.95) return 'ultimate' as PracticeDifficulty;
      if (acc >= 0.9) return 'hard' as PracticeDifficulty;
      if (acc >= 0.75) return 'medium' as PracticeDifficulty;
      return 'easy' as PracticeDifficulty;
    };

    const recentSet = new Set(recentQuestionIds);
    const recentKeySet = new Set(recentQuestionKeys);
    const tryGenerate = (
      fn: (seed: number) => PracticeQuestion,
      accept?: (q: PracticeQuestion) => boolean,
      opts?: { strict?: boolean; seedBase?: number }
    ) => {
      const hasTextFilter = Boolean(onlyQuestionTextQuery.trim());
      const currentQuestionId = (question as any)?.id ? String((question as any).id) : '';
      const currentQuestionKey = (() => {
        try {
          return currentQuestionId ? String(getQuestionDedupKey(question as any) ?? '') : '';
        } catch {
          return '';
        }
      })();
      const seedBase = typeof opts?.seedBase === 'number' ? opts.seedBase : seedValue;
      const maxAttempts = hasTextFilter ? 12000 : 1200;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const seed = seedBase + attempt;
        const q = fn(seed);

        // Even under keyword filters, never repeat the exact same instance.
        if (hasTextFilter) {
          if (currentQuestionId && String(q.id ?? '') === currentQuestionId) continue;
          const k = getQuestionDedupKey(q);
          if (k && currentQuestionKey && String(k) === String(currentQuestionKey)) continue;
        }
        if (!hasTextFilter && recentSet.has(q.id)) continue;
        if (!hasTextFilter) {
          const k = getQuestionDedupKey(q);
          if (k && recentKeySet.has(k)) continue;
        }

        // Extra anti-repeat for trigonometry: avoid repeating the same trig sub-kind too often
        // unless admin has explicitly forced a strict variant selection.
        const anyQ: any = q as any;
        if (!hasTextFilter && !opts?.strict && anyQ?.topicId === 'graph_trigonometry') {
          const subKind = String(anyQ?.generatorParams?.kind ?? '');
          if (subKind) {
            // Avoid repeating the same trig sub-kind in the last ~12 questions.
            const recentKinds = recentQuestionKeys
              .slice(0, 80)
              .filter((s) => typeof s === 'string' && s.startsWith('graph_trigonometry_kind:'))
              .map((s) => s.replace('graph_trigonometry_kind:', ''));
            const recentKindSet = new Set(recentKinds.slice(0, 12));
            if (recentKindSet.has(subKind)) continue;
          }
        }

        if (accept && !accept(q)) continue;
        if (hasTextFilter) {
          const hay = getQuestionSearchText(q).toLowerCase();
          const needles = onlyQuestionTextQuery
            .split(';')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
          if (!needles.length) continue;
          const ok = needles.some((needle) => hay.includes(needle));
          if (!ok) continue;
        }
        return q;
      }

      // If a keyword filter is active and we couldn't find a match, don't fall back
      // to a random question (that defeats the purpose of /only).
      if (onlyQuestionTextQuery.trim()) return null;
      return fn(seedBase);
    };

    const probabilityCooldown = 8;
    const acceptWordProblem = (q: PracticeQuestion) => {
      const cat = wordProblemCategory((q as any).variantId);
      if (cat !== 'probability') return true;
      const recent = recentWordProblemCategories.slice(0, probabilityCooldown);
      return !recent.includes('probability');
    };

    if (mode === 'mixed') {
      if (!selectedMixedModule) return;

      if ((selectedMixedModule as any).type === 'pool') {
        const pool = ((selectedMixedModule as any).pool ?? []) as Array<{
          topicId: PracticeTopicId;
          weight: number;
          difficultyMode: 'fixed' | 'mix' | 'auto';
          difficulty?: PracticeDifficulty;
          difficultyWeights?: Partial<Record<PracticeDifficulty, number>>;
        }>;
        const unlocked0 = pool.filter((p) => p?.topicId && !isTopicLocked(p.topicId) && !isTopicHidden(p.topicId));
        const unlocked = activeTopicScope
          ? unlocked0.filter((p) => p.topicId === activeTopicScope)
          : unlocked0;
        if (!unlocked.length) return;

        const picked = adminFilterOverridesFrequencies
          ? (unlocked[((seedValue >>> 0) % unlocked.length) as number] ?? null)
          : (
              weightedPick(unlocked, (p) => Number(p.weight ?? 0), seedValue) ??
              unlocked[((seedValue >>> 0) % unlocked.length) as number] ??
              null
            );
        if (!picked) return;

        const pickedDifficulty: PracticeDifficulty = (() => {
          if (picked.difficultyMode === 'fixed') return (picked.difficulty ?? 'easy') as PracticeDifficulty;
          if (picked.difficultyMode === 'mix') {
            const w = picked.difficultyWeights ?? {};
            const candidates: PracticeDifficulty[] = ['easy', 'medium', 'hard', 'ultimate'];
            const best = weightedPick(candidates, (d) => Number((w as any)[d] ?? 0), seedValue);
            return (best ?? 'easy') as PracticeDifficulty;
          }
          return autoDifficultyForTopic(picked.topicId);
        })();

        const item = { topicId: picked.topicId, difficulty: pickedDifficulty };

        {
          const forced =
            variantOverride?.topicId === item.topicId ? buildForcedVariantWeights(item.topicId, variantOverride.variantId) : null;
          const multi = variantMultiOverride?.topicId === item.topicId
            ? buildMultiVariantWeights(item.topicId, variantMultiOverride.variantIds)
            : null;
          const weightsForTopic = (forced ?? (topicVariantWeights?.[item.topicId] as any)) as any;
          const effectiveWeightsForTopic = (forced ?? multi ?? weightsForTopic) as any;
          const strictTopic = !!forced || !!multi || hasConfiguredWeights(effectiveWeightsForTopic);

          const avoidVariantId = !hasTextFilter && !strictTopic && item.topicId === 'word_problems'
            ? (lastVariantByTopic.word_problems as string | undefined)
            : undefined;

          const q0 = tryGenerate(
            (seed) =>
              generatePracticeQuestion({
                topicId: item.topicId,
                difficulty: item.difficulty,
                seed,
                avoidVariantId,
                variantWeights: effectiveWeightsForTopic,
                answerKindByVariant: topicVariantAnswerKinds?.[item.topicId],
              }),
            item.topicId === 'word_problems' ? acceptWordProblem : undefined,
            { strict: strictTopic }
          );

          const q = q0 ?? (onlyQuestionTextQuery.trim()
            ? tryGenerate(
                (seed) =>
                  generatePracticeQuestion({
                    topicId: item.topicId,
                    difficulty: item.difficulty,
                    seed,
                    avoidVariantId,
                    variantWeights: effectiveWeightsForTopic,
                    answerKindByVariant: topicVariantAnswerKinds?.[item.topicId],
                  }),
                item.topicId === 'word_problems' ? acceptWordProblem : undefined,
                { strict: strictTopic, seedBase: computeNextSeed() }
              )
            : null);

          if (!q) {
            return;
          }

          setQuestion(q);
          rememberQuestionId(q.id);
          rememberQuestionKey(getQuestionDedupKey(q));
          rememberTrigKind(q);
          if (item.topicId === 'word_problems') {
            const nextVariant = (q as any).variantId ?? undefined;
            setLastVariantByTopic((m) => ({ ...m, word_problems: nextVariant }));
            rememberWordProblemCategory((q as any).variantId);
          }
          resetAttemptState();
          return;
        }

        resetAttemptState();
        return;
      }

      if (!(selectedMixedModule as any).items?.length) return;

      const items = (selectedMixedModule as any).items as Array<{ topicId: PracticeTopicId; difficulty: PracticeDifficulty }>;
      const weights = mixedModuleItemWeights?.[(selectedMixedModule as any).id];
      const strictMixed = hasConfiguredWeights(weights);
      const candidates0 = items.filter((it) => it?.topicId && !isTopicLocked(it.topicId) && !isTopicHidden(it.topicId));
      const candidates = activeTopicScope
        ? candidates0.filter((it) => it.topicId === activeTopicScope)
        : candidates0;
      if (!candidates.length) return;
      const weightedIdx = (!adminFilterOverridesFrequencies && weights)
        ? weightedPickIndex(weights as any, candidates.length, seedValue)
        : null;
      const idx0 = typeof weightedIdx === 'number' ? weightedIdx : (mixedCursor % candidates.length);

      let item: (typeof items)[number] | undefined;
      for (let i = 0; i < candidates.length; i++) {
        const idx = (idx0 + i) % candidates.length;
        const candidate = candidates[idx];
        if (!candidate) continue;
        item = candidate;
        break;
      }
      if (!item) return;

      {
        const forced = variantOverride?.topicId === item.topicId
          ? buildForcedVariantWeights(item.topicId, variantOverride.variantId)
          : null;
        const multi = variantMultiOverride?.topicId === item.topicId
          ? buildMultiVariantWeights(item.topicId, variantMultiOverride.variantIds)
          : null;
        const weightsForTopic = (forced ?? (topicVariantWeights?.[item.topicId] as any)) as any;
        const effectiveWeightsForTopic = (forced ?? multi ?? weightsForTopic) as any;
        const strictTopic = !!forced || !!multi || hasConfiguredWeights(effectiveWeightsForTopic);
        const avoidVariantId = !hasTextFilter && !strictTopic ? (lastVariantByTopic[item.topicId] as string | undefined) : undefined;

        const q0 = tryGenerate(
          (seed) =>
            generatePracticeQuestion({
              topicId: item.topicId,
              difficulty: item.difficulty,
              seed,
              avoidVariantId,
              variantWeights: effectiveWeightsForTopic,
              answerKindByVariant: topicVariantAnswerKinds?.[item.topicId],
            }),
          item.topicId === 'word_problems' ? acceptWordProblem : undefined,
          { strict: strictMixed || strictTopic }
        );

        const q = q0 ?? (onlyQuestionTextQuery.trim()
          ? tryGenerate(
              (seed) =>
                generatePracticeQuestion({
                  topicId: item.topicId,
                  difficulty: item.difficulty,
                  seed,
                  avoidVariantId,
                  variantWeights: effectiveWeightsForTopic,
                  answerKindByVariant: topicVariantAnswerKinds?.[item.topicId],
                }),
              item.topicId === 'word_problems' ? acceptWordProblem : undefined,
              { strict: strictMixed || strictTopic, seedBase: computeNextSeed() }
            )
          : null);

        if (!q) return;
        setQuestion(q);
        rememberQuestionId(q.id);
        rememberQuestionKey(getQuestionDedupKey(q));
        if (item.topicId === 'word_problems') {
          const nextVariant = (q as any).variantId ?? undefined;
          setLastVariantByTopic((m) => ({ ...m, word_problems: nextVariant }));
          rememberWordProblemCategory((q as any).variantId);
        }
        resetAttemptState();
        return;
      }
    }

    if (!topicId) return;

    const weightsForTopic = topicVariantWeights?.[topicId] as any;
    const forced = variantOverride?.topicId === topicId ? buildForcedVariantWeights(topicId, variantOverride.variantId) : null;
    const multi = variantMultiOverride?.topicId === topicId ? buildMultiVariantWeights(topicId, variantMultiOverride.variantIds) : null;
    const effectiveWeightsForTopic = (forced ?? multi ?? weightsForTopic) as any;
    const strict = !!forced || !!multi || hasConfiguredWeights(effectiveWeightsForTopic);
    const avoidVariantId = !hasTextFilter && !strict ? (lastVariantByTopic[topicId] as string | undefined) : undefined;

    const q0 = tryGenerate(
      (seed) =>
        generatePracticeQuestion({
          topicId: topicId,
          difficulty: difficulty,
          seed,
          avoidVariantId,
          variantWeights: effectiveWeightsForTopic,
          answerKindByVariant: topicVariantAnswerKinds?.[topicId],
        }),
      topicId === 'word_problems' ? acceptWordProblem : undefined,
      { strict }
    );

    const q = q0 ?? (onlyQuestionTextQuery.trim()
      ? tryGenerate(
          (seed) =>
            generatePracticeQuestion({
              topicId: topicId,
              difficulty: difficulty,
              seed,
              avoidVariantId,
              variantWeights: effectiveWeightsForTopic,
              answerKindByVariant: topicVariantAnswerKinds?.[topicId],
            }),
          topicId === 'word_problems' ? acceptWordProblem : undefined,
          { strict, seedBase: computeNextSeed() }
        )
      : null);

    if (!q) return;
    setQuestion(q);
    rememberQuestionId(q.id);
    rememberQuestionKey(getQuestionDedupKey(q));
    // Record last variant id (if present) so the next question avoids it.
    const nextVariant = (q as any).variantId ?? (q as any).generatorParams?.kind ?? undefined;
    setLastVariantByTopic((m) => ({ ...m, [topicId]: nextVariant }));
    if (topicId === 'word_problems') {
      rememberWordProblemCategory((q as any).variantId);
    }
    resetAttemptState();
  };

  useEffect(() => {
    if (keywordApplyNonce <= 0) return;
    const seed = pendingKeywordSeedRef.current ?? computeNextSeed();
    pendingKeywordSeedRef.current = null;
    setSessionSeed(seed);
    generateNext(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywordApplyNonce]);

  const buildPracticeSnapshot = useCallback((q: any) => {
    if (!q) return null;
    const pruneExplanation = (blocks: any[]) => {
      if (!Array.isArray(blocks)) return blocks;
      return blocks.map((b) => {
        if (!b || typeof b !== 'object') return b;
        if (b.kind === 'graph') return { kind: 'graph', altText: b.altText, graphSpec: b.graphSpec };
        if (b.kind === 'long_division') {
          return {
            kind: 'long_division',
            divisorLatex: b.divisorLatex,
            dividendLatex: b.dividendLatex,
            quotientLatex: b.quotientLatex,
            steps: b.steps,
          };
        }
        return b;
      });
    };

    const correctAnswerKatex = (() => {
      if (q.kind === 'graph') {
        if (Array.isArray(q.katexOptions) && typeof q.correctIndex === 'number') {
          return String(q.katexOptions[q.correctIndex] ?? '');
        }
        const gp = (q.generatorParams ?? {}) as any;
        if (typeof gp.expectedLatex === 'string' && gp.expectedLatex) return gp.expectedLatex;
        if (typeof gp.expectedValue === 'number' && Number.isFinite(gp.expectedValue)) {
          return String.raw`\text{Answer: }${String(gp.expectedValue)}`;
        }
        return '';
      }

      if (q.kind === 'quadratic') {
        const qq: any = q as any;
        if (qq.variantId === 'factorisation') {
          const sols = Array.isArray(qq.solutionsLatex) ? qq.solutionsLatex : [];
          if (sols.length === 0) return '';
          // Always show two values of x, even if repeated.
          const s0 = String(sols[0] ?? '');
          const s1 = String(sols[1] ?? '');
          if (!s0 && !s1) return '';
          return String.raw`x = ${s0}\\;\text{or}\\; x = ${s1}`;
        }
        const parts = Array.isArray(qq.expectedParts) ? (qq.expectedParts as any[]) : [];
        if (!parts.length) return '';
        const rendered = parts.map((p: any) => {
          if (p.kind === 'fraction' && p.expectedFraction) {
            return String.raw`${p.label} = ${fractionToLatex(p.expectedFraction)}`;
          }
          if (p.kind === 'decimal_4sf' && typeof p.expectedDecimal === 'number') {
            const v = Number(p.expectedDecimal);
            if (!Number.isFinite(v)) return String.raw`${p.label} = ?`;
            return String.raw`${p.label} \approx ${Number(v.toPrecision(4))}`;
          }
          return String.raw`${p.label} = ?`;
        });
        return rendered.join('\\; ,\\; ');
      }

      if (typeof q.solutionLatex === 'string' && q.solutionLatex) {
        return String.raw`x = ${q.solutionLatex}`;
      }

      if (typeof q.solutionLatexX === 'string' || typeof q.solutionLatexY === 'string') {
        const x = q.solutionLatexX ? String.raw`x = ${q.solutionLatexX}` : '';
        const y = q.solutionLatexY ? String.raw`y = ${q.solutionLatexY}` : '';
        const z = q.solutionLatexZ ? String.raw`z = ${q.solutionLatexZ}` : '';
        return [x, y, z].filter(Boolean).join('\\; ,\\; ');
      }

      if (typeof q.expectedLatex === 'string' && q.expectedLatex) return q.expectedLatex;
      if (typeof q.expectedNumber === 'number' && Number.isFinite(q.expectedNumber)) return String.raw`\text{Answer: }${q.expectedNumber}`;
      if (typeof q.exponent === 'number' && Number.isFinite(q.exponent)) return String.raw`\text{Exponent: }${q.exponent}`;
      return '';
    })();

    if (q.kind === 'graph') {
      return {
        kind: 'graph',
        id: q.id,
        topicId: q.topicId,
        difficulty: q.difficulty,
        seed: q.seed,
        promptText: q.promptText,
        promptBlocks: Array.isArray(q.promptBlocks) ? q.promptBlocks : undefined,
        promptKatex: q.promptKatex,
        katexQuestion: q.katexQuestion,
        katexOptions: q.katexOptions,
        correctIndex: q.correctIndex,
        katexExplanation: q.katexExplanation,
        generatorParams: q.generatorParams,
        graphSpec: q.graphSpec,
        secondaryGraphSpec: q.secondaryGraphSpec,
        svgDataUrl: (q as any).svgDataUrl,
        svgAltText: q.svgAltText,
        correctAnswerKatex,
      };
    }

    return {
      kind: q.kind,
      id: q.id,
      topicId: q.topicId,
      difficulty: q.difficulty,
      seed: q.seed,
      katexQuestion: q.katexQuestion,
      promptBlocks: Array.isArray(q.promptBlocks) ? q.promptBlocks : undefined,
      katexExplanation: pruneExplanation(q.katexExplanation),
      variantId: q.variantId,
      generatorParams: q.generatorParams,
      correctAnswerKatex,
    };
  }, []);

  const recordShownEvent = useCallback(async () => {
    if (!user?.id) return;
    if (step !== 'session') return;
    if (!question) return;

    const qAny: any = question as any;
    const questionId = String(qAny.id ?? '');
    if (!questionId) return;

    if (activePracticeEventQuestionIdRef.current === questionId && activePracticeEventIdRef.current) return;
    if (activePracticeEventIdRef.current && activePracticeEventQuestionIdRef.current && activePracticeEventQuestionIdRef.current !== questionId) {
      const now = Date.now();
      await finalizeActivePracticeEvent({ submittedAt: now, nextAt: now, userAnswer: 'N/A', isCorrect: false });
    }

    const now = Date.now();
    const topicForRecord = (qAny.topicId ?? qAny.metadata?.topic ?? topicId) as any;
    const variantForRecord = (qAny.variantId ?? qAny.generatorParams?.kind ?? qAny.metadata?.method) as any;

    const id = uuidv4();
    activePracticeEventIdRef.current = id;
    activePracticeEventQuestionIdRef.current = questionId;
    activePracticeEventShownAtRef.current = now;

    try {
      await db.practiceEvents.add({
        id,
        userId: user.id,
        username: user.username,
        mode,
        topicId: topicForRecord ? String(topicForRecord) : undefined,
        difficulty: String(qAny.difficulty ?? difficulty ?? ''),
        variantId: variantForRecord ? String(variantForRecord) : undefined,
        mixedModuleId: mode === 'mixed' ? (mixedModuleId ?? undefined) : undefined,
        questionId,
        questionKind: qAny.kind ? String(qAny.kind) : undefined,
        shownAt: now,
        snapshotJson: JSON.stringify(buildPracticeSnapshot(qAny)),
        createdAt: now,
      });
    } catch (e) {
      console.error(e);
    }
  }, [buildPracticeSnapshot, difficulty, finalizeActivePracticeEvent, mixedModuleId, mode, question, step, topicId, user?.id, user?.username]);

  useEffect(() => {
    void recordShownEvent();
  }, [recordShownEvent]);

  const recordSubmitEvent = useCallback(
    async (payload: { isCorrect: boolean; userAnswer: string; userAnswerParts?: string[] }) => {
      const id = activePracticeEventIdRef.current;
      const shownAt = activePracticeEventShownAtRef.current;
      if (!id) return;
      try {
        const baseSnapshot = question ? buildPracticeSnapshot(question as any) : null;
        const snapshotJson = baseSnapshot
          ? JSON.stringify({
              ...baseSnapshot,
              userAnswerParts: Array.isArray(payload.userAnswerParts) ? payload.userAnswerParts : undefined,
              userAnswer: payload.userAnswer,
            })
          : undefined;
        await db.practiceEvents.update(id, {
          submittedAt: Date.now(),
          isCorrect: payload.isCorrect,
          userAnswer: payload.userAnswer,
          shownAt: shownAt ?? undefined,
          snapshotJson,
        } as any);
      } catch (e) {
        console.error(e);
      }
    },
    [buildPracticeSnapshot, question]
  );

  const recordNextEvent = useCallback(async () => {
    const id = activePracticeEventIdRef.current;
    if (!id) return;
    try {
      await db.practiceEvents.update(id, { nextAt: Date.now() } as any);
    } catch (e) {
      console.error(e);
    }
    activePracticeEventIdRef.current = null;
    activePracticeEventQuestionIdRef.current = null;
    activePracticeEventShownAtRef.current = null;
  }, []);

  const prevStepRef = useRef(step);
  useEffect(() => {
    const prev = prevStepRef.current;
    prevStepRef.current = step;
    if (prev === 'session' && step !== 'session') {
      const now = Date.now();
      void finalizeActivePracticeEvent({ submittedAt: now, nextAt: now, userAnswer: 'N/A', isCorrect: false });
    }
  }, [finalizeActivePracticeEvent, step]);

  useEffect(() => {
    return () => {
      const now = Date.now();
      void finalizeActivePracticeEvent({ submittedAt: now, nextAt: now, userAnswer: 'N/A', isCorrect: false });
    };
  }, [finalizeActivePracticeEvent]);

  useEffect(() => {
    if (step !== 'session') return;
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      const now = Date.now();
      void finalizeActivePracticeEvent({ submittedAt: now, nextAt: now, userAnswer: 'N/A', isCorrect: false });
    };
    const onPageHide = () => {
      const now = Date.now();
      void finalizeActivePracticeEvent({ submittedAt: now, nextAt: now, userAnswer: 'N/A', isCorrect: false });
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [finalizeActivePracticeEvent, step]);

  const currentTopicForAdminCommand = useMemo(() => {
    const q: any = question as any;
    const tid = (q?.topicId ?? q?.metadata?.topic) as PracticeTopicId | undefined;
    return tid ?? null;
  }, [question]);

  const currentTopicForSearchScope = useMemo(() => {
    if (mode === 'individual') return topicId;
    const q: any = question as any;
    const tid = (q?.topicId ?? q?.metadata?.topic) as PracticeTopicId | undefined;
    return tid ?? null;
  }, [mode, question, topicId]);

  const activeTopicScope = useMemo(() => {
    // If any "filter" implies a topic (keyword scope, multi-variant selection, or forced variant),
    // then mixed-mode generation should stay within that topic.
    return (
      onlyQuestionTextTopicScope ??
      variantMultiOverride?.topicId ??
      variantOverride?.topicId ??
      null
    );
  }, [onlyQuestionTextTopicScope, variantMultiOverride?.topicId, variantOverride?.topicId]);

  const currentTopicForVariantPicker = useMemo(() => {
    return mode === 'individual' ? topicId : (currentTopicForSearchScope ?? null);
  }, [currentTopicForSearchScope, mode, topicId]);

  const availableVariantsForPicker = useMemo(() => {
    if (!currentTopicForVariantPicker) return [];
    return PRACTICE_VARIANTS[currentTopicForVariantPicker] ?? [];
  }, [currentTopicForVariantPicker]);

  const selectedVariantIdsForPicker = useMemo(() => {
    if (!currentTopicForVariantPicker) return [];
    if (variantMultiOverride?.topicId !== currentTopicForVariantPicker) return [];
    return variantMultiOverride.variantIds ?? [];
  }, [currentTopicForVariantPicker, variantMultiOverride]);

  const toggleVariantForPicker = useCallback((variantId: string) => {
    if (!currentTopicForVariantPicker) return;
    setVariantMultiOverride((prev) => {
      const base: PracticeVariantMultiOverride = prev?.topicId === currentTopicForVariantPicker
        ? prev
        : { topicId: currentTopicForVariantPicker, variantIds: [] };
      const cur = new Set((base?.variantIds ?? []).map(String));
      if (cur.has(variantId)) cur.delete(variantId);
      else cur.add(variantId);
      return { topicId: currentTopicForVariantPicker, variantIds: Array.from(cur) };
    });
  }, [currentTopicForVariantPicker]);

  const applyCommandFromModal = useCallback(() => {
    const raw = (commandText ?? '').trim();
    if (!raw) {
      // If the user only used the checkbox picker (no typed command), keep the selected
      // variants active. Clearing is handled by the explicit "Clear all" button.
      if (variantMultiOverride?.topicId && (variantMultiOverride.variantIds ?? []).length) {
        setVariantOverride(null);
        setOnlyQuestionTextQuery('');
        setOnlyQuestionTextTopicScope(variantMultiOverride.topicId);
        toast.success('Applied selected question types');
        return;
      }
      if (variantOverride?.topicId && variantOverride?.variantId) {
        setVariantMultiOverride(null);
        setOnlyQuestionTextQuery('');
        setOnlyQuestionTextTopicScope(variantOverride.topicId);
        toast.success('Applied forced variant');
        return;
      }
      setVariantOverride(null);
      setVariantMultiOverride(null);
      setOnlyQuestionTextQuery('');
      setOnlyQuestionTextTopicScope(null);
      return;
    }

    // Non-admin: treat as keyword filter unless they try to use a slash command.
    if (!isAdmin && raw.startsWith('/')) {
      toast.error('Commands are admin-only. Type a keyword to filter questions.');
      return;
    }

    // Shortcut: allow typing a plain keyword (without /only) to set text filter quickly.
    if (!raw.startsWith('/')) {
      setVariantOverride(null);
      setOnlyQuestionTextQuery(raw);
      setOnlyQuestionTextTopicScope(currentTopicForSearchScope);
      pendingKeywordSeedRef.current = computeNextSeed();
      setKeywordApplyNonce((n) => n + 1);
      toast.success(`Filtering questions by text: "${raw}"`);
      return;
    }

    if (!isAdmin) return;

    if (/^\/?clear\b/i.test(raw)) {
      setVariantOverride(null);
      setVariantMultiOverride(null);
      setOnlyQuestionTextQuery('');
      setOnlyQuestionTextTopicScope(null);
      toast.success('Cleared forced variant');
      return;
    }

    const onlyMatch = raw.match(/^\/?only\s+(.+)$/i);
    if (!onlyMatch) {
      toast.error('Invalid command. Use "/only <variantId>" or "/only <topicId>:<variantId>" or "/clear"');
      return;
    }
    const payload = onlyMatch[1]?.trim() ?? '';
    if (!payload) {
      toast.error('Missing variant id');
      return;
    }
    const parts = payload.split(':').map((p) => p.trim()).filter(Boolean);
    const rawTopicId = parts.length >= 2 ? parts[0] : null;
    const rawVariantId = parts.length >= 2 ? parts.slice(1).join(':') : parts[0];

    const normalizeVariantToken = (s: string) => normalizeCommandToken(String(s ?? '').trim());

    const resolveTopicIdForMulti = (rawTid: string | null): PracticeTopicId | null => {
      if (rawTid) {
        const candidates = PRACTICE_TOPICS.map((t) => t.id);
        const hit = candidates.find((c) => normalizeCommandToken(c) === normalizeCommandToken(rawTid));
        return (hit ?? null) as any;
      }
      return (currentTopicForAdminCommand ?? currentTopicForSearchScope ?? null) as any;
    };

    const maybeVariantTokens = rawVariantId.split(';').map((s) => s.trim()).filter(Boolean);
    if (maybeVariantTokens.length >= 2) {
      const topic = resolveTopicIdForMulti(rawTopicId);
      if (!topic) {
        toast.error('Cannot infer topic for multi-type /only. Use "/only <topicId>:a;b"');
        return;
      }
      const allowed = PRACTICE_VARIANTS[topic] ?? [];
      if (!allowed.length) {
        // No variants for this topic; treat it as a keyword filter instead.
        const q = payload.trim();
        setVariantOverride(null);
        setVariantMultiOverride(null);
        setOnlyQuestionTextQuery(q);
        setOnlyQuestionTextTopicScope(currentTopicForSearchScope);
        toast.success(`Filtering questions by text: "${q}"`);
        return;
      }
      const wanted = maybeVariantTokens.map(normalizeVariantToken);
      const valid = allowed.filter((v) => wanted.includes(normalizeCommandToken(v)));

      // Only interpret ';' as multi-variant when it clearly matches known variant IDs,
      // or when the user explicitly provided a topicId.
      if (rawTopicId || valid.length) {
        if (!valid.length) {
          toast.error(`No valid variants found. Allowed: ${allowed.join(', ')}`);
          return;
        }
        setVariantOverride(null);
        setVariantMultiOverride({ topicId: topic, variantIds: valid });
        setOnlyQuestionTextQuery('');
        setOnlyQuestionTextTopicScope(topic);
        toast.success(`Forced ${topic} types: ${valid.join(', ')}`);
        return;
      }

      // Otherwise treat it as multiple keyword terms, e.g. "/only temperature; convert".
      const q = payload.trim();
      setVariantOverride(null);
      setVariantMultiOverride(null);
      setOnlyQuestionTextQuery(q);
      setOnlyQuestionTextTopicScope(currentTopicForSearchScope);
      pendingKeywordSeedRef.current = computeNextSeed();
      toast.success(`Filtering questions by text: "${q}"`);
      return;
    }

    const resolved = resolveTopicAndVariant({
      rawTopicId,
      rawVariantId,
      currentTopicId: currentTopicForAdminCommand,
    });

    if (!resolved) {
      // Fallback: treat payload as a keyword filter against rendered question text.
      const q = payload.trim();
      setVariantOverride(null);
      setOnlyQuestionTextQuery(q);
      setOnlyQuestionTextTopicScope(currentTopicForSearchScope);
      pendingKeywordSeedRef.current = computeNextSeed();
      setKeywordApplyNonce((n) => n + 1);
      toast.success(`Filtering questions by text: "${q}"`);
      return;
    }

    const weights = buildForcedVariantWeights(resolved.topicId, resolved.variantId);
    if (!weights) {
      const allowed = PRACTICE_VARIANTS[resolved.topicId] ?? [];
      toast.error(
        allowed.length
          ? `This topic supports variants, but the command could not be applied. Allowed: ${allowed.join(', ')}`
          : `This topic does not support variants via command.`
      );
      return;
    }

    setVariantOverride({ topicId: resolved.topicId, variantId: resolved.variantId });
    setVariantMultiOverride(null);
    setOnlyQuestionTextQuery('');
    // If you force a topic variant, keep generation in that topic.
    setOnlyQuestionTextTopicScope(resolved.topicId);
    if (resolved.resolvedBy === 'exact') {
      toast.success(`Forced ${resolved.topicId}:${resolved.variantId}`);
    } else {
      toast.success(`Forced ${resolved.topicId}:${resolved.variantId} (matched from "${payload}")`);
    }
  }, [commandText, currentTopicForAdminCommand, currentTopicForSearchScope, isAdmin, variantMultiOverride, variantOverride]);

  const getQuestionSearchText = useCallback((q: PracticeQuestion): string => {
    const anyQ: any = q as any;
    const out: string[] = [];
    const seen = new Set<any>();
    const MAX_STRINGS = 300;

    const push = (s: unknown) => {
      if (out.length >= MAX_STRINGS) return;
      const v = typeof s === 'string' ? s : '';
      const t = v.replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    };

    const extract = (value: unknown, depth: number) => {
      if (out.length >= MAX_STRINGS) return;
      if (depth <= 0) return;
      if (value == null) return;

      if (typeof value === 'string') {
        push(value);
        return;
      }

      if (typeof value === 'number' || typeof value === 'boolean') return;

      if (Array.isArray(value)) {
        for (const it of value) extract(it, depth - 1);
        return;
      }

      if (typeof value === 'object') {
        if (seen.has(value)) return;
        seen.add(value);

        const obj = value as Record<string, unknown>;
        for (const [k, v] of Object.entries(obj)) {
          if (out.length >= MAX_STRINGS) break;
          // Skip noisy keys.
          if (
            k === 'id' ||
            k === 'seed' ||
            k === 'createdAt' ||
            k === 'updatedAt' ||
            k === 'image' ||
            k === 'imageUrl' ||
            k === 'imageDataUrl' ||
            k === 'attachments'
          ) {
            continue;
          }
          extract(v, depth - 1);
        }
      }
    };

    // Primary stems
    extract(anyQ.katexQuestion, 2);
    extract(anyQ.question, 2);
    extract(anyQ.prompt, 2);
    extract(anyQ.promptText, 2);
    extract(anyQ.promptKatex, 2);
    extract(anyQ.text, 2);
    extract(anyQ.title, 2);

    // Prompt blocks / structured content
    extract(anyQ.promptBlocks, 4);
    extract(anyQ.blocks, 4);

    // Options / choices (support many shapes)
    extract(anyQ.options, 4);
    extract(anyQ.choices, 4);
    extract(anyQ.answers, 4);
    extract(anyQ.mcqOptions, 4);

    // Metadata / tags
    extract(anyQ.metadata, 3);
    extract(anyQ.tags, 2);
    extract(anyQ.topicId, 1);
    extract(anyQ.difficulty, 1);
    extract(anyQ.variantId, 1);

    return out.join(' ').replace(/\s+/g, ' ').trim();
  }, []);

  useEffect(() => {
    if (step !== 'session') return;
    if (!practiceHistoryLoadedRef.current) return;
    if (!question) {
      generateNext(sessionSeed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, question, sessionSeed]);

  useEffect(() => {
    const outer = wpKatexOuterRef.current;
    const inner = wpKatexInnerRef.current;
    if (!outer || !inner) return;

    const compute = () => {
      const ow = outer.clientWidth;
      const iw = inner.scrollWidth;
      if (!ow || !iw) return;
      const next = Math.min(1, Math.max(0.6, ow / iw));
      setWpKatexScale((prev) => (Math.abs(prev - next) < 0.01 ? prev : next));
    };

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(compute);
    });
    ro.observe(outer);

    requestAnimationFrame(compute);
    return () => {
      ro.disconnect();
    };
  }, [question, step]);

  const checkQuadraticAnswers = (expected: Fraction[], a: string, b: string) => {
    const p1 = parseFraction(a);
    const p2 = parseFraction(b);
    if (!p1 || !p2) return false;

    const [e1, e2] = expected;

    const direct = fractionsEqual(p1, e1) && fractionsEqual(p2, e2);
    const swapped = fractionsEqual(p1, e2) && fractionsEqual(p2, e1);
    return direct || swapped;
  };

  const gcdInt = (a: number, b: number): number => {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y !== 0) {
      const t = x % y;
      x = y;
      y = t;
    }
    return x;
  };

  const parseRawFractionInput = (raw: string): Fraction | null => {
    const s0 = String(raw ?? '').trim();
    if (!s0) return null;
    const s = s0.replace(/[−–]/g, '-');
    const cleaned = s.replace(/\s+/g, '');

    if (/^-?\d+$/.test(cleaned)) {
      return { n: Number(cleaned), d: 1 };
    }

    // Only accept explicit fractions for "simplified fraction" prompts.
    // Do not accept decimals here.
    const m = cleaned.match(/^(-?\d+)\/(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      const d = Number(m[2]);
      if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
      return { n, d };
    }

    const m3 = cleaned.match(/^\\frac\{(-?\d+)\}\{(\d+)\}$/);
    if (m3) {
      const n = Number(m3[1]);
      const d = Number(m3[2]);
      if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
      return { n, d };
    }

    const m4 = cleaned.match(/^-\\frac\{(\d+)\}\{(\d+)\}$/);
    if (m4) {
      const n = -Number(m4[1]);
      const d = Number(m4[2]);
      if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
      return { n, d };
    }

    return null;
  };

  const isSimplestFractionInput = (raw: string, expected: Fraction): boolean => {
    const parsedRaw = parseRawFractionInput(raw);
    if (!parsedRaw) return false;

    const n = parsedRaw.n;
    const d = parsedRaw.d;
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return false;

    // If the expected answer is an integer, require the student's input to be an integer.
    // (e.g. 6/3 should be marked wrong; student should enter 2)
    const exp = normalizeFraction(expected);
    const expIsInt = exp.d === 1;
    if (expIsInt) return d === 1;

    // Require positive denominator and reduced form.
    if (d < 0) return false;
    return gcdInt(n, d) === 1;
  };

  const checkSingleFractionAnswer = (expected: Fraction, raw: string, opts?: { requireSimplest?: boolean }) => {
    const parsed = parseFraction(String(raw ?? '').replace(/[−–]/g, '-'));
    if (!parsed) return false;
    if (opts?.requireSimplest) {
      if (!isSimplestFractionInput(String(raw ?? '').replace(/[−–]/g, '-'), expected)) return false;
    }
    return fractionsEqual(parsed, expected);
  };

  const parseFractionFromMathRaw = (raw: string): Fraction | null => {
    const s0 = String(raw ?? '').trim();
    if (!s0) return null;
    const s = s0.replace(/[−–]/g, '-');
    const cleaned = s.replace(/\s+/g, '');

    const fromBasic = parseFraction(cleaned);
    if (fromBasic) return fromBasic;

    const m = cleaned.match(/^\\(?:frac|dfrac|tfrac)\{(-?\d+)\}\{(\d+)\}$/);
    if (m) {
      const n = Number(m[1]);
      const d = Number(m[2]);
      if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
      return { n, d };
    }

    const m2 = cleaned.match(/^-\\(?:frac|dfrac|tfrac)\{(\d+)\}\{(\d+)\}$/);
    if (m2) {
      const n = -Number(m2[1]);
      const d = Number(m2[2]);
      if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
      return { n, d };
    }

    // Support compact forms like \frac12 or -\frac12
    const m3 = cleaned.match(/^\\(?:frac|dfrac|tfrac)(-?\d+)(\d+)$/);
    if (m3) {
      const n = Number(m3[1]);
      const d = Number(m3[2]);
      if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
      return { n, d };
    }

    return null;
  };

  const isDefiniteIntegralQuestion = (q: any) => {
    const latex = String(q?.katexQuestion ?? '');
    return /\\int_\{/.test(latex);
  };

  const sanitizeNumericInput = (raw: string, opts?: { maxDecimals?: number }) => {
    const maxDecimals = opts?.maxDecimals;
    let s = raw.replace(/[−–]/g, '-').replace(/[^0-9.\-]/g, '');
    const hadDot = s.includes('.');
    const hadTrailingDot = s.endsWith('.');
    const minusAtStart = s.startsWith('-');
    s = s.replace(/\-/g, '');
    if (minusAtStart) s = `-${s}`;

    // Allow a leading '.' during typing (e.g. ".3" -> "0.3").
    if (s.startsWith('.')) s = `0${s}`;
    if (s.startsWith('-.')) s = `-0${s.slice(1)}`;

    const dot = s.indexOf('.');
    if (dot !== -1) {
      const before = s.slice(0, dot + 1);
      const after = s.slice(dot + 1).replace(/\./g, '');
      s = before + after;
    }

    if (typeof maxDecimals === 'number' && maxDecimals >= 0) {
      const m = s.match(/^(-?\d+)(?:\.(\d*))?$/);
      if (m) {
        const a = m[1];
        const b = (m[2] ?? '').slice(0, maxDecimals);
        // Preserve an in-progress trailing dot (e.g. "0.") so users can continue typing decimals.
        if (!b.length && hadDot && hadTrailingDot && maxDecimals > 0) {
          s = `${a}.`;
        } else {
          s = b.length ? `${a}.${b}` : a;
        }
      }
    }

    return s;
  };

  const sanitizeRationalInput = (raw: string, opts?: { maxDecimals?: number }) => {
    const maxDecimals = opts?.maxDecimals;
    let s = raw.replace(/[−–]/g, '-').replace(/[^0-9.\/\-]/g, '');

    const hadDot = s.includes('.');
    const hadTrailingDot = s.endsWith('.');

    const minusAtStart = s.startsWith('-');
    s = s.replace(/\-/g, '');
    if (minusAtStart) s = `-${s}`;

    // keep only one '/'
    const slash = s.indexOf('/');
    if (slash !== -1) {
      const before = s.slice(0, slash + 1);
      const after = s.slice(slash + 1).replace(/\//g, '');
      s = before + after;

      // when fraction is present, remove any extra dots
      const left = s.slice(0, slash);
      const right = s.slice(slash + 1);
      const cleanLeft = (() => {
        const d = left.indexOf('.');
        if (d === -1) return left;
        return left.slice(0, d + 1) + left.slice(d + 1).replace(/\./g, '');
      })();
      const cleanRight = (() => {
        const d = right.indexOf('.');
        if (d === -1) return right;
        return right.slice(0, d + 1) + right.slice(d + 1).replace(/\./g, '');
      })();
      s = `${cleanLeft}/${cleanRight}`;
      return s;
    }

    // No fraction slash -> treat as decimal/integer; preserve "in-progress" decimal states.
    if (s.startsWith('.')) s = `0${s}`;
    if (s.startsWith('-.')) s = `-0${s.slice(1)}`;

    // otherwise treat as decimal/integer
    const dot = s.indexOf('.');
    if (dot !== -1) {
      const before = s.slice(0, dot + 1);
      const after = s.slice(dot + 1).replace(/\./g, '');
      s = before + after;
    }

    if (typeof maxDecimals === 'number' && maxDecimals >= 0) {
      const m = s.match(/^(-?\d+)(?:\.(\d*))?$/);
      if (m) {
        const a = m[1];
        const b = (m[2] ?? '').slice(0, maxDecimals);
        if (!b.length && hadDot && hadTrailingDot && maxDecimals > 0) {
          s = `${a}.`;
        } else {
          s = b.length ? `${a}.${b}` : a;
        }
      }
    }

    return s;
  };

  const normalizeFixed2 = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (!/^-?\d*(?:\.\d*)?$/.test(trimmed)) return trimmed;
    if (trimmed === '-' || trimmed === '.' || trimmed === '-.') return trimmed;

    const n = Number(trimmed);
    if (!Number.isFinite(n)) return trimmed;
    return n.toFixed(2);
  };

  const countSigFigs = (raw: string): number | null => {
    const s0 = String(raw ?? '').trim();
    if (!s0) return null;
    if (!/^-?\d*(?:\.\d*)?$/.test(s0)) return null;
    if (s0 === '-' || s0 === '.' || s0 === '-.') return null;

    let s = s0;
    if (s.startsWith('-')) s = s.slice(1);

    const hasDot = s.includes('.');
    const [a0, b0] = s.split('.', 2);
    const a = a0 ?? '';
    const b = b0 ?? '';

    if (hasDot) {
      // With decimal point: all digits after the first non-zero (including trailing zeros) are significant.
      const digits = (a + b).replace(/^0+/, '');
      if (!digits.length) return 0;
      return digits.length;
    }

    // No decimal point: trailing zeros are not significant.
    const trimmed = a.replace(/^0+/, '').replace(/0+$/, '');
    return trimmed.length;
  };

  const equalsTo4SigFigs = (expected: number, raw: string): boolean => {
    const s = sanitizeNumericInput(String(raw ?? ''), { maxDecimals: 12 }).trim();
    if (!s) return false;
    const sf = countSigFigs(s);
    if (sf !== 4) return false;
    const v = Number(s);
    if (!Number.isFinite(v)) return false;
    const eRounded = Number(expected.toPrecision(4));
    const vRounded = Number(v.toPrecision(4));
    return vRounded === eRounded;
  };

  const checkSessionAnswer = () => {
    const q = question as any;
    if (!q || !q.kind) return false;

    switch (q.kind) {
      case 'quadratic': {
        if (q.variantId === 'factorisation') {
          const expected = Array.isArray(q.solutions) ? (q.solutions as Fraction[]) : [];
          if (expected.length < 2) return false;
          return checkQuadraticAnswers(expected, answer1, answer2);
        }

        const parts = Array.isArray(q.expectedParts) ? (q.expectedParts as any[]) : [];
        const values = [answer1, answer2, answer3, ...extraAnswers];
        if (!parts.length) return false;
        if (values.slice(0, parts.length).some((v) => !String(v ?? '').trim())) return false;

        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          const raw = String(values[i] ?? '');
          if (p.kind === 'fraction') {
            if (!p.expectedFraction) return false;
            if (!checkSingleFractionAnswer(p.expectedFraction as Fraction, raw)) return false;
            continue;
          }
          if (p.kind === 'decimal_4sf') {
            if (typeof p.expectedDecimal !== 'number') return false;
            if (!equalsTo4SigFigs(Number(p.expectedDecimal), raw)) return false;
            continue;
          }
          return false;
        }
        return true;
      }
      case 'arithmetic': {
        const aq = q as any;
        const raw = String(answer1 ?? '').trim();
        if (!raw) return false;
        if (!/^-?\d+$/.test(raw)) return false;
        return Number(raw) === Number(aq.expectedNumber);
      }
      case 'linear':
        return checkSingleFractionAnswer(q.solution, answer1);
      case 'linear_intersection': {
        const xOk = checkSingleFractionAnswer(q.solutionX, answer1);
        const yOk = checkSingleFractionAnswer(q.solutionY, answer2);
        return xOk && yOk;
      }
      case 'fractions':
        return checkSingleFractionAnswer(q.solution, answer1, {
          requireSimplest: q.variantId === 'simplify_fraction' || q.variantId === 'add_sub_fractions',
        });
      case 'indices': {
        const trimmed = answer1.trim().replace(/\s+/g, '');

        // Indices: require the exponent only (numeric).
        if (!/^-?\d+$/.test(trimmed)) return false;
        const exp = Number(trimmed);
        if (exp === null || Number.isNaN(exp)) return false;
        return exp === q.exponent;
      }
      case 'polynomial': {
        const trimmed = String(answer1 ?? '').trim().replace(/\s+/g, '').replace(/[−–]/g, '-');
        if (!/^\d+$/.test(trimmed)) return false;
        const v = Number(trimmed);
        if (!Number.isFinite(v)) return false;
        return v === (q as any).expectedNumber;
      }
      case 'permutation_combination': {
        const trimmed = String(answer1 ?? '').trim().replace(/\s+/g, '').replace(/[−–]/g, '-');
        if (!/^\d+$/.test(trimmed)) return false;
        const v = Number(trimmed);
        if (!Number.isFinite(v)) return false;
        return v === Number((q as any).expectedNumber);
      }
      case 'simultaneous': {
        const isLinQuad = (q as any).variantId === 'lin_quad'
          && (q as any).solutionX2
          && (q as any).solutionY2;

        if (isLinQuad) {
          const ax1 = answer1;
          const ay1 = answer2;
          const ax2 = String((extraAnswers[0] ?? '') as any);
          const ay2 = String((extraAnswers[1] ?? '') as any);

          const pair1a = checkSingleFractionAnswer(q.solutionX, ax1) && checkSingleFractionAnswer(q.solutionY, ay1);
          const pair2a = checkSingleFractionAnswer((q as any).solutionX2, ax2) && checkSingleFractionAnswer((q as any).solutionY2, ay2);

          const pair1b = checkSingleFractionAnswer(q.solutionX, ax2) && checkSingleFractionAnswer(q.solutionY, ay2);
          const pair2b = checkSingleFractionAnswer((q as any).solutionX2, ax1) && checkSingleFractionAnswer((q as any).solutionY2, ay1);

          return (pair1a && pair2a) || (pair1b && pair2b);
        }

        const xOk = checkSingleFractionAnswer(q.solutionX, answer1);
        const yOk = checkSingleFractionAnswer(q.solutionY, answer2);
        if ((q as any).variableCount === 3) {
          if (!(q as any).solutionZ) return false;
          const zOk = checkSingleFractionAnswer((q as any).solutionZ, answer3);
          return xOk && yOk && zOk;
        }
        return xOk && yOk;
      }
      case 'factorisation': {
        const fq = q as any;
        const norm = (s: string) => String(s ?? '')
          .trim()
          .replace(/[−–]/g, '-')
          .replace(/\u200b/g, '')
          .replace(/\s+/g, '');
        // MathLive emits LaTeX; normalize it to our lightweight compare format.
        const expectedCount = Math.max(2, Math.min(3, Number(fq.expectedFactors?.length ?? 2)));

        const factors = [norm(answer1), norm(answer2), norm(answer3)].filter(Boolean);
        if (factors.length !== expectedCount) return false;

        const perms = (arr: string[]) => {
          if (arr.length <= 1) return [arr];
          if (arr.length === 2) return [[arr[0], arr[1]], [arr[1], arr[0]]];
          if (arr.length === 3) {
            const [a0, a1, a2] = arr;
            return [
              [a0, a1, a2],
              [a0, a2, a1],
              [a1, a0, a2],
              [a1, a2, a0],
              [a2, a0, a1],
              [a2, a1, a0],
            ];
          }
          return [arr];
        };

        const candidates: string[] = [];
        for (const p of perms(factors)) {
          const paren = p.map((f) => `(${f})`);
          candidates.push(paren.join(''));
          candidates.push(paren.join('*'));
        }

        for (const c of candidates) {
          if (q.expectedNormalized.includes(c)) return true;
        }
        return false;
      }
      case 'logarithms': {
        const lg = q as any;
        const variantId = String(lg.variantId ?? '');
        const raw1 = String(answer1 ?? '').trim();
        const expectedNum = (typeof lg.expectedNumber === 'number' && Number.isFinite(lg.expectedNumber))
          ? Number(lg.expectedNumber)
          : null;

        const countSignificantFigures = (raw: string): number => {
          const s0 = String(raw ?? '').trim();
          if (!s0) return 0;
          const s = s0.replace(/[−–]/g, '-');
          // Allow scientific notation.
          const parts = s.split(/[eE]/);
          const mantissa0 = (parts[0] ?? '').trim();
          if (!mantissa0) return 0;
          const mantissa = mantissa0.replace(/^[+-]/, '');

          // Reject non-numeric mantissas.
          if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(mantissa)) return 0;

          const hasDot = mantissa.includes('.');
          const digits = mantissa.replace('.', '');
          // If the mantissa is all zeros (e.g. 0, 0.0), treat as 1 sig fig.
          if (!/[1-9]/.test(digits)) return 1;

          if (hasDot) {
            // Decimal present: count from first non-zero digit through the end (including zeros).
            const idx = digits.search(/[1-9]/);
            return Math.max(0, digits.length - idx);
          }

          // Integer with no decimal point: trailing zeros are not significant.
          const noLeading = digits.replace(/^0+/, '');
          const noTrailing = noLeading.replace(/0+$/, '');
          return noTrailing.length;
        };

        // Avoid accepting raw numeric equality for significant-figure questions.
        if (expectedNum !== null && raw1 && lg.answerKind !== 'decimal_3sf' && lg.answerKind !== 'decimal_4sf') {
          const n = Number(raw1);
          if (!Number.isNaN(n) && Math.abs(n - expectedNum) < 1e-9) return true;
        }

        const isConvertToLog = [
          'exp_to_log',
          'exp_to_log_const',
          'exp_to_log_two_vars',
          'exp_to_log_ab_c',
        ].includes(variantId);

        const isSingleLog = [
          'single_log_sum',
          'single_log_diff',
          'single_log_power',
          'single_log_coeff_sum',
          'single_log_coeff_diff',
          'single_log_const_plus',
          'single_log_const_minus',
          'single_log_then_simplify',
        ].includes(variantId);

				const isConvertToExp = [
					'log_to_exp_basic',
					'log_to_exp_frac',
					'log_to_exp_zero',
					'log_to_exp_var_rhs',
					'log_to_exp',
				].includes(variantId);

        if (isConvertToLog && Array.isArray(lg.expectedParts) && lg.expectedParts.length === 3) {
          const normalize = (raw: string) => String(raw ?? '')
            .trim()
            .replace(/[−–]/g, '-')
            .replace(/\s+/g, '')
            .toLowerCase();
          const inputs = [answer1, answer2, answer3].map((x) => normalize(String(x ?? '')));
          const expected = (lg.expectedParts as any[]).map((x) => normalize(String(x ?? '')));
          if (inputs.some((s) => !s)) return false;
          return inputs[0] === expected[0] && inputs[1] === expected[1] && inputs[2] === expected[2];
        }

        if (isSingleLog && Array.isArray(lg.expectedParts) && lg.expectedParts.length >= 2) {
          const normalize = (raw: string) => String(raw ?? '')
            .trim()
            .replace(/[−–]/g, '-')
            .replace(/\s+/g, '')
            .replace(/\\left/g, '')
            .replace(/\\right/g, '')
            .replace(/[()]/g, '')
            .replace(/\\(?:frac|dfrac|tfrac)\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
            .replace(/\\(?:frac|dfrac|tfrac)(-?\d+)(\d+)/g, '$1/$2')
            .replace(/\{([^}]*)\}/g, '$1')
            .toLowerCase();
          const b = normalize(answer1);
          const arg = normalize(answer2);
          if (!b || !arg) return false;
          const expected = (lg.expectedParts as any[]).map((x) => normalize(String(x ?? '')));
          return b === (expected[0] ?? '') && arg === (expected[1] ?? '');
        }

				if (isConvertToExp && Array.isArray(lg.expectedParts) && lg.expectedParts.length === 3) {
					const normalize = (raw: string) => String(raw ?? '')
						.trim()
						.replace(/[−–]/g, '-')
						.replace(/\s+/g, '')
						.replace(/\\left/g, '')
						.replace(/\\right/g, '')
						.replace(/[()]/g, '')
						.replace(/\\(?:frac|dfrac|tfrac)\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
						.replace(/\\(?:frac|dfrac|tfrac)(-?\d+)(\d+)/g, '$1/$2')
						.replace(/\{([^}]*)\}/g, '$1')
						.toLowerCase();
					const inputs = [answer1, answer2, answer3].map((x) => normalize(String(x ?? '')));
					const expected = (lg.expectedParts as any[]).map((x) => normalize(String(x ?? '')));
					if (inputs.some((s) => !s)) return false;
					return inputs[0] === expected[0] && inputs[1] === expected[1] && inputs[2] === expected[2];
				}

        if (lg.answerKind === 'integer') {
          const raw = raw1;
          if (!raw) return false;
          if (!/^-?\d+$/.test(raw)) return false;
          return expectedNum !== null ? Number(raw) === expectedNum : Number(raw) === Number(lg.expectedNumber);
        }

        if (lg.answerKind === 'decimal_3sf') {
          const raw = raw1;
          if (!raw) return false;
          const n = Number(raw);
          if (Number.isNaN(n)) return false;
          if (countSignificantFigures(raw) !== 3) return false;
          const toSigFigs = (x: number, sig: number) => {
            if (!Number.isFinite(x)) return x;
            const ax = Math.abs(x);
            if (ax === 0) return 0;
            const p = Math.floor(Math.log10(ax));
            const scale = Math.pow(10, sig - 1 - p);
            return Math.round(x * scale) / scale;
          };
          const expected = expectedNum !== null ? expectedNum : Number(lg.expectedNumber);
          if (!Number.isFinite(expected)) return false;
          const userRounded = toSigFigs(n, 3);
          const expectedRounded = toSigFigs(expected, 3);
          return Math.abs(userRounded - expectedRounded) < 1e-9;
        }

        if (lg.answerKind === 'decimal_4sf') {
          const raw = raw1;
          if (!raw) return false;
          const n = Number(raw);
          if (Number.isNaN(n)) return false;
          const toSigFigs = (x: number, sig: number) => {
            if (!Number.isFinite(x)) return x;
            const ax = Math.abs(x);
            if (ax === 0) return 0;
            const p = Math.floor(Math.log10(ax));
            const scale = Math.pow(10, sig - 1 - p);
            return Math.round(x * scale) / scale;
          };

          const expected = expectedNum !== null ? expectedNum : Number(lg.expectedNumber);
          if (!Number.isFinite(expected)) return false;
          const userRounded = toSigFigs(n, 4);
          const expectedRounded = toSigFigs(expected, 4);
          if (countSignificantFigures(raw) !== 4) return false;
          return Math.abs(userRounded - expectedRounded) < 1e-9;
        }

        // text fallback: compare normalized latex-ish string (be tolerant to optional parentheses)
        const expectedFrac = parseFractionFromMathRaw(String(lg.expectedLatex ?? ''));
        const userFrac = parseFractionFromMathRaw(String(answer1 ?? ''));
        if (expectedFrac && userFrac) return fractionsEqual(expectedFrac, userFrac);

        const normLatex = (s: string) => String(s ?? '')
          .trim()
          .replace(/[−–]/g, '-')
          .replace(/\s+/g, '')
          .replace(/\\left/g, '')
          .replace(/\\right/g, '')
          .replace(/[()]/g, '')
          .replace(/\\(?:frac|dfrac|tfrac)\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
          .replace(/\\(?:frac|dfrac|tfrac)(-?\d+)(\d+)/g, '$1/$2')
          .replace(/\{([^}]*)\}/g, '$1')
          .replace(/\\cdot/g, '')
          .replace(/\*/g, '')
          .toLowerCase();
        const normalized = normLatex(String(answer1 ?? ''));
        const expectedLatex = normLatex(String(lg.expectedLatex ?? ''));
        return normalized.length > 0 && normalized === expectedLatex;
      }
      case 'calculus': {
        const cq = q as any;

        // Differentiation variants can have multi-part answers.
        if (cq.topicId === 'differentiation' && Array.isArray(cq.expectedParts) && cq.expectedParts.length > 0) {
          // Special-case: some differentiation variants expect (a,b) parameters.
          if (String(cq.variantId ?? '') === 'sqrt_params_point_gradient' && cq.expectedParts.length === 2) {
            const parseExpected = (s: string): Fraction | null => parseFractionFromMathRaw(String(s ?? ''));
            const expA = parseExpected(cq.expectedParts[0]);
            const expB = parseExpected(cq.expectedParts[1]);
            if (!expA || !expB) return false;

            const requireSimplestA = normalizeFraction(expA).d !== 1;
            const requireSimplestB = normalizeFraction(expB).d !== 1;

            const okA = checkSingleFractionAnswer(expA, String(answer1 ?? ''), { requireSimplest: requireSimplestA });
            const okB = checkSingleFractionAnswer(expB, String(answer2 ?? ''), { requireSimplest: requireSimplestB });
            return okA && okB;
          }

          // Single gradient as a fraction/integer (must be simplest when a fraction).
          if (['power_linear_point_gradient', 'rational_yaxis_gradient'].includes(String(cq.variantId ?? '')) && cq.expectedParts.length === 1) {
            const exp = parseFractionFromMathRaw(String(cq.expectedParts[0] ?? ''));
            if (!exp) return false;
            const requireSimplest = normalizeFraction(exp).d !== 1;
            return checkSingleFractionAnswer(exp, String(answer1 ?? ''), { requireSimplest });
          }

          // Generic single numeric answer (e.g. some gradient-at-a-point variants may not be in the allowlist).
          if (cq.expectedParts.length === 1) {
            const exp = parseFractionFromMathRaw(String(cq.expectedParts[0] ?? ''));
            if (!exp) return false;
            const requireSimplest = normalizeFraction(exp).d !== 1;
            return checkSingleFractionAnswer(exp, String(answer1 ?? ''), { requireSimplest });
          }

          // Two gradients at two x-intercepts: allow either order, each must be simplest if fractional.
          if (String(cq.variantId ?? '') === 'linear_minus_rational_xaxis_gradients' && cq.expectedParts.length === 2) {
            const is3sf = String((cq as any).answerFormat ?? '') === 'decimal_3sf';
            if (is3sf) {
              const n1 = Number(String(cq.expectedParts[0] ?? ''));
              const n2 = Number(String(cq.expectedParts[1] ?? ''));
              if (!Number.isFinite(n1) || !Number.isFinite(n2)) return false;
              const ok12 = equalsTo3SigFigs(n1, String(answer1 ?? '')) && equalsTo3SigFigs(n2, String(answer2 ?? ''));
              const ok21 = equalsTo3SigFigs(n2, String(answer1 ?? '')) && equalsTo3SigFigs(n1, String(answer2 ?? ''));
              return ok12 || ok21;
            }
            const exp1 = parseFractionFromMathRaw(String(cq.expectedParts[0] ?? ''));
            const exp2 = parseFractionFromMathRaw(String(cq.expectedParts[1] ?? ''));
            if (!exp1 || !exp2) return false;
            const r1 = normalizeFraction(exp1).d !== 1;
            const r2 = normalizeFraction(exp2).d !== 1;
            const ok12 = checkSingleFractionAnswer(exp1, String(answer1 ?? ''), { requireSimplest: r1 })
              && checkSingleFractionAnswer(exp2, String(answer2 ?? ''), { requireSimplest: r2 });
            const ok21 = checkSingleFractionAnswer(exp2, String(answer1 ?? ''), { requireSimplest: r2 })
              && checkSingleFractionAnswer(exp1, String(answer2 ?? ''), { requireSimplest: r1 });
            return ok12 || ok21;
          }

          // Coordinate-pair answers: expectedParts is [x1,y1,x2,y2,...].
          // Allow swapping whole points, but do NOT allow mixing x/y across points.
          // Compare numerically (fractions/decimals/integers) to be tolerant of equivalent forms.
          {
            const parts = cq.expectedParts as any[];
            const hasEvenParts = Array.isArray(parts) && parts.length >= 2 && parts.length % 2 === 0;
            const hintText = `${String(cq.variantId ?? '')} ${String((cq as any).code ?? '')} ${String(cq.katexQuestion ?? '')}`.toLowerCase();
            const looksLikeCoords = hintText.includes('coord') || hintText.includes('point') || hintText.includes('gradient');
            if (hasEvenParts && looksLikeCoords) {
              const need = parts.length;
              const values = [answer1, answer2, answer3, ...extraAnswers].slice(0, need).map((v) => String(v ?? ''));
              if (values.some((v) => !String(v ?? '').trim())) return false;

              const parse = (s: string) => parseFractionFromMathRaw(String(s ?? ''));
              const exp = parts.map((p) => parse(String(p ?? '')));
              const inp = values.map((p) => parse(String(p ?? '')));
              if (exp.some((x) => !x) || inp.some((x) => !x)) return false;

              type Pair = { x: Fraction; y: Fraction };
              const toPairs = (arr: Fraction[]): Pair[] => {
                const out: Pair[] = [];
                for (let i = 0; i < arr.length; i += 2) out.push({ x: arr[i] as Fraction, y: arr[i + 1] as Fraction });
                return out;
              };

              const expPairs = toPairs(exp as Fraction[]);
              const inPairs = toPairs(inp as Fraction[]);

              const canon = (p: Pair) => {
                const xx = normalizeFraction(p.x);
                const yy = normalizeFraction(p.y);
                return `${xx.n}/${xx.d},${yy.n}/${yy.d}`;
              };

              const expCanon = expPairs.map(canon).sort();
              const inCanon = inPairs.map(canon).sort();
              if (expCanon.length !== inCanon.length) return false;
              return expCanon.every((v, i) => v === inCanon[i]);
            }
          }

          // Stationary-points x-values (original variant) - keep existing behavior.
          if (String(cq.variantId ?? '') !== 'stationary_points') {
            // If another differentiation variant uses expectedParts but isn't handled above, fall back.
            // (Should not happen for the variants we support.)
            return false;
          }

          const normalizeSingle = (raw: string) => {
            const cleaned = String(raw ?? '')
              .trim()
              .replace(/[−–]/g, '-')
              .replace(/\u200b/g, '')
              .replace(/^x\s*=/i, '')
              .replace(/^x\s*:/i, '')
              .replace(/\s+/g, '')
              .replace(/\{|\}/g, '')
              .replace(/\[|\]/g, '')
              .replace(/\(|\)/g, '');
            // If user typed a comma-separated list, keep only the first token.
            return cleaned.split(',').filter(Boolean)[0] ?? '';
          };

          const expected = cq.expectedParts.map((p: string) => normalizeSingle(p)).filter(Boolean);
          const inputs = [answer1, answer2, answer3].map((a) => normalizeSingle(a)).filter(Boolean);
          if (inputs.length !== expected.length) return false;
          const a = [...inputs].sort();
          const b = [...expected].sort();
          return a.every((v, i) => v === b[i]);
        }

        // Generic calculus fallback: two gradients (e.g. at two x-intercepts).
        // Some question types outside our explicit differentiation variant mapping may still carry expectedParts=[g1,g2].
        if (Array.isArray(cq.expectedParts) && cq.expectedParts.length === 2) {
          const hintText = `${String(cq.variantId ?? '')} ${String((cq as any).code ?? '')} ${String(cq.katexQuestion ?? '')}`.toLowerCase();
          const looksLikeTwoGradients = hintText.includes('gradient') && (hintText.includes('points') || hintText.includes('point'));
          if (looksLikeTwoGradients) {
            const is3sf = String((cq as any).answerFormat ?? '') === 'decimal_3sf' || hintText.includes('3 s.f');

            const rawA1 = String(answer1 ?? '');
            const rawA2 = String(answer2 ?? '');
            if (!rawA1.trim() || !rawA2.trim()) return false;

            if (is3sf) {
              const n1 = Number(String(cq.expectedParts[0] ?? ''));
              const n2 = Number(String(cq.expectedParts[1] ?? ''));
              if (!Number.isFinite(n1) || !Number.isFinite(n2)) return false;
              const ok12 = equalsTo3SigFigsLenient(n1, rawA1) && equalsTo3SigFigsLenient(n2, rawA2);
              const ok21 = equalsTo3SigFigsLenient(n2, rawA1) && equalsTo3SigFigsLenient(n1, rawA2);
              return ok12 || ok21;
            }

            const exp1 = parseFractionFromMathRaw(String(cq.expectedParts[0] ?? ''));
            const exp2 = parseFractionFromMathRaw(String(cq.expectedParts[1] ?? ''));
            if (!exp1 || !exp2) return false;
            const r1 = normalizeFraction(exp1).d !== 1;
            const r2 = normalizeFraction(exp2).d !== 1;
            const ok12 = checkSingleFractionAnswer(exp1, rawA1, { requireSimplest: r1 })
              && checkSingleFractionAnswer(exp2, rawA2, { requireSimplest: r2 });
            const ok21 = checkSingleFractionAnswer(exp2, rawA1, { requireSimplest: r2 })
              && checkSingleFractionAnswer(exp1, rawA2, { requireSimplest: r1 });
            return ok12 || ok21;
          }
        }

        // Definite integrals should accept numeric fractions/decimals like -2/3.
        if (cq.topicId === 'integration' && isDefiniteIntegralQuestion(cq)) {
          const expectedFrac = parseFractionFromMathRaw(String(cq.expectedLatex ?? ''));
          const userFrac = parseFractionFromMathRaw(String(answer1 ?? ''));
          if (expectedFrac && userFrac) return fractionsEqual(expectedFrac, userFrac);

          // Fallback to normalized string compare.
          const normalized = String(answer1 ?? '').replace(/\s+/g, '').toLowerCase();
          return (cq.expectedNormalized ?? []).includes(normalized);
        }

        // Indefinite calculus answers are symbolic.
        const normalizeExpr = (raw: string) => typeof cq.normalize === 'function'
          ? String(cq.normalize(String(raw ?? '')))
          : String(raw ?? '').replace(/\s+/g, '').toLowerCase();

        const normalized = normalizeExpr(String(answer1 ?? ''));
        const expected = (cq.expectedNormalized ?? []).map((s: string) => normalizeExpr(String(s ?? '')));
        if (expected.includes(normalized)) return true;

        // Universal math normalization fallback: accept equivalent algebraic formatting
        // (e.g. -3x^4/4 == -(3/4)x^4, \frac{2x^3}{3} == \frac{2}{3}x^3).
        const uniUser = normalizeUniversalMathAnswer(String(answer1 ?? ''));
        const uniExpected = (cq.expectedNormalized ?? []).map((s: string) => normalizeUniversalMathAnswer(String(s ?? '')));
        return uniExpected.includes(uniUser);
      }
      case 'word_problem': {
        const wp = q as any;
        const raw1 = String(answer1 ?? '').trim();
        const raw2 = String(answer2 ?? '').trim();

        const countSignificantFigures = (raw: string): number => {
          const s0 = String(raw ?? '').trim();
          if (!s0) return 0;
          const s = s0.replace(/[−–]/g, '-');
          const parts = s.split(/[eE]/);
          const mantissa0 = (parts[0] ?? '').trim();
          if (!mantissa0) return 0;
          const mantissa = mantissa0.replace(/^[+-]/, '');
          if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(mantissa)) return 0;
          const hasDot = mantissa.includes('.');
          const digits = mantissa.replace('.', '');
          if (!/[1-9]/.test(digits)) return 1;
          if (hasDot) {
            const idx = digits.search(/[1-9]/);
            return Math.max(0, digits.length - idx);
          }
          const noLeading = digits.replace(/^0+/, '');
          const noTrailing = noLeading.replace(/0+$/, '');
          return noTrailing.length;
        };

        const checkDecimal4sf = (expected: number, raw: string) => {
          const s = String(raw ?? '').trim();
          if (!s) return false;
          const cleaned = s.replace(/[−–]/g, '-').replace(/\s+/g, '');
          if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) return false;
          const n = Number(cleaned);
          if (!Number.isFinite(n)) return false;

          if (!Number.isInteger(expected)) {
            if (!cleaned.includes('.')) return false;
            if (countSignificantFigures(cleaned) !== 4) return false;
          }

          const tol = Math.max(1e-9, Math.abs(expected) * 1e-6);
          return Math.abs(n - expected) <= tol;
        };

        if (Array.isArray(wp.expectedNumbers) && wp.expectedNumbers.length === 2) {
          const e1 = Number(wp.expectedNumbers[0]);
          const e2 = Number(wp.expectedNumbers[1]);
          if (!raw1 || !raw2) return false;

          if (wp.answerKind === 'integer') {
            if (!/^-?\d+$/.test(raw1) || !/^-?\d+$/.test(raw2)) return false;
            return (Number(raw1) === e1 && Number(raw2) === e2) || (Number(raw1) === e2 && Number(raw2) === e1);
          }

          if (wp.answerKind === 'decimal_4sf') {
            const direct = checkDecimal4sf(e1, raw1) && checkDecimal4sf(e2, raw2);
            const swapped = checkDecimal4sf(e2, raw1) && checkDecimal4sf(e1, raw2);
            return direct || swapped;
          }

          return false;
        }

        const raw = wp.answerKind === 'rational' && wp.expectedFraction
          ? (raw2 ? `${raw1}/${raw2}` : raw1)
          : raw1;

        if (!raw) return false;

        if (wp.answerKind === 'integer') {
          if (!/^-?\d+$/.test(raw)) return false;
          return Number(raw) === Number(wp.expectedNumber);
        }

        if (wp.answerKind === 'decimal_2dp') {
          if (!/^-?\d+\.\d{2}$/.test(raw)) return false;
          return Number(raw) === Number(wp.expectedNumber);
        }

        if (wp.answerKind === 'decimal_4sf') {
          if (typeof wp.expectedNumber !== 'number' || !Number.isFinite(wp.expectedNumber)) return false;
          return checkDecimal4sf(Number(wp.expectedNumber), raw);
        }

        // rational: allow fraction or decimal
        if (wp.expectedFraction) {
          const parsed = parseFraction(raw);
          if (!parsed) return false;
          return fractionsEqual(parsed, wp.expectedFraction);
        }
        return false;
      }
      case 'graph': {
        const gq = q as unknown as GraphPracticeQuestion;
        if (gq.katexOptions?.length) {
          if (typeof gq.correctIndex !== 'number') return false;
          if (selectedOptionIndex === null) return false;
          return selectedOptionIndex === gq.correctIndex;
        }

        const gp = (gq.generatorParams ?? {}) as any;

        if (gq.topicId === 'clock_reading') {
          const kind = String(gp.answerKind ?? '');
          const hRaw = String(answer1 ?? '').trim();
          const mRaw = String(answer2 ?? '').trim();
          const sRaw = String(answer3 ?? '').trim();

          const parseIntSafe = (v: string) => {
            if (!/^\d+$/.test(v)) return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          };

          if (kind === 'time_12_no_ampm') {
            const h = parseIntSafe(hRaw);
            const m = parseIntSafe(mRaw);
            if (h == null || m == null) return false;
            if (h < 1 || h > 12) return false;
            if (m < 0 || m > 59) return false;
            return h === Number(gp.expectedHour) && m === Number(gp.expectedMinute);
          }

          if (kind === 'time_12_ampm') {
            const h = parseIntSafe(hRaw);
            const m = parseIntSafe(mRaw);
            if (h == null || m == null) return false;
            if (h < 1 || h > 12) return false;
            if (m < 0 || m > 59) return false;
            const ampm = sRaw.toUpperCase();
            if (ampm !== 'AM' && ampm !== 'PM') return false;
            return (
              h === Number(gp.expectedHour)
              && m === Number(gp.expectedMinute)
              && ampm === String(gp.expectedAmPm ?? '').toUpperCase()
            );
          }

          if (kind === 'time_24') {
            const h = parseIntSafe(hRaw);
            const m = parseIntSafe(mRaw);
            if (h == null || m == null) return false;
            if (h < 0 || h > 23) return false;
            if (m < 0 || m > 59) return false;
            return h === Number(gp.expectedHour24) && m === Number(gp.expectedMinute);
          }

          if (kind === 'duration_hm') {
            const h = parseIntSafe(hRaw);
            const m = parseIntSafe(mRaw);
            if (h == null || m == null) return false;
            if (h < 0) return false;
            if (m < 0 || m > 59) return false;
            return h === Number(gp.expectedHours) && m === Number(gp.expectedMinutes);
          }

          if (kind === 'duration_minutes') {
            const mins = parseIntSafe(hRaw);
            if (mins == null) return false;
            if (mins < 0) return false;
            return mins === Number(gp.expectedTotalMinutes);
          }
        }

        if (Array.isArray(gp.expectedParts) && gp.expectedParts.length > 0) {
          const expectedParts = (gp.expectedParts as any[]).map((x) => Number(x)).filter((n) => Number.isFinite(n));
          if (!expectedParts.length) return false;

          const values = [answer1, answer2, answer3, ...extraAnswers].map((v) => String(v ?? '').trim());
          const userNums: number[] = [];
          for (let i = 0; i < expectedParts.length; i++) {
            const raw = values[i] ?? '';
            if (!raw) return false;
            const user = Number(raw);
            if (Number.isNaN(user)) return false;
            userNums.push(user);
          }

          const tol = typeof gp.expectedTolerance === 'number' ? Number(gp.expectedTolerance) : 0.02;
          const fmt = String(gp.expectedFormat ?? '');
          const ordered = gp.expectedPartsOrdered === true;

          const toSigFigs = (n: number, sf: number) => {
            const x = Number(n);
            if (!Number.isFinite(x)) return x;
            if (x === 0) return 0;
            const d = Math.ceil(Math.log10(Math.abs(x)));
            const p = sf - d;
            const scale = Math.pow(10, p);
            return Math.round(x * scale) / scale;
          };

          const norm = (n: number) => (fmt === 'sigfig_4' ? toSigFigs(n, 4) : n);
          const exp = expectedParts.map(norm);
          const usr = userNums.map(norm);

          if (ordered) {
            // Compare in fixed order (useful for labeled multi-input answers like X_A, Y_A, X_B, Y_B).
            for (let i = 0; i < exp.length; i++) {
              const d = Math.abs((usr[i] ?? Number.NaN) - exp[i]!);
              if (!Number.isFinite(d) || d > tol) return false;
            }
            return true;
          }

          // Order does not matter: greedily match each expected value to a remaining user value.
          const remaining = usr.slice();
          for (const e of exp) {
            let bestIdx = -1;
            let bestDist = Number.POSITIVE_INFINITY;
            for (let i = 0; i < remaining.length; i++) {
              const d = Math.abs(remaining[i]! - e);
              if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
              }
            }
            if (bestIdx === -1) return false;
            if (bestDist > tol) return false;
            remaining.splice(bestIdx, 1);
          }
          return true;
        }
        if (typeof gp.expectedValue === 'number' && Number.isFinite(gp.expectedValue)) {
          const raw = answer1.trim();
          if (!raw) return false;

          if (gp.expectedFormat === 'fixed2') {
            if (!/^-?\d+\.\d{2}$/.test(raw)) return false;
            return raw === Number(gp.expectedValue).toFixed(2);
          }

          const user = Number(raw);
          if (Number.isNaN(user)) return false;
          return Math.abs(user - gp.expectedValue) <= 0.02;
        }

        if (typeof gp.expectedLatex === 'string') {
          const normalized = answer1.replace(/\s+/g, '');
          const expected = String(gp.expectedLatex).replace(/\s+/g, '');
          return normalized === expected;
        }

        return false;
      }
      default:
        return false;
    }
  };

  const persistAttempt = (payload: { correct: boolean; inputs: string[]; q: PracticeQuestion }) => {
    try {
      const topic = String((payload.q as any).topicId ?? 'unknown');
      const method = String((payload.q as any).variantId ?? (payload.q as any).metadata?.method ?? 'unknown');
      const key = `practice.attempts.${topic}.${method}`;
      const existingRaw = localStorage.getItem(key);
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const next = [
        {
          id: payload.q.id,
          seed: (payload.q as any).seed,
          difficulty: (payload.q as any).difficulty,
          coefficients: (payload.q as any).metadata?.coefficients,
          correct: payload.correct,
          inputs: payload.inputs,
          createdAt: Date.now(),
        },
        ...existing,
      ].slice(0, 200);
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const chooserTitle = mode === 'mixed' ? 'Mixed Exercises' : 'Individual Topics';

  const currentTitle = useMemo(() => {
    if (step === 'chooser') return chooserTitle;
    if (mode === 'mixed') {
      const m = (mixedModules ?? []).find((x) => x.id === mixedModuleId);
      return m?.title || 'Mixed Exercises';
    }
    return selectedTopic?.title || 'Practice';
  }, [chooserTitle, mixedModuleId, mixedModules, mode, selectedTopic?.title, step]);

  const nowMs = Date.now();
  const chooserList = mode === 'mixed'
    ? (mixedModules ?? [])
        .filter((m) => isMixedModuleAssignedToUser(m as any))
        .map((m) => {
          const isOpen = isMixedModuleOpenNow(m as any, nowMs);
          return { id: m.id, title: m.title || 'Untitled mixed module', disabled: !isOpen };
        })
    : PRACTICE_TOPICS
        .filter((t) => !isTopicHidden(t.id))
        .map((t) => ({ id: t.id, title: t.title, disabled: !t.enabled || isTopicLocked(t.id) }));

  const canStartMixed = useMemo(() => {
    if (mode !== 'mixed') return false;
    if (!mixedModuleId) return false;
    const m = (mixedModules ?? []).find((x: any) => x.id === mixedModuleId) ?? null;
    if (!m) return false;
    if (!isMixedModuleAssignedToUser(m)) return false;
    return isMixedModuleOpenNow(m, Date.now());
  }, [isMixedModuleAssignedToUser, isMixedModuleOpenNow, mixedModuleId, mixedModules, mode]);

  useEffect(() => {
    if (step !== 'session') return;
    if (mode !== 'mixed') return;
    if (!mixedModuleId) return;
    const m = (mixedModules ?? []).find((x: any) => x.id === mixedModuleId) ?? null;
    if (!m) return;
    const tick = () => {
      const ok = isMixedModuleAssignedToUser(m) && isMixedModuleOpenNow(m, Date.now());
      if (ok) return;
      toast.error('Module has ended');
      setQuestion(null);
      setMixedModuleId(null);
      setStep('chooser');
      navigate(HOME_ROUTE);
    };
    tick();
    const t = window.setInterval(tick, 10_000);
    return () => window.clearInterval(t);
  }, [isMixedModuleAssignedToUser, isMixedModuleOpenNow, mixedModuleId, mixedModules, mode, navigate, step]);

  const sessionInstruction = useMemo(() => {
    if (!question) return '';

    if ((question as any).kind === 'quadratic') {
      const q: any = question as any;
      if (q.variantId === 'factorisation') {
        return 'Enter both values of x. Order does not matter. Fractions are allowed.';
      }
      if (q.variantId === 'solve_complete_square_surd') {
        return 'You may use a calculator. Enter both answers to 4 significant figures.';
      }
      return 'Enter all requested constants. Fractions are allowed.';
    }

    const q = question as PracticeQuestion;
    if ((q as any).kind === 'graph') {
      const gq = q as any;
      const gp = (gq.generatorParams ?? {}) as any;
      if (
        gq.topicId === 'graph_trigonometry'
        && Array.isArray(gp.expectedParts)
        && gp.expectedParts.length > 0
        && (gp.kind === 'solve_trig_equation' || gp.kind === 'exact_values_special_angles')
      ) {
        // Keep these instructions inside the explanation only.
        return '';
      }

      if (gq.topicId === 'graph_trigonometry' && Array.isArray(gp.expectedParts) && gp.expectedParts.length > 0) {
        const unit = String(gp.expectedUnit ?? '');
        const fmt = String(gp.expectedFormat ?? '');
        if (unit === 'rad' && fmt === 'sigfig_4') {
          return 'Enter all solutions in decimal radians (4 s.f.). Do not use π. Order does not matter.';
        }
        if (unit === 'deg') {
          return 'Enter all solutions in degrees as numbers. Order does not matter.';
        }
        return 'Enter all solutions. Order does not matter.';
      }
    }
    switch (q.kind) {
      case 'arithmetic':
        return 'Enter your answer as an integer.';
      case 'linear':
        return 'Solve for x. Enter x as a simplified integer or fraction.';
      case 'linear_intersection':
        return 'Find the intersection point. Enter x and y as simplified integers or fractions.';
      case 'fractions':
        return 'Calculate the result and enter your answer as a simplified fraction (or integer).';
      case 'indices':
        return 'Use index laws to find the final exponent. Enter only the exponent as an integer.';
      case 'polynomial':
        return 'Enter your answer as an integer.';
      case 'permutation_combination':
        return 'Enter your answer as an integer.';
      case 'simultaneous':
        return (question as any)?.variantId === 'lin_quad'
          ? 'There are 2 solution pairs. Enter (x₁, y₁) and (x₂, y₂) (fractions are allowed).'
          : 'Solve for x and y. Enter both values (fractions are allowed).';
      case 'factorisation':
        return 'Factorise the expression completely. Enter the final factorised answer.';
      case 'word_problem': {
        // We render word-problem instructions inside the question text to keep the UI clean.
        return '';
      }
      default:
        return '';
    }
  }, [question]);

  return (
    <div className="w-full py-8">
      {step === 'chooser' ? (
        <div className="max-w-6xl mx-auto">
          <div className="mb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Practice</div>
              <Button variant="outline" size="sm" onClick={() => navigate('/scorecard')}>
                SCORECARD
              </Button>
            </div>
          </div>

          <Card className="p-6">
            <div className="flex items-center gap-2 border-b pb-3">
              <button
                type="button"
                className={`text-sm font-semibold px-2 py-1 ${mode === 'individual' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground'}`}
                onClick={() => {
                  setMode('individual');
                  setMixedModuleId(null);
                  setTopicId(null);
                }}
              >
                INDIVIDUAL TOPICS
              </button>
              <button
                type="button"
                className={`text-sm font-semibold px-2 py-1 ${mode === 'mixed' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground'}`}
                onClick={() => {
                  setMode('mixed');
                  setTopicId(null);
                }}
              >
                MIXED EXERCISES
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
              <div className="space-y-2">
                {chooserList.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    disabled={(row as any).disabled}
                    className={`w-full text-left rounded-md border px-5 py-4 bg-white transition-colors ${(row as any).disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted/10'} ${(mode === 'mixed' ? mixedModuleId === row.id : topicId === row.id) ? 'border-foreground/40 bg-muted/10' : ''}`}
                    onClick={() => {
                      if (mode === 'mixed') {
                        setMixedModuleId(row.id);
                        return;
                      }
                      setTopicId(row.id as PracticeTopicId);
                    }}
                  >
                    <div className="text-lg font-semibold">{row.title}</div>
                  </button>
                ))}
              </div>

              <div className="rounded-md border bg-muted/10 p-5">
                {mode === 'mixed' ? (
                  <>
                    <div className="text-base font-semibold">Start</div>
                    <div className="text-sm text-muted-foreground mt-1">{chooserTitle}</div>
                    <div className="mt-5">
                      <Button
                        variant="default"
                        className="w-full h-12 text-base"
                        disabled={!canStartMixed}
                        onClick={() => {
                          setSessionSeed(Date.now());
                          setQuestion(null);
                          setSubmitted(false);
                          setIsCorrect(null);
                          setMixedCursor(0);
                          setStep('session');
                        }}
                      >
                        Start
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-base font-semibold">Choose a level</div>
                    <div className="text-sm text-muted-foreground mt-1">{selectedTopic?.title || chooserTitle}</div>
                    <div className="mt-5 space-y-3">
                      <Button
                        variant="outline"
                        className="w-full h-12 text-base"
                        disabled={!topicId}
                        onClick={() => {
                          setDifficulty('easy');
                          setSessionSeed(Date.now());
                          setQuestion(null);
                          setSubmitted(false);
                          setIsCorrect(null);
                          setMixedCursor(0);
                          setStep('session');
                        }}
                      >
                        Easy
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full h-12 text-base"
                        disabled={!topicId}
                        onClick={() => {
                          setDifficulty('medium');
                          setSessionSeed(Date.now());
                          setQuestion(null);
                          setSubmitted(false);
                          setIsCorrect(null);
                          setMixedCursor(0);
                          setStep('session');
                        }}
                      >
                        Medium
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full h-12 text-base"
                        disabled={!topicId}
                        onClick={() => {
                          setDifficulty('ultimate');
                          setSessionSeed(Date.now());
                          setQuestion(null);
                          setSubmitted(false);
                          setIsCorrect(null);
                          setMixedCursor(0);
                          setStep('session');
                        }}
                      >
                        Ultimate
                      </Button>
                    </div>
                  </>
                )}

                {mode === 'mixed' && mixedModules.length === 0 ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    No mixed modules configured. Ask an admin to create one in Settings.
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      ) : step === 'session' && !question ? (
        <div className="w-full max-w-none mx-auto space-y-3 px-3 md:px-6">
          <Card className="px-4 py-3">
            <div className="flex items-center justify-between gap-3 min-h-12">
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setStep('chooser');
                    setQuestion(null);
                    setSubmitted(false);
                    setIsCorrect(null);
                    setAnswer1('');
                    setAnswer2('');
                    setAnswer3('');
                    setSelectedOptionIndex(null);
                    setVariantOverride(null);
                    setVariantMultiOverride(null);
                    setOnlyQuestionTextQuery('');
                    setOnlyQuestionTextTopicScope(null);
                    setCommandText('');
                  }}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0">
                  <div className="text-lg font-semibold leading-tight text-foreground truncate">Practice</div>
                  <div className="text-xs text-muted-foreground">No question available.</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setCommandModalOpen(true)} className="bg-white">
                    Search / Filters
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const nextSeed = computeNextSeed();
                    setSessionSeed(nextSeed);
                    generateNext(nextSeed);
                  }}
                  className="bg-white"
                >
                  Retry
                </Button>
              </div>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              This can happen if the current filters/selected types don’t match any questions.
            </div>
          </Card>
        </div>
      ) : null}

      {step === 'session' && question ? (
        <div className="w-full max-w-none mx-auto space-y-3 px-3 md:px-6">
          <Card className="px-4 py-3">
            <div className="flex items-center justify-between gap-3 min-h-12">
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setStep('chooser');
                    setQuestion(null);
                    setSubmitted(false);
                    setIsCorrect(null);
                    setAnswer1('');
                    setAnswer2('');
                    setAnswer3('');
                    setVariantOverride(null);
                    setVariantMultiOverride(null);
                    setOnlyQuestionTextQuery('');
                    setOnlyQuestionTextTopicScope(null);
                    setCommandText('');
                  }}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0 select-none">
                  <div className="text-lg font-semibold leading-tight text-foreground truncate">{currentTitle}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCommandModalOpen(true)}
                    className="bg-white"
                  >
                    Search / Filters
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void openReportDialogWithCapture();
                  }}
                  className="bg-white"
                >
                  <Bug className="h-4 w-4 mr-2" />
                  Report issue
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setReportHelpOpen(true)}
                  className="bg-white rounded-full"
                  aria-label="Answer input help"
                  title="Answer input help"
                >
                  <CircleHelp className="h-5 w-5" />
                </Button>
              </div>
            </div>
            {isAdmin && variantOverride ? (
              <div className="mt-2 text-xs text-muted-foreground">
                Forced variant: <span className="font-mono">{variantOverride.topicId}:{variantOverride.variantId}</span>
              </div>
            ) : null}
            {onlyQuestionTextQuery.trim() ? (
              <div className="mt-2 text-xs text-muted-foreground">
                Active filter: <span className="font-medium text-foreground">{onlyQuestionTextQuery.trim()}</span>
              </div>
            ) : null}
          </Card>

          {isAdmin ? (
            <Dialog open={commandModalOpen} onOpenChange={setCommandModalOpen}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Search / Filters</DialogTitle>
                  <DialogDescription>
                    Type a keyword to filter questions. Admins can also use /only and /clear. Optionally select multiple question types.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Keyword / Command</Label>
                    <Input
                      value={commandText}
                      onChange={(e) => setCommandText(e.target.value)}
                      placeholder={isAdmin ? '/only <keyword> or /only <topicId>:<variantId> or /clear' : 'Type a keyword (e.g. temperature)'}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          applyCommandFromModal();
                          setCommandModalOpen(false);
                        }
                      }}
                    />
                    <div className="text-xs text-muted-foreground">
                      Scope: {currentTopicForSearchScope ? <span className="font-mono">{currentTopicForSearchScope}</span> : 'current topic'}
                    </div>
                  </div>

                  {availableVariantsForPicker.length ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label>Question types (optional)</Label>
                        {selectedVariantIdsForPicker.length ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setVariantMultiOverride(null)}
                          >
                            Clear types
                          </Button>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {availableVariantsForPicker.map((v) => {
                          const checked = selectedVariantIdsForPicker.includes(v);
                          return (
                            <label key={v} className="flex items-start gap-2 rounded-md border px-3 py-2 min-w-0">
                              <Checkbox checked={checked} onCheckedChange={() => toggleVariantForPicker(v)} className="mt-0.5" />
                              <span className="font-mono text-sm min-w-0 whitespace-normal break-all">{v}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Selected types are applied only within the current topic.
                      </div>
                      {isAdmin && variantOverride ? (
                        <div>
                          Forced variant: <span className="font-mono text-foreground">{variantOverride.topicId}:{variantOverride.variantId}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setVariantOverride(null);
                    setVariantMultiOverride(null);
                    setOnlyQuestionTextQuery('');
                    setOnlyQuestionTextTopicScope(null);
                    setCommandText('');
                    toast.success('Cleared filters');
                  }}
                >
                  Clear all
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    applyCommandFromModal();
                    setCommandModalOpen(false);
                  }}
                >
                  Apply
                </Button>
              </DialogFooter>
            </DialogContent>
            </Dialog>
          ) : null}

          <Dialog open={reportHelpOpen} onOpenChange={setReportHelpOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Answer input help</DialogTitle>
                <DialogDescription>
                  How to type answers and what format is accepted.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm leading-relaxed text-foreground">
                <div className="font-semibold">General rules</div>
                <div>
                  - Do <span className="font-semibold">not</span> include spaces between parts of an answer.
                </div>
                <div>
                  Example: type <span className="font-mono">2x-1</span>, not <span className="font-mono">2x - 1</span>.
                </div>

                <div className="font-semibold mt-2">MathLive input boxes</div>
                <div>
                  - Use <span className="font-mono">-</span> for negatives.
                </div>
                <div>
                  - Use brackets <span className="font-mono">( )</span> when needed.
                </div>
                <div>
                  - Multiplication can be typed as <span className="font-mono">2x</span> or <span className="font-mono">2*x</span>.
                </div>
                <div>
                  - Fractions can be typed as <span className="font-mono">3/4</span> (this will format as a fraction).
                </div>

                <div className="font-semibold mt-2">Powers (superscripts)</div>
                <div>
                  Use <span className="font-mono">^</span> for powers.
                </div>
                <div>
                  Examples:
                  <div className="mt-1 font-mono">x^2</div>
                  <div className="font-mono">(x+1)^2</div>
                </div>

                <div className="font-semibold mt-2">Subscripts</div>
                <div>
                  Use <span className="font-mono">_</span> for subscripts.
                </div>
                <div>
                  Examples:
                  <div className="mt-1 font-mono">a_1</div>
                  <div className="font-mono">x_0</div>
                </div>

                <div className="font-semibold mt-2">Factorisation</div>
                <div>
                  Enter each factor in its own box. Each factor is treated as being inside brackets.
                </div>
                <div>
                  Example: <span className="font-mono">(12x)(2x-1)(5x+3)</span>
                </div>
                <div>
                  Tips:
                  <div className="mt-1">- Type <span className="font-mono">2x-1</span> for <span className="font-mono">(2x-1)</span>.</div>
                  <div>- Use <span className="font-mono">/</span> for fractional coefficients, e.g. <span className="font-mono">(x+1)/2</span>.</div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setReportHelpOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card ref={practiceContentRef} className="p-6 border-2">
            {sessionInstruction ? (
              <div className="text-base font-medium text-foreground">{sessionInstruction}</div>
            ) : null}

            {(question as any).kind === 'graph'
              && (((question as GraphPracticeQuestion).graphSpec) || ((question as GraphPracticeQuestion).svgDataUrl))
              && !(question as any).generatorParams?.graphInExplanationOnly
              && !(question as any).generatorParams?.unitCircle
              && ((question as any).topicId !== 'graph_unit_circle' || (question as any).generatorParams?.circularMeasure) ? (
                <div className="mt-4 flex justify-center">
                  {(question as GraphPracticeQuestion).graphSpec ? (
                    <InteractiveGraph
                      spec={(question as GraphPracticeQuestion).graphSpec!}
                      altText={(question as GraphPracticeQuestion).svgAltText}
                      interactive={(question as any).topicId === 'graph_straight_line'}
                    />
                  ) : (
                    <img
                      src={(question as GraphPracticeQuestion).svgDataUrl}
                      alt={(question as GraphPracticeQuestion).svgAltText}
                      className={(question as any).generatorParams?.circularMeasure
                        ? 'max-w-full h-auto'
                        : ((question as any).topicId === 'clock_reading'
                            ? 'max-w-full h-auto'
                            : 'max-w-full h-auto rounded-md border bg-white')}
                    />
                  )}
                </div>
              )
              : null}

            {(question as any).kind === 'word_problem' && (question as any).svgDataUrl ? (
              <div className="mt-4 flex justify-center">
                <img
                  src={String((question as any).svgDataUrl)}
                  alt={String((question as any).svgAltText ?? 'Diagram')}
                  className="max-w-full h-auto"
                />
              </div>
            ) : null}

            <div className="mt-6 w-full">
              {(question as any).kind === 'graph' ? (
                <div className="w-full select-none">
                  {(() => {
                    const pb = (question as any).promptBlocks as any[] | undefined;
                    if (!Array.isArray(pb) || !pb.length) return null;
                    return (
                      <div className="tk-wp-expl-text font-slab w-full min-w-0 max-w-full overflow-x-hidden text-xl md:text-2xl leading-snug text-center text-foreground whitespace-normal break-words">
                        <span className="inline-flex flex-wrap items-baseline justify-center gap-x-1 gap-y-1">
                          {pb.map((b, i) => {
                            if (b?.kind === 'math') {
                              return (
                                <span key={`gm-${i}`} className="inline-block align-baseline max-w-full">
                                  <Katex latex={String(b.content ?? '')} displayMode={false} />
                                </span>
                              );
                            }
                            return (
                              <span key={`gt-${i}`} className="whitespace-normal">
                                {String(b?.content ?? '')}
                              </span>
                            );
                          })}
                        </span>
                      </div>
                    );
                  })()}

                  {(question as GraphPracticeQuestion).promptText ? (
                    <div className={`tk-wp-expl-text w-full min-w-0 max-w-full overflow-x-hidden text-xl md:text-2xl leading-snug text-left text-foreground whitespace-normal break-words ${(question as any).topicId === 'clock_reading' ? 'font-slab' : ''}`}>
                      {(() => {
                        const s0 = String((question as GraphPracticeQuestion).promptText ?? '');
                        const s = s0.replace(/\b(sin|cos|tan|sec|csc|cot)\s*\(/g, '\\$1(');
                        const hasLatex = /\\sin\b|\\cos\b|\\tan\b|\\sec\b|\\csc\b|\\cot\b|\^\{?|_\{|\\frac\{|\\sqrt\b|\\cdot\b|\\pi\b/.test(s);
                        if (!hasLatex) return s;

                        const parts = s.split(
                          /(\\frac\{[^}]+\}\{[^}]+\}|\\sqrt\{[^}]+\}|\\cdot|\\pi\b|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+)/g
                        );
                        return (
                          <span>
                            {parts.filter((p) => p.length > 0).map((p, i) => {
                              const isMath =
                                /^(\\frac\{[^}]+\}\{[^}]+\}|\\sqrt\{[^}]+\}|\\cdot|\\pi\b|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+)$/.test(p);
                              return isMath ? <Katex key={i} latex={p} /> : <span key={i}>{p}</span>;
                            })}
                          </span>
                        );
                      })()}
                    </div>
                  ) : null}

                  {(question as GraphPracticeQuestion).promptKatex ? (
                    <div
                      className={`${(question as GraphPracticeQuestion).promptText ? 'mt-2 text-2xl leading-snug text-left text-foreground' : 'text-2xl leading-snug text-center text-foreground'} w-full min-w-0 max-w-full overflow-x-hidden`}
                    >
                      <Katex latex={(question as GraphPracticeQuestion).promptKatex!} displayMode />
                    </div>
                  ) : null}
                </div>
              ) : (() => {
                  const isWordProblem = (question as any).topicId === 'word_problems' || (question as any).kind === 'word_problem';
                  const wpPromptText = isWordProblem ? String((question as any).promptText ?? '') : '';

                  const stripLatex = (src: string) => src
                    // Remove common LaTeX wrappers seen in some prompt strings.
                    .replace(/\\text\{([^}]*)\}/g, '$1')
                    // Handle malformed \\text{... with no closing brace.
                    .replace(/\\text\{([^}]*)/g, '$1')
                    // Some prompts may contain \text(...) instead of braces.
                    .replace(/\\text\(([^)]*)\)/g, '$1')
                    // If \text appears without a brace, drop it.
                    .replace(/\\text\b\{?/g, '')
                    // Degree notation: ^\circ or \circ -> °
                    .replace(/\^\{\\circ\}/g, '°')
                    .replace(/\^\\circ/g, '°')
                    .replace(/\\circ/g, '°')
                    .replace(/\\!+/g, '')
                    // Line breaks and spacing escapes.
                    .replace(/\\\\/g, ' ')
                    .replace(/\\,/g, ' ')
                    .replace(/\\quad/g, ' ')
                    .replace(/\\;/g, ' ')
                    // Punctuation escapes.
                    .replace(/\\\./g, '.')
                    .replace(/\\\}/g, '')
                    .replace(/\\\{/g, '')
                    // Remove any remaining LaTeX commands/backslashes.
                    .replace(/\\[a-zA-Z]+/g, '')
                    .replace(/\\+/g, '')
                    .replace(/~/g, ' ')
                    .replace(/[{}]/g, '')
                    // Remove unnecessary parentheses around signed temperatures.
                    // e.g. "(-26)°C" -> "-26°C"
                    .replace(/\(\s*(-?\d+(?:\.\d+)?)\s*\)\s*°\s*([cCfF])\b/g, '$1°$2')
                    .replace(/\(\s*(-?\d+(?:\.\d+)?)\s*\)\s*°\b/g, '$1°')
                    .replace(/\s+/g, ' ')
                    .trim();

                  const isDegreeOnlyLatex = (src: string) => {
                    const s = String(src ?? '').trim();
                    if (!s) return false;
                    // If it contains "real" math constructs, we should keep KaTeX.
                    if (/\\frac\{|\\(?:dfrac|tfrac)\{|\\sqrt\b|\\pi\b|\\ln\b|\\log\b|\\cdot\b|\\int\b|_=|\$/.test(s)) return false;
                    // If it has scripts other than the degree symbol, keep KaTeX.
                    const stripped = s
                      .replace(/\^\{\\circ\}/g, '')
                      .replace(/\^\\circ/g, '')
                      .replace(/\\circ/g, '')
                      .replace(/\^\{\d+\}/g, '');
                    return !/[\^_]/.test(stripped);
                  };

                  const preserveFractions = (src: string) => {
                    const fracs: string[] = [];
                    const out = src.replace(/\\frac\{[^}]+\}\{[^}]+\}/g, (m) => {
                      const id = fracs.length;
                      fracs.push(m);
                      return `@@FRAC_${id}@@`;
                    });
                    return { out, fracs };
                  };

                  const restoreFractionsParts = (src: string, fracs: string[]) => {
                    const parts = src.split(/(@@FRAC_\d+@@)/g).filter((p) => p.length > 0);
                    return parts.map((p) => {
                      const m = p.match(/^@@FRAC_(\d+)@@$/);
                      if (!m) return { kind: 'text' as const, value: p };
                      const idx = Number(m[1]);
                      const latex = fracs[idx] ?? '';
                      return { kind: 'math' as const, value: latex };
                    });
                  };

                  const wpLatex = isWordProblem ? String((question as any).katexQuestion ?? '').trim() : '';
                  const wpShouldRenderAsKatex =
                    !!wpLatex
                    && !isDegreeOnlyLatex(wpLatex)
                    && (/\^|_|\\frac\{|\\(?:dfrac|tfrac)\{|\\sqrt\b|\\pi\b|\\ln\b|\\log\b|\\cdot\b|\\int\b/.test(wpLatex));

                  if (isWordProblem && wpShouldRenderAsKatex) {
                    return (
                      <div className={`w-full min-w-0 max-w-full select-none font-slab text-xl md:text-2xl leading-snug text-left whitespace-normal break-words`}>
                        <Katex latex={wpLatex} displayMode />
                      </div>
                    );
                  }

                  if (isWordProblem && wpLatex && isDegreeOnlyLatex(wpLatex)) {
                    const cleaned = stripLatex(wpLatex);
                    if (cleaned) {
                      return (
                        <div className={`w-full min-w-0 max-w-full select-none font-slab text-xl md:text-2xl leading-snug text-left whitespace-normal break-words`}>
                          {cleaned}
                        </div>
                      );
                    }
                  }

                  if (isWordProblem && wpPromptText.trim().length) {
                    const wp = question as any;

                    const { out: tmp, fracs } = preserveFractions(wpPromptText);
                    const baseText = stripLatex(tmp.replace(/\s*\n+\s*/g, ' ').trim());
                    const needsFixed2 = wp?.answerKind === 'decimal_2dp';

                    const hasFixed2Instruction = /give\s+your\s+answer\s+to\s+2\s+decimal\s+places\.?/i.test(baseText);
                    const fullText = needsFixed2 && !hasFixed2Instruction
                      ? `${baseText}${baseText.endsWith('.') ? '' : '.'} Give your answer to 2 decimal places.`
                      : baseText;

                    const sentences = fullText
                      .split(/(?<=[.!?])\s+/)
                      .map((s) => s.trim())
                      .filter(Boolean);

                    return (
                      <div className={`w-full min-w-0 max-w-full select-none font-slab text-xl md:text-2xl leading-snug text-left whitespace-normal break-words`}>
                        <div className="w-full min-w-0 max-w-full space-y-2">
                          {sentences.map((t, i) => {
                            const segs = restoreFractionsParts(t, fracs);
                            return (
                              <div key={i} className="whitespace-normal break-words">
                                {segs.map((seg, j) => seg.kind === 'math'
                                  ? (
                                    <span key={j} className="inline-block align-baseline mx-1">
                                      <Katex latex={seg.value} displayMode={false} />
                                    </span>
                                  )
                                  : (
                                    <span key={j}>{seg.value}</span>
                                  ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  if (isWordProblem) {
                    if (wpLatex) {
                      const shouldRenderAsKatex =
                        /\^|_|\\frac\{|\\(?:dfrac|tfrac)\{|\\sqrt\b|\\pi\b|\\ln\b|\\log\b|\\cdot\b|\\int\b/.test(wpLatex);
                      if (shouldRenderAsKatex) {
                        return (
                          <div className={`w-full min-w-0 max-w-full select-none font-slab text-xl md:text-2xl leading-snug text-left whitespace-normal break-words`}>
                            <Katex latex={wpLatex} displayMode />
                          </div>
                        );
                      }

                      // Fallback: if it's mostly plain text with a few LaTeX wrappers, strip wrappers but keep fractions.
                      if (/\\text\b|\\!|\\\.|\\,|\{|\}|\\|\\frac\{/.test(wpLatex)) {
                        const { out: tmp, fracs } = preserveFractions(wpLatex);
                        const cleaned = stripLatex(tmp);
                        if (cleaned) {
                          const segs = restoreFractionsParts(cleaned, fracs);
                          return (
                            <div className={`w-full min-w-0 max-w-full select-none font-slab text-xl md:text-2xl leading-snug text-left whitespace-normal break-words`}>
                              {segs.map((seg, j) => seg.kind === 'math'
                                ? (
                                  <span key={j} className="inline-block align-baseline mx-1">
                                    <Katex latex={seg.value} displayMode={false} />
                                  </span>
                                )
                                : (
                                  <span key={j}>{seg.value}</span>
                                ))}
                            </div>
                          );
                        }
                      }
                    }
                  }

                  const promptBlocks = (question as any).promptBlocks as any[] | undefined;
                  if (Array.isArray(promptBlocks) && promptBlocks.length) {
                    return (
                      <div className="w-full select-none">
                        <PromptBlocksFlow
                          blocks={promptBlocks as any}
                          className="tk-wp-expl-text text-lg md:text-xl leading-relaxed text-foreground"
                          textClassName="font-slab"
                          align="left"
                        />
                      </div>
                    );
                  }

                  const latex = String((question as any).katexQuestion ?? '');
                  const isMultiline = latex.includes('\\begin{cases}') || latex.includes('\\begin{aligned}') || latex.includes('\\\\');
                  const promptTextClass = isWordProblem
                    ? (isMultiline ? 'text-2xl md:text-3xl leading-snug text-left' : 'text-2xl md:text-3xl leading-snug text-left')
                    : (isMultiline ? 'text-xl md:text-2xl leading-snug text-center' : 'text-2xl md:text-3xl leading-snug text-center');

                  const useResponsiveScale = isWordProblem && !wpPromptText.trim().length && !isMultiline;
                  const scale = useResponsiveScale ? wpKatexScale : 1;

                  // If the prompt is pure text (\text{...}), render it as HTML so we can control the font.
                  // This improves headings like the stationary-points prompt.
                  const textOnlyMatch = latex.match(/^\\text\{([\s\S]*)\}$/);
                  if (textOnlyMatch && !/\\frac\{|\^\{|_\{|\\int\b|\\cdot\b|\\sqrt\b|\\sum\b|\\pi\b/.test(textOnlyMatch[1] ?? '')) {
                    return (
                      <div className={`${promptTextClass} font-slab max-w-full select-none`}>
                        {String(textOnlyMatch[1] ?? '').replace(/\\\\/g, ' ')}
                      </div>
                    );
                  }

                  const boldTextWithMathMatch = latex.match(/^\\textbf\{([\s\S]*?)\}\\;\s*([\s\S]*)$/);
                  if (boldTextWithMathMatch) {
                    const t = String(boldTextWithMathMatch[1] ?? '').replace(/\\\\/g, ' ').trim();
                    const rest = String(boldTextWithMathMatch[2] ?? '').trim();
                    return (
                      <div className={'text-xl md:text-2xl leading-snug text-center font-slab max-w-full select-none'}>
                        <span className="inline-flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
                          <span>{t}</span>
                          <span className="inline-block">
                            <Katex latex={rest} displayMode={false} />
                          </span>
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div className={`${promptTextClass} select-none`}>
                      <div className={isWordProblem ? 'w-full min-w-0 max-w-full px-2' : 'w-full min-w-0 max-w-full'}>
                        <div
                          ref={useResponsiveScale ? wpKatexOuterRef : undefined}
                          className={useResponsiveScale ? 'w-full overflow-visible py-1' : 'w-full max-w-full'}
                        >
                          <div
                            ref={useResponsiveScale ? wpKatexInnerRef : undefined}
                            className={useResponsiveScale ? 'inline-block w-max max-w-none' : 'w-full'}
                            style={useResponsiveScale ? { transform: `scale(${scale})`, transformOrigin: 'top left' } : undefined}
                          >
                            <Katex latex={latex} displayMode />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
            </div>

            <Dialog
              open={reportDialogOpen}
              onOpenChange={(open) => {
                setReportDialogOpen(open);
                if (!open) {
                  setReportScreenshotDataUrl(undefined);
                  setIsCapturingReportScreenshot(false);
                  setReportScreenshotError(null);
                }
              }}
            >
              <DialogContent className="max-w-6xl h-[85vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Report an issue</DialogTitle>
                  <DialogDescription>
                    Send a detailed description so the admin can fix it.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="min-h-0 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-muted-foreground">Screenshot</div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant={reportCaptureMode === 'practice_full' ? 'default' : 'outline'}
                          size="sm"
                          disabled={isCapturingReportScreenshot}
                          onClick={() => {
                            setReportCaptureMode('practice_full');
                            void openReportDialogWithCapture('practice_full');
                          }}
                        >
                          Capture practice
                        </Button>
                        <Button
                          variant={reportCaptureMode === 'screen' ? 'default' : 'outline'}
                          size="sm"
                          disabled={isCapturingReportScreenshot}
                          onClick={() => {
                            setReportCaptureMode('screen');
                            void openReportDialogWithCapture('screen');
                          }}
                        >
                          Capture screen
                        </Button>
                      </div>
                    </div>
                    {reportScreenshotDataUrl ? (
                      <div className="flex-1 min-h-0 overflow-auto rounded-md border bg-muted/20">
                        <img
                          src={reportScreenshotDataUrl}
                          alt="Report screenshot preview"
                          className="w-full h-auto block"
                        />
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground flex items-center justify-center text-center">
                        {isCapturingReportScreenshot
                          ? 'Capturing screenshot…'
                          : reportScreenshotError
                            ? reportScreenshotError
                            : 'Click “Capture practice” (recommended) or “Capture screen”.'}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                      Tip: “Capture practice” includes off-screen content; “Capture screen” captures exactly what you see.
                    </div>
                  </div>

                  <div className="min-h-0 flex flex-col gap-2">
                    <div className="text-xs text-muted-foreground">Issue description</div>
                    <Textarea
                      value={reportMessage}
                      onChange={(e) => setReportMessage(e.target.value)}
                      placeholder="Please describe the issue in detail (what you expected vs what happened, steps to reproduce, etc.)"
                      className="flex-1 min-h-0"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setReportDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={submitErrorReport}
                    disabled={isSubmittingReport || isCapturingReportScreenshot || (!reportScreenshotDataUrl && !reportScreenshotError)}
                  >
                    {isSubmittingReport ? 'Sending…' : 'Send report'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="mt-8">
              {(question as any).kind === 'graph' && (question as GraphPracticeQuestion).katexOptions?.length ? (
                (() => {
                  const q = question as GraphPracticeQuestion;
                  const isTrigRatio = !!(q as any).generatorParams?.unitCircle;
                  const correctIdx = q.correctIndex;
                  const gridClass = isTrigRatio
                    ? 'max-w-5xl mx-auto grid grid-cols-4 gap-2'
                    : 'max-w-2xl mx-auto space-y-2';
                  return (
                    <div className={gridClass}>
                      {q.katexOptions!.map((opt, idx) => {
                        const selected = selectedOptionIndex === idx;
                        const isCorrectOption = submitted && correctIdx !== undefined && idx === correctIdx;
                        const isWrongSelected = submitted && selected && correctIdx !== undefined && idx !== correctIdx;
                        const baseClass = isTrigRatio
                          ? 'w-full text-center rounded-md border px-2 py-2 bg-white transition-colors'
                          : 'w-full text-left rounded-md border px-4 py-3 bg-white transition-colors';
                        const stateClass = submitted
                          ? isCorrectOption
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-300'
                            : isWrongSelected
                              ? 'border-rose-600 bg-rose-50 text-rose-950 ring-2 ring-rose-300'
                              : 'opacity-90'
                          : 'hover:bg-muted/10';
                        const selectedClass = !submitted && selected ? 'border-foreground/40 bg-muted/10' : '';

                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={submitted}
                            onClick={() => setSelectedOptionIndex(idx)}
                            className={`${baseClass} ${stateClass} ${selectedClass}`}
                          >
                            <div className={isTrigRatio ? 'text-base md:text-lg leading-snug' : 'text-xl leading-snug'}>
                              <Katex latex={opt} displayMode={false} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()
              ) : null}

              {(question as any).kind === 'graph'
                && !(question as GraphPracticeQuestion).katexOptions?.length
                && (question as GraphPracticeQuestion).inputFields?.length ? (
                ((question as any).topicId === 'clock_reading'
                  ? (() => {
                      const gp = ((question as GraphPracticeQuestion).generatorParams ?? {}) as any;
                      const kind = String(gp.answerKind ?? '');

                      if (kind === 'time_12_ampm') {
                        return (
                          <div className="max-w-md mx-auto space-y-3">
                            <div className="flex flex-wrap items-end justify-center gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Hour</Label>
                                <Input
                                  value={answer1}
                                  inputMode="numeric"
                                  onChange={(e) => setAnswer1(sanitizeNumericInput(e.target.value))}
                                  disabled={submitted}
                                  className="h-12 w-24 text-2xl font-normal text-center py-1"
                                />
                              </div>
                              <div className="pb-2 text-2xl select-none">:</div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Minute</Label>
                                <Input
                                  value={answer2}
                                  inputMode="numeric"
                                  onChange={(e) => setAnswer2(sanitizeNumericInput(e.target.value))}
                                  disabled={submitted}
                                  className="h-12 w-24 text-2xl font-normal text-center py-1"
                                />
                              </div>
                              <div className="space-y-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={submitted}
                                  className="h-12 w-20 text-lg"
                                  onClick={() => {
                                    const cur = answer3 === 'PM' ? 'PM' : 'AM';
                                    setAnswer3(cur === 'PM' ? 'AM' : 'PM');
                                  }}
                                  title="Toggle AM/PM"
                                >
                                  {answer3 === 'PM' ? 'PM' : 'AM'}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (kind === 'duration_minutes') {
                        return (
                          <div className="max-w-sm mx-auto space-y-1">
                            <Label className="text-xs text-muted-foreground">Total minutes</Label>
                            <Input
                              value={answer1}
                              inputMode="numeric"
                              onChange={(e) => setAnswer1(sanitizeNumericInput(e.target.value))}
                              disabled={submitted}
                              className="h-12 text-2xl font-normal text-center py-1"
                            />
                          </div>
                        );
                      }

                      // time_12_no_ampm, time_24, duration_hm
                      const hourLabel = kind === 'time_24' ? 'Hour (24h)' : (kind === 'duration_hm' ? 'Hours' : 'Hour');
                      const minuteLabel = kind === 'duration_hm' ? 'Minutes' : 'Minute';
                      return (
                        <div className="max-w-md mx-auto space-y-3">
                          <div className="flex items-end justify-center gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">{hourLabel}</Label>
                              <Input
                                value={answer1}
                                inputMode="numeric"
                                onChange={(e) => setAnswer1(sanitizeNumericInput(e.target.value))}
                                disabled={submitted}
                                className="h-12 w-28 text-2xl font-normal text-center py-1"
                              />
                            </div>
                            <div className="pb-2 text-2xl select-none">:</div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">{minuteLabel}</Label>
                              <Input
                                value={answer2}
                                inputMode="numeric"
                                onChange={(e) => setAnswer2(sanitizeNumericInput(e.target.value))}
                                disabled={submitted}
                                className="h-12 w-28 text-2xl font-normal text-center py-1"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  : (
                      (() => {
                        const gq = question as GraphPracticeQuestion;
                        const gp = (gq.generatorParams ?? {}) as any;
                        const fields = gq.inputFields ?? [];
                        const isABCoords =
                          gp?.kind === 'line_circle_intersections_coords_ab'
                          && fields.length === 4
                          && fields.every((f) => typeof f?.label === 'string' && /_\{?[AB]\}?/.test(String(f.label)));

                        const renderField = (f: any, idx: number) => {
                          const values = [answer1, answer2, answer3, ...extraAnswers];
                          const value = values[idx] ?? '';
                          const setValue = (next: string) => {
                            if (idx === 0) return setAnswer1(next);
                            if (idx === 1) return setAnswer2(next);
                            if (idx === 2) return setAnswer3(next);
                            const j = idx - 3;
                            setExtraAnswers((prev) => {
                              const out = prev.slice();
                              while (out.length <= j) out.push('');
                              out[j] = next;
                              return out;
                            });
                          };

                          const labelRaw = String(f?.label ?? '');
                          const labelHasMath = /[_^\\]/.test(labelRaw);

                          return (
                            <div key={String(f.id ?? idx)} className="space-y-1">
                              <Label className="text-xs text-muted-foreground">
                                {labelHasMath ? <Katex latex={labelRaw} displayMode={false} /> : labelRaw}
                              </Label>
                              {f.kind === 'text' ? (
                                <MathLiveInput
                                  value={value}
                                  onChange={setValue as any}
                                  placeholder=""
                                  disabled={submitted}
                                  className="text-2xl font-normal text-left tk-expr-input"
                                />
                              ) : (
                                <Input
                                  value={value}
                                  inputMode="decimal"
                                  onChange={(e) => {
                                    const gp2 = ((question as GraphPracticeQuestion).generatorParams ?? {}) as any;
                                    const fixed2 = gp2.expectedFormat === 'fixed2';
                                    const forbidPi = gp2.expectedForbidPi === true;
                                    const maxDecimals = fixed2 ? 2 : (gp2.expectedFormat === 'sigfig_4' ? 4 : undefined);
                                    const raw = e.target.value;
                                    if (forbidPi && /pi|π/i.test(raw)) {
                                      const cleaned = raw.replace(/pi/gi, '').replace(/π/g, '');
                                      const next = sanitizeNumericInput(cleaned, { maxDecimals });
                                      (setValue as any)(next);
                                      return;
                                    }
                                    const next = sanitizeNumericInput(raw, { maxDecimals });
                                    (setValue as any)(next);
                                  }}
                                  disabled={submitted}
                                  className="h-12 text-2xl font-normal text-center py-1"
                                />
                              )}
                            </div>
                          );
                        };

                        if (isABCoords) {
                          return (
                            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                              {fields.map((f, idx) => renderField(f, idx))}
                            </div>
                          );
                        }

                        return (
                          <div className="max-w-sm mx-auto space-y-3">
                            {fields.map((f, idx) => renderField(f, idx))}
                          </div>
                        );
                      })()
                    ))
              ) : null}

              {(question as any).kind === 'quadratic' ? (
                (() => {
                  const qAny: any = question as any;
                  if (qAny.variantId === 'factorisation') {
                    return (
                      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground"><Katex latex={String.raw`x_{1}`} displayMode={false} /></Label>
                          <Input
                            value={answer1}
                            inputMode="decimal"
                            onChange={(e) => setAnswer1(sanitizeRationalInput(e.target.value))}
                            disabled={submitted}
                            className="h-12 text-2xl font-normal text-center py-1"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground"><Katex latex={String.raw`x_{2}`} displayMode={false} /></Label>
                          <Input
                            value={answer2}
                            inputMode="decimal"
                            onChange={(e) => setAnswer2(sanitizeRationalInput(e.target.value))}
                            disabled={submitted}
                            className="h-12 text-2xl font-normal text-center py-1"
                          />
                        </div>
                      </div>
                    );
                  }

                  const parts = Array.isArray(qAny.expectedParts) ? (qAny.expectedParts as any[]) : [];
                  const values = [answer1, answer2, answer3, ...extraAnswers];
                  const setters = [setAnswer1, setAnswer2, setAnswer3] as const;
                  const grid = parts.length === 2
                    ? 'grid grid-cols-2 gap-3 max-w-md mx-auto'
                    : parts.length === 3
                      ? 'grid grid-cols-3 gap-3 max-w-2xl mx-auto'
                      : 'grid grid-cols-1 gap-3 max-w-sm mx-auto';

                  return (
                    <div className={grid}>
                      {parts.slice(0, 3).map((p: any, idx: number) => {
                        const v = String(values[idx] ?? '');
                        const setV = setters[idx] ?? setAnswer1;
                        const isDecimal = p.kind === 'decimal_4sf';
                        const labelRaw = String(p.label ?? `Answer ${idx + 1}`);
                        const labelHasMath = /[_^\\]/.test(labelRaw);
                        return (
                          <div key={String(p.id ?? idx)} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              {labelHasMath ? <Katex latex={labelRaw} displayMode={false} /> : labelRaw}
                            </Label>
                            <Input
                              value={v}
                              inputMode="decimal"
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (isDecimal) return setV(sanitizeNumericInput(raw, { maxDecimals: 12 }));
                                return setV(sanitizeRationalInput(raw));
                              }}
                              disabled={submitted}
                              className="h-12 text-2xl font-normal text-center py-1"
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              ) : (question as PracticeQuestion).kind === 'linear_intersection' ? (
                <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">x</Label>
                    <Input
                      value={answer1}
                      inputMode="decimal"
                      onChange={(e) => setAnswer1(sanitizeRationalInput(e.target.value))}
                      disabled={submitted}
                      className="h-12 text-2xl font-normal text-center py-1"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">y</Label>
                    <Input
                      value={answer2}
                      inputMode="decimal"
                      onChange={(e) => setAnswer2(sanitizeRationalInput(e.target.value))}
                      disabled={submitted}
                      className="h-12 text-2xl font-normal text-center py-1"
                    />
                  </div>
                </div>
              ) : (question as PracticeQuestion).kind === 'simultaneous' ? (
                ((question as any).variantId === 'lin_quad' && (question as any).solutionX2 && (question as any).solutionY2) ? (
                  <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">x₁</Label>
                      <Input
                        value={answer1}
                        inputMode="decimal"
                        onChange={(e) => setAnswer1(sanitizeRationalInput(e.target.value))}
                        disabled={submitted}
                        className="h-12 text-2xl font-normal text-center py-1"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">y₁</Label>
                      <Input
                        value={answer2}
                        inputMode="decimal"
                        onChange={(e) => setAnswer2(sanitizeRationalInput(e.target.value))}
                        disabled={submitted}
                        className="h-12 text-2xl font-normal text-center py-1"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">x₂</Label>
                      <Input
                        value={String(extraAnswers[0] ?? '')}
                        inputMode="decimal"
                        onChange={(e) => setExtraAnswers((prev) => {
                          const out = prev.slice();
                          while (out.length < 2) out.push('');
                          out[0] = sanitizeRationalInput(e.target.value);
                          return out;
                        })}
                        disabled={submitted}
                        className="h-12 text-2xl font-normal text-center py-1"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">y₂</Label>
                      <Input
                        value={String(extraAnswers[1] ?? '')}
                        inputMode="decimal"
                        onChange={(e) => setExtraAnswers((prev) => {
                          const out = prev.slice();
                          while (out.length < 2) out.push('');
                          out[1] = sanitizeRationalInput(e.target.value);
                          return out;
                        })}
                        disabled={submitted}
                        className="h-12 text-2xl font-normal text-center py-1"
                      />
                    </div>
                  </div>
                ) : (
                  <div className={(question as any).variableCount === 3 ? 'grid grid-cols-3 gap-3 max-w-2xl mx-auto' : 'grid grid-cols-2 gap-3 max-w-md mx-auto'}>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">x</Label>
                      <Input
                        value={answer1}
                        inputMode="decimal"
                        onChange={(e) => setAnswer1(sanitizeRationalInput(e.target.value))}
                        disabled={submitted}
                        className="h-12 text-2xl font-normal text-center py-1"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">y</Label>
                      <Input
                        value={answer2}
                        inputMode="decimal"
                        onChange={(e) => setAnswer2(sanitizeRationalInput(e.target.value))}
                        disabled={submitted}
                        className="h-12 text-2xl font-normal text-center py-1"
                      />
                    </div>
                    {(question as any).variableCount === 3 ? (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">z</Label>
                        <Input
                          value={answer3}
                          inputMode="decimal"
                          onChange={(e) => setAnswer3(sanitizeRationalInput(e.target.value))}
                          disabled={submitted}
                          className="h-12 text-2xl font-normal text-center py-1"
                        />
                      </div>
                    ) : null}
                  </div>
                )
              ) : (question as any).kind === 'graph' ? null : (
                <div
                  className={`${(question as any).expectedFactors?.length === 3 ? 'max-w-5xl' : (question as any).expectedFactors?.length === 2 ? 'max-w-4xl' : 'max-w-sm'} mx-auto space-y-1`}
                >
                  {(question as PracticeQuestion).kind === 'factorisation' ? (
                    <div className={(question as any).expectedFactors?.length === 3 || (question as any).expectedFactors?.length === 2 ? 'w-full overflow-x-auto' : ''}>
                      <div
                        className={`grid gap-x-12 gap-y-3 ${(question as any).expectedFactors?.length === 3 ? 'grid-cols-3 min-w-[720px]' : (question as any).expectedFactors?.length === 2 ? 'grid-cols-2 min-w-[520px]' : 'grid-cols-2'}`}
                        style={{ gridAutoColumns: (question as any).expectedFactors?.length === 2 ? 'minmax(240px, 1fr)' : 'minmax(200px, 1fr)' }}
                      >
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Factor 1</Label>
                          <div className="flex items-center justify-center gap-2">
                            <div className="text-2xl select-none px-1 min-w-[0.9em] text-center">(</div>
                            <div className="flex-1 min-w-[220px]">
                              <MathLiveInput
                                value={answer1}
                                onChange={setAnswer1}
                                placeholder=""
                                disabled={submitted}
                                className={'text-2xl font-normal text-center'}
                              />
                            </div>
                            <div className="text-2xl select-none px-1 min-w-[0.9em] text-center">)</div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Factor 2</Label>
                          <div className="flex items-center justify-center gap-2">
                            <div className="text-2xl select-none px-1 min-w-[0.9em] text-center">(</div>
                            <div className="flex-1 min-w-[220px]">
                              <MathLiveInput
                                value={answer2}
                                onChange={setAnswer2}
                                placeholder=""
                                disabled={submitted}
                                className={'text-2xl font-normal text-center'}
                              />
                            </div>
                            <div className="text-2xl select-none px-1 min-w-[0.9em] text-center">)</div>
                          </div>
                        </div>
                        {(question as any).expectedFactors?.length === 3 ? (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Factor 3</Label>
                            <div className="flex items-center justify-center gap-2">
                              <div className="text-2xl select-none px-1 min-w-[0.9em] text-center">(</div>
                              <div className="flex-1 min-w-[200px]">
                                <MathLiveInput
                                  value={answer3}
                                  onChange={setAnswer3}
                                  placeholder=""
                                  disabled={submitted}
                                  className={'text-2xl font-normal text-center'}
                                />
                              </div>
                              <div className="text-2xl select-none px-1 min-w-[0.9em] text-center">)</div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (question as PracticeQuestion).kind === 'calculus' && (question as any).topicId === 'integration' && /\\int_\{/.test(String((question as any).katexQuestion ?? '')) ? (
                    <Input
                      value={answer1}
                      inputMode="decimal"
                      onChange={(e) => setAnswer1(sanitizeRationalInput(e.target.value))}
                      disabled={submitted}
                      className="h-12 text-2xl font-normal text-center py-1"
                    />
                  ) : (question as PracticeQuestion).kind === 'calculus' ? (
                    (() => {
                      const cq = question as any;
                      const parts = Array.isArray(cq.expectedParts) ? (cq.expectedParts as string[]) : [];
                      const isDiffMulti = cq.topicId === 'differentiation' && parts.length > 0;

                      const isSqrtParams =
                        cq.topicId === 'differentiation'
                        && String(cq.variantId ?? '') === 'sqrt_params_point_gradient'
                        && parts.length === 2;

                      const isGradientOne =
                        cq.topicId === 'differentiation'
                        && ['power_linear_point_gradient', 'rational_yaxis_gradient'].includes(String(cq.variantId ?? ''))
                        && parts.length === 1;

                      const isGradientTwo =
                        cq.topicId === 'differentiation'
                        && String(cq.variantId ?? '') === 'linear_minus_rational_xaxis_gradients'
                        && parts.length === 2;

                      const isStationaryCoords =
                        cq.topicId === 'differentiation'
                        && String(cq.variantId ?? '') === 'stationary_points_coords'
                        && parts.length > 0;

                      if (isDiffMulti) {
                        const specs = getAnswerFieldSpecs(question as PracticeQuestion);
                        if (specs.length > 0) {
                          const hint = String((cq as any).calculatorHint ?? '').trim();
                          return (
                            <div className="space-y-2">
                              {renderAnswerFields(specs)}
                              {hint ? (
                                <div className="text-xs text-muted-foreground max-w-2xl mx-auto">
                                  {hint}
                                </div>
                              ) : null}
                            </div>
                          );
                        }
                      }

                      return (
                        <div className="space-y-1">
                          <MathLiveInput
                            value={answer1}
                            onChange={setAnswer1}
                            disabled={submitted}
                            className={'text-2xl font-normal text-left tk-expr-input'}
                          />
                        </div>
                      );
                    })()
                  					) : (question as any).kind === 'logarithms'
					&& ['log_to_exp_basic', 'log_to_exp_frac', 'log_to_exp_zero', 'log_to_exp_var_rhs', 'log_to_exp'].includes(String((question as any).variantId)) ? (
					<div className="w-full flex justify-center">
						<div className="flex items-baseline gap-4">
							<span className="text-4xl font-semibold select-none leading-none">
								<Katex latex={String.raw`\log`} displayMode={false} />
							</span>
							<Input
								value={answer1}
								inputMode="text"
								onChange={(e) => setAnswer1(e.target.value)}
								disabled={submitted}
								className="h-9 w-16 text-xl font-normal text-center py-0.5 align-baseline relative -ml-1 translate-y-3 rounded-none"
								aria-label="Log base"
							/>
							<Input
								value={answer2}
								inputMode="text"
								onChange={(e) => setAnswer2(e.target.value)}
								disabled={submitted}
								className="h-12 w-40 text-3xl font-normal text-center py-1 rounded-none"
								aria-label="Log argument"
							/>
							<span className="text-3xl font-semibold select-none">=</span>
							<Input
								value={answer3}
								inputMode="text"
								onChange={(e) => setAnswer3(e.target.value)}
								disabled={submitted}
								className="h-12 w-28 text-3xl font-normal text-center py-1 rounded-none"
								aria-label="Result"
							/>
						</div>
					</div>
				) : (question as any).kind === 'logarithms'
					&& ['exp_to_log', 'exp_to_log_const', 'exp_to_log_two_vars', 'exp_to_log_ab_c'].includes(String((question as any).variantId)) ? (
					<div className="w-full flex justify-center">
						<div className="flex items-baseline gap-4">
							<span className="text-4xl font-semibold select-none leading-none">
								<Katex latex={String.raw`\log`} displayMode={false} />
							</span>
							<Input
								value={answer1}
								inputMode="text"
								onChange={(e) => setAnswer1(e.target.value)}
								disabled={submitted}
								className="h-9 w-16 text-xl font-normal text-center py-0.5 align-baseline relative -ml-1 translate-y-3 rounded-none"
								aria-label="Log base"
							/>
							<Input
								value={answer2}
								inputMode="text"
								onChange={(e) => setAnswer2(e.target.value)}
								disabled={submitted}
								className="h-12 w-40 text-3xl font-normal text-center py-1 rounded-none"
								aria-label="Log argument"
							/>
							<span className="text-3xl font-semibold select-none">=</span>
							<Input
								value={answer3}
								inputMode="text"
								onChange={(e) => setAnswer3(e.target.value)}
								disabled={submitted}
								className="h-12 w-28 text-3xl font-normal text-center py-1 rounded-none"
								aria-label="Result"
							/>
						</div>
					</div>
				) : (question as any).kind === 'logarithms'
					&& [
						'single_log_sum',
						'single_log_diff',
						'single_log_power',
						'single_log_coeff_sum',
						'single_log_coeff_diff',
						'single_log_const_plus',
						'single_log_const_minus',
						'single_log_then_simplify',
					].includes(String((question as any).variantId)) ? (
					<div className="w-full flex justify-center">
						<div className="flex items-baseline gap-4">
							<span className="text-4xl font-semibold select-none leading-none">
								<Katex latex={String.raw`\log`} displayMode={false} />
							</span>
							<Input
								value={answer1}
								inputMode="text"
								onChange={(e) => setAnswer1(e.target.value)}
								disabled={submitted}
								className="h-9 w-16 text-xl font-normal text-center py-0.5 align-baseline relative -ml-1 translate-y-3 rounded-none"
								aria-label="Log base"
							/>
							<Input
								value={answer2}
								inputMode="text"
								onChange={(e) => setAnswer2(e.target.value)}
								disabled={submitted}
								className="h-12 w-48 text-3xl font-normal text-center py-1 rounded-none"
								aria-label="Log argument"
							/>
						</div>
					</div>
				) : (question as any).kind === 'logarithms' && String((question as any).answerKind) === 'text' ? (
					<MathLiveInput
						value={answer1}
						onChange={setAnswer1}
						disabled={submitted}
						className={'text-2xl font-normal text-left tk-expr-input'}
					/>
				) : (question as PracticeQuestion).kind === 'word_problem'
						&& Array.isArray((question as any).expectedNumbers)
						&& ((question as any).expectedNumbers?.length ?? 0) === 2
						&& (String((question as any).answerKind) === 'integer' || String((question as any).answerKind) === 'decimal_4sf') ? (
							<div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
								<div className="space-y-1">
									<Label className="text-xs text-muted-foreground">{String(((question as any).answerLabels?.[0] ?? 'Answer 1') as any)}</Label>
									<Input
										value={answer1}
										inputMode={String((question as any).answerKind) === 'integer' ? 'numeric' : 'decimal'}
										onChange={(e) => {
											const ak = String((question as any).answerKind);
											if (ak === 'integer') {
												setAnswer1(sanitizeNumericInput(e.target.value, { maxDecimals: 0 }));
												return;
											}
											setAnswer1(sanitizeNumericInput(e.target.value, { maxDecimals: 12 }));
										}}
										disabled={submitted}
										className="h-12 text-2xl font-normal text-center py-1"
									/>
								</div>
								<div className="space-y-1">
									<Label className="text-xs text-muted-foreground">{String(((question as any).answerLabels?.[1] ?? 'Answer 2') as any)}</Label>
									<Input
										value={answer2}
										inputMode={String((question as any).answerKind) === 'integer' ? 'numeric' : 'decimal'}
										onChange={(e) => {
											const ak = String((question as any).answerKind);
											if (ak === 'integer') {
												setAnswer2(sanitizeNumericInput(e.target.value, { maxDecimals: 0 }));
												return;
											}
											setAnswer2(sanitizeNumericInput(e.target.value, { maxDecimals: 12 }));
										}}
										disabled={submitted}
										className="h-12 text-2xl font-normal text-center py-1"
									/>
								</div>
							</div>
						) : (question as PracticeQuestion).kind === 'word_problem'
						&& (question as any).answerKind === 'rational'
						&& !!(question as any).expectedFraction ? (
                      <div className="w-full flex justify-center">
                        <div className="w-56">
                          <Input
                            value={answer1}
                            inputMode="numeric"
                            onChange={(e) => setAnswer1(sanitizeNumericInput(e.target.value, { maxDecimals: 0 }))}
                            disabled={submitted}
                            className="h-12 text-2xl font-normal text-center py-1"
                          />
                          <div className="my-2 h-px bg-foreground/40" />
                          <Input
                            value={answer2}
                            inputMode="numeric"
                            onChange={(e) => setAnswer2(sanitizeNumericInput(e.target.value, { maxDecimals: 0 }))}
                            disabled={submitted}
                            className="h-12 text-2xl font-normal text-center py-1"
                          />
                        </div>
                      </div>
                    ) : (
                    <Input
                      value={answer1}
                      inputMode={(() => {
                        const kind = (question as PracticeQuestion).kind;
                        if (kind === 'indices') return 'numeric';
                        if (kind === 'polynomial') return 'numeric';
                        if (kind === 'linear' || kind === 'fractions') return 'decimal';
                        if (kind === 'word_problem') {
                          const wp = question as any;
                          if (wp.answerKind === 'integer') return 'numeric';
                          // decimal_2dp + rational (single input) should allow '.'
                          return 'decimal';
                        }
                        return undefined;
                      })()}
                      onChange={(e) => {
                        if ((question as PracticeQuestion).kind === 'indices') {
                          setAnswer1(sanitizeNumericInput(e.target.value, { maxDecimals: 0 }));
                          return;
                        }
                        if ((question as PracticeQuestion).kind === 'polynomial') {
                          setAnswer1(sanitizeNumericInput(e.target.value, { maxDecimals: 0 }));
                          return;
                        }
                        if ((question as PracticeQuestion).kind === 'linear' || (question as PracticeQuestion).kind === 'fractions') {
                          // Fractions/linear allow fraction or decimal.
                          setAnswer1(sanitizeRationalInput(e.target.value));
                          return;
                        }
                        if ((question as PracticeQuestion).kind === 'word_problem') {
                          const wp = question as any;
                          if (wp.answerKind === 'integer') {
                            setAnswer1(sanitizeNumericInput(e.target.value, { maxDecimals: 0 }));
                            return;
                          }
                          if (wp.answerKind === 'decimal_2dp') {
                            setAnswer1(sanitizeNumericInput(e.target.value, { maxDecimals: 2 }));
                            return;
                          }
                          if (wp.answerKind === 'decimal_4sf') {
                            setAnswer1(sanitizeNumericInput(e.target.value, { maxDecimals: 12 }));
                            return;
                          }
                          setAnswer1(sanitizeRationalInput(e.target.value));
                          return;
                        }
                        // For other non-text topics, keep it numeric-only.
                        setAnswer1(sanitizeNumericInput(e.target.value));
                        return;
                      }}
                      disabled={submitted}
                      className="h-12 text-2xl font-normal text-center py-1"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-center">
              <Button
                disabled={submitted
                  || (
                    (question as any).kind === 'graph'
                    && !!(question as GraphPracticeQuestion).katexOptions?.length
                    && selectedOptionIndex === null
                  )}
                onClick={() => {
                  const ok = checkSessionAnswer();
                  if (!ok) {
                    const qAny = question as any;
                    const raw = String(answer1 ?? '');
                    const normalized = typeof qAny?.normalize === 'function'
                      ? String(qAny.normalize(raw))
                      : raw.replace(/\s+/g, '').toLowerCase();
                    const specs = getAnswerFieldSpecs(question as PracticeQuestion);
                    const allInputs = [answer1, answer2, answer3, ...extraAnswers]
                      .slice(0, specs.length > 0 ? specs.length : 3)
                      .map((x) => String(x ?? ''));
                    console.log('[practice][answer-debug]', {
                      kind: qAny?.kind,
                      topicId: qAny?.topicId,
                      expectedNormalized: qAny?.expectedNormalized,
                      expectedLatex: qAny?.expectedLatex,
                      expectedRaw: qAny?.expected,
                      userAnswerParts: allInputs,
                      userAnswerRaw: raw,
                      userAnswerNormalized: normalized,
                    });
                  }
                  setSubmitted(true);
                  setIsCorrect(ok);
                  const specs = getAnswerFieldSpecs(question as PracticeQuestion);
                  const maxInputs = (() => {
                    if (specs.length > 0) return specs.length;
                    if ((question as any)?.kind === 'graph') {
                      const gq = question as any;
                      if (Array.isArray(gq?.inputFields) && gq.inputFields.length > 0) return gq.inputFields.length;
                      // clock_reading and other small graph inputs still use answer1..3
                      return 3;
                    }
                    return 3;
                  })();

                  const allInputs = [answer1, answer2, answer3, ...extraAnswers]
                    .slice(0, maxInputs)
                    .map((x) => String(x ?? ''));
                  void recordSubmitEvent({
                    isCorrect: ok,
                    userAnswer: (() => {
                      if ((question as any)?.kind === 'graph' && Array.isArray((question as any)?.katexOptions)) {
                        if (typeof selectedOptionIndex === 'number') {
                          return String((question as any).katexOptions[selectedOptionIndex] ?? '').trim() || 'N/A';
                        }
                        return 'N/A';
                      }
                      const parts = allInputs.filter((x) => String(x ?? '').trim().length > 0);
                      return parts.length ? parts.join(' | ') : 'N/A';
                    })(),
                    userAnswerParts: (() => {
                      // Only store parts when they are meaningful; otherwise the admin modals will show "—".
                      const trimmed = allInputs.map((x) => String(x ?? '').trim());
                      const hasAny = trimmed.some((x) => x.length > 0);
                      if (!hasAny) return undefined;
                      // For graph MCQ options, userAnswer is the selected option latex; parts would be empty.
                      if ((question as any)?.kind === 'graph' && Array.isArray((question as any)?.katexOptions)) return undefined;
                      return allInputs;
                    })(),
                  });
                  if ((question as any).kind === 'quadratic') {
                    const qAny: any = question as any;
                    const parts = Array.isArray(qAny.expectedParts) ? (qAny.expectedParts as any[]) : [];
                    const n = qAny.variantId === 'factorisation' ? 2 : Math.max(2, parts.length);
                    persistAttempt({ correct: ok, inputs: [answer1, answer2, answer3, ...extraAnswers].slice(0, n), q: question as PracticeQuestion });
                  }
                }}
              >
                Submit
              </Button>
            </div>

            {submitted ? (
              <div className="mt-6 space-y-3">
                <div className={`${isCorrect
                  ? 'bg-gradient-to-r from-emerald-500/15 via-emerald-400/10 to-emerald-500/15 border-emerald-600 text-emerald-950'
                  : 'bg-gradient-to-r from-red-500/15 via-red-400/10 to-red-500/15 border-red-600 text-red-950'} rounded-md border px-3 py-2 flex items-center justify-between gap-3`}>
                  <div className="text-base font-semibold">{isCorrect ? 'Correct' : 'Wrong'}</div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void recordNextEvent();
                      const nextSeed = computeNextSeed();
                      setSessionSeed(nextSeed);
                      if (mode === 'mixed') {
                        setMixedCursor((c) => c + 1);
                      }
                      setSubmitted(false);
                      setIsCorrect(null);
                      setAnswer1('');
                      setAnswer2('');
                      setAnswer3('');
                      setSelectedOptionIndex(null);
                      generateNext(nextSeed);
                    }}
                  >
                    Next
                  </Button>
                </div>

                <div className="rounded-md border bg-background p-4">
                  {(question as any).kind === 'graph' ? (
                    <div className="space-y-4">
                      {(question as GraphPracticeQuestion).graphSpec && !(question as any).generatorParams?.unitCircle ? (
                        <div className="flex justify-center">
                          <InteractiveGraph
                            spec={(question as GraphPracticeQuestion).graphSpec!}
                            altText={(question as GraphPracticeQuestion).svgAltText}
                            interactive={false}
                          />
                        </div>
                      ) : null}

                      {!!(question as any).generatorParams?.circularMeasure && (question as GraphPracticeQuestion).svgDataUrl ? (
                        <div className="flex justify-center">
                          <img
                            src={(question as GraphPracticeQuestion).svgDataUrl}
                            alt={(question as GraphPracticeQuestion).svgAltText}
                            className="max-w-full h-auto"
                          />
                        </div>
                      ) : null}

                      {!!(question as any).generatorParams?.unitCircle && (question as GraphPracticeQuestion).graphSpec ? (
                        (question as GraphPracticeQuestion).secondaryGraphSpec ? (
                          <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <InteractiveGraph
                              spec={(question as GraphPracticeQuestion).graphSpec!}
                              altText={(question as GraphPracticeQuestion).svgAltText}
                              interactive={false}
                            />
                            <InteractiveGraph
                              spec={(question as GraphPracticeQuestion).secondaryGraphSpec!}
                              altText={(question as GraphPracticeQuestion).svgAltText}
                              interactive={false}
                            />
                          </div>
                        ) : (
                          <div className="flex justify-center">
                            <InteractiveGraph
                              spec={(question as GraphPracticeQuestion).graphSpec!}
                              altText={(question as GraphPracticeQuestion).svgAltText}
                              interactive={false}
                            />
                          </div>
                        )
                      ) : null}

                      {!!(question as any).generatorParams?.circularMeasure && (question as any).generatorParams?.expectedLatex ? (
                        <div className="rounded-md border bg-background px-3 py-2">
                          <div className="text-xs text-muted-foreground">Explanation</div>
                          <div className="text-2xl leading-snug">
                            <Katex latex={(question as any).generatorParams.expectedLatex} displayMode={false} />
                          </div>
                        </div>
                      ) : null}

                      {(question as GraphPracticeQuestion).correctIndex !== undefined && (question as GraphPracticeQuestion).katexOptions?.[(question as GraphPracticeQuestion).correctIndex!] ? (
                        <div className="rounded-md border bg-background px-3 py-2">
                          <div className="text-xs text-muted-foreground">Explanation</div>
                          <div className="text-2xl leading-snug">
                            <Katex
                              latex={(question as GraphPracticeQuestion).katexOptions![(question as GraphPracticeQuestion).correctIndex!]}
                              displayMode={false}
                            />
                          </div>
                        </div>
                      ) : null}

                      {(question as GraphPracticeQuestion).katexExplanation.steps.map((s, idx) => (
                        <div key={idx} className="space-y-1">
                          <div
                            className={
                              (question as any).generatorParams?.circularMeasure
                                ? 'text-lg md:text-xl leading-snug max-w-full'
                                : 'text-xl md:text-2xl leading-snug max-w-full'
                            }
                          >
                            <Katex latex={s.katex} displayMode />
                          </div>
                          <div className="tk-wp-expl-text text-lg leading-relaxed text-foreground">
                            {(() => {
                              const raw = String(s.text ?? '');
                              // Normalize common plain-text math fragments so they render properly.
                              const normalized0 = raw
                                .replace(/\b(sin|cos|tan|sec|csc|cot)\s*\(/g, '\\$1(')
                                // Convert simple |...| into KaTeX absolute bars.
                                .replace(/\|([^|]+)\|/g, String.raw`\\left|$1\\right|`);

                              const hasLatex = /\\left\||\\right\||\\sin\b|\\cos\b|\\tan\b|\\sec\b|\\csc\b|\\cot\b|\\frac\{|\\(?:dfrac|tfrac)\{|\\sqrt\b|\\pi\b|\\ln\b|\\log\b|\\cdot\b|\\int\b|\^\{|\^\d|_\{|_\d/.test(normalized0);
                              if (!hasLatex) return raw;

                              const parts = normalized0.split(
                                /(\\left\|[\s\S]*?\\right\||\\(?:frac|dfrac|tfrac)\{[^}]+\}\{[^}]+\}|\\sqrt\{[^}]+\}|\\sqrt\[[^\]]+\]\{[^}]+\}|\\pi\b|\\ln\b|\\log(?:_{\{[^}]+\}}|_{[^}]+})?\b|\\sin\b|\\cos\b|\\tan\b|\\sec\b|\\csc\b|\\cot\b|\\cdot|\\int\b|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+|-?\d*x_\{[^}]+\}|x_\{[^}]+\}|-?\d*x_\d+|x_\d+)/g
                              );
                              return (
                                <span>
                                  {parts.filter((p) => p.length > 0).map((p, i) => {
                                    const isMath =
                                      /^(\\left\|[\s\S]*?\\right\||\\(?:frac|dfrac|tfrac)\{[^}]+\}\{[^}]+\}|\\sqrt\{[^}]+\}|\\sqrt\[[^\]]+\]\{[^}]+\}|\\pi\b|\\ln\b|\\log(?:_{\{[^}]+\}}|_{[^}]+})?\b|\\sin\b|\\cos\b|\\tan\b|\\sec\b|\\csc\b|\\cot\b|\\cdot|\\int\b|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+|-?\d*x_\{[^}]+\}|x_\{[^}]+\}|-?\d*x_\d+|x_\d+)$/.test(p);
                                    return isMath ? <Katex key={i} latex={p} /> : <span key={i}>{p}</span>;
                                  })}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      ))}

                      <div className="pt-2 border-t">
                        <div className="text-base font-semibold text-foreground">Key Idea</div>
                        <div className="tk-wp-expl-text text-lg leading-relaxed text-foreground">
                          {(() => {
                            const s = String((question as GraphPracticeQuestion).katexExplanation.summary ?? '');
                            const hasLatex = /\\text\{|\\frac\{|\^\{|\^\d|_\{|\\int\b|\\cdot\b|\\sqrt\b|\\left\b|\\right\b/.test(s);
                            if (!hasLatex) return s;

                            // Render the whole summary as KaTeX inline. Splitting into fragments breaks commands like \text{...}.
                            return <Katex latex={s} displayMode={false} />;
                          })()}
                        </div>
                      </div>

                      {(question as GraphPracticeQuestion).katexExplanation.commonMistake ? (
                        <div className="pt-2 border-t">
                          <div className="text-base font-semibold text-foreground">Common mistake</div>
                          <div
                            className={
                              (question as any).generatorParams?.circularMeasure
                                ? 'mt-1 text-base md:text-lg leading-snug max-w-full'
                                : 'mt-1 text-lg md:text-xl leading-snug max-w-full'
                            }
                          >
                            <Katex
                              latex={(question as GraphPracticeQuestion).katexExplanation.commonMistake!.katex}
                              displayMode
                            />
                          </div>
                          <div className="tk-wp-expl-text text-lg leading-relaxed text-foreground">
                            {(() => {
                              const s = String((question as GraphPracticeQuestion).katexExplanation.commonMistake!.text ?? '');
                              const hasLatex = /\\frac\{|\\sqrt\b|\^\{|\^\d|_\{|\\log\b|\\log_\{|\\int\b|\\cdot\b/.test(s);
                              if (!hasLatex) return s;

                              const parts = s.split(
                                /(\\frac\{[^}]+\}\{[^}]+\}|\\sqrt\{[^}]+\}|\\sqrt\[[^\]]+\]\{[^}]+\}|\\cdot|\\log_\{[^}]+\}\([^)]*\)|\\log_\{[^}]+\}|\\log\b|\\int\b|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+)/g
                              );
                              return (
                                <span>
                                  {parts.filter((p) => p.length > 0).map((p, i) => {
                                    const isMath =
                                      /^(\\frac\{[^}]+\}\{[^}]+\}|\\sqrt\{[^}]+\}|\\sqrt\[[^\]]+\]\{[^}]+\}|\\cdot|\\log_\{[^}]+\}\([^)]*\)|\\log_\{[^}]+\}|\\log\b|\\int\b|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+)$/.test(p);
                                    return isMath ? <Katex key={i} latex={p} /> : <span key={i}>{p}</span>;
                                  })}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(() => {
                        const rawBlocks = ((question as any).katexExplanation ?? []) as any[];
                        const isLog = (question as any).topicId === 'logarithms';

                        const inferCallout = (latex: string) => {
                          const s = String(latex ?? '');
                          if (/\\log_{10}\b|\\log\b/.test(s) && /=/.test(s)) return 'Take logarithms of both sides.';
                          if (/\\ln\b/.test(s) && /=/.test(s)) return 'Take natural logarithms of both sides.';
                          if (/\\iff/.test(s)) return 'Rewrite using an equivalent form.';
                          if (/\\frac\{\\log_{10}/.test(s)) return 'Use the change-of-base relationship.';
                          if (/\^\{/.test(s) || /\^\d/.test(s)) return 'Use index and log laws to simplify.';
                          if (/x\s*=/.test(s)) return 'Solve for x.';
                          return 'Simplify and proceed to the next step.';
                        };

                        const cooked = (() => {
                          if (!isLog) return rawBlocks;
                          const out: any[] = [];
                          let pendingText: string | null = null;
                          for (const b of rawBlocks) {
                            if (!b) continue;
                            if (b.kind === 'text') {
                              const t = String(b.content ?? '').trim();
                              if (!t) continue;
                              pendingText = pendingText ? `${pendingText} ${t}` : t;
                              continue;
                            }
                            if (b.kind === 'math' && pendingText) {
                              out.push({ kind: 'math_callout', content: b.content, callout: pendingText, displayMode: b.displayMode });
                              pendingText = null;
                              continue;
                            }
                            if (b.kind === 'math' && !pendingText) {
                              out.push({ kind: 'math_callout', content: b.content, callout: inferCallout(b.content), displayMode: b.displayMode });
                              continue;
                            }
                            if (pendingText) {
                              out.push({ kind: 'text', content: pendingText });
                              pendingText = null;
                            }
                            out.push(b);
                          }
                          if (pendingText) out.push({ kind: 'text', content: pendingText });
                          return out;
                        })();

                        return cooked.map((b: any, idx: number) =>
                        b.kind === 'text' ? (
                          <div
                            key={idx}
                            className={(question as any).topicId === 'word_problems'
                              ? 'tk-wp-expl-text font-slab text-xl leading-relaxed text-foreground'
                              : (question as any).topicId === 'polynomials'
                                ? 'tk-wp-expl-text font-slab text-base leading-relaxed text-foreground'
                                : 'font-slab text-base leading-relaxed text-foreground'}
                          >
                            {(() => {
                              const raw = String(b.content ?? '');
                              const normalized = raw.trim().toLowerCase();
                              if (normalized === 'answer') {
                                return <div className="text-base font-semibold text-foreground">Answer</div>;
                              }
                              if (normalized === 'explanation') {
                                return (question as any).topicId === 'word_problems'
                                  ? null
                                  : <div className="text-base font-semibold text-foreground">Explanation</div>;
                              }

                              const sNorm = raw.replace(/\b(sin|cos|tan|sec|csc|cot)\s*\(/g, '\\$1(');
                              const hasLatex = /\\sin\b|\\cos\b|\\tan\b|\\sec\b|\\csc\b|\\cot\b|\\frac\{|\\(?:dfrac|tfrac)\{|\\sqrt\b|\\pi\b|\\ln\b|\\log\b|\\cdot\b|\\int\b|\^\{|\^\d|_\{|_\d/.test(sNorm);
                              if (!hasLatex) return raw;

                              const parts = sNorm.split(
                                /(\\(?:frac|dfrac|tfrac)\{[^}]+\}\{[^}]+\}|\\sqrt\{[^}]+\}|\\sqrt\[[^\]]+\]\{[^}]+\}|\\pi\b|\\ln\b|\\log(?:_\{[^}]+\}|_{[^}]+})?\b|\\cdot|\\int\b|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+|[a-zA-Z]\^\{[^}]+\}|[a-zA-Z]\^[a-zA-Z0-9]+|-?\d*x_\{[^}]+\}|x_\{[^}]+\}|-?\d*x_\d+|x_\d+)/g
                              );

                              return (
                                <span>
                                  {parts.filter((p) => p.length > 0).map((p, i) => {
                                    const isMath =
                                      /^(\\(?:frac|dfrac|tfrac)\{[^}]+\}\{[^}]+\}|\\sqrt\{[^}]+\}|\\sqrt\[[^\]]+\]\{[^}]+\}|\\pi\b|\\ln\b|\\log(?:_\{[^}]+\}|_{[^}]+})?\b|\\cdot|\\int\b|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+|[a-zA-Z]\^\{[^}]+\}|[a-zA-Z]\^[a-zA-Z0-9]+|-?\d*x_\{[^}]+\}|x_\{[^}]+\}|-?\d*x_\d+|x_\d+)$/.test(p);
                                    return isMath ? <Katex key={i} latex={p} /> : <span key={i}>{p}</span>;
                                  })}
                                </span>
                              );
                            })()}
                          </div>
                        ) : b.kind === 'math_callout' ? (
                          <div key={idx} className="w-full">
                            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                              <div
                                className={
                                  (question as any).topicId === 'word_problems'
                                    ? 'text-2xl leading-snug py-1'
                                    : (b.displayMode ? 'text-xl leading-snug' : 'text-xl leading-snug')
                                }
                              >
                                <Katex
                                  latex={b.content}
                                  displayMode={(question as any).topicId === 'word_problems' ? false : !!b.displayMode}
                                />
                              </div>

                              <div aria-hidden className="hidden md:block flex-1 border-t border-dotted border-border/80" />

                              <div className="md:max-w-[360px] md:w-fit">
                                <div className="rounded-md bg-amber-100/70 border border-amber-200/70 text-amber-950 px-3 py-2 text-sm leading-snug shadow-sm">
                                  {(() => {
                                    const s0 = String(b.callout ?? '');
                                    const s = s0.replace(/\b(sin|cos|tan|sec|csc|cot)\s*\(/g, '\\$1(');
                                    const hasLatex = /\\sin\b|\\cos\b|\\tan\b|\\sec\b|\\csc\b|\\cot\b|\\frac\{|\\(?:dfrac|tfrac)\{|\\sqrt\b|\\pi\b|\\ln\b|\\log\b|\\cdot\b|\\int\b|\^\{|\^\d|_\{|_\d/.test(s);
                                    if (!hasLatex) return s;
                                    const parts = s.split(
                                      /(\\(?:frac|dfrac|tfrac)\{[^}]+\}\{[^}]+\}|\\sqrt\{[^}]+\}|\\sqrt\[[^\]]+\]\{[^}]+\}|\\pi\b|\\ln\b|\\log(?:_\{[^}]+\}|_{[^}]+})?\b|\\cdot|\\int\b|\\left\([^)]*\\right\)\^\{?\d+\}?|\([^)]*\)\^\{?\d+\}?|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+|[a-zA-Z]\^\{[^}]+\}|[a-zA-Z]\^[a-zA-Z0-9]+|-?\d*x_\{[^}]+\}|x_\{[^}]+\}|-?\d*x_\d+|x_\d+)/g
                                    );
                                    return (
                                      <span>
                                        {parts.filter((p) => p.length > 0).map((p, i) => {
                                          const isMath =
                                            /^(\\(?:frac|dfrac|tfrac)\{[^}]+\}\{[^}]+\}|\\sqrt\{[^}]+\}|\\sqrt\[[^\]]+\]\{[^}]+\}|\\pi\b|\\ln\b|\\log(?:_\{[^}]+\}|_{[^}]+})?\b|\\cdot|\\int\b|\\left\([^)]*\\right\)\^\{?\d+\}?|\([^)]*\)\^\{?\d+\}?|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+|[a-zA-Z]\^\{[^}]+\}|[a-zA-Z]\^[a-zA-Z0-9]+|-?\d*x_\{[^}]+\}|x_\{[^}]+\}|-?\d*x_\d+|x_\d+)$/.test(p);
                                          return isMath ? <Katex key={i} latex={p} /> : <span key={i}>{p}</span>;
                                        })}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : b.kind === 'graph' ? (
                          <div key={idx} className="flex justify-center">
                            {typeof (b as any)?.graphSpec?.svgDataUrl === 'string' ? (
                              <img
                                src={String((b as any).graphSpec.svgDataUrl)}
                                alt={String((b as any).altText ?? 'Diagram')}
                                className="max-w-full h-auto"
                              />
                            ) : (
                              <InteractiveGraph
                                spec={b.graphSpec}
                                altText={b.altText}
                                interactive={(question as any).topicId === 'integration'}
                              />
                            )}
                          </div>
                        ) : b.kind === 'long_division' ? (
                          <div key={idx} className="py-2">
                            <PolynomialLongDivision
                              divisorLatex={b.divisorLatex}
                              dividendLatex={b.dividendLatex}
                              quotientLatex={b.quotientLatex}
                              steps={b.steps}
                            />
                          </div>
                        ) : (
                          <div
                            key={idx}
                            className={
                              (question as any).topicId === 'word_problems'
                                ? 'text-2xl leading-snug py-1'
                                : (b.displayMode ? 'text-xl leading-snug' : 'text-xl leading-snug')
                            }
                          >
                            <Katex latex={b.content} displayMode={(question as any).topicId === 'word_problems' ? false : !!b.displayMode} />
                          </div>
                        )
                      );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}