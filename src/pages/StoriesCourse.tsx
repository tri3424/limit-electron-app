import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db, type StoryChapter } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function StoriesCourse() {
	const navigate = useNavigate();
	const { courseId } = useParams();
	const { user } = useAuth();
	const userId = user?.id || '';

	const goToChapter = (chapterId: string) => {
		if (!courseId) return;
		try {
			if (userId && localStorage.getItem(`story:assignment_lock:${userId}:${chapterId}`) === '1') {
				navigate(`/stories/course/${courseId}/chapter/${chapterId}/assignment`);
				return;
			}
		} catch {
			// ignore
		}
		navigate(`/stories/course/${courseId}/chapter/${chapterId}/read`);
	};

	const course = useLiveQuery(async () => {
		if (!courseId) return null;
		return (await db.storyCourses.get(courseId)) || null;
	}, [courseId]);

	const chapters = useLiveQuery(async () => {
		if (!courseId) return [];
		return await db.storyChapters.where('courseId').equals(courseId).toArray();
	}, [courseId], [] as StoryChapter[]);

	const progress = useLiveQuery(async () => {
		if (!courseId || !userId) return [] as any[];
		return await db.storyChapterProgress.where('[courseId+userId]').equals([courseId, userId]).toArray();
	}, [courseId, userId], [] as any[]);

	const ordered = useMemo(() => {
		return (chapters || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	}, [chapters]);

	const completedSet = useMemo(() => {
		const set = new Set<string>();
		for (const p of progress || []) {
			if (p?.completedAt) set.add(p.chapterId);
		}
		return set;
	}, [progress]);

	const firstIncompleteIndex = useMemo(() => {
		const visible = ordered.filter((c) => c.visible !== false);
		for (let i = 0; i < visible.length; i++) {
			if (!completedSet.has(visible[i].id)) return i;
		}
		return visible.length;
	}, [ordered, completedSet]);

	if (!courseId) {
		return <div className="max-w-5xl mx-auto p-8 text-muted-foreground">Missing course.</div>;
	}

	return (
		<div className="max-w-6xl mx-auto space-y-6 py-8">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<div className="flex items-center gap-3">
						<Button variant="ghost" size="sm" onClick={() => navigate('/stories')}>
							<ArrowLeft className="h-4 w-4" />
						</Button>
						<h1 className="text-3xl font-bold text-foreground">{course?.title ?? 'Course'}</h1>
					</div>
				</div>
			</div>

			<Card className="p-0 overflow-hidden">
				<div className="rounded border overflow-hidden">
					<Table>
						<TableHeader>
							<TableRow className="bg-[#4f7f2b] hover:bg-[#4f7f2b]">
								<TableHead className="text-white w-[80px]">No</TableHead>
								<TableHead className="text-white">Chapter name</TableHead>
								<TableHead className="text-white text-right w-[160px]">Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{ordered.filter((c) => c.visible !== false).map((ch, idx) => {
								const isCompleted = completedSet.has(ch.id);
								const isAvailable = idx === firstIncompleteIndex;
								const isLocked = !isCompleted && !isAvailable;
								return (
									<TableRow
										key={ch.id}
										className={isLocked ? 'bg-[#eef6e4]' : undefined}
									>
										<TableCell className="text-sm">{idx + 1}</TableCell>
										<TableCell className="text-sm">{ch.title}</TableCell>
										<TableCell className="text-right text-sm">
											{isCompleted ? (
												<span className="text-green-700">Completed</span>
											) : isAvailable ? (
												<button
													type="button"
													className="bg-transparent border-0 p-0 m-0 text-sm text-foreground no-underline hover:no-underline hover:bg-transparent hover:text-foreground focus-visible:outline-none"
													onClick={() => goToChapter(ch.id)}
												>
													Read now
												</button>
											) : (
												<span>Locked</span>
											)}
										</TableCell>
									</TableRow>
								);
							})}
							{ordered.filter((c) => c.visible !== false).length === 0 ? (
								<TableRow>
									<TableCell colSpan={3} className="text-center text-muted-foreground py-10">
										No chapters.
									</TableCell>
								</TableRow>
							) : null}
						</TableBody>
					</Table>
				</div>
			</Card>
		</div>
	);
}
