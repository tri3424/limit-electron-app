import { useCallback, useMemo, useState } from 'react';
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
import { PolynomialLongDivision } from '@/components/PolynomialLongDivision';
import { PromptBlocksFlow } from '@/components/PromptBlocksFlow';
import { PRACTICE_TOPICS } from '@/lib/practiceTopics';
import { CustomDatePicker } from '@/components/CustomDatePicker';

function toDateKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function renderInlineKatexText(raw: string) {
  const s0 = String(raw ?? '');
  if (!s0.trim()) return s0;

  // Convert explicit inline delimiters \( ... \) into tokens.
  const tokenized = s0.split(/(\\\([\s\S]*?\\\))/g).filter((p) => p.length > 0);

  const parts: Array<{ kind: 'text' | 'math'; value: string }> = [];
  for (const t of tokenized) {
    const isInline = t.startsWith('\\(') && t.endsWith('\\)');
    if (isInline) {
      parts.push({ kind: 'math', value: t.slice(2, -2) });
      continue;
    }

    // Also support common LaTeX fragments that appear in plain text.
    const normalized = t
      .replace(/\b(sin|cos|tan|sec|csc|cot)\s*\(/g, '\\$1(')
      .replace(/\|([^|]+)\|/g, String.raw`\\left|$1\\right|`);

    const hasLatex = /\\left\||\\right\||\\sin\b|\\cos\b|\\tan\b|\\sec\b|\\csc\b|\\cot\b|\\frac\{|\\(?:dfrac|tfrac)\{|\\sqrt\b|\\pi\b|\\ln\b|\\log\b|\\cdot\b|\\int\b|\^\{|\^\d|_\{|_\d/.test(
      normalized,
    );
    if (!hasLatex) {
      parts.push({ kind: 'text', value: t });
      continue;
    }

    const splitParts = normalized.split(
      /(\\left\|[\s\S]*?\\right\||\\(?:frac|dfrac|tfrac)\{[^}]+\}\{[^}]+\}|\\sqrt\{[^}]+\}|\\sqrt\[[^\]]+\]\{[^}]+\}|\\pi\b|\\ln\b|\\log(?:_\{[^}]+\}|_{[^}]+})?\b|\\sin\b|\\cos\b|\\tan\b|\\sec\b|\\csc\b|\\cot\b|\\cdot|\\int\b|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+|-?\d*x_\{[^}]+\}|x_\{[^}]+\}|-?\d*x_\d+|x_\d+)/g,
    );

    for (const p of splitParts.filter((x) => x.length > 0)) {
      const isMath = /^(\\left\|[\s\S]*?\\right\||\\(?:frac|dfrac|tfrac)\{[^}]+\}\{[^}]+\}|\\sqrt\{[^}]+\}|\\sqrt\[[^\]]+\]\{[^}]+\}|\\pi\b|\\ln\b|\\log(?:_\{[^}]+\}|_{[^}]+})?\b|\\sin\b|\\cos\b|\\tan\b|\\sec\b|\\csc\b|\\cot\b|\\cdot|\\int\b|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+|-?\d*x_\{[^}]+\}|x_\{[^}]+\}|-?\d*x_\d+|x_\d+)$/.test(
        p,
      );
      parts.push({ kind: isMath ? 'math' : 'text', value: isMath ? p : p });
    }
  }

  return (
    <span className="whitespace-normal break-words">
      {parts.map((p, i) =>
        p.kind === 'math' ? <Katex key={i} latex={p.value} /> : <span key={i}>{p.value}</span>
      )}
    </span>
  );
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

function humanizeVariantId(raw: string): string {
  const tokens = String(raw ?? '')
    .trim()
    .split('_')
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tokens.length) return '—';

  const mapToken = (t: string) => {
    const lower = t.toLowerCase();
    if (lower === 'mcq') return 'Multiple-choice';
    if (lower === 'coords') return 'coordinates';
    if (lower === 'coord') return 'coordinate';
    if (lower === 'xaxis') return 'x-axis';
    if (lower === 'yaxis') return 'y-axis';
    if (lower === 'hm') return 'hours & minutes';
    if (lower === 'ampm') return 'AM/PM';
    if (lower === 'ln') return 'ln';
    if (lower === 'log10') return 'log₁₀';
    if (lower === 'gcf') return 'greatest common factor';
    if (lower === 'pqr') return 'p, q, r';
    if (lower === 'abc') return 'a, b, c';
    return lower;
  };

  const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  return titleCase(tokens.map(mapToken).join(' ').replace(/\s+/g, ' ').trim());
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

function isValidDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? '').trim());
}

function inDateKeyRange(dateKey: string, startKey: string | null, endKey: string | null): boolean {
  const d = String(dateKey ?? '').trim();
  if (!isValidDateKey(d)) return false;
  if (startKey && d < startKey) return false;
  if (endKey && d > endKey) return false;
  return true;
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
  const usersWithAdmin = useMemo(() => {
    const base = Array.isArray(users) ? users : [];
    const hasAdmin = base.some((u: any) => String(u?.id) === 'admin');
    return hasAdmin ? base : [...base, { id: 'admin', username: 'Admin' }];
  }, [users]);

  const [userId, setUserId] = useState<string>(() => usersWithAdmin?.[0]?.id ?? '');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedDayKey, setSelectedDayKey] = useState<string>('');

  const events = useLiveQuery(async () => {
    if (!userId) return [];
    return db.practiceEvents.where('userId').equals(userId).toArray();
  }, [userId]) || [];

  const normalizedStartDate = useMemo(() => (isValidDateKey(startDate) ? startDate : ''), [startDate]);
  const normalizedEndDate = useMemo(() => (isValidDateKey(endDate) ? endDate : ''), [endDate]);
  const dateRange = useMemo(() => {
    const s = normalizedStartDate || '';
    const e = normalizedEndDate || '';
    if (s && e && s > e) return { start: e, end: s };
    return { start: s, end: e };
  }, [normalizedEndDate, normalizedStartDate]);

  const filteredEvents = useMemo(() => {
    const startKey = dateRange.start || null;
    const endKey = dateRange.end || null;
    if (!startKey && !endKey) return events;
    return events.filter((ev: any) => {
      const usedTs = typeof ev.submittedAt === 'number' ? ev.submittedAt : ev.shownAt;
      const key = toDateKey(usedTs);
      return inDateKeyRange(key, startKey, endKey);
    });
  }, [dateRange.end, dateRange.start, events]);

  const dayRows = useMemo(() => {
    const buckets = new Map<string, { total: number; correct: number; wrong: number; totalTimeMs: number }>();

    for (const e of filteredEvents) {
      const usedTs = typeof e.submittedAt === 'number' ? e.submittedAt : e.shownAt;
      const date = toDateKey(usedTs);
      const b = buckets.get(date) ?? { total: 0, correct: 0, wrong: 0, totalTimeMs: 0 };
      b.total += 1;
      if (e.isCorrect === true) b.correct += 1;
      if (e.isCorrect === false) b.wrong += 1;
      const endTs = typeof e.submittedAt === 'number' ? e.submittedAt : typeof e.nextAt === 'number' ? e.nextAt : undefined;
      if (typeof endTs === 'number') b.totalTimeMs += Math.max(0, endTs - e.shownAt);
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
  }, [filteredEvents]);

  const filteredTimeline = useMemo(() => {
    const day = isValidDateKey(selectedDayKey) ? selectedDayKey : '';
    const base = day
      ? (filteredEvents as any[]).filter((ev) => {
          const usedTs = typeof ev.submittedAt === 'number' ? ev.submittedAt : ev.shownAt;
          return toDateKey(usedTs) === day;
        })
      : filteredEvents;

    const out = [...base];
    out.sort((a, b) => (b.shownAt ?? 0) - (a.shownAt ?? 0));
    return out;
  }, [filteredEvents, selectedDayKey]);

  const rangeSummary = useMemo(() => {
    const total = filteredEvents.length;
    let correct = 0;
    let wrong = 0;
    let totalTimeMs = 0;
    for (const e of filteredEvents as any[]) {
      if (e.isCorrect === true) correct += 1;
      if (e.isCorrect === false) wrong += 1;
      const endTs = typeof e.submittedAt === 'number' ? e.submittedAt : typeof e.nextAt === 'number' ? e.nextAt : undefined;
      if (typeof endTs === 'number') totalTimeMs += Math.max(0, endTs - e.shownAt);
    }
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const avgTimeMs = total > 0 ? Math.round(totalTimeMs / total) : 0;
    return { total, correct, wrong, accuracy, avgTimeMs };
  }, [filteredEvents]);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const selectedUser = useMemo(() => usersWithAdmin.find((u: any) => String(u?.id) === String(userId)) ?? null, [userId, usersWithAdmin]);

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
      <PromptBlocksFlow
        blocks={blocks as any}
        className="text-xl leading-relaxed whitespace-normal break-words max-w-full"
        textClassName="font-slab"
        align="left"
      />
    );
  }, []);

  const graphDiagramKey = useCallback((graphSpec: any) => {
    const s = stableStringify(graphSpec);
    return s ? `graph:${s}` : '';
  }, []);

  const svgDiagramKey = useCallback((svgDataUrl: any) => {
    const s = String(svgDataUrl ?? '');
    return s ? `svg:${s}` : '';
  }, []);

  const baseDiagramKeys = useMemo(() => {
    const out: string[] = [];
    if (detailSnapshot?.svgDataUrl) {
      const k = svgDiagramKey(detailSnapshot.svgDataUrl);
      if (k) out.push(k);
    }
    if (detailSnapshot?.graphSpec) {
      const k = graphDiagramKey(detailSnapshot.graphSpec);
      if (k) out.push(k);
    }
    if (detailSnapshot?.secondaryGraphSpec) {
      const k = graphDiagramKey(detailSnapshot.secondaryGraphSpec);
      if (k) out.push(k);
    }
    return out;
  }, [detailSnapshot?.graphSpec, detailSnapshot?.secondaryGraphSpec, detailSnapshot?.svgDataUrl, graphDiagramKey, svgDiagramKey]);

  const renderExplanationBlocks = useCallback((blocks: any[], seenDiagramKeys?: Set<string>) => {
    if (!Array.isArray(blocks) || !blocks.length) return null;
    return (
      <div className="space-y-2">
        {blocks.map((b: any, idx: number) => {
          if (!b || typeof b !== 'object') return null;
          if (b.kind === 'text') {
            return (
              <div key={idx} className="text-sm leading-relaxed text-foreground whitespace-normal break-words">
                {renderInlineKatexText(String(b.content ?? ''))}
              </div>
            );
          }
          if (b.kind === 'math') {
            return (
              <div key={idx} className="text-lg leading-snug">
                <Katex latex={String(b.content ?? '')} displayMode={!!b.displayMode} />
              </div>
            );
          }
          if (b.kind === 'math_callout') {
            return (
              <div key={idx} className="rounded-md border bg-background p-3 space-y-2">
                <div className="text-xs text-muted-foreground">{String(b.callout ?? '')}</div>
                <div className="text-lg leading-snug">
                  <Katex latex={String(b.content ?? '')} displayMode={!!b.displayMode} />
                </div>
              </div>
            );
          }
          if (b.kind === 'graph' && b.graphSpec) {
            const key = graphDiagramKey(b.graphSpec);
            if (key && seenDiagramKeys && seenDiagramKeys.has(key)) return null;
            if (key && seenDiagramKeys) seenDiagramKeys.add(key);
            return (
              <div key={idx} className="space-y-2">
                <div className="text-xs text-muted-foreground">{String(b.altText ?? 'Graph')}</div>
                <div className="flex justify-center">
                  <InteractiveGraph spec={b.graphSpec} altText={String(b.altText ?? 'Graph')} interactive={false} />
                </div>
              </div>
            );
          }
          if (b.kind === 'long_division') {
            return (
              <div key={idx} className="py-2">
                <PolynomialLongDivision
                  divisorLatex={String(b.divisorLatex ?? '')}
                  dividendLatex={String(b.dividendLatex ?? '')}
                  quotientLatex={String(b.quotientLatex ?? '')}
                  steps={Array.isArray(b.steps) ? b.steps : []}
                />
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  }, [graphDiagramKey]);

  return (
    <div className="max-w-6xl mx-auto space-y-8 px-4 md:px-6 py-8">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/settings/practice-admin')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Practice Analytics</h1>
          </div>
          <div className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Track daily performance and review question attempts.
          </div>
        </div>
      </div>

      <Card className="p-6 rounded-2xl shadow-sm">
        <div className="flex items-start gap-3">
          <BarChart3 className="h-5 w-5 text-primary mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold tracking-tight">Filters</div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">User</div>
                <Select value={userId || ''} onValueChange={(v) => setUserId(v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {usersWithAdmin.map((u: any) => (
                      <SelectItem key={String(u.id)} value={String(u.id)}>
                        {String(u.username ?? u.id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Start date</div>
                <CustomDatePicker
                  value={dateRange.start || undefined}
                  onChange={(v) => {
                    setStartDate(v);
                    setSelectedDayKey('');
                    if (normalizedEndDate && v && v > normalizedEndDate) setEndDate(v);
                  }}
                  placeholder="Start"
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">End date</div>
                <CustomDatePicker
                  value={dateRange.end || undefined}
                  onChange={(v) => {
                    setEndDate(v);
                    setSelectedDayKey('');
                    if (normalizedStartDate && v && v < normalizedStartDate) setStartDate(v);
                  }}
                  placeholder="End"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    setSelectedDayKey('');
                  }}
                  disabled={!dateRange.start && !dateRange.end}
                >
                  Clear dates
                </Button>
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

      <div className="space-y-6">
        <Card className="p-0 rounded-2xl shadow-sm border border-border/70 overflow-hidden">
          <div className="p-5 pb-3 flex items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold tracking-tight">Daily performance</div>
              {dateRange.start || dateRange.end ? (
                <div className="text-xs text-muted-foreground mt-1">
                  Range: <span className="font-medium text-foreground">{dateRange.start || '…'}</span> –{' '}
                  <span className="font-medium text-foreground">{dateRange.end || '…'}</span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground mt-1">Range: All dates</div>
              )}
            </div>
          </div>

          <div className="px-5 pb-3 grid grid-cols-2 md:grid-cols-5 gap-2">
            <Card className="p-3 rounded-xl shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</div>
              <div className="text-sm font-semibold tabular-nums">{rangeSummary.total}</div>
            </Card>
            <Card className="p-3 rounded-xl shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Correct</div>
              <div className="text-sm font-semibold tabular-nums">{rangeSummary.correct}</div>
            </Card>
            <Card className="p-3 rounded-xl shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Wrong</div>
              <div className="text-sm font-semibold tabular-nums">{rangeSummary.wrong}</div>
            </Card>
            <Card className="p-3 rounded-xl shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Accuracy</div>
              <div className="text-sm font-semibold tabular-nums">{rangeSummary.accuracy}%</div>
            </Card>
            <Card className="p-3 rounded-xl shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Avg time</div>
              <div className="text-sm font-semibold tabular-nums">{fmtMs(rangeSummary.avgTimeMs)}</div>
            </Card>
          </div>

          <ScrollArea className="h-[45vh]" viewportClassName="pb-0">
            <div className="border-t">
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
                      <TableRow
                        key={r.date}
                        className={
                          'cursor-pointer ' +
                          (isValidDateKey(selectedDayKey) && selectedDayKey === r.date
                            ? 'bg-muted/60 border-l-4 border-l-primary'
                            : '')
                        }
                        onClick={() => {
                          setSelectedDayKey((prev) => (prev === r.date ? '' : r.date));
                        }}
                      >
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

        <Card className="p-0 rounded-2xl shadow-sm border border-border/70 overflow-hidden">
          <div className="p-5 pb-3 flex items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold tracking-tight">Question timeline (newest first)</div>
              {isValidDateKey(selectedDayKey) ? (
                <div className="text-xs text-muted-foreground mt-1">
                  Showing: <span className="font-medium text-foreground">{formatDateKey(selectedDayKey)}</span>
                </div>
              ) : null}
            </div>
            {isValidDateKey(selectedDayKey) ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedDayKey('')}>
                Show all days
              </Button>
            ) : null}
          </div>
          <ScrollArea className="h-[45vh]" viewportClassName="pb-0">
            <div className="border-t h-full flex flex-col [&_.overflow-auto]:flex-1 [&_.overflow-auto]:min-h-0">
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
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Question details</DialogTitle>
          </DialogHeader>

          {selected ? (
            <ScrollArea className="h-[70vh] rounded-md">
              <div className="space-y-4 pr-2 overflow-x-hidden">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card className="p-4 rounded-xl shadow-sm">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Shown</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{fmtTime(selected.shownAt)}</div>
                  </Card>
                  <Card className="p-4 rounded-xl shadow-sm">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Submitted</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{fmtTime(selected.submittedAt)}</div>
                  </Card>
                  <Card className="p-4 rounded-xl shadow-sm">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Next</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{fmtTime(selected.nextAt)}</div>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card className="p-4 rounded-xl shadow-sm">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Topic</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{topicTitle(selected.topicId, selected.mode)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Question type: <span className="text-foreground font-medium">{humanizeVariantId(String(selected.variantId ?? ''))}</span>
                    </div>
                  </Card>
                  <Card className="p-4 rounded-xl shadow-sm">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Result</div>
                    <div className="mt-1">
                      <span
                        className={
                          'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ' +
                          (selected.isCorrect === true
                            ? 'bg-green-100 text-green-800'
                            : selected.isCorrect === false
                              ? 'bg-red-100 text-red-800'
                              : 'bg-muted text-foreground')
                        }
                      >
                        {selected.isCorrect === true ? 'Correct' : selected.isCorrect === false ? 'Wrong' : '—'}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Mode: <span className="text-foreground font-medium">{selected.mode === 'mixed' ? 'Mixed' : 'Individual'}</span>
                    </div>
                  </Card>
                  <Card className="p-4 rounded-xl shadow-sm">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Answer</div>
                    <div className="mt-1 space-y-1">
                      {detailSnapshot?.userAnswerParts ? (
                        String(detailSnapshot?.variantId ?? '') === 'sqrt_params_point_gradient' && Array.isArray(detailSnapshot.userAnswerParts) ? (
                          <div className="grid grid-cols-1 gap-1 text-sm">
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
                        )
                      ) : (
                        <>
                          <div className="text-sm font-medium break-words">{String(detailSnapshot?.userAnswer ?? selected.userAnswer ?? '—')}</div>
                          {looksLikeLatex(String(selected.userAnswer ?? '')) ? (
                            <div className="text-lg leading-snug">
                              <Katex latex={String(selected.userAnswer ?? '')} displayMode />
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </Card>
                </div>

                {detailSnapshot ? (
                  <Card className="p-4 space-y-3 min-w-0 overflow-x-hidden">
                    <div className="text-sm font-semibold">Question</div>
                    {Array.isArray(detailSnapshot.promptBlocks) && detailSnapshot.promptBlocks.length ? (
                      <div className="text-xl leading-snug min-w-0 max-w-full whitespace-normal break-words">
                        {renderPromptBlocks(detailSnapshot.promptBlocks)}
                      </div>
                    ) : null}
                    {detailSnapshot.promptText ? (
                      <div className="font-slab text-xl leading-relaxed whitespace-normal break-words max-w-full">
                        {String(detailSnapshot.promptText ?? '')}
                      </div>
                    ) : null}
                    {detailSnapshot.promptKatex ? (
                      <div className="text-xl leading-snug max-w-full overflow-x-hidden">
                        <Katex latex={detailSnapshot.promptKatex} displayMode />
                      </div>
                    ) : null}
                    {detailSnapshot.katexQuestion ? (
                      <div className="text-xl leading-snug max-w-full overflow-x-hidden">
                        <Katex latex={detailSnapshot.katexQuestion} displayMode />
                      </div>
                    ) : null}

                    {detailSnapshot.svgDataUrl || detailSnapshot.graphSpec ? (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold">Diagram</div>
                        {detailSnapshot.svgDataUrl ? (
                          <div className="flex justify-center">
                            <img
                              src={String(detailSnapshot.svgDataUrl)}
                              alt={String(detailSnapshot.svgAltText ?? 'Diagram')}
                              className="max-w-full h-auto"
                              loading="lazy"
                            />
                          </div>
                        ) : null}
                        {detailSnapshot.graphSpec ? (
                          detailSnapshot.secondaryGraphSpec ? (
                            <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <InteractiveGraph spec={detailSnapshot.graphSpec} altText={String(detailSnapshot.svgAltText ?? 'Graph')} interactive={false} />
                              <InteractiveGraph spec={detailSnapshot.secondaryGraphSpec} altText={String(detailSnapshot.svgAltText ?? 'Graph')} interactive={false} />
                            </div>
                          ) : (
                            <div className="flex justify-center">
                              <InteractiveGraph spec={detailSnapshot.graphSpec} altText={String(detailSnapshot.svgAltText ?? 'Graph')} interactive={false} />
                            </div>
                          )
                        ) : null}
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
                        {renderExplanationBlocks(detailSnapshot.katexExplanation, new Set(baseDiagramKeys))}
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
