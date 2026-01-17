import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db, type StoryAssignmentAnswer, type StoryChapterAttempt } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { getLockedBlankIds, getNextAttemptNo, isCorrectFillBlankAnswer, submitStoryChapterAttempt } from '@/lib/stories';

function parseStoryHtmlToNodes(html: string): { parts: Array<{ kind: 'text'; value: string } | { kind: 'blank'; id: string; correct: string }> } {
	if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
		return { parts: [{ kind: 'text', value: html || '' }] };
	}
	const parser = new DOMParser();
	const doc = parser.parseFromString(`<div>${html || ''}</div>`, 'text/html');
	const root = doc.body.firstElementChild;
	if (!root) return { parts: [{ kind: 'text', value: html || '' }] };

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
			const id = el.getAttribute('data-blank-id') || '';
			const correct = (el.innerText || '').trim();
			parts.push({ kind: 'blank', id, correct });
			return;
		}
		if (el.tagName.toLowerCase() === 'br') {
			parts.push({ kind: 'text', value: '\n' });
			return;
		}
		for (const child of Array.from(el.childNodes)) walk(child);
		if (['p', 'div', 'li'].includes(el.tagName.toLowerCase())) {
			parts.push({ kind: 'text', value: '\n' });
		}
	};

	for (const child of Array.from(root.childNodes)) walk(child);
	return { parts };
}

