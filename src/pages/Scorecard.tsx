import { useCallback, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PRACTICE_TOPICS } from '@/lib/practiceTopics';
import { Katex } from '@/components/Katex';

type Row = {
  date: string;
  mode: 'individual' | 'mixed';
  topicId: string;
  total: number;
  correct: number;
  wrong: number;
  accuracy: number;
  avgTimeMs: number;
};

function toDateKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function formatDateKey(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const [y, m, d] = date.split('-').map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

function topicTitle(topicId: string, mode: 'individual' | 'mixed'): string {
  if (!topicId) return '—';
  if (mode === 'mixed' && topicId === 'mixed') return 'Mixed Exercises';
  const hit = PRACTICE_TOPICS.find((t) => t.id === topicId);
  return hit?.title ?? topicId;
}

function fmtMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return `${Math.round(ms / 1000)}s`;
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

export default function Scorecard() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const [modeFilter, setModeFilter] = useState<'all' | 'individual' | 'mixed'>('all');

  const events = useLiveQuery(async () => {
    if (!user?.id) return [];
    if (isAdmin) return db.practiceEvents.toArray();
    return db.practiceEvents.where('userId').equals(user.id).toArray();
  }, [isAdmin, user?.id]) || [];

  const timeline = useMemo(() => {
    const out = [...events];
    out.sort((a: any, b: any) => (Number(b.shownAt ?? 0) - Number(a.shownAt ?? 0)));
    return out;
  }, [events]);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const detailSnapshot = useMemo(() => {
    if (!selected?.snapshotJson) return null;
    try {
      return JSON.parse(selected.snapshotJson);
    } catch {
      return null;
    }
  }, [selected?.snapshotJson]);

  const renderPromptBlocks = useCallback((blocks: any[]) => {
    if (!Array.isArray(blocks) || !blocks.length) return null;
    return (
      <div className="font-slab text-xl leading-relaxed whitespace-normal break-words">
        {blocks.map((b: any, i: number) => {
          if (b?.kind === 'text' && String(b?.content ?? '') === '\n') {
            return <br key={`br-${i}`} />;
          }
          if (b?.kind === 'math') {
            return (
              <span key={`m-${i}`} className="inline-block align-baseline mx-1">
                <Katex latex={String(b.content ?? '')} displayMode={false} />
              </span>
            );
          }
          return <span key={`t-${i}`}>{String(b?.content ?? '')}</span>;
        })}
      </div>
    );
  }, []);

  const rows = useMemo(() => {
    const buckets = new Map<string, { date: string; mode: 'individual' | 'mixed'; topicId: string; total: number; correct: number; wrong: number; totalTimeMs: number }>();

    for (const e of events) {
      const usedTs = typeof e.submittedAt === 'number' ? e.submittedAt : e.shownAt;
      const date = toDateKey(usedTs);
      const mode = e.mode;
      if (modeFilter !== 'all' && mode !== modeFilter) continue;
      const topicId = String(e.topicId ?? (mode === 'mixed' ? 'mixed' : 'unknown'));

      const key = `${date}::${mode}::${topicId}`;
      const cur = buckets.get(key) ?? { date, mode, topicId, total: 0, correct: 0, wrong: 0, totalTimeMs: 0 };
      cur.total += 1;
      if (e.isCorrect === true) cur.correct += 1;
      if (e.isCorrect === false) cur.wrong += 1;
      const end = typeof e.submittedAt === 'number' ? e.submittedAt : typeof e.nextAt === 'number' ? e.nextAt : undefined;
      if (typeof end === 'number' && typeof e.shownAt === 'number') {
        const dt = Math.max(0, end - e.shownAt);
        cur.totalTimeMs += dt;
      }
      buckets.set(key, cur);
    }

    const out: Row[] = [];
    for (const b of buckets.values()) {
      const accuracy = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0;
      const avgTimeMs = b.total > 0 ? Math.round(b.totalTimeMs / b.total) : 0;
      out.push({
        date: b.date,
        mode: b.mode,
        topicId: b.topicId,
        total: b.total,
        correct: b.correct,
        wrong: b.wrong,
        accuracy,
        avgTimeMs,
      });
    }

    out.sort((a, b) => (a.date === b.date ? (a.topicId < b.topicId ? -1 : 1) : a.date < b.date ? 1 : -1));
    return out;
  }, [events, modeFilter]);

  const totals = useMemo(() => {
    const total = rows.reduce((acc, r) => acc + r.total, 0);
    const correct = rows.reduce((acc, r) => acc + r.correct, 0);
    const wrong = rows.reduce((acc, r) => acc + r.wrong, 0);
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const totalTimeMs = rows.reduce((acc, r) => acc + r.avgTimeMs * r.total, 0);
    const avgTimeMs = total > 0 ? Math.round(totalTimeMs / total) : 0;
    return { total, correct, wrong, accuracy, avgTimeMs };
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/practice')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold text-foreground">SCORECARD</h1>
          </div>
          <div className="text-muted-foreground mt-2">
            Total questions: <span className="font-semibold text-foreground">{totals.total}</span> · Accuracy:{' '}
            <span className="font-semibold text-foreground">{totals.accuracy}%</span> · Avg time:{' '}
            <span className="font-semibold text-foreground">{fmtMs(totals.avgTimeMs)}</span>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Select value={modeFilter} onValueChange={(v) => setModeFilter(v as any)}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modes</SelectItem>
              <SelectItem value="individual">Individual topics</SelectItem>
              <SelectItem value="mixed">Mixed exercises</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="p-4">
        <ScrollArea className="h-[65vh] rounded-md">
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Date</TableHead>
                  <TableHead className="w-[130px]">Mode</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead className="text-right w-[120px]">Total</TableHead>
                  <TableHead className="text-right w-[120px]">Correct</TableHead>
                  <TableHead className="text-right w-[120px]">Wrong</TableHead>
                  <TableHead className="text-right w-[120px]">Accuracy</TableHead>
                  <TableHead className="text-right w-[140px]">Avg time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map((r) => (
                    <TableRow key={`${r.date}-${r.mode}-${r.topicId}`}>
                      <TableCell className="text-sm font-medium">{formatDateKey(r.date)}</TableCell>
                      <TableCell className="text-sm">{r.mode === 'mixed' ? 'Mixed Exercises' : 'Individual Topics'}</TableCell>
                      <TableCell className="text-sm">{topicTitle(r.topicId, r.mode)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.correct}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.wrong}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.accuracy}%</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMs(r.avgTimeMs)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                      No practice activity yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      </Card>

      {isAdmin ? (
        <Card className="p-4">
          <div className="text-sm font-semibold mb-3">Recent questions (newest first)</div>
          <ScrollArea className="h-[45vh] rounded-md">
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[190px]">Time</TableHead>
                    <TableHead className="w-[180px]">User</TableHead>
                    <TableHead>Topic</TableHead>
                    <TableHead className="w-[170px]">Variant</TableHead>
                    <TableHead className="text-right w-[110px]">Result</TableHead>
                    <TableHead className="text-right w-[120px]">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timeline.length ? (
                    timeline.map((e: any) => (
                      <TableRow key={String(e.id)}>
                        <TableCell className="text-sm font-medium">{fmtTime(e.submittedAt ?? e.shownAt)}</TableCell>
                        <TableCell className="text-sm">
                          <span className="font-medium">{String(e.username ?? '—')}</span>
                          <span className="text-muted-foreground">{e.userId ? ` (${String(e.userId).slice(0, 8)}…)` : ''}</span>
                        </TableCell>
                        <TableCell className="text-sm">{topicTitle(String(e.topicId ?? ''), e.mode)}</TableCell>
                        <TableCell className="text-sm font-mono">{String(e.variantId ?? '—')}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {e.isCorrect === true ? 'Correct' : e.isCorrect === false ? 'Wrong' : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelected(e);
                              setOpen(true);
                            }}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                        No practice activity yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </Card>
      ) : null}

      <Dialog open={open} onOpenChange={(v) => setOpen(v)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Question details</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">{fmtTime(selected?.shownAt)}</div>
            <div className="text-sm">
              <span className="text-muted-foreground">Topic: </span>
              <span className="font-medium">{String(selected?.topicId ?? '—')}</span>
              <span className="text-muted-foreground"> · Variant: </span>
              <span className="font-mono">{String(selected?.variantId ?? '—')}</span>
            </div>

            {detailSnapshot?.userAnswerParts ? (
              <div className="rounded-md border bg-background p-3">
                <div className="text-xs text-muted-foreground mb-2">Your answer</div>
                {String(detailSnapshot?.variantId ?? '') === 'sqrt_params_point_gradient' && Array.isArray(detailSnapshot.userAnswerParts) ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">a: </span>
                      <span className="font-medium">{String(detailSnapshot.userAnswerParts[0] ?? '—') || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">b: </span>
                      <span className="font-medium">{String(detailSnapshot.userAnswerParts[1] ?? '—') || '—'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm font-medium break-words">
                    {Array.isArray(detailSnapshot.userAnswerParts)
                      ? detailSnapshot.userAnswerParts.map((x: any) => String(x ?? '')).filter((x: string) => x.trim().length > 0).join(' | ') || '—'
                      : '—'}
                  </div>
                )}
              </div>
            ) : null}

            {detailSnapshot?.correctAnswerKatex ? (
              <div className="rounded-md border bg-background p-3">
                <div className="text-xs text-muted-foreground mb-2">Correct answer</div>
                <div className="text-xl leading-snug">
                  <Katex latex={String(detailSnapshot.correctAnswerKatex)} displayMode />
                </div>
              </div>
            ) : null}

            {Array.isArray(detailSnapshot?.promptBlocks) && detailSnapshot.promptBlocks.length ? (
              <div className="rounded-md border bg-background p-3">
                <div className="text-xs text-muted-foreground mb-2">Question</div>
                {renderPromptBlocks(detailSnapshot.promptBlocks)}
              </div>
            ) : detailSnapshot?.katexQuestion ? (
              <div className="rounded-md border bg-background p-3">
                <div className="text-xs text-muted-foreground mb-2">Question (KaTeX)</div>
                <div className="text-xl leading-snug">
                  <Katex latex={String(detailSnapshot.katexQuestion)} displayMode={false} />
                </div>
              </div>
            ) : null}

            {Array.isArray(detailSnapshot?.katexExplanation) && detailSnapshot.katexExplanation.length ? (
              <div className="rounded-md border bg-background p-3">
                <div className="text-xs text-muted-foreground mb-2">Explanation</div>
                <div className="space-y-2">
                  {detailSnapshot.katexExplanation.map((b: any, idx: number) => {
                    if (!b || typeof b !== 'object') return null;
                    if (b.kind === 'text') {
                      return <div key={idx} className="text-sm leading-relaxed">{String(b.content ?? '')}</div>;
                    }
                    if (b.kind === 'math') {
                      return (
                        <div key={idx} className="text-lg leading-snug">
                          <Katex latex={String(b.content ?? '')} displayMode={!!b.displayMode} />
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
