import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Pencil, Trash2, BarChart3, Eye, Play, Pause } from 'lucide-react';
import { toast } from 'sonner';
import AudioPlayer from '@/components/AudioPlayer';

export default function SongModulesAdmin() {
	const songs = useLiveQuery(async () => {
		const all = await db.songs.toArray();
		return all.slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
	}, [], [] as Song[]);
	const users = useLiveQuery(() => db.users.toArray(), [], [] as User[]);
	const modules = useLiveQuery(() => db.songModules.orderBy('createdAt').reverse().toArray(), [], [] as SongModule[]);

	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
	const [songSearch, setSongSearch] = useState('');
	const [saving, setSaving] = useState(false);

	const [assignModuleId, setAssignModuleId] = useState<string | null>(null);
	const [assignSelectedIds, setAssignSelectedIds] = useState<string[]>([]);
	const [editModuleId, setEditModuleId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState('');
	const [editDescription, setEditDescription] = useState('');
	const [editVisible, setEditVisible] = useState(true);
	const [editSelectedSongIds, setEditSelectedSongIds] = useState<string[]>([]);
	const [editSongSearch, setEditSongSearch] = useState('');
	const [editSaving, setEditSaving] = useState(false);

	const [listeningOpen, setListeningOpen] = useState(false);
	const [listeningModuleId, setListeningModuleId] = useState<string | null>(null);
	const [listeningDates, setListeningDates] = useState<string[]>([]);
	const [listeningSelectedDate, setListeningSelectedDate] = useState<string | null>(() => new Date().toISOString().slice(0, 10));
	const [listeningUserIdFilter, setListeningUserIdFilter] = useState<string | 'all'>('all');
	const [listeningDetailsOpen, setListeningDetailsOpen] = useState(false);
	const [listeningDetails, setListeningDetails] = useState<
		| null
		| {
			userId: string;
			username: string;
			songId: string;
			songTitle: string;
			listenedMs: number;
			timeInSongMs: number;
			enteredAtTs?: number;
			exitedAtTs?: number;
			songDurationSec?: number;
			lyricsScrollable: boolean;
			didScrollLyrics: boolean;
		}
	>(null);

	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [previewSong, setPreviewSong] = useState<Song | null>(null);
	const [playingSongId, setPlayingSongId] = useState<string | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const canCreate = title.trim().length > 0 && selectedSongIds.length > 0;

	const togglePlaySong = (song: Song) => {
		try {
			if (!audioRef.current) audioRef.current = new Audio();
			if (playingSongId === song.id) {
				audioRef.current.pause();
				setPlayingSongId(null);
				return;
			}
			audioRef.current.pause();
			audioRef.current.src = song.audioFileUrl;
			void audioRef.current.play();
			setPlayingSongId(song.id);
			audioRef.current.onended = () => setPlayingSongId(null);
		} catch (e) {
			console.error(e);
			toast.error('Failed to play audio');
		}
	};

	const filteredCreateSongs = useMemo(() => {
		const q = songSearch.trim().toLowerCase();
		if (!q) return songs ?? [];
		return (songs ?? []).filter((s) => {
			return (s.title || '').toLowerCase().includes(q) || (s.singer || '').toLowerCase().includes(q);
		});
	}, [songSearch, songs]);

	const createSongsVisible = useMemo(() => {
		return filteredCreateSongs.slice(0, 250);
	}, [filteredCreateSongs]);

	const filteredEditSongs = useMemo(() => {
		const q = editSongSearch.trim().toLowerCase();
		if (!q) return songs ?? [];
		return (songs ?? []).filter((s) => {
			return (s.title || '').toLowerCase().includes(q) || (s.singer || '').toLowerCase().includes(q);
		});
	}, [editSongSearch, songs]);

	const editSongsVisible = useMemo(() => {
		return filteredEditSongs.slice(0, 250);
	}, [filteredEditSongs]);

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
		if (!listeningEvents || !listeningSelectedDate) return [] as Array<{ value: string; label: string }>;
		const inDay = listeningEvents.filter((e) => e.date === listeningSelectedDate);
		const optionsMap = new Map<string, string>();
		for (const e of inDay) {
			const id = e.userId;
			if (id) {
				const label = e.username || usersById.get(id)?.username || id;
				optionsMap.set(id, label);
				continue;
			}
			const uname = e.username;
			if (uname) {
				optionsMap.set(`username:${uname}`, uname);
			}
		}
		return Array.from(optionsMap.entries())
			.map(([value, label]) => ({ value, label }))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [listeningEvents, listeningSelectedDate, usersById]);

	useEffect(() => {
		if (listeningUserIdFilter === 'all') return;
		if (!listeningSelectedDate) return;
		const allowed = new Set(listeningUserOptions.map((u) => u.value));
		if (!allowed.has(listeningUserIdFilter)) {
			setListeningUserIdFilter('all');
		}
	}, [listeningSelectedDate, listeningUserOptions, listeningUserIdFilter]);

	useEffect(() => {
		if (!listeningEvents) return;
		const unique = Array.from(new Set(listeningEvents.map((e) => e.date))).sort();
		setListeningDates(unique.slice(-60));
	}, [listeningEvents]);

	const formatMs = (ms: number) => {
		const sec = Math.max(0, Math.floor(ms / 1000));
		const m = Math.floor(sec / 60);
		const s = sec % 60;
		return `${m}:${String(s).padStart(2, '0')}`;
	};

	const formatSec = (sec?: number) => {
		if (sec == null) return '—';
		const s = Math.max(0, Math.floor(sec));
		const m = Math.floor(s / 60);
		const r = s % 60;
		return `${m}:${String(r).padStart(2, '0')}`;
	};

	const formatTime = (ts?: number) => {
		if (!ts) return '—';
		try {
			return new Date(ts).toLocaleString([], {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
			});
		} catch {
			return '—';
		}
	};

	const listeningRows = useMemo(() => {
		if (!listeningEvents || !listeningSelectedDate || !listeningModuleId) {
			return [] as Array<{
				userId: string;
				username: string;
				songId: string;
				songTitle: string;
				listenedMs: number;
				timeInSongMs: number;
				enteredAtTs?: number;
				exitedAtTs?: number;
				songDurationSec?: number;
				lyricsScrollable: boolean;
				didScrollLyrics: boolean;
			}>;
		}
		const filtered = listeningEvents.filter((e) => e.date === listeningSelectedDate);
		const scoped =
			listeningUserIdFilter === 'all'
				? filtered
				: listeningUserIdFilter.startsWith('username:')
					? filtered.filter((e) => e.username === listeningUserIdFilter.slice('username:'.length))
					: filtered.filter((e) => e.userId === listeningUserIdFilter);
		const map = new Map<
			string,
			{
				userId: string;
				username: string;
				songId: string;
				songTitle: string;
				listenedMs: number;
				timeInSongMs: number;
				enteredAtTs?: number;
				exitedAtTs?: number;
				songDurationSec?: number;
				lyricsScrollable: boolean;
				didScrollLyrics: boolean;
			}
		>();
		for (const e of scoped) {
			const userId = e.userId || 'unknown';
			const username = e.username || usersById.get(userId)?.username || 'Unknown';
			const song = songsById.get(e.songId);
			const songTitle = e.songTitle || song?.title || 'Unknown';
			const key = `${userId}__${e.songId}`;
			const prev = map.get(key);
			const addListenedMs = e.listenedMs ?? 0;
			const addTimeInSongMs = e.timeInSongMs ?? 0;
			const durationSec = e.songDurationSec;
			const lyricsScrollable = e.lyricsScrollable === true;
			const didScrollLyrics = e.didScrollLyrics === true;
			const enteredAtTs = e.eventType === 'view_start' ? e.timestamp : undefined;
			const exitedAtTs = e.eventType === 'view_end' ? e.timestamp : undefined;
			if (prev) {
				prev.listenedMs += addListenedMs;
				prev.timeInSongMs += addTimeInSongMs;
				if (enteredAtTs != null) {
					prev.enteredAtTs = prev.enteredAtTs == null ? enteredAtTs : Math.min(prev.enteredAtTs, enteredAtTs);
				}
				if (exitedAtTs != null) {
					prev.exitedAtTs = prev.exitedAtTs == null ? exitedAtTs : Math.max(prev.exitedAtTs, exitedAtTs);
				}
				if (typeof durationSec === 'number') {
					prev.songDurationSec = Math.max(prev.songDurationSec ?? 0, durationSec);
				}
				prev.lyricsScrollable = prev.lyricsScrollable || lyricsScrollable;
				prev.didScrollLyrics = prev.didScrollLyrics || didScrollLyrics;
			} else {
				map.set(key, {
					userId,
					username,
					songId: e.songId,
					songTitle,
					listenedMs: addListenedMs,
					timeInSongMs: addTimeInSongMs,
					enteredAtTs,
					exitedAtTs,
					songDurationSec: typeof durationSec === 'number' ? durationSec : undefined,
					lyricsScrollable,
					didScrollLyrics,
				});
			}
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
					<Input value={songSearch} onChange={(e) => setSongSearch(e.target.value)} placeholder="Search songs..." />
					<div className="max-h-[260px] overflow-y-auto rounded-md border p-2 space-y-1">
						{filteredCreateSongs.length > createSongsVisible.length && (
							<div className="text-xs text-muted-foreground px-1">
								Showing first {createSongsVisible.length} results. Refine your search to find more.
							</div>
						)}
						{(songs ?? []).length === 0 && (
							<div className="text-sm text-muted-foreground">No songs available. Upload songs first.</div>
						)}
						{createSongsVisible.map((s) => {
							const checked = selectedSongIds.includes(s.id);
							return (
								<label key={s.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
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
									<div
										className="flex items-center gap-2"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
										}}
									>
										<Button
											variant="outline"
											size="icon"
											className="h-8 w-8"
											aria-label={playingSongId === s.id ? 'Pause' : 'Play'}
											onClick={() => togglePlaySong(s)}
										>
											{playingSongId === s.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
										</Button>
										<Button
											variant="outline"
											size="icon"
											className="h-8 w-8"
											aria-label="View"
											onClick={() => setPreviewSong(s)}
										>
											<Eye className="h-4 w-4" />
										</Button>
										<span className="text-xs text-muted-foreground truncate max-w-[12rem]">{s.singer}</span>
									</div>
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
						setEditSongSearch('');
					}
				}}
			>
				<DialogContent className="max-w-6xl">
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
							<Input value={editSongSearch} onChange={(e) => setEditSongSearch(e.target.value)} placeholder="Search songs..." />
							<div className="max-h-[320px] overflow-y-auto rounded-md border p-2 space-y-1">
								{filteredEditSongs.length > editSongsVisible.length && (
									<div className="text-xs text-muted-foreground px-1">
										Showing first {editSongsVisible.length} results. Refine your search to find more.
									</div>
								)}
								{editSongsVisible.map((s) => {
									const checked = editSelectedSongIds.includes(s.id);
									return (
										<label key={s.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
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
											<div
												className="flex items-center gap-2"
												onClick={(e) => {
													e.preventDefault();
													e.stopPropagation();
												}}
											>
												<Button
													variant="outline"
													size="icon"
													className="h-8 w-8"
													aria-label={playingSongId === s.id ? 'Pause' : 'Play'}
													onClick={() => togglePlaySong(s)}
												>
													{playingSongId === s.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
												</Button>
												<Button
													variant="outline"
													size="icon"
													className="h-8 w-8"
													aria-label="View"
													onClick={() => setPreviewSong(s)}
												>
													<Eye className="h-4 w-4" />
												</Button>
												<span className="text-xs text-muted-foreground truncate max-w-[12rem]">{s.singer}</span>
											</div>
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

			<Dialog open={!!previewSong} onOpenChange={(open) => { if (!open) setPreviewSong(null); }}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Song details</DialogTitle>
						<DialogDescription>Preview song metadata and lyrics.</DialogDescription>
					</DialogHeader>
					{previewSong ? (
						<div className="space-y-4">
							<div>
								<div className="text-xl font-semibold">{previewSong.title}</div>
								{previewSong.singer ? <div className="text-sm text-muted-foreground">Singer: {previewSong.singer}</div> : null}
								{previewSong.writer ? <div className="text-sm text-muted-foreground">Writer: {previewSong.writer}</div> : null}
							</div>
							<AudioPlayer src={previewSong.audioFileUrl} title={previewSong.title} />
							<div>
								<div className="text-sm font-semibold mb-2">Lyrics</div>
								<div className="whitespace-pre-wrap border rounded-md bg-muted/30 p-4 text-base md:text-lg leading-relaxed max-h-[340px] overflow-y-auto overflow-x-hidden">
									{previewSong.lyrics || 'No lyrics added yet.'}
								</div>
							</div>
						</div>
					) : null}
					<DialogFooter>
						<Button variant="outline" onClick={() => setPreviewSong(null)}>Close</Button>
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
										<div className="flex items-center gap-2">
											<span>Student:</span>
											<Select value={listeningUserIdFilter} onValueChange={(v: any) => setListeningUserIdFilter(v)}>
												<SelectTrigger className="h-8 w-44 text-xs" disabled={listeningUserOptions.length === 0}>
													<SelectValue placeholder="All students" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="all">All students</SelectItem>
													{listeningUserOptions.map((u) => (
														<SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
								</div>
								<ScrollArea className="h-[55vh] rounded-md">
									{listeningRows.length ? (
										<div className="rounded-md border overflow-hidden">
											<div className="grid grid-cols-12 bg-muted px-3 py-2 text-xs font-medium">
												<div className="col-span-4">Student</div>
												<div className="col-span-5">Song</div>
												<div className="col-span-1 text-right" title="Time spent on the song screen (even if audio was not playing)">On screen</div>
												<div className="col-span-2 text-right" title="Estimated time the audio was actually playing">Audio played</div>
											</div>
											<div className="divide-y">
												{listeningRows.map((r) => (
													<button
														type="button"
														key={`${r.userId}-${r.songId}`}
														className="w-full grid grid-cols-12 gap-2 px-3 py-2 text-sm text-left hover:bg-muted/60 bg-transparent border-0 rounded-none appearance-none"
														onClick={() => {
															setListeningDetails(r);
															setListeningDetailsOpen(true);
														}}
													>
														<div className="col-span-4 truncate" title={r.username}>{r.username}</div>
														<div className="col-span-5 truncate" title={r.songTitle}>{r.songTitle}</div>
														<div className="col-span-1 text-right text-xs text-muted-foreground tabular-nums">{formatMs(r.timeInSongMs)}</div>
														<div className="col-span-2 text-right text-xs text-muted-foreground tabular-nums">{formatMs(r.listenedMs)}</div>
													</button>
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

			<Dialog
				open={listeningDetailsOpen}
				onOpenChange={(open) => {
					setListeningDetailsOpen(open);
					if (!open) setListeningDetails(null);
				}}
			>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Listening details</DialogTitle>
						<DialogDescription>Per-student details for the selected song/day.</DialogDescription>
					</DialogHeader>
					{listeningDetails ? (
						<div className="space-y-3 text-sm">
							<div className="space-y-1">
								<div className="text-xs text-muted-foreground">Student</div>
								<div className="font-medium">{listeningDetails.username}</div>
							</div>
							<div className="space-y-1">
								<div className="text-xs text-muted-foreground">Song</div>
								<div className="font-medium">{listeningDetails.songTitle}</div>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<div className="rounded-md border p-3">
									<div className="text-xs text-muted-foreground">Song duration</div>
									<div className="font-semibold tabular-nums">{formatSec(listeningDetails.songDurationSec)}</div>
								</div>
								<div className="rounded-md border p-3">
									<div className="text-xs text-muted-foreground">Audio played</div>
									<div className="font-semibold tabular-nums">{formatMs(listeningDetails.listenedMs)}</div>
								</div>
								<div className="rounded-md border p-3">
									<div className="text-xs text-muted-foreground">Time on song screen</div>
									<div className="font-semibold tabular-nums">{formatMs(listeningDetails.timeInSongMs)}</div>
								</div>
								<div className="rounded-md border p-3">
									<div className="text-xs text-muted-foreground">Entered at</div>
									<div className="font-semibold tabular-nums">{formatTime(listeningDetails.enteredAtTs)}</div>
								</div>
								<div className="rounded-md border p-3">
									<div className="text-xs text-muted-foreground">Exited at</div>
									<div className="font-semibold tabular-nums">{formatTime(listeningDetails.exitedAtTs)}</div>
								</div>
								<div className="rounded-md border p-3">
									<div className="text-xs text-muted-foreground">Lyrics scrolling</div>
									<div className="font-semibold">
										{listeningDetails.lyricsScrollable ? (
											listeningDetails.didScrollLyrics ? 'Scrollable (scrolled)' : 'Scrollable (not scrolled)'
										) : (
											'Not scrollable'
										)}
									</div>
								</div>
							</div>
						</div>
					) : null}
					<DialogFooter>
						<Button variant="outline" onClick={() => setListeningDetailsOpen(false)}>Close</Button>
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
