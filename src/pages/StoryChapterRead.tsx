import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db, type StoryChapterAttempt } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { getLockedBlankIds, submitStoryChapterAttempt } from '@/lib/stories';
import { useAuth } from '@/contexts/AuthContext';

function parseStoryHtmlToParts(html: string): Array<{ kind: 'text'; value: string } | { kind: 'blank'; id: string; correct: string }> {
	if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
		return [{ kind: 'text', value: html || '' }];
	}
	const parser = new DOMParser();
	const doc = parser.parseFromString(`<div>${html || ''}</div>`, 'text/html');
	const root = doc.body.firstElementChild;
	if (!root) return [{ kind: 'text', value: html || '' }];

	const parts: Array<{ kind: 'text'; value: string } | { kind: 'blank'; id: string; correct: string }> = [];
	const walk = (node: ChildNode) => {
		if (node.nodeType === Node.TEXT_NODE) {
			const v = node.textContent || '';
			if (v) parts.push({ kind: 'text', value: v });
			return;
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return;
		const el = node as HTMLElement;
		const isBlank = el.getAttribute('data-blank') === 'true';
		if (isBlank) {
			parts.push({ kind: 'blank', id: el.getAttribute('data-blank-id') || '', correct: (el.innerText || '').trim() });
			return;
		}
		if (el.tagName.toLowerCase() === 'br') {
			parts.push({ kind: 'text', value: '\n' });
			return;
		}
		for (const child of Array.from(el.childNodes)) walk(child);
		if (['p', 'div', 'li'].includes(el.tagName.toLowerCase())) parts.push({ kind: 'text', value: '\n' });
	};
	for (const child of Array.from(root.childNodes)) walk(child);
	return parts;
}

function pendingKey(userId: string, chapterId: string) {
	return `story:pending:${userId}:${chapterId}`;
}

function skipRestoreKey(userId: string, chapterId: string) {
	return `story:skip_restore:${userId}:${chapterId}`;
}

function assignmentLockKey(userId: string, chapterId: string) {
	return `story:assignment_lock:${userId}:${chapterId}`;
}

type Pending = { startedAt: number; blankAnswers: Record<string, string> };

