import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Katex } from '@/components/Katex';
import { ArrowLeft } from 'lucide-react';
import TypingAnswerMathInput from '@/components/TypingAnswerMathInput';
import InteractiveGraph from '@/components/InteractiveGraph';
import { PRACTICE_TOPICS, PracticeTopicId } from '@/lib/practiceTopics';
import { Fraction, fractionsEqual, parseFraction } from '@/lib/fraction';
import { db } from '@/lib/db';
import { generateQuadraticByFactorisation, PracticeDifficulty, QuadraticFactorizationQuestion } from '@/lib/practiceGenerators/quadraticFactorization';
import { generatePracticeQuestion, PracticeQuestion, GraphPracticeQuestion } from '@/lib/practiceEngine';

export default function Practice() {
  const settings = useLiveQuery(() => db.settings.get('1'));

  const [mode, setMode] = useState<'individual' | 'mixed'>('individual');
  const [step, setStep] = useState<'chooser' | 'session'>('chooser');
  const [topicId, setTopicId] = useState<PracticeTopicId | null>(null);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>('easy');

  const [sessionSeed, setSessionSeed] = useState(() => Date.now());
  const [question, setQuestion] = useState<QuadraticFactorizationQuestion | PracticeQuestion | null>(null);
  const [mixedModuleId, setMixedModuleId] = useState<string | null>(null);
  const [mixedCursor, setMixedCursor] = useState(0);
  const [answer1, setAnswer1] = useState('');
  const [answer2, setAnswer2] = useState('');
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const [lastVariantByTopic, setLastVariantByTopic] = useState<Record<string, string | undefined>>({});

  const selectedTopic = useMemo(() => PRACTICE_TOPICS.find((t) => t.id === topicId) ?? null, [topicId]);

  const mixedModules = useMemo(() => settings?.mixedPracticeModules ?? [], [settings?.mixedPracticeModules]);
  const practiceTopicLocks = useMemo(() => settings?.practiceTopicLocks ?? {}, [settings?.practiceTopicLocks]);
  const selectedMixedModule = useMemo(
    () => (mixedModuleId ? mixedModules.find((m) => m.id === mixedModuleId) ?? null : null),
    [mixedModules, mixedModuleId]
  );

  const resetAttemptState = () => {
    setAnswer1('');
    setAnswer2('');
    setSelectedOptionIndex(null);
    setSubmitted(false);
    setIsCorrect(null);
  };

  const generateNext = (seedValue: number) => {
    if (mode === 'mixed') {
      if (!selectedMixedModule || !selectedMixedModule.items?.length) return;
      const items = selectedMixedModule.items;
      const idx = mixedCursor % items.length;
      const item = items[idx];
      if (!item) return;

      if (item.topicId === 'quadratics') {
        const q = generateQuadraticByFactorisation({ seed: seedValue, difficulty: item.difficulty });
        setQuestion(q);
      } else {
        const q = generatePracticeQuestion({ topicId: item.topicId, difficulty: item.difficulty, seed: seedValue });
        setQuestion(q);
      }
      resetAttemptState();
      return;
    }

    if (!topicId) return;
    if (topicId === 'quadratics') {
      const q = generateQuadraticByFactorisation({ seed: seedValue, difficulty });
      setQuestion(q);
      resetAttemptState();
      return;
    }
    const avoidVariantId = lastVariantByTopic[topicId] as string | undefined;
    const q = generatePracticeQuestion({ topicId, difficulty, seed: seedValue, avoidVariantId });
    setQuestion(q);
    // Record last variant id (if present) so the next question avoids it.
    const nextVariant = (q as any).variantId ?? (q as any).generatorParams?.kind ?? undefined;
    setLastVariantByTopic((m) => ({ ...m, [topicId]: nextVariant }));
    resetAttemptState();
  };

  useEffect(() => {
    if (step !== 'session') return;
    if (!question) {
      generateNext(sessionSeed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, question, sessionSeed]);

  const checkQuadraticAnswers = (expected: Fraction[], a: string, b: string) => {
    const p1 = parseFraction(a);
    const p2 = parseFraction(b);
    if (!p1 || !p2) return false;

    const [e1, e2] = expected;

    const direct = fractionsEqual(p1, e1) && fractionsEqual(p2, e2);
    const swapped = fractionsEqual(p1, e2) && fractionsEqual(p2, e1);
    return direct || swapped;
  };

  const checkSingleFractionAnswer = (expected: Fraction, raw: string) => {
    const parsed = parseFraction(raw);
    if (!parsed) return false;
    return fractionsEqual(parsed, expected);
  };

  const sanitizeNumericInput = (raw: string, opts?: { maxDecimals?: number }) => {
    const maxDecimals = opts?.maxDecimals;
    let s = raw.replace(/[^0-9.\-]/g, '');
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
    let s = raw.replace(/[^0-9.\/\-]/g, '');

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
    if (Number.isNaN(n)) return trimmed;
    return n.toFixed(2);
  };

  const checkSessionAnswer = () => {
    if (!question) return false;

    if ((question as any).metadata?.topic === 'quadratics') {
      const q = question as QuadraticFactorizationQuestion;
      return checkQuadraticAnswers(q.solutions, answer1, answer2);
    }

    const q = question as PracticeQuestion;
    switch (q.kind) {
      case 'linear':
        return checkSingleFractionAnswer(q.solution, answer1);
      case 'fractions':
        return checkSingleFractionAnswer(q.solution, answer1);
      case 'indices': {
        const trimmed = answer1.trim().replace(/\s+/g, '');

        // Indices: require the exponent only (numeric).
        if (!/^-?\d+$/.test(trimmed)) return false;
        const exp = Number(trimmed);
        if (exp === null || Number.isNaN(exp)) return false;
        return exp === q.exponent;
      }
      case 'simultaneous': {
        const xOk = checkSingleFractionAnswer(q.solutionX, answer1);
        const yOk = checkSingleFractionAnswer(q.solutionY, answer2);
        return xOk && yOk;
      }
      case 'factorisation': {
        const normalized = answer1.replace(/\s+/g, '').toLowerCase();
        return q.expectedNormalized.includes(normalized);
      }
      case 'calculus': {
        const normalized = answer1.replace(/\s+/g, '').toLowerCase();
        return (q as any).expectedNormalized?.includes(normalized);
      }
      case 'word_problem': {
        const wp = q as any;
        const raw1 = String(answer1 ?? '').trim();
        const raw2 = String(answer2 ?? '').trim();
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

  const persistAttempt = (payload: { correct: boolean; inputs: [string, string]; q: QuadraticFactorizationQuestion }) => {
    try {
      const key = `practice.attempts.${payload.q.metadata.topic}.${payload.q.metadata.method}`;
      const existingRaw = localStorage.getItem(key);
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const next = [
        {
          id: payload.q.id,
          seed: payload.q.metadata.seed,
          difficulty: payload.q.metadata.difficulty,
          coefficients: payload.q.metadata.coefficients,
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

  const nowMs = Date.now();
  const chooserList = mode === 'mixed'
    ? (mixedModules ?? []).map((m) => {
        const sched = (m as any).schedule as { enabled: boolean; opensAt: number; closesAt: number } | undefined;
        const isOpen = !sched?.enabled || (nowMs >= sched.opensAt && nowMs <= sched.closesAt);
        return { id: m.id, title: m.title || 'Untitled mixed module', disabled: !isOpen };
      })
    : PRACTICE_TOPICS.map((t) => ({ id: t.id, title: t.title, disabled: !t.enabled || !!(practiceTopicLocks as any)[t.id] }));

  const currentTitle = useMemo(() => {
    if (mode === 'mixed') return selectedMixedModule?.title || 'Mixed Exercises';
    return selectedTopic?.title || 'Practice';
  }, [mode, selectedMixedModule?.title, selectedTopic?.title]);

  const currentInstruction = useMemo(() => {
    if (!question) return '';
    if (mode === 'mixed') {
      const items = selectedMixedModule?.items ?? [];
      const idx = mixedCursor % (items.length || 1);
      const it = items[idx];
      const topic = PRACTICE_TOPICS.find((t) => t.id === it?.topicId);
      return it ? (topic ? topic.description : String(it.topicId)) : '';
    }
    return selectedTopic?.description || '';
  }, [mode, mixedCursor, question, selectedMixedModule?.items, selectedTopic?.description]);

  const sessionInstruction = useMemo(() => {
    if (!question) return '';

    if ((question as any).metadata?.topic === 'quadratics') {
      return 'Enter both values of x. Order does not matter. Fractions are allowed.';
    }

    const q = question as PracticeQuestion;
    switch (q.kind) {
      case 'linear':
        return 'Solve for x. Enter x as a simplified integer or fraction.';
      case 'fractions':
        return 'Calculate the result and enter your answer as a simplified fraction (or integer).';
      case 'indices':
        return 'Use index laws to find the final exponent. Enter only the exponent as an integer.';
      case 'simultaneous':
        return 'Solve for x and y. Enter both values (fractions are allowed).';
      case 'factorisation':
        return 'Factorise the expression completely. Enter the final factorised answer.';
      case 'word_problem': {
        const wp = q as any;
        if (wp.answerKind === 'decimal_2dp') return 'Answer the word problem. Give your answer to 2 decimal places.';
        if (wp.answerKind === 'rational') return 'Answer the word problem. Fractions/decimals are allowed.';
        return 'Answer the word problem. Enter an integer unless told otherwise.';
      }
      default:
        return currentInstruction || 'Answer the question.';
    }
  }, [currentInstruction, question]);

  return (
    <div className="w-full py-8">
      {step === 'chooser' ? (
        <div className="max-w-5xl mx-auto">
          <div className="mb-4">
            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Practice</div>
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
                <div className="text-base font-semibold">Choose a level</div>
                <div className="text-sm text-muted-foreground mt-1">{chooserTitle}</div>
                <div className="mt-5 space-y-3">
                  <Button
                    variant="outline"
                    className="w-full h-12 text-base"
                    disabled={mode === 'mixed' ? !mixedModuleId : !topicId}
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
                    disabled={mode === 'mixed' ? !mixedModuleId : !topicId}
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
                    disabled={mode === 'mixed' ? !mixedModuleId : !topicId}
                    onClick={() => {
                      setDifficulty('hard');
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

                {mode === 'mixed' && mixedModules.length === 0 ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    No mixed modules configured. Ask an admin to create one in Settings.
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {step === 'session' && question ? (
        <div className="max-w-7xl mx-auto space-y-3 px-3 md:px-0">
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
                  }}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0 select-none">
                  <div className="text-lg font-semibold leading-tight text-foreground truncate">{currentTitle}</div>
                </div>
              </div>
              <div />
            </div>
          </Card>

          <Card className="p-6">
            <div className="text-base font-medium text-foreground">{sessionInstruction}</div>

            {(question as any).kind === 'graph'
              && (((question as GraphPracticeQuestion).graphSpec) || ((question as GraphPracticeQuestion).svgDataUrl))
              && !(question as any).generatorParams?.unitCircle ? (
                <div className="mt-4 flex justify-center">
                  {(question as GraphPracticeQuestion).graphSpec ? (
                    <InteractiveGraph
                      spec={(question as GraphPracticeQuestion).graphSpec!}
                      altText={(question as GraphPracticeQuestion).svgAltText}
                    />
                  ) : (
                    <img
                      src={(question as GraphPracticeQuestion).svgDataUrl}
                      alt={(question as GraphPracticeQuestion).svgAltText}
                      className={(question as any).generatorParams?.circularMeasure ? 'max-w-full h-auto' : 'max-w-full h-auto rounded-md border bg-white'}
                    />
                  )}
                </div>
              )
              : null}

            <div className="mt-6 flex justify-center">
              {(question as any).kind === 'graph' ? (
                <div className="max-w-3xl">
                  {(question as GraphPracticeQuestion).promptKatex ? (
                    <div className="text-2xl leading-snug text-center text-foreground">
                      <Katex latex={(question as GraphPracticeQuestion).promptKatex!} displayMode={false} />
                    </div>
                  ) : (
                    <div className="text-xl font-semibold text-center text-foreground">
                      {(question as GraphPracticeQuestion).promptText}
                    </div>
                  )}
                </div>
              ) : (
                (() => {
                  const latex = String((question as any).katexQuestion ?? '');
                  const isMultiline = latex.includes('\\begin{cases}') || latex.includes('\\begin{aligned}') || latex.includes('\\\\');
                  const isWordProblem = (question as any).topicId === 'word_problems' || (question as any).kind === 'word_problem';
                  const promptTextClass = isWordProblem
                    ? (isMultiline ? 'text-xl md:text-2xl leading-snug text-center' : 'text-2xl md:text-3xl leading-snug text-center')
                    : (isMultiline ? 'text-2xl md:text-3xl leading-snug text-center' : 'text-3xl md:text-4xl leading-snug text-center');
                  return (
                    <div className={promptTextClass}>
                      <div className={isWordProblem ? 'katex-wrap w-full min-w-0 max-w-full overflow-x-auto' : 'w-full min-w-0 max-w-full overflow-x-auto'}>
                        <Katex latex={latex} displayMode={isMultiline} />
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

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
                <div className="max-w-sm mx-auto space-y-3">
                  {(question as GraphPracticeQuestion).inputFields!.map((f) => (
                    <div key={f.id} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{f.label}</Label>
                      {f.kind === 'text' ? (
                        <TypingAnswerMathInput
                          value={answer1}
                          onChange={setAnswer1}
                          placeholder=""
                          disabled={submitted}
                          className="text-2xl font-normal text-left"
                        />
                      ) : (
                        <Input
                          value={answer1}
                          inputMode="decimal"
                          onChange={(e) => {
                            const gp = ((question as GraphPracticeQuestion).generatorParams ?? {}) as any;
                            const fixed2 = gp.expectedFormat === 'fixed2';
                            const next = sanitizeNumericInput(e.target.value, { maxDecimals: fixed2 ? 2 : undefined });
                            setAnswer1(next);
                          }}
                          disabled={submitted}
                          className="h-12 text-2xl font-normal text-center py-1"
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              {(question as any).metadata?.topic === 'quadratics' ? (
                <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Answer 1</Label>
                    <Input
                      value={answer1}
                      onChange={(e) => setAnswer1(e.target.value)}
                      disabled={submitted}
                      className="h-12 text-2xl font-normal text-center py-1"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Answer 2</Label>
                    <Input
                      value={answer2}
                      onChange={(e) => setAnswer2(e.target.value)}
                      disabled={submitted}
                      className="h-12 text-2xl font-normal text-center py-1"
                    />
                  </div>
                </div>
              ) : (question as PracticeQuestion).kind === 'simultaneous' ? (
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
              ) : (question as any).kind === 'graph' ? null : (
                <div className="max-w-sm mx-auto space-y-1">
                  <Label className="text-xs text-muted-foreground">Answer</Label>
                  {(question as PracticeQuestion).kind === 'factorisation' || (question as PracticeQuestion).kind === 'calculus' ? (
                    <TypingAnswerMathInput
                      value={answer1}
                      onChange={setAnswer1}
                      placeholder=""
                      disabled={submitted}
                      className={(question as PracticeQuestion).kind === 'factorisation' ? 'text-2xl font-normal text-center' : 'text-2xl font-normal text-left'}
                    />
                  ) : (
                    (question as PracticeQuestion).kind === 'word_problem'
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
                    )
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
                  setSubmitted(true);
                  setIsCorrect(ok);
                  if ((question as any).metadata?.topic === 'quadratics') {
                    persistAttempt({ correct: ok, inputs: [answer1, answer2], q: question as QuadraticFactorizationQuestion });
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
                  <div className="text-sm font-semibold">{isCorrect ? 'Correct' : 'Wrong'}</div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const nextSeed = Date.now();
                      setSessionSeed(nextSeed);
                      if (mode === 'mixed') {
                        setMixedCursor((c) => c + 1);
                      }
                      setQuestion(null);
                      generateNext(nextSeed);
                    }}
                  >
                    Next
                  </Button>
                </div>

                <div className="rounded-md border bg-background p-4">
                  {(question as any).kind === 'graph' ? (
                    <div className="space-y-4">
                      {!!(question as any).generatorParams?.unitCircle && (question as GraphPracticeQuestion).graphSpec ? (
                        (question as GraphPracticeQuestion).secondaryGraphSpec ? (
                          <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <InteractiveGraph
                              spec={(question as GraphPracticeQuestion).graphSpec!}
                              altText={(question as GraphPracticeQuestion).svgAltText}
                            />
                            <InteractiveGraph
                              spec={(question as GraphPracticeQuestion).secondaryGraphSpec!}
                              altText={(question as GraphPracticeQuestion).svgAltText}
                            />
                          </div>
                        ) : (
                          <div className="flex justify-center">
                            <InteractiveGraph
                              spec={(question as GraphPracticeQuestion).graphSpec!}
                              altText={(question as GraphPracticeQuestion).svgAltText}
                            />
                          </div>
                        )
                      ) : null}

                      {!!(question as any).generatorParams?.circularMeasure && (question as any).generatorParams?.expectedLatex ? (
                        <div className="rounded-md border bg-background px-3 py-2">
                          <div className="text-xs text-muted-foreground">Answer</div>
                          <div className="text-2xl leading-snug">
                            <Katex latex={(question as any).generatorParams.expectedLatex} displayMode={false} />
                          </div>
                        </div>
                      ) : null}

                      {(question as GraphPracticeQuestion).correctIndex !== undefined && (question as GraphPracticeQuestion).katexOptions?.[(question as GraphPracticeQuestion).correctIndex!] ? (
                        <div className="rounded-md border bg-background px-3 py-2">
                          <div className="text-xs text-muted-foreground">Answer</div>
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
                          <div className="text-2xl leading-snug">
                            <Katex latex={s.katex} displayMode />
                          </div>
                          <div className="text-base leading-relaxed text-foreground">{s.text}</div>
                        </div>
                      ))}

                      <div className="pt-2 border-t">
                        <div className="text-base font-semibold text-foreground">Key Idea</div>
                        <div className="text-base leading-relaxed text-foreground">
                          {(question as GraphPracticeQuestion).katexExplanation.summary}
                        </div>
                      </div>

                      {(question as GraphPracticeQuestion).katexExplanation.commonMistake ? (
                        <div className="pt-2 border-t">
                          <div className="text-base font-semibold text-foreground">Common mistake</div>
                          <div className="mt-1 text-2xl leading-snug">
                            <Katex
                              latex={(question as GraphPracticeQuestion).katexExplanation.commonMistake!.katex}
                              displayMode
                            />
                          </div>
                          <div className="text-base leading-relaxed text-foreground">
                            {(question as GraphPracticeQuestion).katexExplanation.commonMistake!.text}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(question as any).katexExplanation?.map((b: any, idx: number) =>
                        b.kind === 'text' ? (
                          <div
                            key={idx}
                            className={(question as any).topicId === 'word_problems' ? 'text-lg leading-relaxed text-foreground' : 'text-base leading-relaxed text-foreground'}
                          >
                            {b.content}
                          </div>
                        ) : b.kind === 'graph' ? (
                          <div key={idx} className="flex justify-center overflow-x-auto">
                            <InteractiveGraph spec={b.graphSpec} altText={b.altText} />
                          </div>
                        ) : (
                          <div key={idx} className={b.displayMode ? 'text-2xl leading-snug overflow-x-auto' : 'text-2xl leading-snug'}>
                            <Katex latex={b.content} displayMode={!!b.displayMode} />
                          </div>
                        )
                      )}
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
