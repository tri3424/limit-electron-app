import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { v4 as uuidv4 } from "uuid";
import { db, Song } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AudioPlayer from "@/components/AudioPlayer";

async function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("Failed to read file"));
		reader.onload = () => {
			const res = reader.result;
			if (typeof res !== "string") {
				reject(new Error("Unexpected FileReader result"));
				return;
			}
			const commaIdx = res.indexOf(",");
			resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
		};
		reader.readAsDataURL(file);
	});
}

async function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error('Failed to read file'));
		reader.onload = () => {
			const res = reader.result;
			if (typeof res !== 'string') {
				reject(new Error('Unexpected FileReader result'));
				return;
			}
			resolve(res);
		};
		reader.readAsDataURL(file);
	});
}

export default function SongsAdmin() {
	const songs = useLiveQuery(() => db.songs.orderBy("createdAt").reverse().toArray(), [], [] as Song[]);

	const [title, setTitle] = useState("");
	const [singer, setSinger] = useState("");
	const [writer, setWriter] = useState("");
	const [lyrics, setLyrics] = useState("");
	const [audioFile, setAudioFile] = useState<File | null>(null);
	const [saving, setSaving] = useState(false);

	const [deleteTarget, setDeleteTarget] = useState<Song | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [viewTarget, setViewTarget] = useState<Song | null>(null);
	const [editTarget, setEditTarget] = useState<Song | null>(null);
	const [editTitle, setEditTitle] = useState("");
	const [editSinger, setEditSinger] = useState("");
	const [editWriter, setEditWriter] = useState("");
	const [editLyrics, setEditLyrics] = useState("");
	const [editAudioFile, setEditAudioFile] = useState<File | null>(null);
	const [editing, setEditing] = useState(false);

	const canSave = useMemo(() => {
		return (
			title.trim().length > 0 &&
			singer.trim().length > 0 &&
			writer.trim().length > 0 &&
			lyrics.trim().length > 0 &&
			audioFile != null
		);
	}, [title, singer, writer, lyrics, audioFile]);

	return (
		<div className="max-w-7xl mx-auto space-y-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-3xl font-bold text-foreground">Songs</h1>
					<p className="text-muted-foreground mt-2">Upload songs and control which songs are visible to users.</p>
				</div>
				<div className="shrink-0">
					<Button variant="outline" onClick={() => (window.location.hash = '#/song-modules-admin')}>
						Manage Song Modules
					</Button>
				</div>
			</div>

			<Card className="p-6 space-y-4">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label>Title</Label>
						<Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" />
					</div>
					<div className="space-y-2">
						<Label>Singer</Label>
						<Input value={singer} onChange={(e) => setSinger(e.target.value)} placeholder="Singer" />
					</div>
					<div className="space-y-2">
						<Label>Writer</Label>
						<Input value={writer} onChange={(e) => setWriter(e.target.value)} placeholder="Writer" />
					</div>
					<div className="space-y-2">
						<Label>Audio file</Label>
						<Input
							type="file"
							accept="audio/*"
							onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
						/>
					</div>
				</div>
				<div className="space-y-2">
					<Label>Lyrics</Label>
					<Textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} rows={8} placeholder="Paste lyrics here..." />
				</div>
				<div className="flex justify-end">
					<Button
						disabled={!canSave || saving}
						onClick={async () => {
							if (!canSave || !audioFile) return;
							setSaving(true);
							try {
								let audioFilePath = '';
								let audioFileUrl = '';

								// Electron mode: persist to userData via preload IPC
								if (window.songs?.saveAudioFile) {
									const dataBase64 = await fileToBase64(audioFile);
									const saved = await window.songs.saveAudioFile({
										fileName: audioFile.name,
										dataBase64,
									});
									audioFilePath = saved.filePath;
									audioFileUrl = saved.fileUrl;
								} else {
									// Browser mode fallback: store a data URL in Dexie (fully offline)
									audioFileUrl = await fileToDataUrl(audioFile);
								}

								const now = Date.now();
								await db.songs.add({
									id: uuidv4(),
									title: title.trim(),
									singer: singer.trim(),
									writer: writer.trim(),
									lyrics,
									audioFilePath,
									audioFileUrl,
									createdAt: now,
									updatedAt: now,
									visible: true,
								});
								setTitle("");
								setSinger("");
								setWriter("");
								setLyrics("");
								setAudioFile(null);
								toast.success(window.songs?.saveAudioFile ? 'Song uploaded' : 'Song uploaded (stored locally)');
							} catch (err) {
								console.error(err);
								toast.error("Failed to upload song");
							} finally {
								setSaving(false);
							}
						}}
					>
						{saving ? "Uploading..." : "Upload"}
					</Button>
				</div>
			</Card>

			<div className="space-y-3">
				{songs.map((s) => (
					<Card key={s.id} className="p-4 flex items-start justify-between gap-4 w-full">
						<div className="min-w-0 flex-1">
							<div className="text-lg font-semibold truncate">{s.title}</div>
							<div className="text-sm text-muted-foreground">Singer: {s.singer}</div>
							<div className="text-sm text-muted-foreground">Writer: {s.writer}</div>
							<div className="mt-2">
								<AudioPlayer src={s.audioFileUrl} title={s.title} />
							</div>
						</div>

						<div className="shrink-0 flex flex-col items-end gap-3">
							<div className="flex items-center gap-2">
								<Button variant="outline" size="icon" onClick={() => setViewTarget(s)} aria-label="View">
									<Eye className="h-4 w-4" />
								</Button>
								<Button
									variant="outline"
									size="icon"
									onClick={() => {
										setEditTarget(s);
										setEditTitle(s.title);
										setEditSinger(s.singer);
										setEditWriter(s.writer);
										setEditLyrics(s.lyrics);
										setEditAudioFile(null);
									}}
									aria-label="Edit"
								>
									<Pencil className="h-4 w-4" />
								</Button>
							</div>
							<label className="flex items-center gap-2 text-sm">
								<Checkbox
									checked={s.visible !== false}
									onCheckedChange={async (v) => {
										try {
											const nextVisible = v === true;
											await db.songs.update(s.id, { visible: nextVisible, updatedAt: Date.now() });
											toast.success(nextVisible ? "Visible to users" : "Hidden from users");
										} catch (err) {
											console.error(err);
											toast.error("Failed to update visibility");
										}
									}}
								/>
								<span>Visible</span>
							</label>
							<Button variant="destructive" size="icon" onClick={() => setDeleteTarget(s)} aria-label="Delete">
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					</Card>
				))}
				{songs.length === 0 && <Card className="p-8 text-center text-muted-foreground">No songs yet.</Card>}
			</div>

			<Dialog
				open={!!viewTarget}
				onOpenChange={(open) => {
					if (!open) setViewTarget(null);
				}}
			>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Song details</DialogTitle>
						<DialogDescription>View song metadata and lyrics.</DialogDescription>
					</DialogHeader>
					{viewTarget ? (
						<div className="space-y-4">
							<div>
								<div className="text-xl font-semibold">{viewTarget.title}</div>
								<div className="text-sm text-muted-foreground">Singer: {viewTarget.singer}</div>
								<div className="text-sm text-muted-foreground">Writer: {viewTarget.writer}</div>
							</div>
							<AudioPlayer src={viewTarget.audioFileUrl} title={viewTarget.title} />
							<div>
								<div className="text-sm font-semibold mb-2">Lyrics</div>
								<div className="whitespace-pre-wrap border rounded-md bg-muted/30 p-4 text-base md:text-lg leading-relaxed max-h-[340px] overflow-y-auto overflow-x-hidden">
									{viewTarget.lyrics}
								</div>
							</div>
						</div>
					) : null}
					<DialogFooter>
						<Button variant="outline" onClick={() => setViewTarget(null)}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={!!editTarget}
				onOpenChange={(open) => {
					if (!open) {
						setEditTarget(null);
						setEditAudioFile(null);
					}
				}}
			>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Edit song</DialogTitle>
						<DialogDescription>Edit metadata and optionally replace audio.</DialogDescription>
					</DialogHeader>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Title</Label>
							<Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
						</div>
						<div className="space-y-2">
							<Label>Singer</Label>
							<Input value={editSinger} onChange={(e) => setEditSinger(e.target.value)} />
						</div>
						<div className="space-y-2">
							<Label>Writer</Label>
							<Input value={editWriter} onChange={(e) => setEditWriter(e.target.value)} />
						</div>
						<div className="space-y-2">
							<Label>Replace audio (optional)</Label>
							<Input type="file" accept="audio/*" onChange={(e) => setEditAudioFile(e.target.files?.[0] ?? null)} />
						</div>
					</div>
					<div className="space-y-2">
						<Label>Lyrics</Label>
						<Textarea value={editLyrics} onChange={(e) => setEditLyrics(e.target.value)} rows={10} />
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setEditTarget(null)} disabled={editing}>
							Cancel
						</Button>
						<Button
							disabled={!editTarget || editing || !editTitle.trim() || !editSinger.trim() || !editWriter.trim() || !editLyrics.trim()}
							onClick={async () => {
								if (!editTarget) return;
								setEditing(true);
								try {
									let nextAudioFilePath = editTarget.audioFilePath;
									let nextAudioFileUrl = editTarget.audioFileUrl;

									if (editAudioFile) {
										// Remove old audio file if it was file-based.
										if (window.songs?.deleteAudioFile && editTarget.audioFilePath && editTarget.audioFileUrl?.startsWith('file:')) {
											try {
												await window.songs.deleteAudioFile({ filePath: editTarget.audioFilePath });
											} catch {
												// ignore
											}
										}

										if (window.songs?.saveAudioFile) {
											const dataBase64 = await fileToBase64(editAudioFile);
											const saved = await window.songs.saveAudioFile({ fileName: editAudioFile.name, dataBase64 });
											nextAudioFilePath = saved.filePath;
											nextAudioFileUrl = saved.fileUrl;
										} else {
											nextAudioFilePath = '';
											nextAudioFileUrl = await fileToDataUrl(editAudioFile);
										}
									}

									await db.songs.update(editTarget.id, {
										title: editTitle.trim(),
										singer: editSinger.trim(),
										writer: editWriter.trim(),
										lyrics: editLyrics,
										audioFilePath: nextAudioFilePath,
										audioFileUrl: nextAudioFileUrl,
										updatedAt: Date.now(),
									});
									toast.success('Song updated');
									setEditTarget(null);
									setEditAudioFile(null);
								} catch (e) {
									console.error(e);
									toast.error('Failed to update song');
								} finally {
									setEditing(false);
								}
							}}
						>
							{editing ? 'Saving...' : 'Save'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={!!deleteTarget}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Delete song</DialogTitle>
						<DialogDescription>This will remove the song from the list and delete its audio file.</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={!deleteTarget || deleting}
							onClick={async () => {
								if (!deleteTarget) return;
								setDeleting(true);
								try {
									if (window.songs?.deleteAudioFile && deleteTarget.audioFilePath) {
										await window.songs.deleteAudioFile({ filePath: deleteTarget.audioFilePath });
									}
									await db.songs.delete(deleteTarget.id);
									toast.success("Song deleted");
									setDeleteTarget(null);
								} catch (err) {
									console.error(err);
									toast.error("Failed to delete song");
								} finally {
									setDeleting(false);
								}
							}}
						>
							{deleting ? "Deleting..." : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