export default function StoryChapterRunner() {
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

	const attempts = useLiveQuery(async () => {
		if (!userId || !chapterId) return [];
		const rows = await db.storyAttempts.where('[chapterId+userId]').equals([chapterId, userId]).toArray();
		return rows.slice().sort((a, b) => a.attemptNo - b.attemptNo);
	}, [userId, chapterId], [] as StoryChapterAttempt[]);

	const [startedAt, setStartedAt] = useState<number>(() => Date.now());
	const [lockedBlankIds, setLockedBlankIds] = useState<string[]>([]);
	const [blankAnswers, setBlankAnswers] = useState<Record<string, string>>({});
	const [assignmentAnswers, setAssignmentAnswers] = useState<Record<string, StoryAssignmentAnswer>>({});

	const [submittedAttempt, setSubmittedAttempt] = useState<StoryChapterAttempt | null>(null);
	const [revealAnswers, setRevealAnswers] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	const maxAttempts = 3;

	useEffect(() => {
		setStartedAt(Date.now());
		setSubmittedAttempt(null);
		setRevealAnswers(false);
	}, [chapterId]);

	useEffect(() => {
		if (!userId || !chapterId) return;
		void (async () => {
			const locked = await getLockedBlankIds(userId, chapterId);
			setLockedBlankIds(locked);
		})();
	}, [userId, chapterId, attempts?.length]);

	const parts = useMemo(() => {
		if (!chapter) return { parts: [] as any[] };
		return parseStoryHtmlToNodes(chapter.storyHtml || '');
	}, [chapter?.storyHtml]);

	const blankIds = useMemo(() => {
		const set = new Set<string>();
		for (const p of parts.parts as any[]) {
			if (p.kind === 'blank' && p.id) set.add(p.id);
		}
		return Array.from(set);
	}, [parts]);

	const statements = chapter?.assignment?.statements || [];
	const hasAssignment = statements.length > 0;

	const attemptsUsed = attempts?.length || 0;
	const attemptsRemaining = Math.max(0, maxAttempts - attemptsUsed);
	const lastAttempt = attempts && attempts.length ? attempts[attempts.length - 1] : null;
	const lastAccuracy = submittedAttempt?.accuracyPercent ?? lastAttempt?.accuracyPercent;

	const canRetry = (() => {
		if (attemptsUsed >= maxAttempts) return false;
		if (submittedAttempt) {
			// if just submitted, allow retry only if not passed threshold
			return submittedAttempt.accuracyPercent < 75;
		}
		return true;
	})();

	const canProceedNow = (() => {
		// If accuracy >= 75 then allow proceed/complete immediately.
		// If below 75, allow proceed only after final attempt.
		if (typeof lastAccuracy !== 'number') return false;
		if (lastAccuracy >= 75) return true;
		return attemptsUsed >= maxAttempts;
	})();

	const showSeeAnswers = (() => {
		// Only after final allowed attempt OR when accuracy>75 but <100.
		if (!submittedAttempt && !lastAttempt) return false;
		const a = submittedAttempt || lastAttempt;
		if (!a) return false;
		if (a.accuracyPercent === 100) return false;
		if (a.accuracyPercent > 75) return true;
		return attemptsUsed >= maxAttempts;
	})();

	const primaryActionLabel = hasAssignment ? 'Proceed' : 'Complete';

	const onSubmit = async () => {
		if (!userId || !chapter) {
			toast.error('No user or chapter');
			return;
		}
		const needed = blankIds;
		for (const id of needed) {
			if (lockedBlankIds.includes(id)) continue;
			const v = (blankAnswers[id] || '').trim();
			if (!v) {
				toast.error('Fill all blanks');
				return;
			}
		}
		if (hasAssignment) {
			for (const s of statements) {
				const v = assignmentAnswers[s.id];
				if (v !== 'yes' && v !== 'no') {
					toast.error('Answer all assignment statements');
					return;
				}
			}
		}

		setSubmitting(true);
		try {
			const attemptNo = await getNextAttemptNo(userId, chapter.id);
			if (attemptNo > 3) {
				toast.error('No attempts remaining');
				return;
			}
			const res = await submitStoryChapterAttempt({
				userId,
				username,
				chapter,
				startedAt,
				blankAnswers,
				assignmentAnswers: hasAssignment ? assignmentAnswers : undefined,
			});
			setSubmittedAttempt(res);
			setRevealAnswers(false);
			setStartedAt(Date.now());
			const locked = await getLockedBlankIds(userId, chapter.id);
			setLockedBlankIds(locked);
			toast.success('Submitted');
		} catch (e) {
			console.error(e);
			toast.error('Failed to submit');
		} finally {
			setSubmitting(false);
		}
	};

	const onRetry = () => {
		setSubmittedAttempt(null);
		setRevealAnswers(false);
		setStartedAt(Date.now());
		// Keep answers for locked blanks, clear others
		setBlankAnswers((prev) => {
			const next: Record<string, string> = { ...prev };
			for (const id of blankIds) {
				if (!lockedBlankIds.includes(id)) next[id] = '';
			}
			return next;
		});
		// Assignment does NOT partial lock; full resubmit
		setAssignmentAnswers({});
	};

	const onProceed = () => {
		if (!course || !chapter) return;
		const chs = (course.chapterIds || []).slice();
		const idx = chs.indexOf(chapter.id);
		const nextId = idx >= 0 ? chs[idx + 1] : null;
		if (nextId) {
			navigate(`/stories/course/${course.id}/chapter/${nextId}`);
		} else {
			toast.success('Course complete');
			navigate('/stories');
		}
	};

	if (!chapter || !courseId || !chapterId) {
		return <div className="max-w-5xl mx-auto p-8 text-muted-foreground">Loading…</div>;
	}

	return (
		<div className="max-w-4xl mx-auto space-y-6 py-8">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<div className="text-xs text-muted-foreground">Course: {course?.title ?? courseId}</div>
					<h1 className="text-2xl font-bold text-foreground">{chapter.title}</h1>
					<div className="text-xs text-muted-foreground mt-1">Attempts remaining: {attemptsRemaining}</div>
				</div>
				<Button variant="outline" onClick={() => navigate('/stories')}>Back</Button>
			</div>

			<Card className="p-5 space-y-4">
				<div className="space-y-3 whitespace-pre-wrap">
					{parts.parts.map((p: any, idx: number) => {
						if (p.kind === 'text') {
							return <span key={idx}>{p.value}</span>;
						}
						const locked = lockedBlankIds.includes(p.id);
						const showCorrect = revealAnswers && (attemptsUsed >= maxAttempts);
						return (
							<span key={idx} className="inline-flex items-center gap-2 mx-1 my-1">
								<Input
									value={locked && !blankAnswers[p.id] ? p.correct : (blankAnswers[p.id] || '')}
									onChange={(e) => setBlankAnswers((prev) => ({ ...prev, [p.id]: e.target.value }))}
									disabled={locked || !!submittedAttempt}
									className="h-8 w-[140px]"
									placeholder="..."
								/>
								{showCorrect ? (
									<span className="text-xs text-muted-foreground">{p.correct}</span>
								) : null}
							</span>
						);
					})}
				</div>
			</Card>

			{hasAssignment ? (
				<Card className="p-5 space-y-4">
					<div className="text-sm font-semibold">Assignment</div>
					<div className="space-y-3">
						{statements.map((s) => (
							<div key={s.id} className="rounded-lg border p-3 space-y-2">
								<div className="text-sm">{s.text}</div>
								<RadioGroup
									value={assignmentAnswers[s.id] || ''}
									onValueChange={(v) => setAssignmentAnswers((prev) => ({ ...prev, [s.id]: v as StoryAssignmentAnswer }))}
									disabled={!!submittedAttempt}
									className="grid grid-cols-2 gap-2"
								>
									<label className="flex items-center gap-2 rounded-lg border p-2 cursor-pointer">
										<RadioGroupItem value="yes" />
										<span className="text-sm">Yes</span>
									</label>
									<label className="flex items-center gap-2 rounded-lg border p-2 cursor-pointer">
										<RadioGroupItem value="no" />
										<span className="text-sm">No</span>
									</label>
								</RadioGroup>
							</div>
						))}
					</div>
				</Card>
			) : null}

			<Card className="p-5 space-y-4">
				{submittedAttempt ? (
					<>
						<div className="rounded-lg border p-4 text-center">
							<div className="text-xs text-muted-foreground">Accuracy</div>
							<div className="text-3xl font-bold">{submittedAttempt.accuracyPercent}%</div>
						</div>
						<div className="flex flex-wrap gap-2 justify-end">
							{showSeeAnswers ? (
								<Button
									variant="outline"
									onClick={() => {
										const allow = (attemptsUsed >= maxAttempts);
										if (!allow) return;
										setRevealAnswers(true);
									}}
									disabled={attemptsUsed < maxAttempts}
								>
									See Answers
								</Button>
							) : null}
							{submittedAttempt.accuracyPercent < 75 && attemptsUsed < maxAttempts ? (
								<Button onClick={onRetry} disabled={!canRetry}>Retry</Button>
							) : null}
							{submittedAttempt.accuracyPercent === 100 ? (
								<Button onClick={onProceed}>{primaryActionLabel}</Button>
							) : canProceedNow ? (
								<Button onClick={onProceed}>{primaryActionLabel}</Button>
							) : null}
						</div>
					</>
				) : (
					<div className="flex justify-end">
						<Button onClick={onSubmit} disabled={submitting || attemptsUsed >= maxAttempts}>Submit</Button>
					</div>
				)}
			</Card>
		</div>
	);
}
