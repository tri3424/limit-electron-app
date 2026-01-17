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

	const [startedAt, setStartedAt] = useState<number>(() => Date.now());
	const [blankAnswers, setBlankAnswers] = useState<Record<string, string>>({});
	const [attemptId, setAttemptId] = useState<string>('');
	const [assignmentAnswers, setAssignmentAnswers] = useState<Record<string, StoryAssignmentAnswer>>({});
	const [submitting, setSubmitting] = useState(false);
	const [submittedAttempt, setSubmittedAttempt] = useState<StoryChapterAttempt | null>(null);

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

	const statements = useMemo(() => chapter?.assignment?.statements || [], [chapter?.id]);

	useEffect(() => {
		if (!chapterId || !userId) return;
		if (!attemptId) {
			navigate(`/stories/course/${courseId}/chapter/${chapterId}/read`, { replace: true });
		}
	}, [attemptId, chapterId, courseId, navigate, userId]);

	const onSubmit = async () => {
		if (!userId || !chapter) return;
		if (!attemptId) {
			toast.error('Please submit the story first');
			return;
		}
		for (const s of statements) {
			const v = assignmentAnswers[s.id];
			if (v !== 'yes' && v !== 'no') {
				toast.error('Answer all statements');
				return;
			}
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

			<div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
				<Card className="p-6 space-y-4">
					<div className="text-sm font-semibold">Statements</div>
					<div className="space-y-3">
						{statements.map((s) => (
							<Card key={s.id} className="p-4 space-y-3">
								<div className="text-sm">{s.text}</div>
								<RadioGroup
									value={assignmentAnswers[s.id] || ''}
									onValueChange={(v) => setAssignmentAnswers((prev) => ({ ...prev, [s.id]: v as StoryAssignmentAnswer }))}
									disabled={!!submittedAttempt}
									className="grid grid-cols-2 gap-3"
								>
									<label className="flex items-center gap-3 rounded-xl border p-3 cursor-pointer hover:bg-muted/10">
										<RadioGroupItem value="yes" />
										<div className="text-sm font-medium">Yes</div>
									</label>
									<label className="flex items-center gap-3 rounded-xl border p-3 cursor-pointer hover:bg-muted/10">
										<RadioGroupItem value="no" />
										<div className="text-sm font-medium">No</div>
									</label>
								</RadioGroup>
							</Card>
						))}
					</div>
				</Card>

				<div>
					<div className="lg:sticky lg:top-6 space-y-4">
						<Card className="p-5 space-y-4">
							<div className="text-sm font-semibold">Submit</div>
							{submittedAttempt ? (
								<>
									<div className="rounded-lg border p-4 text-center bg-muted/10">
										<div className="text-xs text-muted-foreground">Accuracy</div>
										<div className="text-4xl font-bold">{submittedAttempt.accuracyPercent}%</div>
									</div>
									<Button onClick={onProceed} className="w-full">Proceed</Button>
								</>
							) : (
								<Button onClick={onSubmit} disabled={submitting} className="w-full">
									{submitting ? 'Submitting…' : 'Submit'}
								</Button>
							)}
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}
