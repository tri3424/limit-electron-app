import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db, Song, SongListeningEvent, SongModule, User } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CheckedState } from '@radix-ui/react-checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

export default function SongModulesAdmin() {
	const songs = useLiveQuery(() => db.songs.orderBy('createdAt').reverse().toArray(), [], [] as Song[]);
	const users = useLiveQuery(() => db.users.toArray(), [], [] as User[]);
	const modules = useLiveQuery(() => db.songModules.orderBy('createdAt').reverse().toArray(), [], [] as SongModule[]);

	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
	const [saving, setSaving] = useState(false);

	const [assignModuleId, setAssignModuleId] = useState<string | null>(null);
	const [assignSelectedIds, setAssignSelectedIds] = useState<string[]>([]);
	const [editModuleId, setEditModuleId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState('');
	const [editDescription, setEditDescription] = useState('');
	const [editVisible, setEditVisible] = useState(true);
	const [editSelectedSongIds, setEditSelectedSongIds] = useState<string[]>([]);
	const [editSaving, setEditSaving] = useState(false);

	const [listeningOpen, setListeningOpen] = useState(false);
	const [listeningModuleId, setListeningModuleId] = useState<string | null>(null);
	const [listeningDates, setListeningDates] = useState<string[]>([]);
	const [listeningSelectedDate, setListeningSelectedDate] = useState<string | null>(() => new Date().toISOString().slice(0, 10));
	const [listeningUserIdFilter, setListeningUserIdFilter] = useState<string | 'all'>('all');

	const [deleteId, setDeleteId] = useState<string | null>(null);

	const canCreate = title.trim().length > 0 && selectedSongIds.length > 0;

	const usersById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);
	const songsById = useMemo(() => new Map((songs ?? []).map((s) => [s.id, s])), [songs]);

	const listeningEvents = useLiveQuery(
		async () => {
			if (!listeningOpen || !listeningModuleId) return [] as SongListeningEvent[];
			return db.songListeningEvents.where('songModuleId').equals(listeningModuleId).toArray();
		},
		[listeningOpen, listeningModuleId],
		[] as SongListeningEvent[],
	);

	const listeningUserOptions = useMemo(() => {
		if (!listeningEvents) return [];
		const ids = Array.from(new Set(listeningEvents.map((e) => e.userId).filter((x): x is string => !!x)));
		const resolved = ids.map((id) => usersById.get(id)).filter(Boolean) as User[];
		return resolved.sort((a, b) => a.username.localeCompare(b.username));
	}, [listeningEvents, usersById]);

	useEffect(() => {
		if (!listeningEvents) return;
		const unique = Array.from(new Set(listeningEvents.map((e) => e.date))).sort();
		setListeningDates(unique.slice(-60));
	}, [listeningEvents]);

	const listeningRows = useMemo(() => {
		if (!listeningEvents || !listeningSelectedDate || !listeningModuleId) return [] as Array<{ userId: string; username: string; songId: string; songTitle: string; listenedMs: number }>;
		const filtered = listeningEvents.filter((e) => e.date === listeningSelectedDate);
		const scoped = listeningUserIdFilter === 'all' ? filtered : filtered.filter((e) => e.userId === listeningUserIdFilter);
		const map = new Map<string, { userId: string; username: string; songId: string; songTitle: string; listenedMs: number }>();
		for (const e of scoped) {
			const userId = e.userId || 'unknown';
			const username = e.username || usersById.get(userId)?.username || 'Unknown';
			const song = songsById.get(e.songId);
			const songTitle = e.songTitle || song?.title || 'Unknown';
			const key = `${userId}__${e.songId}`;
			const prev = map.get(key);
			const addMs = e.listenedMs ?? 0;
			if (prev) prev.listenedMs += addMs;
			else map.set(key, { userId, username, songId: e.songId, songTitle, listenedMs: addMs });
		}
		return Array.from(map.values()).sort((a, b) => a.username.localeCompare(b.username) || a.songTitle.localeCompare(b.songTitle));
	}, [listeningEvents, listeningModuleId, listeningSelectedDate, listeningUserIdFilter, songsById, usersById]);

	return (
		<div className="max-w-7xl mx-auto space-y-6">
			<div>
				<h1 className="text-3xl font-bold text-foreground">Song Modules</h1>
				<p className="text-muted-foreground mt-2">Create modules, select songs, and assign them to users.</p>
			</div>

			<Card className="p-6 space-y-4">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label>Module title</Label>
						<Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Devotional Songs" />
					</div>
					<div className="space-y-2">
						<Label>Description (optional)</Label>
						<Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown to users" />
					</div>
				</div>

				<div className="space-y-2">
					<Label>Select songs for this module</Label>
					<div className="max-h-[260px] overflow-y-auto rounded-md border p-3 space-y-2">
						{(songs ?? []).length === 0 && (
							<div className="text-sm text-muted-foreground">No songs available. Upload songs first.</div>
						)}
						{(songs ?? []).map((s) => {
							const checked = selectedSongIds.includes(s.id);
							return (
								<label key={s.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
									<div className="flex items-center gap-2 min-w-0">
										<Checkbox
											checked={checked}
											onCheckedChange={(v: CheckedState) => {
												setSelectedSongIds((prev) =>
													v === true ? Array.from(new Set([...prev, s.id])) : prev.filter((id) => id !== s.id),
												);
											}}
										/>
										<span className="truncate">{s.title}</span>
									</div>
									<span className="text-xs text-muted-foreground truncate">{s.singer}</span>
								</label>
							);
						})}
					</div>
				</div>

				<div className="flex justify-end">
					<Button
						disabled={!canCreate || saving}
						onClick={async () => {
							if (!canCreate) return;
							setSaving(true);
							try {
								const now = Date.now();
								await db.songModules.add({
									id: uuidv4(),
									title: title.trim(),
									description: description.trim() || undefined,
									songIds: selectedSongIds.slice(),
									assignedUserIds: [],
									createdAt: now,
									updatedAt: now,
									visible: true,
								});
								setTitle('');
								setDescription('');
								setSelectedSongIds([]);
								toast.success('Song module created');
							} catch (e) {
								console.error(e);
								toast.error('Failed to create module');
							} finally {
								setSaving(false);
							}
					}}
					>
						{saving ? 'Creating...' : 'Create module'}
					</Button>
				</div>
			</Card>

			<div className="space-y-3">
				{(modules ?? []).map((m) => {
					const assignedUsers = (m.assignedUserIds || []).map((id) => usersById.get(id)).filter(Boolean) as User[];
					return (
						<Card key={m.id} className="p-4 flex items-start justify-between gap-4">
							<div className="min-w-0">
								<div className="text-lg font-semibold truncate">{m.title}</div>
								{m.description ? <div className="text-sm text-muted-foreground">{m.description}</div> : null}
								<div className="text-sm text-muted-foreground mt-1">Songs: {m.songIds.length}</div>
								<div className="text-xs text-muted-foreground mt-2">
									Assigned users: {assignedUsers.length ? assignedUsers.map((u) => u.username).join(', ') : 'None'}
								</div>
							</div>

							<div className="shrink-0 flex items-center gap-2">
								<Button
									variant="outline"
									onClick={() => {
										setEditModuleId(m.id);
										setEditTitle(m.title);
										setEditDescription(m.description || '');
										setEditVisible(m.visible !== false);
										setEditSelectedSongIds(m.songIds || []);
									}}
								>
									<Pencil className="h-4 w-4 mr-2" />
									Edit
								</Button>
								<Button
									variant="outline"
									onClick={async () => {
										setListeningModuleId(m.id);
										setListeningSelectedDate(new Date().toISOString().slice(0, 10));
										setListeningUserIdFilter('all');
										setListeningOpen(true);
									}}
								>
									<BarChart3 className="h-4 w-4 mr-2" />
									Listening
								</Button>
								<Button
									variant="outline"
									onClick={() => {
										setAssignModuleId(m.id);
										setAssignSelectedIds(m.assignedUserIds || []);
									}}
								>
									Assign users
								</Button>
								<Button variant="destructive" size="icon" onClick={() => setDeleteId(m.id)} aria-label="Delete">
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						</Card>
					);
				})}
				{(modules ?? []).length === 0 && <Card className="p-8 text-center text-muted-foreground">No song modules yet.</Card>}
			</div>

			{/* Edit Module */}
			<Dialog
				open={!!editModuleId}
				onOpenChange={(open) => {
					if (!open) {
						setEditModuleId(null);
						setEditTitle('');
						setEditDescription('');
						setEditVisible(true);
						setEditSelectedSongIds([]);
					}
				}}
			>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Edit module</DialogTitle>
						<DialogDescription>Update title/description, choose songs, and toggle visibility.</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label>Module title</Label>
								<Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
							</div>
							<div className="space-y-2">
								<Label>Description (optional)</Label>
								<Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
							</div>
						</div>
						<label className="flex items-center gap-2 text-sm">
							<Checkbox checked={editVisible} onCheckedChange={(v: CheckedState) => setEditVisible(v === true)} />
							<span>Visible to students</span>
						</label>
						<div className="space-y-2">
							<Label>Select songs for this module</Label>
							<div className="max-h-[320px] overflow-y-auto rounded-md border p-3 space-y-2">
								{(songs ?? []).map((s) => {
									const checked = editSelectedSongIds.includes(s.id);
									return (
										<label key={s.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
											<div className="flex items-center gap-2 min-w-0">
												<Checkbox
													checked={checked}
													onCheckedChange={(v: CheckedState) => {
														setEditSelectedSongIds((prev) =>
															v === true ? Array.from(new Set([...prev, s.id])) : prev.filter((id) => id !== s.id),
														);
													}}
												/>
												<span className="truncate">{s.title}</span>
											</div>
											<span className="text-xs text-muted-foreground truncate">{s.singer}</span>
										</label>
									);
								})}
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setEditModuleId(null)} disabled={editSaving}>Cancel</Button>
						<Button
							disabled={editSaving || editTitle.trim().length === 0 || editSelectedSongIds.length === 0}
							onClick={async () => {
							if (!editModuleId) return;
							setEditSaving(true);
							try {
								await db.songModules.update(editModuleId, {
									title: editTitle.trim(),
									description: editDescription.trim() || undefined,
									visible: editVisible,
									songIds: editSelectedSongIds.slice(),
									updatedAt: Date.now(),
								});
								toast.success('Module updated');
								setEditModuleId(null);
							} catch (e) {
								console.error(e);
								toast.error('Failed to update module');
							} finally {
								setEditSaving(false);
							}
						}}
						>
							{editSaving ? 'Saving...' : 'Save changes'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Listening Report */}
			<Dialog
				open={listeningOpen}
				onOpenChange={(open) => {
					setListeningOpen(open);
					if (!open) {
						setListeningModuleId(null);
						setListeningSelectedDate(new Date().toISOString().slice(0, 10));
						setListeningDates([]);
						setListeningUserIdFilter('all');
					}
				}}
			>
				<DialogContent className="max-w-6xl">
					<DialogHeader>
						<DialogTitle>Song Module Listening</DialogTitle>
						<DialogDescription>Date-wise listening summary for this song module.</DialogDescription>
					</DialogHeader>
					<div className="grid grid-cols-12 gap-4">
						<div className="col-span-4">
							<Card className="p-3 h-[64vh] overflow-hidden">
								<div className="text-sm font-medium mb-2">Days</div>
								<ScrollArea className="h-[58vh] rounded-md">
									<div className="divide-y">
										{listeningDates.length ? listeningDates.slice().reverse().map((d) => (
											<div key={d} className={`p-3 flex items-center justify-between ${listeningSelectedDate === d ? 'bg-muted' : ''}`}>
												<div className="text-sm font-medium">{d}</div>
												<Button size="sm" variant="outline" onClick={() => setListeningSelectedDate(d)}>View</Button>
											</div>
										)) : (
											<div className="p-6 text-center text-muted-foreground">No days recorded.</div>
										)}
									</div>
								</ScrollArea>
							</Card>
						</div>
						<div className="col-span-8">
							<Card className="p-3 h-[64vh] overflow-hidden">
								<div className="flex flex-wrap items-center justify-between gap-3 mb-3">
									<div className="space-y-0.5">
										<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Selected day</div>
										<div className="font-semibold">{listeningSelectedDate ? new Date(listeningSelectedDate).toLocaleDateString() : new Date().toLocaleDateString()}</div>
									</div>
									<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
										{listeningUserOptions.length > 0 && (
											<div className="flex items-center gap-2">
												<span>Student:</span>
												<Select value={listeningUserIdFilter} onValueChange={(v: any) => setListeningUserIdFilter(v)}>
													<SelectTrigger className="h-8 w-44 text-xs">
														<SelectValue placeholder="All students" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="all">All students</SelectItem>
														{listeningUserOptions.map((u) => (
															<SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
										)}
									</div>
								</div>
								<ScrollArea className="h-[55vh] rounded-md">
									{listeningRows.length ? (
										<div className="rounded-md border overflow-hidden">
											<div className="grid grid-cols-12 bg-muted px-3 py-2 text-xs font-medium">
												<div className="col-span-4">Student</div>
												<div className="col-span-6">Song</div>
												<div className="col-span-2 text-right">Listened</div>
											</div>
											<div className="divide-y">
												{listeningRows.map((r) => (
													<div key={`${r.userId}-${r.songId}`} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
														<div className="col-span-4 truncate" title={r.username}>{r.username}</div>
														<div className="col-span-6 truncate" title={r.songTitle}>{r.songTitle}</div>
														<div className="col-span-2 text-right text-xs text-muted-foreground tabular-nums">{Math.round(r.listenedMs / 1000)}s</div>
													</div>
												))}
											</div>
										</div>
									) : (
										<div className="p-8 text-center text-muted-foreground">No listening data for selected date.</div>
									)}
								</ScrollArea>
							</Card>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setListeningOpen(false)}>Close</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Assign Users */}
			<Dialog
				open={!!assignModuleId}
				onOpenChange={(open) => {
					if (!open) {
						setAssignModuleId(null);
						setAssignSelectedIds([]);
					}
				}}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Assign Users</DialogTitle>
						<DialogDescription>Select students who can access this song module.</DialogDescription>
					</DialogHeader>
					<div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
						{(users ?? []).length === 0 && <div className="text-sm text-muted-foreground">No users found.</div>}
						{(users ?? []).map((u) => {
							const checked = assignSelectedIds.includes(u.id);
							return (
								<label key={u.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
									<div className="flex items-center gap-2">
										<Checkbox
											checked={checked}
											onCheckedChange={(v: CheckedState) => {
												setAssignSelectedIds((prev) =>
													v === true ? Array.from(new Set([...prev, u.id])) : prev.filter((id) => id !== u.id),
												);
											}}
										/>
										<span>{u.username}</span>
									</div>
								</label>
							);
						})}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setAssignModuleId(null)}>
							Cancel
						</Button>
						<Button
							onClick={async () => {
								if (!assignModuleId) return;
								try {
									await db.songModules.update(assignModuleId, {
										assignedUserIds: assignSelectedIds,
										updatedAt: Date.now(),
									});
									toast.success('Assignments saved');
									setAssignModuleId(null);
									setAssignSelectedIds([]);
								} catch (e) {
									console.error(e);
									toast.error('Failed to save assignments');
								}
							}}
						>
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete module */}
			<Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Delete module</DialogTitle>
						<DialogDescription>This only deletes the module. It will not delete songs.</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
						<Button
							variant="destructive"
							onClick={async () => {
								if (!deleteId) return;
								try {
									await db.songModules.delete(deleteId);
									toast.success('Module deleted');
									setDeleteId(null);
								} catch (e) {
									console.error(e);
									toast.error('Failed to delete module');
								}
							}}
						>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
