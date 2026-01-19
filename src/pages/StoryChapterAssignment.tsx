import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db, type StoryAssignmentAnswer, type StoryChapterAttempt } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import {
	attachAssignmentToAttempt,
	getStoryFeedbackActions,
} from '@/lib/stories';
import { useAuth } from '@/contexts/AuthContext';

function pendingKey(userId: string, chapterId: string) {
	return `story:pending:${userId}:${chapterId}`;
}

function assignmentLockKey(userId: string, chapterId: string) {
	return `story:assignment_lock:${userId}:${chapterId}`;
}

function assignmentAttemptsKey(userId: string, chapterId: string) {
	return `story:assignment_attempts_used:${userId}:${chapterId}`;
}

function readAssignmentAttemptsUsed(userId: string, chapterId: string): number {
	try {
		const raw = localStorage.getItem(assignmentAttemptsKey(userId, chapterId));
		const n = Number(raw || 0);
		return Number.isFinite(n) ? Math.max(0, n) : 0;
	} catch {
		return 0;
	}
}

function writeAssignmentAttemptsUsed(userId: string, chapterId: string, next: number) {
	try {
		localStorage.setItem(assignmentAttemptsKey(userId, chapterId), String(next));
	} catch {
		// ignore
	}
}

function skipRestoreKey(userId: string, chapterId: string) {
	return `story:skip_restore:${userId}:${chapterId}`;
}

type Pending = { startedAt: number; blankAnswers: Record<string, string> };

