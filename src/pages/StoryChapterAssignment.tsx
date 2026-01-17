import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db, type StoryAssignmentAnswer, type StoryChapterAttempt } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { attachAssignmentToAttempt } from '@/lib/stories';
import { useAuth } from '@/contexts/AuthContext';

function pendingKey(userId: string, chapterId: string) {
	return `story:pending:${userId}:${chapterId}`;
}

function assignmentLockKey(userId: string, chapterId: string) {
	return `story:assignment_lock:${userId}:${chapterId}`;
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

	const [startedAt, setStartedAt] = useState<number>(() => Date.now());
	const [blankAnswers, setBlankAnswers] = useState<Record<string, string>>({});
	const [attemptId, setAttemptId] = useState<string>('');
	const [assignmentAnswers, setAssignmentAnswers] = useState<Record<string, StoryAssignmentAnswer>>({});
	const [submitting, setSubmitting] = useState(false);
	const [submittedAttempt, setSubmittedAttempt] = useState<StoryChapterAttempt | null>(null);
	const [revealAnswers, setRevealAnswers] = useState(false);

	const isChapterCompleted = !!(progress && (progress as any).completedAt);

	useEffect(() => {
		if (!userId || !chapterId) return;
		if (isChapterCompleted) return;
		try {
			localStorage.setItem(assignmentLockKey(userId, chapterId), '1');
		} catch {
			// ignore
		}
	}, [userId, chapterId, isChapterCompleted]);

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

	const statements = useMemo(() => chapter?.assignment?.statements || [], [chapter?.id]);
	const statementById = useMemo(() => {
		const map = new Map<string, { id: string; text: string; correct: StoryAssignmentAnswer }>();
		for (const s of statements) map.set(s.id, s);
		return map;
	}, [statements]);
	const maxAttempts = 3;
	const effectiveAttemptsUsed = Math.max(
		latestAttempt?.attemptNo ?? 0,
		submittedAttempt?.attemptNo ?? 0,
	);

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
		setSubmitting(true);
		try {
			const res = await attachAssignmentToAttempt({ attemptId, chapter, assignmentAnswers });
			setSubmittedAttempt(res);
			localStorage.removeItem(pendingKey(userId, chapter.id));
			toast.success('Submitted');
		} catch (e) {
			console.error(e);
			toast.error('Failed');
		} finally {
			setSubmitting(false);
		}
	};

	const assignmentAccuracyPercent = useMemo(() => {
		const a = submittedAttempt?.assignment || [];
		if (!a.length) return 0;
		const correct = a.filter((x) => x.correct).length;
		return Math.round((correct / a.length) * 100);
	}, [submittedAttempt]);

	const attemptsRemaining = useMemo(() => {
		return Math.max(0, maxAttempts - effectiveAttemptsUsed);
	}, [effectiveAttemptsUsed]);

	const canSeeAnswers = !!submittedAttempt && (assignmentAccuracyPercent >= 75 || attemptsRemaining === 0);
	const canRetry = !!submittedAttempt && attemptsRemaining > 0;

	useEffect(() => {
		setRevealAnswers(false);
	}, [submittedAttempt?.id]);

	const onRetry = async () => {
		if (!attemptId) return;
		try {
			const existing = await db.storyAttempts.get(attemptId);
			if (existing) {
				const blanks = existing.blanks || [];
				const correctParts = blanks.filter((b) => b.correct).length;
				const totalParts = blanks.length;
				const accuracyPercent = totalParts ? Math.round((correctParts / totalParts) * 100) : 0;
				await db.storyAttempts.update(existing.id, { assignment: undefined, accuracyPercent });
			}
			setSubmittedAttempt(null);
			setAssignmentAnswers({});
			toast.success('You can retry the assignment');
		} catch (e) {
			console.error(e);
			toast.error('Failed');
		}
	};

	const onComplete = async () => {
		if (!userId || !courseId || !chapterId) return;
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
		}
	};

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
				<Button variant="outline" onClick={() => navigate(`/stories/course/${courseId}/chapter/${chapterId}/read`)}>Back</Button>
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
								{canRetry && !revealAnswers && assignmentAccuracyPercent < 100 ? (
									<Button variant="outline" onClick={onRetry} className="flex-1">Retry</Button>
								) : null}
								{canSeeAnswers && !revealAnswers ? (
									<Button variant="outline" onClick={() => setRevealAnswers(true)} className="flex-1">See Answers</Button>
								) : null}
								{canSeeAnswers && revealAnswers ? (
									<Button onClick={onComplete} className="flex-1">Complete</Button>
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
