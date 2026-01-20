import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { db, type StoryChapter } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
 	AlertDialog,
 	AlertDialogAction,
 	AlertDialogCancel,
 	AlertDialogContent,
 	AlertDialogDescription,
 	AlertDialogFooter,
 	AlertDialogHeader,
 	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Plus, Pencil, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';

export default function StoriesAdminCourse() {
	const { courseId } = useParams();
	const navigate = useNavigate();

	const course = useLiveQuery(async () => {
		if (!courseId) return null;
		return (await db.storyCourses.get(courseId)) || null;
	}, [courseId]);

	const chapters = useLiveQuery(async () => {
		if (!courseId) return [];
		return await db.storyChapters.where('courseId').equals(courseId).toArray();
	}, [courseId], [] as StoryChapter[]);

	const ordered = useMemo(() => (chapters || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [chapters]);
	const users = useLiveQuery(() => db.users.toArray(), [], [] as any[]);

	const [open, setOpen] = useState(false);
	const [chapterTitle, setChapterTitle] = useState('');
	const [resetOpen, setResetOpen] = useState(false);
	const [resetUserId, setResetUserId] = useState<string>('');
	const [resetScope, setResetScope] = useState<'course' | 'chapter'>('course');
	const [resetChapterId, setResetChapterId] = useState<string>('');
	const [resetting, setResetting] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [confirmText, setConfirmText] = useState('');
	const [viewOpen, setViewOpen] = useState(false);
	const [viewChapter, setViewChapter] = useState<StoryChapter | null>(null);
	const [viewTab, setViewTab] = useState<'story' | 'assignment'>('story');
	const [deleteChapterOpen, setDeleteChapterOpen] = useState(false);
	const [deleteChapterId, setDeleteChapterId] = useState<string | null>(null);
	const [deleteChapterTitle, setDeleteChapterTitle] = useState('');
	const [deletingChapter, setDeletingChapter] = useState(false);

	const onCreateChapter = async () => {
		if (!courseId) return;
		const t = chapterTitle.trim();
		if (!t) {
			toast.error('Chapter name is required');
			return;
		}
		try {
			const now = Date.now();
			const nextOrder = ordered.length ? (ordered[ordered.length - 1].order ?? ordered.length) + 1 : 1;
			const id = uuidv4();
			const ch: StoryChapter = {
				id,
				courseId,
				title: t,
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
				const c = await db.storyCourses.get(courseId);
				if (c) {
					const next = Array.from(new Set([...(c.chapterIds || []), id]));
					await db.storyCourses.update(courseId, { chapterIds: next, updatedAt: Date.now() });
				}
			});
			setOpen(false);
			setChapterTitle('');
			navigate(`/stories-admin/course/${courseId}`);
		} catch (e) {
			console.error(e);
			toast.error('Failed to create chapter');
		}
	};

	const onDeleteChapter = async () => {
		if (!courseId || !deleteChapterId) return;
		setDeletingChapter(true);
		try {
			await db.transaction('rw', db.storyChapters, db.storyCourses, db.storyAttempts, db.storyChapterProgress, async () => {
				const chapter = await db.storyChapters.get(deleteChapterId);
				if (!chapter) return;
				const attempts = await db.storyAttempts.where('chapterId').equals(deleteChapterId).toArray();
				if (attempts.length) {
					await db.storyAttempts.bulkDelete(attempts.map((a) => a.id));
				}
				const prog = await db.storyChapterProgress.where('chapterId').equals(deleteChapterId).toArray();
				if (prog.length) {
					await db.storyChapterProgress.bulkDelete(prog.map((p) => p.id));
				}
				await db.storyChapters.delete(deleteChapterId);
				const c = await db.storyCourses.get(courseId);
				if (c) {
					await db.storyCourses.update(courseId, {
						chapterIds: (c.chapterIds || []).filter((id) => id !== deleteChapterId),
						updatedAt: Date.now(),
					});
				}
			});
			toast.success('Chapter deleted');
			setDeleteChapterOpen(false);
			setDeleteChapterId(null);
			setDeleteChapterTitle('');
		} catch (e) {
			console.error(e);
			toast.error('Failed to delete chapter');
		} finally {
			setDeletingChapter(false);
		}
	};

	const onResetProgress = async () => {
		if (!courseId) return;
		if (!resetUserId) {
			toast.error('Select a user');
			return;
		}
		if (resetScope === 'chapter' && !resetChapterId) {
			toast.error('Select a chapter');
			return;
		}
		setResetting(true);
		try {
			await db.transaction('rw', db.storyAttempts, db.storyChapterProgress, async () => {
				if (resetScope === 'chapter') {
					const rows = await db.storyAttempts
						.where('[chapterId+userId]')
						.equals([resetChapterId, resetUserId])
						.toArray();
					await db.storyAttempts.bulkDelete(rows.map((r) => r.id));
					const p = await db.storyChapterProgress
						.where('[chapterId+userId]')
						.equals([resetChapterId, resetUserId])
						.toArray();
					await db.storyChapterProgress.bulkDelete(p.map((x) => x.id));
					return;
				}

				const attempts = await db.storyAttempts
					.where('userId')
					.equals(resetUserId)
					.and((a) => a.courseId === courseId)
					.toArray();
				await db.storyAttempts.bulkDelete(attempts.map((a) => a.id));

				const prog = await db.storyChapterProgress
					.where('[courseId+userId]')
					.equals([courseId, resetUserId])
					.toArray();
				await db.storyChapterProgress.bulkDelete(prog.map((p) => p.id));
			});

			toast.success('Progress reset');
			setResetOpen(false);
			setResetUserId('');
			setResetScope('course');
			setResetChapterId('');
		} catch (e) {
			console.error(e);
			toast.error('Failed to reset progress');
		} finally {
			setResetting(false);
		}
	};

	if (!courseId) {
		return <div className="max-w-5xl mx-auto p-8 text-muted-foreground">Missing course.</div>;
	}

	return (
		<div className="max-w-6xl mx-auto space-y-6 py-8">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<div className="flex items-center gap-3">
						<Button variant="outline" size="icon" aria-label="Back" onClick={() => navigate('/stories-admin')}>
							<ArrowLeft className="h-4 w-4" />
						</Button>
						<h1 className="text-2xl font-bold text-foreground">{course?.title ?? 'Course'}</h1>
					</div>
					{course?.description ? <div className="text-sm text-muted-foreground mt-2">{course.description}</div> : null}
				</div>
				<div className="flex gap-2">
					<Button variant="outline" onClick={() => setResetOpen(true)}>
						Reset progress
					</Button>
					<Button size="icon" aria-label="New chapter" onClick={() => setOpen(true)}>
						<Plus className="h-4 w-4" />
					</Button>
				</div>
			</div>

			<Card className="p-4">
				<div className="text-sm font-semibold mb-3">Chapters</div>
				<ScrollArea className="h-[60vh]">
					<div className="space-y-2 pr-2">
						{ordered.map((ch) => (
							<div key={ch.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
								<div className="min-w-0">
									<div className="font-medium truncate">{ch.title}</div>
									<div className="text-xs text-muted-foreground">Order: {ch.order} • Visible: {ch.visible === false ? 'No' : 'Yes'}</div>
								</div>
								<div className="flex gap-2">
									<Button
										size="icon"
										variant="outline"
										aria-label="Edit"
										onClick={() => navigate(`/stories-admin/chapter/${ch.id}/edit`)}
									>
										<Pencil className="h-4 w-4" />
									</Button>
									<Button
										size="icon"
										variant="outline"
										aria-label="Delete"
										onClick={() => {
											setDeleteChapterId(ch.id);
											setDeleteChapterTitle(ch.title || 'Chapter');
											setDeleteChapterOpen(true);
										}}
									>
										<Trash2 className="h-4 w-4" />
									</Button>
									<Button
										size="icon"
										variant="outline"
										aria-label="View"
										onClick={() => {
											setViewChapter(ch);
											setViewTab('story');
											setViewOpen(true);
										}}
									>
										<Eye className="h-4 w-4" />
									</Button>
								</div>
							</div>
						))}
						{ordered.length === 0 ? <div className="text-sm text-muted-foreground p-4">No chapters.</div> : null}
					</div>
				</ScrollArea>
			</Card>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Create chapter</DialogTitle>
					</DialogHeader>
					<div className="space-y-2">
						<Label>Chapter name</Label>
						<Input value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} />
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
						<Button onClick={onCreateChapter}>Create</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={viewOpen} onOpenChange={setViewOpen}>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle>{viewChapter?.title || 'Chapter'}</DialogTitle>
					</DialogHeader>

					<Tabs value={viewTab} onValueChange={(v: any) => setViewTab(v)}>
						<TabsList>
							<TabsTrigger value="story">Story</TabsTrigger>
							<TabsTrigger value="assignment">Assignment</TabsTrigger>
						</TabsList>

						<TabsContent value="story" className="space-y-4">
							<Card className="p-4">
								<div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: viewChapter?.storyHtml || '' }} />
							</Card>

							<Card className="p-4">
								<div className="text-sm font-semibold mb-2">Fill-in-the-Blanks (Correct answers)</div>
								<div className="space-y-2">
									{(viewChapter?.fillBlanks?.blanks || []).length ? (
										(viewChapter?.fillBlanks?.blanks || []).map((b) => (
											<div key={b.id} className="flex items-center justify-between gap-3 border rounded p-2">
												<div className="text-xs text-muted-foreground">{b.id}</div>
												<div className="text-sm font-medium">{b.correct}</div>
											</div>
										))
									) : (
										<div className="text-sm text-muted-foreground">No blanks.</div>
									)}
								</div>
							</Card>
						</TabsContent>

						<TabsContent value="assignment" className="space-y-4">
							{(viewChapter?.assignment?.statements || []).length ? (
								<Card className="p-4">
									<div className="text-sm font-semibold mb-2">Assignment (Correct answers)</div>
									<div className="space-y-3">
										{(viewChapter?.assignment?.statements || []).map((s) => (
											<div key={s.id} className="border rounded p-3 space-y-2">
												<div className="text-sm">{s.text}</div>
												<div className="flex items-center gap-2">
													<div
														className={
															s.correct === 'yes'
																? 'px-3 py-2 border rounded bg-green-50 border-green-600 text-green-800'
																: 'px-3 py-2 border rounded bg-muted/10 text-muted-foreground'
														}
													>
														Yes
													</div>
													<div
														className={
															s.correct === 'no'
																? 'px-3 py-2 border rounded bg-green-50 border-green-600 text-green-800'
																: 'px-3 py-2 border rounded bg-muted/10 text-muted-foreground'
														}
													>
														No
													</div>
												</div>
											</div>
										))}
									</div>
								</Card>
							) : (
								<Card className="p-4 text-sm text-muted-foreground">No assignment.</Card>
							)}
						</TabsContent>
					</Tabs>

					<DialogFooter>
						<Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={resetOpen} onOpenChange={setResetOpen}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Reset progress</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-2">
							<Label>User</Label>
							<Select value={resetUserId} onValueChange={setResetUserId}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(users || []).map((u) => (
										<SelectItem key={u.id} value={u.id}>
											{u.username}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label>Scope</Label>
							<Select value={resetScope} onValueChange={(v: any) => setResetScope(v)}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="course">Whole course</SelectItem>
									<SelectItem value="chapter">Specific chapter</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{resetScope === 'chapter' ? (
							<div className="space-y-2">
								<Label>Chapter</Label>
								<Select value={resetChapterId} onValueChange={setResetChapterId}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{ordered.map((ch) => (
											<SelectItem key={ch.id} value={ch.id}>
												{ch.title}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						) : null}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setResetOpen(false);
							}}
						>
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (!resetUserId) {
									toast.error('Select a user');
									return;
								}
								if (resetScope === 'chapter' && !resetChapterId) {
									toast.error('Select a chapter');
									return;
								}
								const scopeText = resetScope === 'course' ? 'entire course' : 'selected chapter';
								setConfirmText(`Reset progress for ${scopeText}? This will delete attempts.`);
								setConfirmOpen(true);
							}}
							disabled={resetting}
						>
							{resetting ? 'Resetting…' : 'Reset'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Confirm reset</AlertDialogTitle>
						<AlertDialogDescription className="mt-3">
							{confirmText}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="mt-6">
						<AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={async () => {
								setConfirmOpen(false);
								await onResetProgress();
							}}
							disabled={resetting}
						>
							Reset
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={deleteChapterOpen} onOpenChange={setDeleteChapterOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete chapter</AlertDialogTitle>
						<AlertDialogDescription className="mt-3">
							Delete “{deleteChapterTitle}”? This will also remove related attempts/progress.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="mt-6">
						<AlertDialogCancel disabled={deletingChapter}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={async () => {
								await onDeleteChapter();
							}}
							disabled={deletingChapter}
						>
							{deletingChapter ? 'Deleting…' : 'Delete'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
