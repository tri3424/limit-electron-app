import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type StoryChapterAttempt, type StoryCourse, type StoryChapter, type User } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function fmtMs(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return '—';
	return `${Math.round(ms / 1000)}s`;
}

function formatDateKey(date: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
	const [y, m, d] = date.split('-').map((x) => Number(x));
	const dt = new Date(Date.UTC(y, m - 1, d));
	return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

type DayRow = {
	date: string;
	totalAttempts: number;
	avgAccuracy: number;
	avgTimeMs: number;
};

export default function StoriesAdminAnalytics() {
	const navigate = useNavigate();

	const users = useLiveQuery(() => db.users.toArray(), [], [] as User[]);
	const courses = useLiveQuery(() => db.storyCourses.toArray(), [], [] as StoryCourse[]);
	const chapters = useLiveQuery(() => db.storyChapters.toArray(), [], [] as StoryChapter[]);

	const [userId, setUserId] = useState<string>('');
	const [courseId, setCourseId] = useState<string>('all');
	const [chapterId, setChapterId] = useState<string>('all');

	const attempts = useLiveQuery(async () => {
		let q = db.storyAttempts.toCollection();
		const all = await q.toArray();
		return all;
	}, [], [] as StoryChapterAttempt[]);

	const filtered = useMemo(() => {
		let out = attempts || [];
		if (userId) out = out.filter((a) => a.userId === userId);
		if (courseId !== 'all') out = out.filter((a) => a.courseId === courseId);
		if (chapterId !== 'all') out = out.filter((a) => a.chapterId === chapterId);
		out = out.slice().sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
		return out;
	}, [attempts, userId, courseId, chapterId]);

	const dayRows = useMemo(() => {
		const buckets = new Map<string, { total: number; accSum: number; timeSum: number }>();
		for (const a of filtered) {
			const date = a.date || new Date(a.submittedAt).toISOString().slice(0, 10);
			const b = buckets.get(date) || { total: 0, accSum: 0, timeSum: 0 };
			b.total += 1;
			b.accSum += a.accuracyPercent || 0;
			b.timeSum += a.durationMs || 0;
			buckets.set(date, b);
		}
		const out: DayRow[] = [];
		for (const [date, b] of buckets.entries()) {
			out.push({
				date,
				totalAttempts: b.total,
				avgAccuracy: b.total ? Math.round(b.accSum / b.total) : 0,
				avgTimeMs: b.total ? Math.round(b.timeSum / b.total) : 0,
			});
		}
		out.sort((a, b) => (a.date < b.date ? 1 : -1));
		return out;
	}, [filtered]);

	const chapterOptions = useMemo(() => {
		let out = chapters || [];
		if (courseId !== 'all') out = out.filter((c) => c.courseId === courseId);
		out = out.slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
		return out;
	}, [chapters, courseId]);

	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState<StoryChapterAttempt | null>(null);
	const [detailTab, setDetailTab] = useState<'fill' | 'assignment' | 'all'>('fill');

	const chapterMap = useMemo(() => new Map((chapters || []).map((c) => [c.id, c])), [chapters]);
	const courseMap = useMemo(() => new Map((courses || []).map((c) => [c.id, c])), [courses]);
	const userMap = useMemo(() => new Map((users || []).map((u) => [u.id, u])), [users]);
	const selectedChapter = useMemo(() => {
		if (!selected) return null;
		return chapterMap.get(selected.chapterId) || null;
	}, [selected, chapterMap]);

	const relatedAttempts = useMemo(() => {
		if (!selected) return [] as StoryChapterAttempt[];
		const list = (attempts || []).filter((a) => a.userId === selected.userId && a.chapterId === selected.chapterId);
		return list.slice().sort((a, b) => a.attemptNo - b.attemptNo);
	}, [attempts, selected?.id]);

	return (
		<div className="max-w-7xl mx-auto space-y-6 py-8">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<div className="flex items-center gap-3">
						<Button variant="outline" size="sm" onClick={() => navigate('/stories-admin')}>
							<ArrowLeft className="h-4 w-4 mr-2" /> Back
						</Button>
						<h1 className="text-3xl font-bold text-foreground">Stories Analytics</h1>
					</div>
					<div className="text-muted-foreground mt-2">User-wise daily performance and per-attempt details.</div>
				</div>
			</div>

			<Card className="p-5">
				<div className="flex items-start gap-3">
					<BarChart3 className="h-5 w-5 text-primary mt-0.5" />
					<div className="min-w-0 flex-1">
						<div className="text-lg font-semibold">Filters</div>
						<div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
							<div>
								<div className="text-xs text-muted-foreground mb-1">User</div>
								<Select value={userId || 'all'} onValueChange={(v) => setUserId(v === 'all' ? '' : v)}>
									<SelectTrigger className="h-9"><SelectValue placeholder="All" /></SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All users</SelectItem>
										{(users || []).map((u) => (
											<SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div>
								<div className="text-xs text-muted-foreground mb-1">Course</div>
								<Select value={courseId} onValueChange={(v) => { setCourseId(v); setChapterId('all'); }}>
									<SelectTrigger className="h-9"><SelectValue placeholder="All" /></SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All courses</SelectItem>
										{(courses || []).map((c) => (
											<SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div>
								<div className="text-xs text-muted-foreground mb-1">Chapter</div>
								<Select value={chapterId} onValueChange={(v) => setChapterId(v)}>
									<SelectTrigger className="h-9"><SelectValue placeholder="All" /></SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All chapters</SelectItem>
										{chapterOptions.map((c) => (
											<SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
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
										<TableHead className="w-[140px]">Date</TableHead>
										<TableHead className="text-right w-[120px]">Attempts</TableHead>
										<TableHead className="text-right w-[120px]">Avg accuracy</TableHead>
										<TableHead className="text-right w-[120px]">Avg time</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{dayRows.length ? (
										dayRows.map((r) => (
											<TableRow key={r.date}>
												<TableCell className="text-sm font-medium">{formatDateKey(r.date)}</TableCell>
												<TableCell className="text-right tabular-nums">{r.totalAttempts}</TableCell>
												<TableCell className="text-right tabular-nums">{r.avgAccuracy}%</TableCell>
												<TableCell className="text-right tabular-nums">{fmtMs(r.avgTimeMs)}</TableCell>
											</TableRow>
										))
									) : (
										<TableRow>
											<TableCell colSpan={4} className="text-center text-muted-foreground py-10">No data.</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
					</ScrollArea>
				</Card>

				<Card className="p-4">
					<div className="text-sm font-semibold mb-3">Attempts (newest first)</div>
					<ScrollArea className="h-[45vh] rounded-md">
						<div className="rounded-md border overflow-hidden">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Date</TableHead>
										<TableHead>User</TableHead>
										<TableHead>Course</TableHead>
										<TableHead>Chapter</TableHead>
										<TableHead className="text-right">Attempt</TableHead>
										<TableHead className="text-right">Accuracy</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filtered.length ? (
										filtered.map((a) => {
											const u = userMap.get(a.userId);
											const c = courseMap.get(a.courseId);
											const ch = chapterMap.get(a.chapterId);
											return (
												<TableRow
													key={a.id}
													className="cursor-pointer"
													onClick={() => {
														setSelected(a);
														setDetailTab('fill');
														setOpen(true);
													}}
												>
													<TableCell className="text-xs">{formatDateKey(a.date)}</TableCell>
													<TableCell className="text-xs">{u?.username ?? a.username ?? a.userId}</TableCell>
													<TableCell className="text-xs">{c?.title ?? a.courseId}</TableCell>
													<TableCell className="text-xs">{ch?.title ?? a.chapterId}</TableCell>
													<TableCell className="text-right tabular-nums text-xs">{a.attemptNo}</TableCell>
													<TableCell className="text-right tabular-nums text-xs">{a.accuracyPercent}%</TableCell>
												</TableRow>
											);
										})
									) : (
										<TableRow>
											<TableCell colSpan={6} className="text-center text-muted-foreground py-10">No attempts.</TableCell>
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
						<DialogTitle>Attempt details</DialogTitle>
					</DialogHeader>
					{selected ? (
						<ScrollArea className="h-[70vh] rounded-md">
							<div className="space-y-4 pr-2">
								<Tabs value={detailTab} onValueChange={(v: any) => setDetailTab(v)}>
									<TabsList>
										<TabsTrigger value="fill">Fill-in</TabsTrigger>
										<TabsTrigger value="assignment">Assignment</TabsTrigger>
										<TabsTrigger value="all">All attempts</TabsTrigger>
									</TabsList>

									<TabsContent value="fill" className="space-y-4">
										<Card className="p-3">
											<div className="text-xs text-muted-foreground">Accuracy</div>
											<div className="text-xl font-semibold">{selected.accuracyPercent}%</div>
											<div className="text-xs text-muted-foreground mt-1">Time: {fmtMs(selected.durationMs)}</div>
										</Card>

										{selectedChapter?.storyHtml ? (
											<Card className="p-4">
												<div className="text-sm font-semibold mb-2">Story</div>
												<div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selectedChapter.storyHtml }} />
											</Card>
										) : null}

										<Card className="p-4">
											<div className="text-sm font-semibold mb-2">Fill-in-the-Blanks answers</div>
											<div className="space-y-2">
												{(selected.blanks || []).map((b) => (
													<div key={b.blankId} className="flex items-center justify-between gap-3 border rounded-md p-2">
														<div className="text-xs text-muted-foreground">{b.blankId}</div>
														<div className="text-sm break-words">{b.answer || '—'}</div>
														<div className="text-xs">{b.correct ? 'Correct' : 'Wrong'}</div>
													</div>
												))}
											</div>
										</Card>
									</TabsContent>

									<TabsContent value="assignment" className="space-y-4">
										{selected.assignment ? (
											<Card className="p-4">
												<div className="text-sm font-semibold mb-2">Assignment answers</div>
												<div className="space-y-2">
													{selected.assignment.map((a) => (
														<div key={a.statementId} className="flex items-center justify-between gap-3 border rounded-md p-2">
															<div className="text-xs text-muted-foreground">{a.statementId}</div>
															<div className="text-sm">{a.answer}</div>
															<div className="text-xs">{a.correct ? 'Correct' : 'Wrong'}</div>
														</div>
													))}
												</div>
											</Card>
										) : (
											<Card className="p-4 text-sm text-muted-foreground">No assignment answers recorded for this attempt.</Card>
										)}
									</TabsContent>

									<TabsContent value="all" className="space-y-4">
										<Card className="p-4">
											<div className="text-sm font-semibold mb-2">All attempts (1–3)</div>
											<div className="space-y-3">
												{relatedAttempts.map((a) => (
													<Card key={a.id} className="p-3">
														<div className="flex items-center justify-between">
															<div className="text-sm font-medium">Attempt {a.attemptNo}</div>
															<div className="text-xs text-muted-foreground">{fmtMs(a.durationMs)} • {a.accuracyPercent}%</div>
														</div>
														<div className="mt-2 space-y-2">
															<div className="text-xs font-semibold">Fill-in</div>
															{(a.blanks || []).map((b) => (
																<div key={b.blankId} className="flex items-center justify-between gap-3 border rounded-md p-2">
																	<div className="text-xs text-muted-foreground">{b.blankId}</div>
																	<div className="text-sm break-words">{b.answer || '—'}</div>
																	<div className="text-xs">{b.correct ? 'Correct' : 'Wrong'}</div>
																</div>
															))}
															{a.assignment ? (
																<>
																	<div className="text-xs font-semibold mt-3">Assignment</div>
																	{a.assignment.map((x) => (
																		<div key={x.statementId} className="flex items-center justify-between gap-3 border rounded-md p-2">
																			<div className="text-xs text-muted-foreground">{x.statementId}</div>
																			<div className="text-sm">{x.answer}</div>
																			<div className="text-xs">{x.correct ? 'Correct' : 'Wrong'}</div>
																		</div>
																	))}
																</>
															) : null}
														</div>
													</Card>
												))}
												{relatedAttempts.length === 0 ? (
													<div className="text-sm text-muted-foreground">No attempts found.</div>
												) : null}
											</div>
										</Card>
									</TabsContent>
								</Tabs>
							</div>
						</ScrollArea>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}
