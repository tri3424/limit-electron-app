import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Layers, Info, X } from 'lucide-react';
import { db, AppSettings, initializeSettings } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { PRACTICE_TOPICS } from '@/lib/practiceTopics';
import type { PracticeTopicId } from '@/lib/practiceTopics';
import type { PracticeDifficulty } from '@/lib/practiceGenerators/quadraticFactorization';

export default function SettingsPracticeAdminMixedModules() {
  const navigate = useNavigate();

  const settings = useLiveQuery(() => db.settings.get('1'), [], null as any);
  const users = useLiveQuery(() => db.users.toArray()) || [];
  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null);

  const [mixedModuleDialogOpen, setMixedModuleDialogOpen] = useState(false);
  const [editingMixedModuleId, setEditingMixedModuleId] = useState<string | null>(null);
  const [mixedModuleTitle, setMixedModuleTitle] = useState('');
  const [mixedModuleType, setMixedModuleType] = useState<'items' | 'pool'>('items');
  const [mixedModuleItems, setMixedModuleItems] = useState<Array<{ topicId: PracticeTopicId; difficulty: PracticeDifficulty }>>([]);
  const [mixedModulePool, setMixedModulePool] = useState<
    Array<{
      topicId: PracticeTopicId;
      weight: number;
      difficultyMode: 'fixed' | 'mix' | 'auto';
      difficulty?: PracticeDifficulty;
      difficultyWeights?: Partial<Record<PracticeDifficulty, number>>;
    }>
  >([]);
  const [mixedModuleScheduleEnabled, setMixedModuleScheduleEnabled] = useState(false);
  const [mixedModuleDaysOfWeek, setMixedModuleDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [mixedModuleOpensTime, setMixedModuleOpensTime] = useState('18:00');
  const [mixedModuleClosesTime, setMixedModuleClosesTime] = useState('20:00');
  const [mixedModuleAssignedUserIds, setMixedModuleAssignedUserIds] = useState<string[]>([]);
  const [poolInfoOpen, setPoolInfoOpen] = useState(false);

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (settings === undefined) return;
    if (!settings) void initializeSettings();
  }, [settings]);

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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/settings/practice-admin')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold text-foreground">Mixed Exercises Modules</h1>
          </div>
          <p className="text-muted-foreground mt-2">
            Create mixed practice modules by selecting topics and difficulty levels.
          </p>
        </div>
        <div className="shrink-0">
          <Button
            onClick={() => {
              setEditingMixedModuleId(null);
              setMixedModuleTitle('');
              setMixedModuleType('items');
              setMixedModuleItems([]);
              setMixedModulePool([]);
              setMixedModuleScheduleEnabled(false);
              setMixedModuleDaysOfWeek([1, 2, 3, 4, 5]);
              setMixedModuleOpensTime('18:00');
              setMixedModuleClosesTime('20:00');
              setMixedModuleAssignedUserIds([]);
              setMixedModuleDialogOpen(true);
            }}
          >
            Add module
          </Button>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Layers className="h-5 w-5 text-primary mt-0.5" />
          <div className="min-w-0">
            <div className="text-lg font-semibold">Modules</div>
            <div className="text-sm text-muted-foreground mt-1">
              Mixed modules appear in Practice under the Mixed mode.
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {(localSettings.mixedPracticeModules ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No mixed modules yet.</div>
          ) : (
            <div className="space-y-2">
              {(localSettings.mixedPracticeModules ?? []).map((m: any) => (
                <div key={m.id} className="flex items-start justify-between gap-3 rounded-md border bg-background p-3">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{m.title || 'Untitled mixed module'}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {m.schedule?.enabled
                        ? (() => {
                            const now = Date.now();
                            const sched: any = m.schedule;
                            const open =
                              (typeof sched.opensAt === 'number' && typeof sched.closesAt === 'number')
                                ? (now >= sched.opensAt && now <= sched.closesAt)
                                : 'daysOfWeek' in sched
                                  ? true
                                  : true;
                            return open ? 'Scheduled: Open' : 'Scheduled: Closed';
                          })()
                        : 'Always open'}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {(m.assignedUserIds ?? []).length ? `Assigned users: ${(m.assignedUserIds ?? []).length}` : 'Assigned users: none'}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {String(m.type ?? 'items') === 'pool'
                        ? (m.pool ?? []).map((p: any, idx: number) => {
                            const topic = PRACTICE_TOPICS.find((t) => t.id === p.topicId);
                            const label = topic ? topic.title : p.topicId;
                            const mode = String(p.difficultyMode ?? 'fixed');
                            const diffLabel =
                              mode === 'fixed'
                                ? String(p.difficulty ?? 'easy')
                                : mode === 'mix'
                                  ? 'mix'
                                  : 'auto';
                            return (
                              <span key={`${m.id}-pool-${idx}`}>
                                {idx > 0 ? ' · ' : ''}
                                {label} (w:{Number(p.weight ?? 0)} / {diffLabel})
                              </span>
                            );
                          })
                        : (m.items ?? []).map((it: any, idx: number) => {
                            const topic = PRACTICE_TOPICS.find((t) => t.id === it.topicId);
                            const label = topic ? topic.title : it.topicId;
                            return (
                              <span key={`${m.id}-${idx}`}>
                                {idx > 0 ? ' · ' : ''}
                                {label} ({it.difficulty})
                              </span>
                            );
                          })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingMixedModuleId(m.id);
                        setMixedModuleTitle(m.title || '');
                        setMixedModuleType(String(m.type ?? 'items') === 'pool' ? 'pool' : 'items');
                        setMixedModuleItems((m.items ?? []).map((x: any) => ({ topicId: x.topicId, difficulty: x.difficulty })));
                        setMixedModulePool(
                          (m.pool ?? []).map((p: any) => ({
                            topicId: p.topicId,
                            weight: Number(p.weight ?? 0),
                            difficultyMode: (p.difficultyMode ?? 'fixed') as any,
                            difficulty: p.difficulty as any,
                            difficultyWeights: p.difficultyWeights as any,
                          }))
                        );
                        setMixedModuleScheduleEnabled(!!m.schedule?.enabled);

                        const sched: any = m.schedule ?? null;
                        if (sched?.enabled) {
                          if (Array.isArray(sched.daysOfWeek) && typeof sched.opensTime === 'string' && typeof sched.closesTime === 'string') {
                            setMixedModuleDaysOfWeek(sched.daysOfWeek as number[]);
                            setMixedModuleOpensTime(String(sched.opensTime));
                            setMixedModuleClosesTime(String(sched.closesTime));
                          } else if (typeof sched.opensAt === 'number' && typeof sched.closesAt === 'number') {
                            const o = new Date(sched.opensAt);
                            const c = new Date(sched.closesAt);
                            const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                            setMixedModuleDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
                            setMixedModuleOpensTime(hhmm(o));
                            setMixedModuleClosesTime(hhmm(c));
                          } else {
                            setMixedModuleDaysOfWeek([1, 2, 3, 4, 5]);
                            setMixedModuleOpensTime('18:00');
                            setMixedModuleClosesTime('20:00');
                          }
                        } else {
                          setMixedModuleDaysOfWeek([1, 2, 3, 4, 5]);
                          setMixedModuleOpensTime('18:00');
                          setMixedModuleClosesTime('20:00');
                        }

                        setMixedModuleAssignedUserIds(Array.isArray(m.assignedUserIds) ? (m.assignedUserIds as string[]) : []);
                        setMixedModuleDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        const next = (localSettings.mixedPracticeModules ?? []).filter((x: any) => x.id !== m.id);
                        await handleUpdateSettings({ mixedPracticeModules: next });
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Dialog
          open={mixedModuleDialogOpen}
          onOpenChange={(open) => {
            setMixedModuleDialogOpen(open);
            if (!open) {
              setEditingMixedModuleId(null);
              setMixedModuleTitle('');
              setMixedModuleType('items');
              setMixedModuleItems([]);
              setMixedModulePool([]);
              setMixedModuleScheduleEnabled(false);
              setMixedModuleDaysOfWeek([1, 2, 3, 4, 5]);
              setMixedModuleOpensTime('18:00');
              setMixedModuleClosesTime('20:00');
              setMixedModuleAssignedUserIds([]);
              setPoolInfoOpen(false);
            }
          }}
        >
          <DialogContent className="w-[96vw] max-w-5xl lg:max-w-6xl">
            <DialogHeader>
              <DialogTitle>{editingMixedModuleId ? 'Edit Mixed Practice Module' : 'Add Mixed Practice Module'}</DialogTitle>
              <DialogDescription>
                Create a mixed practice module by selecting topics and difficulty settings.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[70vh] overflow-auto pr-1 space-y-4">
              <div className="rounded-md border bg-muted/10 p-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Title</Label>
                    <Input
                      value={mixedModuleTitle}
                      onChange={(e) => setMixedModuleTitle(e.target.value)}
                      placeholder="e.g. Mixed revision set"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Type</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPoolInfoOpen(true)}
                        className="h-8 px-2"
                      >
                        <Info className="h-4 w-4 mr-2" />
                        What is Pool?
                      </Button>
                    </div>
                    <Select value={mixedModuleType} onValueChange={(v) => setMixedModuleType(v as any)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="items">Items (fixed list)</SelectItem>
                        <SelectItem value="pool">Pool (frequency weights)</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-muted-foreground">
                      Choose <strong>Items</strong> when you want an exact fixed set. Choose <strong>Pool</strong> when you want the app to pick topics more often based on weights.
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-md border bg-muted/10 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Scheduling</Label>
                    <div className="text-xs text-muted-foreground mt-1">Optional. If enabled, the module is open only on selected days within the time window.</div>
                  </div>
                  <Switch checked={mixedModuleScheduleEnabled} onCheckedChange={setMixedModuleScheduleEnabled} />
                </div>

                {mixedModuleScheduleEnabled ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Days</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {dayLabels.map((label, idx) => {
                          const checked = mixedModuleDaysOfWeek.includes(idx);
                          return (
                            <label key={label} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  const nextChecked = v === true;
                                  setMixedModuleDaysOfWeek((prev) => {
                                    const set = new Set(prev);
                                    if (nextChecked) set.add(idx);
                                    else set.delete(idx);
                                    return Array.from(set).sort((a, b) => a - b);
                                  });
                                }}
                              />
                              <span>{label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Opens time</Label>
                        <Input type="time" value={mixedModuleOpensTime} onChange={(e) => setMixedModuleOpensTime(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Closes time</Label>
                        <Input type="time" value={mixedModuleClosesTime} onChange={(e) => setMixedModuleClosesTime(e.target.value)} />
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      If close time is earlier than open time, it will be treated as crossing midnight.
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-md border bg-muted/10 p-3 space-y-3">
                <div>
                  <Label>Assign users</Label>
                  <div className="text-xs text-muted-foreground mt-1">
                    Only assigned users will see this module in Mixed mode.
                  </div>
                </div>
                {users.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-auto pr-1">
                    {users.map((u) => {
                      const checked = mixedModuleAssignedUserIds.includes(u.id);
                      return (
                        <label key={u.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const nextChecked = v === true;
                              setMixedModuleAssignedUserIds((prev) => {
                                const set = new Set(prev);
                                if (nextChecked) set.add(u.id);
                                else set.delete(u.id);
                                return Array.from(set);
                              });
                            }}
                          />
                          <span className="truncate">{u.username}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No users found.</div>
                )}
              </div>

              {mixedModuleType === 'items' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Items</Label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const firstTopic = PRACTICE_TOPICS[0]?.id as PracticeTopicId | undefined;
                        if (!firstTopic) return;
                        setMixedModuleItems((prev) => [...prev, { topicId: firstTopic, difficulty: 'easy' }]);
                      }}
                    >
                      Add item
                    </Button>
                  </div>

                  {mixedModuleItems.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Add at least one item.</div>
                  ) : (
                    <div className="space-y-2">
                      {mixedModuleItems.map((it, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center rounded-md border bg-muted/10 p-2">
                          <div className="col-span-6">
                            <Select
                              value={it.topicId}
                              onValueChange={(v) =>
                                setMixedModuleItems((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, topicId: v as PracticeTopicId } : x))
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PRACTICE_TOPICS.map((t) => (
                                  <SelectItem key={t.id} value={t.id}>
                                    {t.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-4">
                            <Select
                              value={it.difficulty}
                              onValueChange={(v) =>
                                setMixedModuleItems((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, difficulty: v as PracticeDifficulty } : x))
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="easy">Easy</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="hard">Hard</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2 flex justify-end">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => setMixedModuleItems((prev) => prev.filter((_, i) => i !== idx))}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Pool</Label>
                      <div className="text-xs text-muted-foreground mt-1">
                        Add topics with weights. Higher weight = selected more often.
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const firstTopic = PRACTICE_TOPICS[0]?.id as PracticeTopicId | undefined;
                        if (!firstTopic) return;
                        setMixedModulePool((prev) => [
                          ...prev,
                          {
                            topicId: firstTopic,
                            weight: 10,
                            difficultyMode: 'auto',
                            difficulty: 'easy',
                            difficultyWeights: { easy: 60, medium: 30, hard: 10 },
                          },
                        ]);
                      }}
                    >
                      Add topic
                    </Button>
                  </div>

                  {mixedModulePool.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Add at least one topic to the pool.</div>
                  ) : (
                    <div className="space-y-2">
                      {mixedModulePool.map((p, idx) => (
                        <div key={idx} className="rounded-md border bg-muted/10 p-3 space-y-2">
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                            <div className="md:col-span-6">
                              <div className="space-y-1">
                                <Label>Topic</Label>
                                <Select
                                  value={p.topicId}
                                  onValueChange={(v) =>
                                    setMixedModulePool((prev) =>
                                      prev.map((x, i) => (i === idx ? { ...x, topicId: v as PracticeTopicId } : x))
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PRACTICE_TOPICS.map((t) => (
                                      <SelectItem key={t.id} value={t.id}>
                                        {t.title}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="md:col-span-2">
                              <div className="space-y-1">
                                <Label>Weight</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step={1}
                                  className="h-9"
                                  value={String(p.weight)}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const w = raw === '' ? 0 : Number(raw);
                                    setMixedModulePool((prev) => prev.map((x, i) => (i === idx ? { ...x, weight: w } : x)));
                                  }}
                                  inputMode="numeric"
                                />
                              </div>
                            </div>

                            <div className="md:col-span-3">
                              <div className="space-y-1">
                                <Label>Difficulty</Label>
                                <Select
                                  value={p.difficultyMode}
                                  onValueChange={(v) =>
                                    setMixedModulePool((prev) =>
                                      prev.map((x, i) => (i === idx ? { ...x, difficultyMode: v as any } : x))
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="auto">Auto</SelectItem>
                                    <SelectItem value="fixed">Fixed</SelectItem>
                                    <SelectItem value="mix">Mix</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="md:col-span-1 flex justify-end">
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => setMixedModulePool((prev) => prev.filter((_, i) => i !== idx))}
                                aria-label="Remove topic"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {p.difficultyMode === 'fixed' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <Label>Fixed difficulty</Label>
                                <Select
                                  value={p.difficulty ?? 'easy'}
                                  onValueChange={(v) =>
                                    setMixedModulePool((prev) =>
                                      prev.map((x, i) => (i === idx ? { ...x, difficulty: v as PracticeDifficulty } : x))
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="easy">Easy</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="hard">Hard</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          ) : null}

                          {p.difficultyMode === 'mix' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {(['easy', 'medium', 'hard'] as PracticeDifficulty[]).map((d) => (
                                <div key={d} className="space-y-1">
                                  <Label>{d}</Label>
                                  <Input
                                    value={String(Number((p.difficultyWeights as any)?.[d] ?? 0))}
                                    onChange={(e) => {
                                      const v = Number(e.target.value);
                                      setMixedModulePool((prev) =>
                                        prev.map((x, i) => {
                                          if (i !== idx) return x;
                                          const dw = { ...(x.difficultyWeights ?? {}) } as any;
                                          dw[d] = v;
                                          return { ...x, difficultyWeights: dw };
                                        })
                                      );
                                    }}
                                    inputMode="numeric"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Dialog open={poolInfoOpen} onOpenChange={setPoolInfoOpen}>
              <DialogContent className="w-[96vw] max-w-2xl">
                <DialogHeader>
                  <DialogTitle>What is the Pool type?</DialogTitle>
                  <DialogDescription>
                    A simple guide to help you choose the right type.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-sm">
                  <div className="rounded-md border bg-muted/10 p-3 space-y-2">
                    <div className="font-medium text-foreground">In one line</div>
                    <div className="text-muted-foreground">
                      <strong>Pool</strong> means the app will pick questions from different topics more often based on the <strong>weight</strong> you set.
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-md border p-3 space-y-2">
                      <div className="font-medium text-foreground">Items (fixed list)</div>
                      <div className="text-muted-foreground">
                        Use this when you want an exact list: “Always practice these topics at these difficulties.”
                      </div>
                    </div>
                    <div className="rounded-md border p-3 space-y-2">
                      <div className="font-medium text-foreground">Pool (frequency weights)</div>
                      <div className="text-muted-foreground">
                        Use this when you want a flexible mix: “Practice these topics, but some more than others.”
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md border p-3 space-y-2">
                    <div className="font-medium text-foreground">How weight works</div>
                    <div className="text-muted-foreground">
                      If Topic A has weight 10 and Topic B has weight 5, Topic A will be chosen about twice as often as Topic B.
                    </div>
                  </div>
                  <div className="rounded-md border p-3 space-y-2">
                    <div className="font-medium text-foreground">Difficulty modes (inside Pool)</div>
                    <div className="text-muted-foreground">
                      <div><strong>Auto</strong>: app adjusts difficulty over time.</div>
                      <div><strong>Fixed</strong>: always use one difficulty.</div>
                      <div><strong>Mix</strong>: use your easy/medium/hard percentages.</div>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" onClick={() => setPoolInfoOpen(false)}>Got it</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMixedModuleDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  const title = mixedModuleTitle.trim();
                  if (!title) {
                    toast.error('Title is required');
                    return;
                  }
                  if (mixedModuleType === 'items' && mixedModuleItems.length === 0) {
                    toast.error('Add at least one item');
                    return;
                  }
                  if (mixedModuleType === 'pool' && mixedModulePool.length === 0) {
                    toast.error('Add at least one topic');
                    return;
                  }

                  if (mixedModuleAssignedUserIds.length === 0) {
                    toast.error('Assign at least one user');
                    return;
                  }

                  let schedule:
                    | {
                        enabled: boolean;
                        opensAt?: number;
                        closesAt?: number;
                        daysOfWeek?: number[];
                        opensTime?: string;
                        closesTime?: string;
                      }
                    | undefined;
                  if (mixedModuleScheduleEnabled) {
                    if (!Array.isArray(mixedModuleDaysOfWeek) || mixedModuleDaysOfWeek.length === 0) {
                      toast.error('Select at least one day');
                      return;
                    }
                    if (!/^\d{2}:\d{2}$/.test(mixedModuleOpensTime) || !/^\d{2}:\d{2}$/.test(mixedModuleClosesTime)) {
                      toast.error('Provide opens and closes time');
                      return;
                    }
                    schedule = {
                      enabled: true,
                      daysOfWeek: mixedModuleDaysOfWeek,
                      opensTime: mixedModuleOpensTime,
                      closesTime: mixedModuleClosesTime,
                    };
                  }

                  const now = Date.now();
                  const existing = localSettings.mixedPracticeModules ?? [];
                  const id = editingMixedModuleId ?? uuidv4();
                  const prev = (existing as any[]).find((x) => x.id === id);
                  const nextItem = mixedModuleType === 'pool'
                    ? {
                        id,
                        title,
                        type: 'pool' as const,
                        pool: mixedModulePool.map((p) => ({
                          topicId: p.topicId,
                          weight: Number(p.weight ?? 0),
                          difficultyMode: p.difficultyMode,
                          difficulty: p.difficulty,
                          difficultyWeights: p.difficultyWeights,
                        })),
                        schedule,
                        assignedUserIds: mixedModuleAssignedUserIds,
                        createdAt: prev?.createdAt ?? now,
                        updatedAt: now,
                      }
                    : {
                        id,
                        title,
                        type: 'items' as const,
                        items: mixedModuleItems,
                        schedule,
                        assignedUserIds: mixedModuleAssignedUserIds,
                        createdAt: prev?.createdAt ?? now,
                        updatedAt: now,
                      };
                  const next = prev ? (existing as any[]).map((x) => (x.id === id ? nextItem : x)) : [nextItem, ...(existing as any[])];
                  await handleUpdateSettings({ mixedPracticeModules: next });
                  setMixedModuleDialogOpen(false);
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}