export default function StoryChapterRead() {
	const { courseId, chapterId } = useParams();
	const navigate = useNavigate();
	const { user } = useAuth();
	const userId = user?.id || '';
	const username = user?.username;

	const chapter = useLiveQuery(async () => {
		if (!chapterId) return null;
		return (await db.storyChapters.get(chapterId)) || null;
	}, [chapterId]);

	const course = useLiveQuery(async () => {
		if (!courseId) return null;
		return (await db.storyCourses.get(courseId)) || null;
	}, [courseId]);

	const progress = useLiveQuery(async () => {
		if (!userId || !chapterId) return null;
		const rows = await db.storyChapterProgress.where('[chapterId+userId]').equals([chapterId, userId]).toArray();
		return rows?.[0] || null;
	}, [userId, chapterId], null as any);

	const attemptsUsed = useLiveQuery(async () => {
		if (!userId || !chapterId) return 0;
		const rows = await db.storyAttempts.where('[chapterId+userId]').equals([chapterId, userId]).toArray();
		return rows.length;
	}, [userId, chapterId], 0);

	useEffect(() => {
		if (!userId || !chapterId) return;
		if ((attemptsUsed ?? 0) !== 0) return;
		if (progress) return;
		try {
			localStorage.removeItem(assignmentLockKey(userId, chapterId));
		} catch {
			// ignore
		}
		try {
			localStorage.removeItem(pendingKey(userId, chapterId));
		} catch {
			// ignore
		}
		try {
			localStorage.removeItem(skipRestoreKey(userId, chapterId));
		} catch {
			// ignore
		}
	}, [userId, chapterId, attemptsUsed, progress]);

	const lastAttempt = useLiveQuery(async () => {
		if (!userId || !chapterId) return null;
		const rows = await db.storyAttempts.where('[chapterId+userId]').equals([chapterId, userId]).toArray();
		if (!rows.length) return null;
		return rows.slice().sort((a, b) => a.attemptNo - b.attemptNo)[rows.length - 1] || null;
	}, [userId, chapterId], null as StoryChapterAttempt | null);

	const [lockedBlankIds, setLockedBlankIds] = useState<string[]>([]);
	const [startedAt, setStartedAt] = useState<number>(() => Date.now());
	const [blankAnswers, setBlankAnswers] = useState<Record<string, string>>({});
	const [submitting, setSubmitting] = useState(false);
	const [submittedAttempt, setSubmittedAttempt] = useState<StoryChapterAttempt | null>(null);
	const [showLastAttemptResult, setShowLastAttemptResult] = useState(true);
	const [revealAnswers, setRevealAnswers] = useState(false);
	const [skipForfeit, setSkipForfeit] = useState(false);
	const mountedAtRef = useRef<number>(Date.now());
	const skipForfeitRef = useRef<boolean>(false);
	const submittedAttemptRef = useRef<StoryChapterAttempt | null>(null);
	const chapterRef = useRef<typeof chapter>(null);
	const attemptsUsedRef = useRef<number>(0);
	const isChapterCompletedRef = useRef<boolean>(false);

	useEffect(() => {
		mountedAtRef.current = Date.now();
	}, []);

	useEffect(() => {
		skipForfeitRef.current = skipForfeit;
	}, [skipForfeit]);

	useEffect(() => {
		submittedAttemptRef.current = submittedAttempt;
	}, [submittedAttempt]);

	useEffect(() => {
		chapterRef.current = chapter;
	}, [chapter]);

	useEffect(() => {
		attemptsUsedRef.current = Number(attemptsUsed ?? 0);
	}, [attemptsUsed]);

	useEffect(() => {
		isChapterCompletedRef.current = !!(progress && (progress as any).completedAt);
	}, [progress]);

	useEffect(() => {
		setSubmittedAttempt(null);
		setSubmitting(false);
		setStartedAt(Date.now());
		setBlankAnswers({});
		setShowLastAttemptResult(true);
		setRevealAnswers(false);
	}, [chapterId]);

	useEffect(() => {
		if (!userId || !chapterId) return;
		void (async () => {
			const locked = await getLockedBlankIds(userId, chapterId);
			setLockedBlankIds(locked);
		})();
	}, [userId, chapterId, attemptsUsed]);

	useEffect(() => {
		if (!userId || !chapterId) return;
		const key = pendingKey(userId, chapterId);
		const skipKey = skipRestoreKey(userId, chapterId);
		try {
			if (localStorage.getItem(skipKey) === '1') {
				localStorage.removeItem(skipKey);
				localStorage.removeItem(key);
				return;
			}
		} catch {
			// ignore
		}
		// If the chapter already has attempts, don't restore any stale draft answers.
		if ((attemptsUsed ?? 0) > 0) {
			try {
				localStorage.removeItem(key);
			} catch {
				// ignore
			}
			return;
		}
		try {
			const raw = localStorage.getItem(key);
			if (!raw) return;
			const parsed = JSON.parse(raw) as Pending;
			if (parsed?.blankAnswers) setBlankAnswers(parsed.blankAnswers);
			if (parsed?.startedAt) setStartedAt(parsed.startedAt);
		} catch {
			// ignore
		}
	}, [userId, chapterId, attemptsUsed]);

	const parts = useMemo(() => parseStoryHtmlToParts(chapter?.storyHtml || ''), [chapter?.storyHtml]);
	const blankIds = useMemo(() => {
		const set = new Set<string>();
		for (const p of parts) if (p.kind === 'blank' && p.id) set.add(p.id);
		return Array.from(set);
	}, [parts]);

	const hasAssignment = (chapter?.assignment?.statements || []).length > 0;
	const maxAttempts = 3;
	const effectiveAttemptsUsed = Math.max(
		Number(attemptsUsed ?? 0),
		submittedAttempt?.attemptNo ?? 0,
		lastAttempt?.attemptNo ?? 0,
	);
	const attemptsRemaining = Math.max(0, maxAttempts - effectiveAttemptsUsed);
	const displayAttempt = submittedAttempt ?? (showLastAttemptResult ? lastAttempt : null);
	const isFinalized = !!(displayAttempt && Array.isArray(displayAttempt.assignment) && displayAttempt.assignment.length > 0);
	const isChapterCompleted = !!(progress && (progress as any).completedAt);

	useEffect(() => {
		if (!userId || !courseId || !chapterId) return;
		if (!hasAssignment) return;
		if (isChapterCompleted) return;
		try {
			const locked = localStorage.getItem(assignmentLockKey(userId, chapterId)) === '1';
			if (locked) {
				navigate(`/stories/course/${courseId}/chapter/${chapterId}/assignment`, { replace: true });
			}
		} catch {
			// ignore
		}
	}, [userId, courseId, chapterId, hasAssignment, isChapterCompleted, navigate]);

	useEffect(() => {
		setRevealAnswers(false);
	}, [displayAttempt?.id]);

	const blanksAccuracyPercent = (() => {
		if (!displayAttempt) return null;
		const blanks = displayAttempt.blanks || [];
		const total = blanks.length;
		if (!total) return 0;
		const correct = blanks.filter((b) => b.correct).length;
		return Math.round((correct / total) * 100);
	})();

	const canSeeAnswers = !!displayAttempt && ((blanksAccuracyPercent ?? 0) >= 75 || attemptsRemaining === 0);

	const onSubmit = async () => {
		if (!userId || !chapter) return;
		if (effectiveAttemptsUsed >= maxAttempts) {
			toast.error('No attempts remaining');
			return;
		}
		setSkipForfeit(true);
		setSubmitting(true);
		try {
			const res = await submitStoryChapterAttempt({
				userId,
				username,
				chapter,
				startedAt,
				blankAnswers,
			});
			setSubmittedAttempt(res);
			setShowLastAttemptResult(true);
			const payload: Pending & { attemptId: string } = { startedAt, blankAnswers, attemptId: res.id };
			localStorage.setItem(pendingKey(userId, chapter.id), JSON.stringify(payload));
			toast.success('Submitted');
		} catch (e) {
			console.error(e);
			toast.error(String((e as any)?.message || 'Failed'));
		} finally {
			setSubmitting(false);
			setSkipForfeit(false);
		}
	};

	const onRetry = () => {
		if (effectiveAttemptsUsed >= maxAttempts) {
			toast.error('No attempts remaining');
			return;
		}
		setSkipForfeit(true);
		setSubmittedAttempt(null);
		setShowLastAttemptResult(false);
		setStartedAt(Date.now());
		setBlankAnswers((prev) => {
			const next: Record<string, string> = { ...prev };
			for (const id of blankIds) {
				if (!lockedBlankIds.includes(id)) next[id] = '';
			}
			return next;
		});
		setSkipForfeit(false);
	};

	const onProceed = () => {
		if (!courseId || !chapterId) return;
		setSkipForfeit(true);
		if (hasAssignment) {
			try {
				if (userId) localStorage.setItem(assignmentLockKey(userId, chapterId), '1');
			} catch {
				// ignore
			}
			try {
				if (userId) localStorage.setItem(skipRestoreKey(userId, chapterId), '1');
			} catch {
				// ignore
			}
			try {
				const attempt = submittedAttempt ?? lastAttempt;
				if (attempt && userId) {
					const payload: Pending & { attemptId: string } = {
						startedAt: attempt.startedAt || startedAt,
						blankAnswers,
						attemptId: attempt.id,
					};
					localStorage.setItem(pendingKey(userId, chapterId), JSON.stringify(payload));
				}
			} catch {
				// ignore
			}
			navigate(`/stories/course/${courseId}/chapter/${chapterId}/assignment`);
			return;
		}
		// No assignment: proceed means go back to chapter list
		navigate(`/stories/course/${courseId}`);
	};

	useEffect(() => {
		return () => {
			if (skipForfeitRef.current) return;
			// In dev (StrictMode), React may mount/unmount once immediately. Avoid consuming attempts.
			if (Date.now() - mountedAtRef.current < 1000) return;
			if (!userId || !chapterId) return;
			const ch = chapterRef.current;
			if (!ch) return;
			if (isChapterCompletedRef.current) return;
			// If the learner leaves Fill-in without submitting, record a 0% attempt.
			if (submittedAttemptRef.current) return;
			if ((attemptsUsedRef.current ?? 0) >= maxAttempts) return;
			try {
				setTimeout(() => {
					try {
						void import('@/lib/stories').then(({ forfeitStoryChapterAttempt }) =>
							forfeitStoryChapterAttempt({ userId, username, chapter: ch, includeAssignment: false }),
						);
					} catch {
						// ignore
					}
				}, 0);
			} catch {
				// ignore
			}
		};
	}, []);

	if (!courseId || !chapterId) {
		return <div className="max-w-5xl mx-auto p-8 text-muted-foreground">Missing chapter.</div>;
	}
	if (!chapter) {
		return <div className="max-w-5xl mx-auto p-8 text-muted-foreground">Loading…</div>;
	}

	return (
		<div className="max-w-5xl mx-auto py-8">
			<div className="flex items-start justify-between gap-4 mb-6">
				<div className="min-w-0">
					<div className="text-xs text-muted-foreground">Course: {course?.title ?? courseId}</div>
					<h1 className="text-2xl font-bold text-foreground">{chapter.title}</h1>
				</div>
				<Button variant="outline" onClick={() => navigate(`/stories/course/${courseId}`)}>Back</Button>
			</div>

			<Card className="p-6">
				<div className="space-y-3 whitespace-pre-wrap leading-relaxed">
					{parts.map((p, idx) => {
						if (p.kind === 'text') return <span key={idx}>{p.value}</span>;
						const locked = lockedBlankIds.includes(p.id);
						return (
							<span key={idx} className="inline-flex items-center gap-2 mx-1 my-1">
								<Input
									value={locked || revealAnswers ? p.correct : (blankAnswers[p.id] || '')}
									onChange={(e) => setBlankAnswers((prev) => ({ ...prev, [p.id]: e.target.value }))}
									disabled={locked || !!submittedAttempt || isChapterCompleted || revealAnswers}
									className="h-9 w-[170px]"
									placeholder={locked ? '' : 'Type…'}
								/>
							</span>
						);
					})}
				</div>
			</Card>

			<Card className="mt-6">
				<div className="rounded-xl border bg-card shadow-sm p-4 md:p-5 flex items-center justify-between gap-4">
					<div className="min-w-0">
						{displayAttempt ? <div className="text-sm font-semibold">Chapter completed!</div> : null}
						{displayAttempt ? (
							<div className="text-sm text-muted-foreground mt-1">
								Accuracy: <span className="font-semibold text-foreground">{blanksAccuracyPercent ?? 0}%</span>
							</div>
						) : null}
					</div>

					<div className="flex items-center gap-2 shrink-0">
						{isChapterCompleted ? null : displayAttempt ? (
							<>
								{attemptsRemaining > 0 && !isFinalized && !revealAnswers && (blanksAccuracyPercent ?? 0) < 100 ? (
									<Button variant="outline" onClick={onRetry}>Retry</Button>
								) : null}
								{canSeeAnswers && !revealAnswers ? (
									<Button variant="outline" onClick={() => setRevealAnswers(true)}>See Answers</Button>
								) : null}
								{canSeeAnswers && revealAnswers && hasAssignment && !isFinalized ? (
									<Button onClick={onProceed}>Proceed</Button>
								) : canSeeAnswers && revealAnswers && !hasAssignment ? (
									<Button onClick={onProceed}>Complete</Button>
								) : null}
							</>
						) : (
							<Button onClick={onSubmit} disabled={submitting || attemptsRemaining === 0} className="min-w-[140px]">
								{submitting ? 'Submitting…' : 'Submit'}
							</Button>
						)}
					</div>
				</div>
			</Card>
		</div>
	);
}
