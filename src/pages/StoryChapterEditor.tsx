import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { db, type StoryChapter, type StoryAssignmentAnswer } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import RichTextEditor from '@/components/RichTextEditor';
import { scanBlanksFromHtml } from '@/lib/stories';

export default function StoryChapterEditor() {
	const { chapterId } = useParams();
	const navigate = useNavigate();

	const chapter = useLiveQuery(async () => {
		if (!chapterId) return null;
		return (await db.storyChapters.get(chapterId)) || null;
	}, [chapterId]);

	const course = useLiveQuery(async () => {
		if (!chapter?.courseId) return null;
		return (await db.storyCourses.get(chapter.courseId)) || null;
	}, [chapter?.courseId]);

	const [title, setTitle] = useState('');
	const [order, setOrder] = useState(1);
	const [visible, setVisible] = useState(true);
	const [storyHtml, setStoryHtml] = useState('');
	const [assignmentEnabled, setAssignmentEnabled] = useState(false);
	const [statements, setStatements] = useState<Array<{ id: string; text: string; correct: StoryAssignmentAnswer }>>([]);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!chapter) return;
		setTitle(chapter.title || '');
		setOrder(chapter.order || 1);
		setVisible(chapter.visible !== false);
		setStoryHtml(chapter.storyHtml || '');
		const st = chapter.assignment?.statements || [];
		setAssignmentEnabled(st.length > 0);
		setStatements(st.length ? st : []);
	}, [chapter?.id]);

	const blanksPreview = useMemo(() => scanBlanksFromHtml(storyHtml || ''), [storyHtml]);

	if (!chapter) {
		return <div className="max-w-5xl mx-auto p-8 text-muted-foreground">Loading…</div>;
	}

	const onSave = async () => {
		setSaving(true);
		try {
			const blanks = scanBlanksFromHtml(storyHtml || '');
			if (!blanks.length) {
				toast.error('Add at least one blank by selecting a word and clicking the blanks button.');
				return;
			}
			const next: Partial<StoryChapter> = {
				title: title.trim() || 'Untitled',
				order: Number(order) || 1,
				visible,
				storyHtml,
				fillBlanks: { blanks },
				assignment: assignmentEnabled
					? {
						statements: (statements || []).filter((s) => s.text.trim().length > 0),
					}
					: undefined,
				updatedAt: Date.now(),
			};
			await db.storyChapters.update(chapter.id, next);
			toast.success('Saved');
		} catch (e) {
			console.error(e);
			toast.error('Failed to save');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="max-w-6xl mx-auto space-y-6 py-8">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<div className="flex items-center gap-3">
						<Button variant="outline" size="sm" onClick={() => navigate('/stories-admin')}>
							<ArrowLeft className="h-4 w-4 mr-2" /> Back
						</Button>
						<h1 className="text-2xl font-bold text-foreground">Chapter Editor</h1>
					</div>
					<div className="text-xs text-muted-foreground mt-2">Course: {course?.title ?? chapter.courseId}</div>
				</div>
				<div className="flex gap-2">
					<Button onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
				</div>
			</div>

			<Card className="p-5 space-y-4">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
					<div>
						<Label>Title</Label>
						<Input value={title} onChange={(e) => setTitle(e.target.value)} />
					</div>
					<div>
						<Label>Order</Label>
						<Input type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} />
					</div>
					<div className="flex items-end gap-2">
						<Checkbox checked={visible} onCheckedChange={(v: any) => setVisible(!!v)} />
						<span className="text-sm">Visible</span>
					</div>
				</div>

				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<div>
							<div className="text-sm font-semibold">Story</div>
							<div className="text-xs text-muted-foreground">
								Select a word/phrase and use the blanks button to turn it into a blank.
							</div>
						</div>
						<div className="text-xs text-muted-foreground">Blanks: {blanksPreview.length}</div>
					</div>
					<RichTextEditor value={storyHtml} onChange={setStoryHtml} enableBlanksButton />
				</div>
			</Card>

			<Card className="p-5 space-y-3">
				<div className="flex items-center justify-between">
					<div>
						<div className="text-sm font-semibold">Assignment (Yes/No)</div>
						<div className="text-xs text-muted-foreground">Shown after the story (optional).</div>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox checked={assignmentEnabled} onCheckedChange={(v: any) => setAssignmentEnabled(!!v)} />
						<span className="text-sm">Enabled</span>
					</div>
				</div>

				{assignmentEnabled ? (
					<div className="space-y-3">
						<Button
							variant="outline"
							onClick={() => setStatements((prev) => [...prev, { id: uuidv4(), text: '', correct: 'yes' }])}
						>
							<Plus className="h-4 w-4 mr-2" /> Add statement
						</Button>
						<ScrollArea className="h-[40vh]">
							<div className="space-y-3 pr-2">
								{statements.map((s, idx) => (
									<Card key={s.id} className="p-3 space-y-2">
										<div className="flex items-center justify-between">
											<div className="text-sm font-medium">Statement {idx + 1}</div>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => setStatements((prev) => prev.filter((x) => x.id !== s.id))}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
										<Input
											value={s.text}
											onChange={(e) =>
												setStatements((prev) => prev.map((x) => (x.id === s.id ? { ...x, text: e.target.value } : x)))
											}
											placeholder="Enter statement"
										/>
										<div className="flex items-center gap-4 text-sm">
											<label className="flex items-center gap-2 cursor-pointer">
												<input
													type="radio"
													name={`correct-${s.id}`}
													checked={s.correct === 'yes'}
													onChange={() =>
														setStatements((prev) => prev.map((x) => (x.id === s.id ? { ...x, correct: 'yes' } : x)))
													}
												/>
												<span>Correct: Yes</span>
											</label>
											<label className="flex items-center gap-2 cursor-pointer">
												<input
													type="radio"
													name={`correct-${s.id}`}
													checked={s.correct === 'no'}
													onChange={() =>
														setStatements((prev) => prev.map((x) => (x.id === s.id ? { ...x, correct: 'no' } : x)))
													}
												/>
												<span>Correct: No</span>
											</label>
										</div>
									</Card>
								))}
								{statements.length === 0 ? <div className="text-sm text-muted-foreground">No statements.</div> : null}
							</div>
						</ScrollArea>
					</div>
				) : (
					<div className="text-sm text-muted-foreground">Assignment disabled.</div>
				)}
			</Card>
		</div>
	);
}
