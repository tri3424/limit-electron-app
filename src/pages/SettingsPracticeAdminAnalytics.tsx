import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { db } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Katex } from '@/components/Katex';
import InteractiveGraph from '@/components/InteractiveGraph';
import { PRACTICE_TOPICS } from '@/lib/practiceTopics';

function toDateKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function formatDateKey(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const [y, m, d] = date.split('-').map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

function topicTitle(topicId: string | undefined, mode: 'individual' | 'mixed'): string {
  const id = String(topicId ?? '').trim();
  if (!id) return '—';
  if (mode === 'mixed' && id === 'mixed') return 'Mixed Exercises';
  const hit = PRACTICE_TOPICS.find((t) => t.id === id);
  return hit?.title ?? id;
}

function looksLikeLatex(s: string): boolean {
  const v = String(s ?? '').trim();
  if (!v) return false;
  return /\\|\^|_|\{|\}|\$/.test(v);
}

function fmtTime(ts?: number): string {
  if (typeof ts !== 'number') return '—';
  return new Date(ts).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function fmtMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return `${Math.round(ms / 1000)}s`;
}

type DayRow = {
  date: string;
  total: number;
  correct: number;
  wrong: number;
  accuracy: number;
  avgTimeMs: number;
};

export default function SettingsPracticeAdminAnalytics() {
  const navigate = useNavigate();

  const users = useLiveQuery(() => db.users.toArray()) || [];
  const [userId, setUserId] = useState<string>(() => users?.[0]?.id ?? '');
  const [dateFilter, setDateFilter] = useState<string>('all');

  const events = useLiveQuery(async () => {
    if (!userId) return [];
    return db.practiceEvents.where('userId').equals(userId).toArray();
  }, [userId]) || [];

  const dayRows = useMemo(() => {
    const buckets = new Map<string, { total: number; correct: number; wrong: number; totalTimeMs: number }>();

    for (const e of events) {
      const usedTs = typeof e.submittedAt === 'number' ? e.submittedAt : e.shownAt;
      const date = toDateKey(usedTs);
      const b = buckets.get(date) ?? { total: 0, correct: 0, wrong: 0, totalTimeMs: 0 };
      b.total += 1;
      if (e.isCorrect === true) b.correct += 1;
      if (e.isCorrect === false) b.wrong += 1;
      const end = typeof e.submittedAt === 'number' ? e.submittedAt : typeof e.nextAt === 'number' ? e.nextAt : undefined;
      if (typeof end === 'number') b.totalTimeMs += Math.max(0, end - e.shownAt);
      buckets.set(date, b);
    }

    const out: DayRow[] = [];
    for (const [date, b] of buckets.entries()) {
      const accuracy = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0;
      const avgTimeMs = b.total > 0 ? Math.round(b.totalTimeMs / b.total) : 0;
      out.push({ date, total: b.total, correct: b.correct, wrong: b.wrong, accuracy, avgTimeMs });
    }
    out.sort((a, b) => (a.date < b.date ? 1 : -1));
    return out;
  }, [events]);

  const availableDates = useMemo(() => {
    const s = new Set<string>();
    for (const r of dayRows) s.add(r.date);
    return Array.from(s).sort((a, b) => (a < b ? 1 : -1));
  }, [dayRows]);

  const filteredTimeline = useMemo(() => {
    const out = [...events];
    out.sort((a, b) => (b.shownAt ?? 0) - (a.shownAt ?? 0));
    if (dateFilter === 'all') return out;
    return out.filter((e) => {
      const usedTs = typeof e.submittedAt === 'number' ? e.submittedAt : e.shownAt;
      return toDateKey(usedTs) === dateFilter;
    });
  }, [dateFilter, events]);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const selectedUser = useMemo(() => users.find((u) => u.id === userId) ?? null, [userId, users]);

  const detailSnapshot = useMemo(() => {
    if (!selected?.snapshotJson) return null;
    try {
      return JSON.parse(selected.snapshotJson);
    } catch {
      return null;
    }
  }, [selected]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/settings/practice-admin')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold text-foreground">Practice Analytics</h1>
          </div>
          <div className="text-muted-foreground mt-2">
            Daily performance and question timeline (newest first).
          </div>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <BarChart3 className="h-5 w-5 text-primary mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold">Filters</div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">User</div>
                <Select value={userId || ''} onValueChange={(v) => setUserId(v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Date</div>
                <Select value={dateFilter} onValueChange={(v) => setDateFilter(v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All dates</SelectItem>
                    {availableDates.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selectedUser ? (
              <div className="mt-3 text-xs text-muted-foreground">
                Viewing: <span className="font-semibold text-foreground">{selectedUser.username}</span>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4">
          <div className="text-sm font-semibold mb-3">Daily performance</div>
          <ScrollArea className="h-[45vh] rounded-md">
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead className="text-right w-[100px]">Total</TableHead>
                    <TableHead className="text-right w-[100px]">Correct</TableHead>
                    <TableHead className="text-right w-[100px]">Wrong</TableHead>
                    <TableHead className="text-right w-[120px]">Accuracy</TableHead>
                    <TableHead className="text-right w-[120px]">Avg time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dayRows.length ? (
                    dayRows.map((r) => (
                      <TableRow key={r.date}>
                        <TableCell className="text-sm font-medium">{formatDateKey(r.date)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.correct}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.wrong}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.accuracy}%</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMs(r.avgTimeMs)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                        No data.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold mb-3">Question timeline (newest first)</div>
          <ScrollArea className="h-[45vh] rounded-md">
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Shown</TableHead>
                    <TableHead className="w-[140px]">Mode</TableHead>
                    <TableHead>Topic</TableHead>
                    <TableHead className="w-[120px]">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTimeline.length ? (
                    filteredTimeline.map((e) => (
                      <TableRow
                        key={e.id}
                        className="cursor-pointer"
                        onClick={() => {
                          setSelected(e);
                          setOpen(true);
                        }}
                      >
                        <TableCell className="text-sm text-muted-foreground">{fmtTime(e.shownAt)}</TableCell>
                        <TableCell className="text-sm">{e.mode === 'mixed' ? 'Mixed Exercises' : 'Individual Topics'}</TableCell>
                        <TableCell className="text-sm">{topicTitle(e.topicId, e.mode)}</TableCell>
                        <TableCell className="text-xs">
                          {e.isCorrect === true ? 'Correct' : e.isCorrect === false ? 'Wrong' : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                        No timeline events.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Question details</DialogTitle>
          </DialogHeader>

          {selected ? (
            <ScrollArea className="h-[70vh] rounded-md">
              <div className="space-y-4 pr-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground">Shown</div>
                    <div className="text-sm font-medium">{fmtTime(selected.shownAt)}</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground">Submitted</div>
                    <div className="text-sm font-medium">{fmtTime(selected.submittedAt)}</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground">Next</div>
                    <div className="text-sm font-medium">{fmtTime(selected.nextAt)}</div>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground">Topic</div>
                    <div className="text-sm font-medium">{topicTitle(selected.topicId, selected.mode)}</div>
                    <div className="text-xs text-muted-foreground mt-1">Variant: {String(selected.variantId ?? '—')}</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground">Result</div>
                    <div className="text-sm font-medium">
                      {selected.isCorrect === true ? 'Correct' : selected.isCorrect === false ? 'Wrong' : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Mode: {selected.mode}</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground">Answer</div>
                    <div className="space-y-1">
                      <div className="text-sm font-medium break-words">{String(selected.userAnswer ?? '—')}</div>
                      {looksLikeLatex(String(selected.userAnswer ?? '')) ? (
                        <div className="text-lg leading-snug">
                          <Katex latex={String(selected.userAnswer ?? '')} displayMode />
                        </div>
                      ) : null}
                    </div>
                  </Card>
                </div>

                {detailSnapshot ? (
                  <Card className="p-4 space-y-3">
                    <div className="text-sm font-semibold">Question</div>
                    {detailSnapshot.promptKatex ? (
                      <div className="text-xl leading-snug">
                        <Katex latex={detailSnapshot.promptKatex} displayMode />
                      </div>
                    ) : null}
                    {detailSnapshot.katexQuestion ? (
                      <div className="text-xl leading-snug">
                        <Katex latex={detailSnapshot.katexQuestion} displayMode />
                      </div>
                    ) : null}

                    {detailSnapshot.graphSpec ? (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold">Graph</div>
                        {detailSnapshot.secondaryGraphSpec ? (
                          <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <InteractiveGraph spec={detailSnapshot.graphSpec} altText={String(detailSnapshot.svgAltText ?? 'Graph')} interactive={false} />
                            <InteractiveGraph spec={detailSnapshot.secondaryGraphSpec} altText={String(detailSnapshot.svgAltText ?? 'Graph')} interactive={false} />
                          </div>
                        ) : (
                          <div className="flex justify-center">
                            <InteractiveGraph spec={detailSnapshot.graphSpec} altText={String(detailSnapshot.svgAltText ?? 'Graph')} interactive={false} />
                          </div>
                        )}
                      </div>
                    ) : null}

                    {detailSnapshot.correctAnswerKatex ? (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold">Correct answer</div>
                        <div className="text-lg leading-snug">
                          <Katex latex={String(detailSnapshot.correctAnswerKatex)} displayMode />
                        </div>
                      </div>
                    ) : null}

                    {Array.isArray(detailSnapshot.katexExplanation) ? (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold">Explanation</div>
                        {detailSnapshot.katexExplanation.map((b: any, idx: number) =>
                          b?.kind === 'text' ? (
                            <div key={idx} className="text-sm text-foreground">{String(b.content ?? '')}</div>
                          ) : b?.kind === 'math' ? (
                            <div key={idx} className="text-lg leading-snug">
                              <Katex latex={String(b.content ?? '')} displayMode={!!b.displayMode} />
                            </div>
                          ) : b?.kind === 'graph' && b?.graphSpec ? (
                            <div key={idx} className="space-y-2">
                              <div className="text-xs text-muted-foreground">{String(b.altText ?? 'Graph')}</div>
                              <div className="flex justify-center">
                                <InteractiveGraph spec={b.graphSpec} altText={String(b.altText ?? 'Graph')} interactive={false} />
                              </div>
                            </div>
                          ) : (
                            <div key={idx} className="text-xs text-muted-foreground">{String(b?.kind ?? '')}</div>
                          )
                        )}
                      </div>
                    ) : detailSnapshot.katexExplanation?.steps ? (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold">Explanation</div>
                        {detailSnapshot.katexExplanation.steps.map((s: any, idx: number) => (
                          <div key={idx} className="space-y-1">
                            <div className="text-lg leading-snug">
                              <Katex latex={String(s.katex ?? '')} displayMode />
                            </div>
                            <div className="text-sm text-foreground">{String(s.text ?? '')}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </Card>
                ) : (
                  <Card className="p-4">
                    <div className="text-sm text-muted-foreground">No snapshot available.</div>
                  </Card>
                )}
              </div>
            </ScrollArea>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
