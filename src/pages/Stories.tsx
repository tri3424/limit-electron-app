import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db, type StoryCourse, type StoryChapter } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function Stories() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const userId = user?.id || '';

	const courses = useLiveQuery(async () => {
		const all = await db.storyCourses.toArray();
		return all
			.filter((c) => c.visible !== false)
			.filter((c) => {
				const assigned = Array.isArray(c.assignedUserIds) ? c.assignedUserIds : [];
				if (!userId) return false;
				return assigned.length === 0 ? true : assigned.includes(userId);
			})
			.slice()
			.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
	}, [userId], [] as StoryCourse[]);

	const chapters = useLiveQuery(async () => {
		const all = await db.storyChapters.toArray();
		return all.filter((c) => c.visible !== false);
	}, [], [] as StoryChapter[]);

	const courseToChapters = useMemo(() => {
		const map = new Map<string, StoryChapter[]>();
		for (const ch of chapters || []) {
			const list = map.get(ch.courseId) || [];
			list.push(ch);
			map.set(ch.courseId, list);
		}
		for (const [courseId, list] of map.entries()) {
			list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
			map.set(courseId, list);
		}
		return map;
	}, [chapters]);

	return (
		<div className="max-w-6xl mx-auto space-y-6 py-8">
			<Card className="p-0 overflow-hidden">
				<div className="rounded-md border overflow-hidden">
					<Table>
						<TableHeader>
							<TableRow className="bg-[#4f7f2b] hover:bg-[#4f7f2b]">
								<TableHead className="text-white w-[80px]">No</TableHead>
								<TableHead className="text-white">Course Name</TableHead>
								<TableHead className="text-white text-right w-[160px]">Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{courses && courses.length ? (
								courses.map((c, idx) => {
									const chs = courseToChapters.get(c.id) || [];
									const isLocked = false;
									return (
										<TableRow key={c.id} className={isLocked ? 'bg-[#eef6e4]' : undefined}>
											<TableCell className="text-sm">{idx + 1}</TableCell>
											<TableCell className="text-sm">{c.title}</TableCell>
											<TableCell className="text-right text-sm">
												<button
													type="button"
													className="bg-transparent border-0 p-0 m-0 text-sm text-foreground no-underline hover:no-underline hover:bg-transparent hover:text-foreground focus-visible:outline-none"
													onClick={() => navigate(`/stories/course/${c.id}`)}
													disabled={!c.id || chs.length === 0}
												>
													Read now
												</button>
											</TableCell>
										</TableRow>
									);
								})
							) : (
								<TableRow>
									<TableCell colSpan={3} className="text-center text-muted-foreground py-10">
										No stories available.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			</Card>
		</div>
	);
}
