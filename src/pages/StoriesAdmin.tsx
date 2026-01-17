import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';
import { db, type StoryCourse, type StoryChapter } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription as AlertDialogDescriptionUi,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Pencil, Plus, Trash2, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

export default function StoriesAdmin() {
	const navigate = useNavigate();
	const courses = useLiveQuery(async () => {
		const all = await db.storyCourses.orderBy('createdAt').reverse().toArray();
		return all;
	}, [], [] as StoryCourse[]);

	const chapters = useLiveQuery(async () => {
		const all = await db.storyChapters.toArray();
		return all;
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

	const users = useLiveQuery(() => db.users.toArray(), [], [] as any[]);

	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [visible, setVisible] = useState(true);
	const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
	const [saving, setSaving] = useState(false);

	const [assignOpen, setAssignOpen] = useState(false);
	const [assignCourseId, setAssignCourseId] = useState<string | null>(null);
	const [assignSelected, setAssignSelected] = useState<string[]>([]);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteCourseId, setDeleteCourseId] = useState<string | null>(null);
	const [deleteCourseTitle, setDeleteCourseTitle] = useState<string>('');

	const onCreateCourse = async () => {
		const t = title.trim();
		if (!t) {
			toast.error('Title is required');
			return;
		}
		setSaving(true);
		try {
			const id = uuidv4();
			const now = Date.now();
			const row: StoryCourse = {
				id,
				title: t,
				description: description.trim() || undefined,
				chapterIds: [],
				assignedUserIds: assignedUserIds.slice(),
				visible,
				createdAt: now,
				updatedAt: now,
			};
			await db.storyCourses.add(row);
			setTitle('');
			setDescription('');
			setAssignedUserIds([]);
			setVisible(true);
			toast.success('Course created');
		} catch (e) {
			console.error(e);
			toast.error('Failed to create course');
		} finally {
			setSaving(false);
		}
	};

	const onDeleteCourse = async () => {
		if (!deleteCourseId) return;
		try {
			await db.transaction('rw', db.storyCourses, db.storyChapters, async () => {
				const chs = await db.storyChapters.where('courseId').equals(deleteCourseId).toArray();
				for (const ch of chs) await db.storyChapters.delete(ch.id);
				await db.storyCourses.delete(deleteCourseId);
			});
			toast.success('Deleted');
			setDeleteOpen(false);
			setDeleteCourseId(null);
			setDeleteCourseTitle('');
		} catch (e) {
			console.error(e);
			toast.error('Failed');
		}
	};

	const onCreateChapter = async (courseId: string) => {
		try {
			const now = Date.now();
			const existing = (courseToChapters.get(courseId) || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
			const nextOrder = existing.length ? (existing[existing.length - 1].order ?? existing.length) + 1 : 1;
			const chapterId = uuidv4();
			const ch: StoryChapter = {
				id: chapterId,
				courseId,
				title: `Chapter ${nextOrder}`,
				order: nextOrder,
				storyHtml: '<p>Write the story here…</p>',
				fillBlanks: { blanks: [] },
				assignment: undefined,
				visible: true,
				createdAt: now,
				updatedAt: now,
			};
			await db.transaction('rw', db.storyChapters, db.storyCourses, async () => {
				await db.storyChapters.add(ch);
				const course = await db.storyCourses.get(courseId);
				if (course) {
					const nextIds = Array.from(new Set([...(course.chapterIds || []), chapterId]));
					await db.storyCourses.update(courseId, { chapterIds: nextIds, updatedAt: Date.now() });
				}
			});
			navigate(`/stories-admin/course/${courseId}`);
		} catch (e) {
			console.error(e);
			toast.error('Failed to create chapter');
		}
	};

	return (
		<div className="max-w-7xl mx-auto space-y-6 py-8">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="text-3xl font-bold text-foreground">Stories Admin</h1>
					<div className="text-muted-foreground mt-2">Create and manage courses/chapters.</div>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" onClick={() => navigate('/stories-admin/analytics')}>
						<BarChart3 className="h-4 w-4 mr-2" /> Analytics
					</Button>
				</div>
			</div>

			<Card className="p-5 space-y-4">
				<div className="text-lg font-semibold">Create Course</div>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
					<div>
						<Label>Title</Label>
						<Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course title" />
					</div>
					<div>
						<Label>Description</Label>
						<Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Checkbox checked={visible} onCheckedChange={(v: any) => setVisible(!!v)} />
					<span className="text-sm">Visible</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<Button onClick={onCreateCourse} disabled={saving}>
						<Plus className="h-4 w-4 mr-2" /> Create
					</Button>
					<Button
						variant="outline"
						onClick={() => {
							setAssignedUserIds([]);
							setAssignSelected([]);
							setAssignCourseId(null);
							setAssignOpen(true);
						}}
					>
						Assign users (optional)
					</Button>
				</div>
				{assignedUserIds.length ? (
					<div className="text-xs text-muted-foreground">Assigned users: {assignedUserIds.length}</div>
				) : (
					<div className="text-xs text-muted-foreground">Assigned users: none (visible to all students)</div>
				)}
			</Card>

			<Card className="p-4">
				<div className="text-sm font-semibold mb-3">Courses</div>
				<ScrollArea className="h-[55vh] rounded-md">
					<div className="rounded-md border overflow-hidden">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Course</TableHead>
									<TableHead className="w-[120px] text-right">Chapters</TableHead>
									<TableHead className="w-[100px] text-right">Visible</TableHead>
									<TableHead className="w-[220px] text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{courses && courses.length ? (
									courses.map((c) => {
										const chs = courseToChapters.get(c.id) || [];
										return (
											<TableRow key={c.id}>
												<TableCell className="min-w-0">
													<div className="font-medium">{c.title}</div>
													{c.description ? <div className="text-xs text-muted-foreground">{c.description}</div> : null}
												</TableCell>
												<TableCell className="text-right tabular-nums">{chs.length}</TableCell>
												<TableCell className="text-right">{c.visible === false ? 'No' : 'Yes'}</TableCell>
												<TableCell className="text-right">
													<div className="flex justify-end gap-2">
														<Button size="sm" variant="outline" onClick={() => navigate(`/stories-admin/course/${c.id}`)}>
															<Pencil className="h-4 w-4 mr-2" /> Chapters
														</Button>
														<Button
															size="sm"
															variant="outline"
															onClick={() => {
																setAssignCourseId(c.id);
																setAssignSelected(Array.isArray(c.assignedUserIds) ? c.assignedUserIds : []);
																setAssignOpen(true);
															}}
														>
															<Pencil className="h-4 w-4 mr-2" /> Assign
														</Button>
														<Button
															size="sm"
															variant="destructive"
															onClick={async () => {
																setDeleteCourseId(c.id);
																setDeleteCourseTitle(c.title || '');
																setDeleteOpen(true);
															}}
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</div>
												</TableCell>
											</TableRow>
										);
									})
								) : (
									<TableRow>
										<TableCell colSpan={4} className="text-center text-muted-foreground py-10">No courses.</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
				</ScrollArea>
			</Card>

			<Dialog open={assignOpen} onOpenChange={setAssignOpen}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>{assignCourseId ? 'Assign course to users' : 'Select assigned users for new course'}</DialogTitle>
						<DialogDescription>Leaving empty means visible to all students.</DialogDescription>
					</DialogHeader>
					<ScrollArea className="h-[55vh]">
						<div className="space-y-2 pr-2">
							{(users || []).map((u) => {
								const checked = assignCourseId ? assignSelected.includes(u.id) : assignedUserIds.includes(u.id);
								return (
									<label key={u.id} className="flex items-center gap-2 rounded-md border p-2 cursor-pointer">
										<Checkbox
											checked={checked}
											onCheckedChange={(v: any) => {
												const isOn = !!v;
												if (assignCourseId) {
													setAssignSelected((prev) =>
														isOn ? Array.from(new Set([...prev, u.id])) : prev.filter((x) => x !== u.id)
													);
												} else {
													setAssignedUserIds((prev) =>
														isOn ? Array.from(new Set([...prev, u.id])) : prev.filter((x) => x !== u.id)
													);
												}
											}}
										/>
										<span className="text-sm">{u.username}</span>
									</label>
								);
							})}
							{(users || []).length === 0 ? <div className="text-sm text-muted-foreground">No users found.</div> : null}
						</div>
					</ScrollArea>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setAssignOpen(false);
							}}
						>
							Close
						</Button>
						{assignCourseId ? (
							<Button
								onClick={async () => {
									try {
										await db.storyCourses.update(assignCourseId, { assignedUserIds: assignSelected.slice(), updatedAt: Date.now() });
										toast.success('Updated');
										setAssignOpen(false);
									} catch (e) {
										console.error(e);
										toast.error('Failed');
									}
								}}
							>
								Save
							</Button>
						) : null}
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete course</AlertDialogTitle>
						<AlertDialogDescriptionUi className="mt-3">
							Delete <strong>{deleteCourseTitle || 'this course'}</strong> and all its chapters? This cannot be undone.
						</AlertDialogDescriptionUi>
					</AlertDialogHeader>
					<AlertDialogFooter className="mt-6">
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={onDeleteCourse}>Delete</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