export default function StoryChapterAssignment() {
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

	const attemptsUsedCount = useLiveQuery(async () => {
		if (!chapterId || !userId) return 0;
		const rows = await db.storyAttempts.where('[chapterId+userId]').equals([chapterId, userId]).toArray();
		return rows.length;
	}, [chapterId, userId], undefined as unknown as number | undefined);

	const [startedAt, setStartedAt] = useState<number>(() => Date.now());
	const [blankAnswers, setBlankAnswers] = useState<Record<string, string>>({});
	const [attemptId, setAttemptId] = useState<string>('');
	const [assignmentAnswers, setAssignmentAnswers] = useState<Record<string, StoryAssignmentAnswer>>({});
	const [submitting, setSubmitting] = useState(false);
	const [submittedAttempt, setSubmittedAttempt] = useState<StoryChapterAttempt | null>(null);
	const [revealAnswers, setRevealAnswers] = useState(false);
	const [assignmentAttemptsUsed, setAssignmentAttemptsUsed] = useState(0);
	const [skipForfeit, setSkipForfeit] = useState(false);
	const mountedAtRef = useRef<number>(Date.now());
	const skipForfeitRef = useRef<boolean>(false);
	const submittedAttemptRef = useRef<StoryChapterAttempt | null>(null);
	const chapterRef = useRef<typeof chapter>(null);
	const attemptIdRef = useRef<string>('');
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
		attemptIdRef.current = attemptId;
	}, [attemptId]);

	useEffect(() => {
		isChapterCompletedRef.current = !!(progress && (progress as any).completedAt);
	}, [progress]);

	useEffect(() => {
		if (!userId || !chapterId) return;
		setAssignmentAttemptsUsed(readAssignmentAttemptsUsed(userId, chapterId));
	}, [userId, chapterId]);

	const isChapterCompleted = !!(progress && (progress as any).completedAt);

	useEffect(() => {
		if (!userId || !chapterId) return;
		if (isChapterCompleted) return;
		if (attemptsUsedCount === undefined) return;
		if ((attemptsUsedCount ?? 0) === 0 && !progress) return;
		try {
			localStorage.setItem(assignmentLockKey(userId, chapterId), '1');
		} catch {
			// ignore
		}
	}, [userId, chapterId, isChapterCompleted, attemptsUsedCount, progress]);

	useEffect(() => {
		if (!userId || !courseId || !chapterId) return;
		if (isChapterCompleted) return;
		// Prevent browser back navigation while assignment is incomplete.
		try {
			window.history.pushState(null, '', window.location.href);
		} catch {
			// ignore
		}
		const onPopState = () => {
			navigate(`/stories/course/${courseId}/chapter/${chapterId}/assignment`, { replace: true });
			try {
				window.history.pushState(null, '', window.location.href);
			} catch {
				// ignore
			}
		};
		window.addEventListener('popstate', onPopState);
		return () => window.removeEventListener('popstate', onPopState);
	}, [userId, courseId, chapterId, isChapterCompleted, navigate]);

	useEffect(() => {
		if (!userId || !chapterId) return;
		try {
			const raw = localStorage.getItem(pendingKey(userId, chapterId));
			if (!raw) return;
			const parsed = JSON.parse(raw) as Pending & { attemptId?: string };
			setBlankAnswers(parsed?.blankAnswers || {});
			setStartedAt(parsed?.startedAt || Date.now());
			setAttemptId(parsed?.attemptId || '');
		} catch {
			// ignore
		}
	}, [userId, chapterId]);

	const latestAttempt = useLiveQuery(async () => {
		if (!chapterId || !userId) return null;
		const rows = await db.storyAttempts.where('[chapterId+userId]').equals([chapterId, userId]).toArray();
		if (!rows.length) return null;
		return rows.slice().sort((a, b) => a.attemptNo - b.attemptNo)[rows.length - 1] || null;
	}, [chapterId, userId], undefined as unknown as StoryChapterAttempt | null | undefined);

	useEffect(() => {
		if (!userId || !chapterId) return;
		if (attemptsUsedCount === undefined) return;
		if ((attemptsUsedCount ?? 0) !== 0) return;
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
		try {
			localStorage.removeItem(assignmentAttemptsKey(userId, chapterId));
		} catch {
			// ignore
		}
		setAssignmentAttemptsUsed(0);
		setAttemptId('');
		setSubmittedAttempt(null);
		setAssignmentAnswers({});
		if (courseId) navigate(`/stories/course/${courseId}/chapter/${chapterId}/read`, { replace: true });
	}, [userId, chapterId, attemptsUsedCount, progress, courseId, navigate]);

	const statements = useMemo(() => chapter?.assignment?.statements || [], [chapter?.id]);
	const statementById = useMemo(() => {
		const map = new Map<string, { id: string; text: string; correct: StoryAssignmentAnswer }>();
		for (const s of statements) map.set(s.id, s);
		return map;
	}, [statements]);
	const maxAttempts = 3;
	const effectiveAttemptsUsed = useMemo(() => {
		return Math.max(0, Number.isFinite(assignmentAttemptsUsed) ? assignmentAttemptsUsed : 0);
	}, [assignmentAttemptsUsed]);

	useEffect(() => {
		if (!chapterId || !userId) return;
		if (attemptId) return;
		// Wait for LiveQuery to resolve before deciding to redirect.
		if (latestAttempt === undefined) return;
		if (latestAttempt?.id) {
			setAttemptId(latestAttempt.id);
			return;
		}
		navigate(`/stories/course/${courseId}/chapter/${chapterId}/read`, { replace: true });
	}, [attemptId, latestAttempt, chapterId, courseId, navigate, userId]);

	const onSubmit = async () => {
		if (!userId || !chapter) return;
		if (!attemptId) {
			toast.error('Please submit the story first');
			return;
		}
		if (effectiveAttemptsUsed >= maxAttempts) {
			toast.error('No attempts remaining');
			return;
		}
		setSkipForfeit(true);
		setSubmitting(true);
		try {
			const res = await attachAssignmentToAttempt({ attemptId, chapter, assignmentAnswers });
			setSubmittedAttempt(res);
			const nextUsed = Math.min(maxAttempts, Math.max(0, effectiveAttemptsUsed) + 1);
			writeAssignmentAttemptsUsed(userId, chapter.id, nextUsed);
			setAssignmentAttemptsUsed(nextUsed);
			localStorage.removeItem(pendingKey(userId, chapter.id));
			toast.success('Submitted');
		} catch (e) {
			console.error(e);
			toast.error('Failed');
		} finally {
			setSubmitting(false);
			setSkipForfeit(false);
		}
	};

	const assignmentAccuracyPercent = useMemo(() => {
		const a = submittedAttempt?.assignment || [];
		if (!a.length) return 0;
		const correct = a.filter((x) => x.correct).length;
		return Math.round((correct / a.length) * 100);
	}, [submittedAttempt]);

	const attemptsRemaining = useMemo(() => {
		const used = Number.isFinite(effectiveAttemptsUsed) ? effectiveAttemptsUsed : 0;
		return Math.max(0, maxAttempts - used);
	}, [effectiveAttemptsUsed]);

	const feedbackActions = submittedAttempt
		? getStoryFeedbackActions({
			scorePercent: assignmentAccuracyPercent,
			attemptsUsed: effectiveAttemptsUsed,
			maxAttempts,
			hasSeenAnswers: revealAnswers,
		})
		: null;

	useEffect(() => {
		setRevealAnswers(false);
	}, [submittedAttempt?.id]);

	const onRetry = async () => {
		if (!attemptId || !chapter) return;
		if (!userId || !chapterId) return;
		if (effectiveAttemptsUsed >= maxAttempts) {
			toast.error('No attempts remaining');
			return;
		}
		setSkipForfeit(true);
		try {
			setSubmittedAttempt(null);
			setAssignmentAnswers({});
			setStartedAt(Date.now());
			setRevealAnswers(false);
			try {
				const payload: Pending & { attemptId: string } = {
					startedAt: Date.now(),
					blankAnswers,
					attemptId,
				};
				localStorage.setItem(pendingKey(userId, chapter.id), JSON.stringify(payload));
			} catch {
				// ignore
			}
			toast.success('You can retry the assignment');
		} catch (e) {
			console.error(e);
			toast.error(String((e as any)?.message || 'Failed'));
		} finally {
			setSkipForfeit(false);
		}
	};

	const onComplete = async () => {
		if (!userId || !courseId || !chapterId) return;
		setSkipForfeit(true);
		const bestAccuracyPercent = submittedAttempt?.accuracyPercent ?? latestAttempt?.accuracyPercent ?? 0;
		try {
			await db.storyChapterProgress.put({
				id: `${userId}:${chapterId}`,
				userId,
				courseId,
				chapterId,
				completedAt: Date.now(),
				bestAccuracyPercent,
				attemptsUsed: effectiveAttemptsUsed,
			});
			try {
				localStorage.removeItem(pendingKey(userId, chapterId));
			} catch {
				// ignore
			}
			try {
				localStorage.removeItem(assignmentLockKey(userId, chapterId));
			} catch {
				// ignore
			}
			onProceed();
		} catch (e) {
			console.error(e);
			toast.error('Failed');
		} finally {
			setSkipForfeit(false);
		}
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
			if (!attemptIdRef.current) return;
			// If the learner leaves Assignment without submitting/completing, consume an ASSIGNMENT attempt
			// (independent from passage attempts) and store an all-wrong assignment result.
			if (submittedAttemptRef.current) return;
			try {
				setTimeout(() => {
					try {
						const used = readAssignmentAttemptsUsed(userId, ch.id);
						if (used >= maxAttempts) return;
						writeAssignmentAttemptsUsed(userId, ch.id, Math.min(maxAttempts, used + 1));

						const wrongAnswers: Record<string, StoryAssignmentAnswer> = {};
						for (const s of ch.assignment?.statements || []) {
							wrongAnswers[s.id] = s.correct === 'yes' ? 'no' : 'yes';
						}
						void attachAssignmentToAttempt({
							attemptId: attemptIdRef.current,
							chapter: ch,
							assignmentAnswers: wrongAnswers,
						});
					} catch {
						// ignore
					}
				}, 0);
			} catch {
				// ignore
			}
		};
	}, []);

	const onProceed = () => {
		if (!course || !chapter) return;
		const ids = (course.chapterIds || []).slice();
		const idx = ids.indexOf(chapter.id);
		const nextId = idx >= 0 ? ids[idx + 1] : null;
		if (nextId) navigate(`/stories/course/${course.id}/chapter/${nextId}/read`);
		else navigate(`/stories/course/${course.id}`);
	};

	if (!courseId || !chapterId) {
		return <div className="max-w-5xl mx-auto p-8 text-muted-foreground">Missing chapter.</div>;
	}
	if (!chapter) {
		return <div className="max-w-5xl mx-auto p-8 text-muted-foreground">Loading…</div>;
	}

	return (
		<div className="max-w-6xl mx-auto py-8">
			<div className="flex items-start justify-between gap-4 mb-6">
				<div className="min-w-0">
					<div className="text-xs text-muted-foreground">Course: {course?.title ?? courseId}</div>
					<h1 className="text-2xl font-bold text-foreground">Assignment</h1>
					<div className="text-sm text-muted-foreground mt-2">Answer the statements and submit.</div>
				</div>
				{isChapterCompleted ? (
					<Button variant="outline" onClick={() => navigate(`/stories/course/${courseId}/chapter/${chapterId}/read`)}>Back</Button>
				) : null}
			</div>

			<div className="space-y-6">
				<Card className="p-6 space-y-4">
					<div className="space-y-3">
						{statements.map((s) => (
							<Card key={s.id} className="p-4 space-y-3">
								<div className="text-sm">{s.text}</div>
								<RadioGroup
									value={assignmentAnswers[s.id] || ''}
									onValueChange={(v) => setAssignmentAnswers((prev) => ({ ...prev, [s.id]: v as StoryAssignmentAnswer }))}
									disabled={!!submittedAttempt || revealAnswers}
									className="grid grid-cols-2 gap-3"
								>
									<label
										className={
											'rounded-lg border bg-background px-4 py-3 cursor-pointer transition-colors ' +
											(assignmentAnswers[s.id] === 'yes'
												? 'border-blue-600 ring-1 ring-blue-600'
												: 'hover:bg-muted/10')
										}
									>
										<RadioGroupItem value="yes" className="sr-only" />
										<div className="text-sm font-semibold">Yes</div>
									</label>
									<label
										className={
											'rounded-lg border bg-background px-4 py-3 cursor-pointer transition-colors ' +
											(assignmentAnswers[s.id] === 'no'
												? 'border-blue-600 ring-1 ring-blue-600'
												: 'hover:bg-muted/10')
										}
									>
										<RadioGroupItem value="no" className="sr-only" />
										<div className="text-sm font-semibold">No</div>
									</label>
								</RadioGroup>
								{revealAnswers ? (
									<div className="text-xs text-muted-foreground">
										Correct answer:{' '}
										<span className="font-semibold text-foreground">
											{statementById.get(s.id)?.correct === 'yes' ? 'Yes' : 'No'}
										</span>
									</div>
								) : null}
							</Card>
						))}
					</div>
				</Card>

				<Card className="p-5 space-y-4">
					<div className="text-sm font-semibold">Submit</div>
					{submittedAttempt ? (
						<>
							<div className="rounded-lg border p-4 text-center bg-muted/10">
								<div className="text-xs text-muted-foreground">Accuracy</div>
								<div className="text-4xl font-bold">{assignmentAccuracyPercent}%</div>
							</div>
							<div className="flex gap-2">
								{feedbackActions?.showRetry && !revealAnswers ? (
									<Button variant="outline" onClick={onRetry} className="flex-1">Retry</Button>
								) : null}
								{feedbackActions?.showSeeAnswers && !revealAnswers ? (
									<Button variant="outline" onClick={() => setRevealAnswers(true)} className="flex-1">See Answers</Button>
								) : null}
								{feedbackActions?.showNext ? (
									<Button onClick={onComplete} className="flex-1">Next</Button>
								) : null}
							</div>
						</>
					) : (
						<Button onClick={onSubmit} disabled={submitting} className="w-full">
							{submitting ? 'Submitting…' : 'Submit'}
						</Button>
					)}
				</Card>
			</div>
		</div>
	);
}
