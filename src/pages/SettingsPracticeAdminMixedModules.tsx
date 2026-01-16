import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Layers } from 'lucide-react';
import { db, AppSettings, initializeSettings } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PRACTICE_TOPICS } from '@/lib/practiceTopics';
import type { PracticeTopicId } from '@/lib/practiceTopics';
import type { PracticeDifficulty } from '@/lib/practiceGenerators/quadraticFactorization';

export default function SettingsPracticeAdminMixedModules() {
  const navigate = useNavigate();

  const settings = useLiveQuery(() => db.settings.get('1'), [], null as any);
  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null);

  const [mixedModuleDialogOpen, setMixedModuleDialogOpen] = useState(false);
  const [editingMixedModuleId, setEditingMixedModuleId] = useState<string | null>(null);
  const [mixedModuleTitle, setMixedModuleTitle] = useState('');
  const [mixedModuleItems, setMixedModuleItems] = useState<Array<{ topicId: PracticeTopicId; difficulty: PracticeDifficulty }>>([]);
  const [mixedModuleScheduleEnabled, setMixedModuleScheduleEnabled] = useState(false);
  const [mixedModuleOpensAt, setMixedModuleOpensAt] = useState('');
  const [mixedModuleClosesAt, setMixedModuleClosesAt] = useState('');

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
              setMixedModuleItems([]);
              setMixedModuleScheduleEnabled(false);
              setMixedModuleOpensAt('');
              setMixedModuleClosesAt('');
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
                            const open = now >= m.schedule.opensAt && now <= m.schedule.closesAt;
                            return open ? 'Scheduled: Open' : 'Scheduled: Closed';
                          })()
                        : 'Always open'}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {(m.items ?? []).map((it: any, idx: number) => {
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
                        setMixedModuleItems((m.items ?? []).map((x: any) => ({ topicId: x.topicId, difficulty: x.difficulty })));
                        setMixedModuleScheduleEnabled(!!m.schedule?.enabled);
                        setMixedModuleOpensAt(m.schedule?.opensAt ? new Date(m.schedule.opensAt).toISOString().slice(0, 16) : '');
                        setMixedModuleClosesAt(m.schedule?.closesAt ? new Date(m.schedule.closesAt).toISOString().slice(0, 16) : '');
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
              setMixedModuleItems([]);
              setMixedModuleScheduleEnabled(false);
              setMixedModuleOpensAt('');
              setMixedModuleClosesAt('');
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingMixedModuleId ? 'Edit Mixed Practice Module' : 'Add Mixed Practice Module'}</DialogTitle>
              <DialogDescription>Add one or more topic rows. Each row chooses a topic and a difficulty.</DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Title</Label>
                <Input value={mixedModuleTitle} onChange={(e) => setMixedModuleTitle(e.target.value)} placeholder="e.g. Mixed revision set" />
              </div>

              <div className="rounded-md border bg-muted/10 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Scheduling</Label>
                    <div className="text-xs text-muted-foreground mt-1">Optional. If enabled, the module is only open within the time window.</div>
                  </div>
                  <Switch checked={mixedModuleScheduleEnabled} onCheckedChange={setMixedModuleScheduleEnabled} />
                </div>

                {mixedModuleScheduleEnabled ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Opens at</Label>
                      <Input type="datetime-local" value={mixedModuleOpensAt} onChange={(e) => setMixedModuleOpensAt(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Closes at</Label>
                      <Input type="datetime-local" value={mixedModuleClosesAt} onChange={(e) => setMixedModuleClosesAt(e.target.value)} />
                    </div>
                  </div>
                ) : null}
              </div>

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
                              setMixedModuleItems((prev) => prev.map((x, i) => (i === idx ? { ...x, topicId: v as PracticeTopicId } : x)))
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
                              setMixedModuleItems((prev) => prev.map((x, i) => (i === idx ? { ...x, difficulty: v as PracticeDifficulty } : x)))
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
            </div>

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
                  if (mixedModuleItems.length === 0) {
                    toast.error('Add at least one item');
                    return;
                  }

                  let schedule: { enabled: boolean; opensAt: number; closesAt: number } | undefined;
                  if (mixedModuleScheduleEnabled) {
                    const opensAt = mixedModuleOpensAt ? new Date(mixedModuleOpensAt).getTime() : NaN;
                    const closesAt = mixedModuleClosesAt ? new Date(mixedModuleClosesAt).getTime() : NaN;
                    if (!Number.isFinite(opensAt) || !Number.isFinite(closesAt)) {
                      toast.error('Provide both opens and closes time');
                      return;
                    }
                    if (closesAt <= opensAt) {
                      toast.error('Closes at must be after opens at');
                      return;
                    }
                    schedule = { enabled: true, opensAt, closesAt };
                  }

                  const now = Date.now();
                  const existing = localSettings.mixedPracticeModules ?? [];
                  const id = editingMixedModuleId ?? uuidv4();
                  const prev = (existing as any[]).find((x) => x.id === id);
                  const nextItem = {
                    id,
                    title,
                    items: mixedModuleItems,
                    schedule,
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
