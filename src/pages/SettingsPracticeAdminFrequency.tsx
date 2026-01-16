import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Sliders, ArrowLeft } from 'lucide-react';
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

        if (t.id === 'differentiation') {
          return {
            ...base,
            variants: [
              { key: 'basic_polynomial', label: 'Basic derivative', defaultValue: 70 },
              { key: 'stationary_points', label: 'Stationary points (double derivation)', defaultValue: 30 },
            ],
          };
        }

        if (t.id === 'word_problems') {
          return {
            ...base,
            variants: [
              { key: 'probability_complement', label: 'Probability (complement)', defaultValue: 1 },
              { key: 'probability_two_bags_blue', label: 'Probability (two bags)', defaultValue: 1 },
              { key: 'unit_conversion_speed', label: 'Unit conversion (speed)', defaultValue: 1 },
              { key: 'number_skills_mix', label: 'Number skills', defaultValue: 1 },
              { key: 'mensuration_cuboid_height', label: 'Mensuration (cuboid)', defaultValue: 1 },
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/settings/practice-admin')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold text-foreground">Frequency Controls</h1>
          </div>
          <p className="text-muted-foreground mt-2">
            Control how frequently variants appear for a specific user.
          </p>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Sliders className="h-5 w-5 text-primary mt-0.5" />
          <div className="min-w-0">
            <div className="text-lg font-semibold">Configuration</div>
            <div className="text-sm text-muted-foreground mt-1">
              These settings apply to the selected user key.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
        </div>

        <div className="space-y-1">
          <Label>Search topics</Label>
          <Input value={freqTopicSearch} onChange={(e) => setFreqTopicSearch(e.target.value)} placeholder="Search…" />
        </div>

        <Accordion type="single" collapsible>
          {filtered.map((t) => (
            <AccordionItem key={t.topicId} value={t.topicId}>
              <AccordionTrigger>{t.label}</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  {t.variants.map((v) => {
                    const k = `${t.topicId}:${v.key}`;
                    const persisted = Number((tvw as any)?.[t.topicId]?.[v.key] ?? v.defaultValue);
                    const current = typeof freqDraftWeights[k] === 'number' ? freqDraftWeights[k]! : persisted;
                    return (
                      <div key={v.key} className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm text-foreground">{v.label}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">{Math.round(current)}</div>
                        </div>
                        <Slider
                          value={[current]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={(vals) => {
                            const nextVal = Array.isArray(vals) ? Number(vals[0] ?? 0) : 0;
                            setFreqDraftWeights((m) => ({ ...m, [k]: nextVal }));
                          }}
                          onValueCommit={(vals) => {
                            const nextVal = Array.isArray(vals) ? Number(vals[0] ?? 0) : 0;
                            setFreqDraftWeights((m) => {
                              const next = { ...m };
                              delete next[k];
                              return next;
                            });
                            void setVariantWeight(t.topicId, v.key, nextVal);
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
                              <div key={idx} className="space-y-2">
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
