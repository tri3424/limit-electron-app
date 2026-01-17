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

type ChapterPerfRow = {
	chapterId: string;
	chapterTitle: string;
	totalAttempts: number;
	bestAccuracy: number;
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

	const latestAttemptsPerChapter = useMemo(() => {
		const map = new Map<string, StoryChapterAttempt>();
		for (const a of filtered) {
			if (!map.has(a.chapterId)) map.set(a.chapterId, a);
		}
		return Array.from(map.values());
	}, [filtered]);

	const chapterOptions = useMemo(() => {
		let out = chapters || [];
		if (courseId !== 'all') out = out.filter((c) => c.courseId === courseId);
		out = out.slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
		return out;
	}, [chapters, courseId]);

	const filteredForPerf = useMemo(() => {
		let out = attempts || [];
		if (userId) out = out.filter((a) => a.userId === userId);
		if (courseId !== 'all') out = out.filter((a) => a.courseId === courseId);
		out = out.slice().sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
		return out;
	}, [attempts, userId, courseId]);

	const chapterPerfRows = useMemo(() => {
		if (courseId === 'all') return [] as ChapterPerfRow[];
		const buckets = new Map<
			string,
			{ total: number; accSum: number; timeSum: number; best: number }
		>();
		for (const a of filteredForPerf) {
			const b = buckets.get(a.chapterId) || { total: 0, accSum: 0, timeSum: 0, best: 0 };
			b.total += 1;
			b.accSum += a.accuracyPercent || 0;
			b.timeSum += a.durationMs || 0;
			b.best = Math.max(b.best, a.accuracyPercent || 0);
			buckets.set(a.chapterId, b);
		}
		const out: ChapterPerfRow[] = [];
		for (const ch of chapterOptions) {
			const b = buckets.get(ch.id);
			out.push({
				chapterId: ch.id,
				chapterTitle: ch.title || ch.id,
				totalAttempts: b?.total ?? 0,
				bestAccuracy: b?.best ?? 0,
				avgAccuracy: b?.total ? Math.round(b.accSum / b.total) : 0,
				avgTimeMs: b?.total ? Math.round(b.timeSum / b.total) : 0,
			});
		}
		return out;
	}, [courseId, chapterOptions, filteredForPerf]);

	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState<StoryChapterAttempt | null>(null);
	const [detailTab, setDetailTab] = useState<'fill' | 'assignment'>('fill');
	const [selectedAttemptNo, setSelectedAttemptNo] = useState<1 | 2 | 3>(1);

	const chapterMap = useMemo(() => new Map((chapters || []).map((c) => [c.id, c])), [chapters]);
	const courseMap = useMemo(() => new Map((courses || []).map((c) => [c.id, c])), [courses]);
	const userMap = useMemo(() => new Map((users || []).map((u) => [u.id, u])), [users]);
	const selectedChapter = useMemo(() => {
		if (!selected) return null;
		return chapterMap.get(selected.chapterId) || null;
	}, [selected, chapterMap]);

	const assignmentStatementMap = useMemo(() => {
		const map = new Map<string, { text: string; correct: string }>();
		const statements = selectedChapter?.assignment?.statements || [];
		for (const s of statements) {
			map.set(s.id, { text: s.text || s.id, correct: String(s.correct || '') });
		}
		return map;
	}, [selectedChapter?.id]);

	const relatedAttempts = useMemo(() => {
		if (!selected) return [] as StoryChapterAttempt[];
		const list = (attempts || []).filter((a) => a.userId === selected.userId && a.chapterId === selected.chapterId);
		return list.slice().sort((a, b) => a.attemptNo - b.attemptNo);
	}, [attempts, selected?.id]);

	const selectedAttempt = useMemo(() => {
		if (!selected) return null;
		return relatedAttempts.find((a) => a.attemptNo === selectedAttemptNo) || selected;
	}, [relatedAttempts, selected, selectedAttemptNo]);

	const attemptNosAvailable = useMemo(() => {
		const set = new Set<number>();
		for (const a of relatedAttempts) set.add(a.attemptNo);
		return set;
	}, [relatedAttempts]);

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
										<SelectItem value="all">Select a course…</SelectItem>
										{(courses || []).map((c) => (
											<SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div>
								<div className="text-xs text-muted-foreground mb-1">Chapter</div>
								<Select value={chapterId} onValueChange={(v) => setChapterId(v)} disabled={courseId === 'all'}>
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

			{courseId === 'all' ? (
				<Card className="p-6">
					<div className="text-sm font-semibold">Select a course to view chapter performance</div>
					<div className="text-sm text-muted-foreground mt-1">Choose a course above to see performance per chapter and browse attempts.</div>
				</Card>
			) : (
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<Card className="p-4">
						<div className="text-sm font-semibold mb-3">Chapter performance</div>
						<ScrollArea className="h-[45vh] rounded-md">
							<div className="rounded-md border overflow-hidden">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Chapter</TableHead>
											<TableHead className="text-right w-[120px]">Attempts</TableHead>
											<TableHead className="text-right w-[140px]">Best accuracy</TableHead>
											<TableHead className="text-right w-[140px]">Avg accuracy</TableHead>
											<TableHead className="text-right w-[120px]">Avg time</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{chapterPerfRows.length ? (
											chapterPerfRows.map((r) => (
												<TableRow
													key={r.chapterId}
													className="cursor-pointer"
													onClick={() => setChapterId(r.chapterId)}
												>
													<TableCell className="text-sm font-medium">{r.chapterTitle}</TableCell>
													<TableCell className="text-right tabular-nums">{r.totalAttempts}</TableCell>
													<TableCell className="text-right tabular-nums">{r.bestAccuracy}%</TableCell>
													<TableCell className="text-right tabular-nums">{r.avgAccuracy}%</TableCell>
													<TableCell className="text-right tabular-nums">{fmtMs(r.avgTimeMs)}</TableCell>
												</TableRow>
											))
										) : (
											<TableRow>
												<TableCell colSpan={5} className="text-center text-muted-foreground py-10">No attempts yet.</TableCell>
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
											<TableHead>Chapter</TableHead>
											<TableHead className="text-right">Accuracy</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{latestAttemptsPerChapter.length ? (
											latestAttemptsPerChapter.map((a) => {
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
															setSelectedAttemptNo((a.attemptNo || 1) as 1 | 2 | 3);
															setOpen(true);
														}}
													>
														<TableCell className="text-xs">{formatDateKey(a.date)}</TableCell>
														<TableCell className="text-xs">{u?.username ?? a.username ?? a.userId}</TableCell>
														<TableCell className="text-xs">{ch?.title ?? a.chapterId}</TableCell>
														<TableCell className="text-right tabular-nums text-xs">{a.accuracyPercent}%</TableCell>
													</TableRow>
												);
											})
										) : (
											<TableRow>
												<TableCell colSpan={4} className="text-center text-muted-foreground py-10">No attempts.</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							</div>
						</ScrollArea>
					</Card>
				</div>
			)}

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
									</TabsList>

									<div className="flex items-center gap-2 pt-3">
										<div className="text-xs text-muted-foreground mr-1">Attempt</div>
										{([1, 2, 3] as const).map((n) => (
											<Button
												key={n}
												variant={selectedAttemptNo === n ? 'default' : 'outline'}
												size="sm"
												disabled={!attemptNosAvailable.has(n)}
												onClick={() => setSelectedAttemptNo(n)}
											>
												{n}
											</Button>
										))}
									</div>

									<TabsContent value="fill" className="space-y-4">
										<Card className="p-3">
											<div className="text-xs text-muted-foreground">Accuracy</div>
											<div className="text-xl font-semibold">{selectedAttempt?.accuracyPercent ?? 0}%</div>
											<div className="text-xs text-muted-foreground mt-1">Time: {fmtMs(selectedAttempt?.durationMs ?? 0)}</div>
											{(selectedAttempt as any)?.escaped ? (
												<div className="text-xs text-red-600 mt-1">Escaped</div>
											) : null}
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
												{(selectedAttempt?.blanks || []).map((b) => (
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
										{selectedAttempt?.assignment ? (
											<Card className="p-4">
												<div className="text-sm font-semibold mb-2">Assignment answers</div>
												<div className="space-y-2">
													{selectedAttempt.assignment.map((a) => (
														<div key={a.statementId} className="border rounded-md p-3">
															<div className="flex items-start justify-between gap-3">
																<div className="min-w-0">
																	<div className="text-sm font-medium break-words">
																		{assignmentStatementMap.get(a.statementId)?.text ?? a.statementId}
																	</div>
																	<div className="text-xs text-muted-foreground mt-1">
																		User answer: {(a.answer || '').toLowerCase() === 'yes' ? 'Yes' : (a.answer || '').toLowerCase() === 'no' ? 'No' : '—'}
																	</div>
																	<div className="text-xs text-muted-foreground">
																		Correct answer: {(assignmentStatementMap.get(a.statementId)?.correct || '').toLowerCase() === 'yes' ? 'Yes' : (assignmentStatementMap.get(a.statementId)?.correct || '').toLowerCase() === 'no' ? 'No' : '—'}
																	</div>
																</div>
																<div className="text-xs shrink-0">{a.correct ? 'Correct' : 'Wrong'}</div>
															</div>
														</div>
													))}
												</div>
											</Card>
										) : (
											<Card className="p-4 text-sm text-muted-foreground">No assignment answers recorded for this attempt.</Card>
										)}
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
