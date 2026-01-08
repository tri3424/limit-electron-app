import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { v4 as uuidv4 } from "uuid";
import { db, LyricsSourceEntry, Song } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Eye, Pencil, Play, Pause, RefreshCcw, Trash2 } from "lucide-react";
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

async function readArtistFromAudioFile(file: File): Promise<string | null> {
	try {
		const mod = await import('music-metadata-browser');
		const metadata = await mod.parseBlob(file);
		const artist = metadata?.common?.artist;
		return typeof artist === 'string' && artist.trim().length ? artist.trim() : null;
	} catch {
		return null;
	}
}

function fileNameToTitle(name: string) {
	const base = name.replace(/\.[^/.]+$/, "");
	return base.replace(/[_-]+/g, " ").trim();
}

function ComboBox({
	value,
	onChange,
	options,
	placeholder,
}: {
	value: string;
	onChange: (next: string) => void;
	options: string[];
	placeholder: string;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return options;
		return options.filter((o) => o.toLowerCase().includes(q));
	}, [options, query]);

	const displayValue = value.trim().length ? value : placeholder;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className="w-full justify-between"
				>
					<span className={value.trim().length ? "truncate" : "truncate text-muted-foreground"}>{displayValue}</span>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
				<Command>
					<CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
					<CommandList>
						<CommandEmpty>No matches.</CommandEmpty>
						{query.trim().length > 0 && !options.some((o) => o.toLowerCase() === query.trim().toLowerCase()) ? (
							<CommandItem
								value={query.trim()}
								onSelect={() => {
									onChange(query.trim());
									setOpen(false);
								}}
							>
								<div className="flex items-center gap-2">
									<Check className="h-4 w-4 opacity-0" />
									<span className="truncate">Use "{query.trim()}"</span>
								</div>
							</CommandItem>
						) : null}
						{filtered.map((o) => (
							<CommandItem
								key={o}
								value={o}
								onSelect={() => {
									onChange(o);
									setOpen(false);
								}}
							>
								<div className="flex items-center gap-2">
									<Check className={value.trim().toLowerCase() === o.toLowerCase() ? "h-4 w-4" : "h-4 w-4 opacity-0"} />
									<span className="truncate">{o}</span>
								</div>
							</CommandItem>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
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
	const songs = useLiveQuery(async () => {
		const all = await db.songs.toArray();
		return all.slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
	}, [], [] as Song[]);
	const uploadAudioInputRef = useRef<HTMLInputElement | null>(null);
	const bulkUploadAudioInputRef = useRef<HTMLInputElement | null>(null);

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

	const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
	const [duplicateIncomingTitle, setDuplicateIncomingTitle] = useState('');
	const [duplicateIncomingLyrics, setDuplicateIncomingLyrics] = useState<string | undefined>(undefined);
	const [duplicateIncomingSinger, setDuplicateIncomingSinger] = useState<string | undefined>(undefined);
	const [duplicateIncomingWriter, setDuplicateIncomingWriter] = useState<string | undefined>(undefined);
	const [duplicateMode, setDuplicateMode] = useState<'create' | 'bulk' | 'edit'>('create');
	const [duplicateExcludeId, setDuplicateExcludeId] = useState<string | undefined>(undefined);
	const [duplicateDupes, setDuplicateDupes] = useState<Song[]>([]);
	const [duplicateSelectedDupeId, setDuplicateSelectedDupeId] = useState<string>('');
	const [duplicateRenameIncoming, setDuplicateRenameIncoming] = useState('');
	const [duplicateRenameExisting, setDuplicateRenameExisting] = useState('');
	const duplicateResolveRef = useRef<((value: { action: 'keep' } | { action: 'renameIncoming'; title: string } | { action: 'renameExisting'; dupeId: string; title: string } | { action: 'replaceExisting'; dupeId: string } | { action: 'cancel' }) => void) | null>(null);

	const [playingSongId, setPlayingSongId] = useState<string | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const [songsSearchText, setSongsSearchText] = useState('');
	const filteredSongs = useMemo(() => {
		const list = songs ?? [];
		const q = songsSearchText.trim().toLowerCase();
		if (!q) return list;
		return list.filter((s) => {
			const hay = `${s.title || ''} ${s.singer || ''} ${s.writer || ''} ${s.lyrics || ''}`.toLowerCase();
			return hay.includes(q);
		});
	}, [songs, songsSearchText]);

	const [refetchTarget, setRefetchTarget] = useState<Song | null>(null);
	const [refetchQuery, setRefetchQuery] = useState('');
	const [refetching, setRefetching] = useState(false);
	const [refetchResults, setRefetchResults] = useState<Array<{ entry: LyricsSourceEntry; score: number }> | null>(null);
	const [selectedRefetchId, setSelectedRefetchId] = useState<string>('');

	const canSave = useMemo(() => {
		return title.trim().length > 0 && audioFile != null;
	}, [title, audioFile]);

	const normalizeEnglishTitle = (value: string) =>
		value
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();

	const scoreMatch = (query: string, candidate: string) => {
		const q = normalizeEnglishTitle(query);
		const c = normalizeEnglishTitle(candidate);
		if (!q || !c) return 0;
		if (q === c) return 100;
		if (c.includes(q) || q.includes(c)) return 75;
		const qTokens = q.split(' ').filter(Boolean);
		if (!qTokens.length) return 0;
		let hits = 0;
		for (const t of qTokens) {
			if (c.includes(t)) hits += 1;
		}
		return Math.round((hits / qTokens.length) * 60);
	};

	const runLyricsRefetch = async (song: Song, queryOverride?: string) => {
		const baseQuery = typeof queryOverride === 'string' ? queryOverride : (song.title || '');
		const q = normalizeEnglishTitle(baseQuery);
		setRefetchQuery(baseQuery);
		setRefetching(true);
		setRefetchResults(null);
		setSelectedRefetchId('');
		try {
			if (!q) {
				toast.error('No English title to search');
				return;
			}
			const candidates = await db.lyricsSource.toArray();
			const scored = candidates
				.map((entry) => ({ entry, score: scoreMatch(q, entry.normalizedEnglishTitle || entry.englishTitle || '') }))
				.filter((x) => x.score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, 10);

			setRefetchResults(scored);
			if (scored[0]) setSelectedRefetchId(scored[0].entry.id);
			if (!scored.length) toast.error('No matching lyrics found in lyrics source');
		} catch (e) {
			console.error(e);
			toast.error('Failed to search lyrics source');
		} finally {
			setRefetching(false);
		}
	};

	const normalizeSongTitle = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

	const findDuplicateSongsByTitle = async (nextTitle: string, excludeId?: string) => {
		const normalized = normalizeSongTitle(nextTitle);
		if (!normalized) return [] as Song[];
		const all = await db.songs.toArray();
		return all.filter((s) => normalizeSongTitle(s.title || '') === normalized && (!excludeId || s.id !== excludeId));
	};

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

	const openDuplicateDialog = async (opts: {
		mode: 'create' | 'bulk' | 'edit';
		incomingTitle: string;
		incomingLyrics?: string;
		incomingSinger?: string;
		incomingWriter?: string;
		excludeId?: string;
	}) => {
		const dupes = await findDuplicateSongsByTitle(opts.incomingTitle, opts.excludeId);
		if (!dupes.length) return { action: 'keep' } as const;
		setDuplicateMode(opts.mode);
		setDuplicateIncomingTitle(opts.incomingTitle);
		setDuplicateIncomingLyrics(opts.incomingLyrics);
		setDuplicateIncomingSinger(opts.incomingSinger);
		setDuplicateIncomingWriter(opts.incomingWriter);
		setDuplicateExcludeId(opts.excludeId);
		setDuplicateDupes(dupes);
		setDuplicateSelectedDupeId(dupes[0]?.id || '');
		setDuplicateRenameIncoming('');
		setDuplicateRenameExisting('');
		setDuplicateDialogOpen(true);
		return await new Promise<
			{ action: 'keep' }
			| { action: 'renameIncoming'; title: string }
			| { action: 'renameExisting'; dupeId: string; title: string }
			| { action: 'replaceExisting'; dupeId: string }
			| { action: 'cancel' }
		>((resolve) => {
			duplicateResolveRef.current = resolve;
		});
	};

	const closeDuplicateDialog = (result: Parameters<NonNullable<typeof duplicateResolveRef.current>>[0]) => {
		setDuplicateDialogOpen(false);
		const r = duplicateResolveRef.current;
		duplicateResolveRef.current = null;
		if (r) r(result);
	};

	const resolveDuplicateBeforeCreateOrEdit = async (opts: {
		mode: 'create' | 'bulk' | 'edit';
		incomingTitle: string;
		incomingLyrics?: string;
		incomingSinger?: string;
		incomingWriter?: string;
		excludeId?: string;
	}) => {
		let incomingTitle = opts.incomingTitle;
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const dupes = await findDuplicateSongsByTitle(incomingTitle, opts.excludeId);
			if (!dupes.length) return { action: 'keep', title: incomingTitle } as const;
			const decision = await openDuplicateDialog({
				mode: opts.mode,
				incomingTitle,
				incomingLyrics: opts.incomingLyrics,
				incomingSinger: opts.incomingSinger,
				incomingWriter: opts.incomingWriter,
				excludeId: opts.excludeId,
			});
			if (decision.action === 'cancel') return { action: 'cancel' } as const;
			if (decision.action === 'keep') return { action: 'keep', title: incomingTitle } as const;
			if (decision.action === 'renameIncoming') {
				incomingTitle = decision.title;
				continue;
			}
			if (decision.action === 'renameExisting') {
				await db.songs.update(decision.dupeId, { title: decision.title.trim(), updatedAt: Date.now() });
				return { action: 'keep', title: incomingTitle } as const;
			}
			if (decision.action === 'replaceExisting') {
				return { action: 'replaceExisting', title: incomingTitle, dupeId: decision.dupeId } as const;
			}
		}
	};

	const persistAudioFile = async (file: File) => {
		let audioFilePath = '';
		let audioFileUrl = '';
		let audioAssetId: string | undefined;

		try {
			const assetId = uuidv4();
			await db.binaryAssets.add({
				id: assetId,
				kind: 'song_audio',
				mimeType: file.type || 'application/octet-stream',
				data: file,
				createdAt: Date.now(),
			});
			audioAssetId = assetId;
		} catch {
			// ignore: keep existing file-based persistence as primary path
		}
		// Electron mode: persist to userData via preload IPC
		if (window.songs?.saveAudioFile) {
			const dataBase64 = await fileToBase64(file);
			const saved = await window.songs.saveAudioFile({
				fileName: file.name,
				dataBase64,
			});
			audioFilePath = saved.filePath;
			audioFileUrl = saved.fileUrl;
		} else {
			// Browser mode fallback: store a data URL in Dexie (fully offline)
			audioFileUrl = await fileToDataUrl(file);
		}
		return { audioFilePath, audioFileUrl, audioAssetId };
	};

	const addSongFromFile = async (file: File) => {
		const now = Date.now();
		const resolvedTitle = fileNameToTitle(file.name);
		const decision = await resolveDuplicateBeforeCreateOrEdit({ mode: 'bulk', incomingTitle: resolvedTitle });
		if (decision.action === 'cancel') throw new Error('Canceled');
		const artist = await readArtistFromAudioFile(file);
		const { audioFilePath, audioFileUrl, audioAssetId } = await persistAudioFile(file);
		if (decision.action === 'replaceExisting') {
			await db.songs.update(decision.dupeId, {
				title: resolvedTitle,
				singer: artist ?? '',
				writer: '',
				audioFilePath,
				audioFileUrl,
				audioAssetId,
				updatedAt: now,
			});
			return;
		}
		await db.songs.add({
			id: uuidv4(),
			title: decision.title,
			singer: artist ?? '',
			writer: '',
			lyrics: '',
			audioFilePath,
			audioFileUrl,
			audioAssetId,
			createdAt: now,
			updatedAt: now,
			visible: true,
		});
	};

	const singerOptions = useMemo(() => {
		const set = new Set(
			(songs ?? [])
				.map((s) => (s.singer ?? "").trim())
				.filter((v) => v.length > 0),
		);
		return Array.from(set).sort((a, b) => a.localeCompare(b));
	}, [songs]);

	const writerOptions = useMemo(() => {
		const set = new Set(
			(songs ?? [])
				.map((s) => (s.writer ?? "").trim())
				.filter((v) => v.length > 0),
		);
		return Array.from(set).sort((a, b) => a.localeCompare(b));
	}, [songs]);

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
						<ComboBox value={singer} onChange={setSinger} options={singerOptions} placeholder="Singer" />
					</div>
					<div className="space-y-2">
						<Label>Writer</Label>
						<ComboBox value={writer} onChange={setWriter} options={writerOptions} placeholder="Writer" />
					</div>
					<div className="space-y-2">
						<Label>Audio file</Label>
						<Input
							ref={uploadAudioInputRef}
							type="file"
							accept="audio/*"
							onChange={(e) => {
								const file = e.target.files?.[0] ?? null;
								setAudioFile(file);
								if (file && !title.trim()) setTitle(fileNameToTitle(file.name));
								if (file && !singer.trim()) {
									void readArtistFromAudioFile(file).then((artist) => {
										if (artist && !singer.trim()) setSinger(artist);
									});
								}
							}}
						/>
						<Input
							ref={bulkUploadAudioInputRef}
							type="file"
							accept="audio/*"
							multiple
							className="hidden"
							onChange={(e) => {
								const files = Array.from(e.target.files || []);
								if (!files.length) return;
								void (async () => {
									setSaving(true);
									try {
										for (const f of files) {
											await addSongFromFile(f);
										}
										toast.success(window.songs?.saveAudioFile ? 'Songs uploaded' : 'Songs uploaded (stored locally)');
									} catch (err) {
										console.error(err);
										toast.error('Failed to bulk upload songs');
									} finally {
										setSaving(false);
										if (bulkUploadAudioInputRef.current) bulkUploadAudioInputRef.current.value = '';
									}
								})();
							}}
						/>
					</div>
				</div>
				<div className="space-y-2">
					<Label>Lyrics</Label>
					<Textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} rows={8} placeholder="Paste lyrics here..." />
				</div>
				<div className="flex items-center justify-end gap-2">
					<Button
						variant="outline"
						disabled={saving}
						onClick={() => bulkUploadAudioInputRef.current?.click()}
					>
						Bulk upload audio
					</Button>
					<Button
						disabled={!canSave || saving}
						onClick={async () => {
							if (!canSave || !audioFile) return;
							setSaving(true);
							try {
								const decision = await resolveDuplicateBeforeCreateOrEdit({
									mode: 'create',
									incomingTitle: title.trim(),
									incomingLyrics: lyrics,
									incomingSinger: singer.trim(),
									incomingWriter: writer.trim(),
								});
								if (decision.action === 'cancel') return;
								const { audioFilePath, audioFileUrl } = await persistAudioFile(audioFile);

								const now = Date.now();
								if (decision.action === 'replaceExisting') {
									const targetId = decision.dupeId;
									const existing = await db.songs.get(targetId);
									await db.songs.update(targetId, {
										title: title.trim(),
										singer: singer.trim(),
										writer: writer.trim(),
										lyrics: lyrics?.trim().length ? lyrics : (existing?.lyrics || ''),
										audioFilePath,
										audioFileUrl,
										updatedAt: now,
									});
								} else {
									await db.songs.add({
										id: uuidv4(),
										title: decision.title,
										singer: singer.trim(),
										writer: writer.trim(),
										lyrics,
										audioFilePath,
										audioFileUrl,
										createdAt: now,
										updatedAt: now,
										visible: true,
									});
								}
								setTitle("");
								setSinger("");
								setWriter("");
								setLyrics("");
								setAudioFile(null);
								if (uploadAudioInputRef.current) uploadAudioInputRef.current.value = "";
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

			<Card className="p-3">
				<Input
					value={songsSearchText}
					onChange={(e) => setSongsSearchText(e.target.value)}
					placeholder="Search songs..."
					className="mb-3"
				/>
				<div className="max-h-[68vh] overflow-y-auto space-y-1 pr-1">
					{filteredSongs.map((s) => (
						<div key={s.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
							<div className="min-w-0 flex-1">
								<div className="font-medium truncate">{s.title}</div>
								<div className="text-xs text-muted-foreground truncate">{s.singer}</div>
							</div>
							<div className="flex items-center gap-2 shrink-0">
								<Button
									variant="outline"
									size="icon"
									className="h-8 w-8"
									aria-label={playingSongId === s.id ? 'Pause' : 'Play'}
									onClick={() => togglePlaySong(s)}
								>
									{playingSongId === s.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
								</Button>
								<Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setViewTarget(s)} aria-label="View">
									<Eye className="h-4 w-4" />
								</Button>
								<Button
									variant="outline"
									size="icon"
									className="h-8 w-8"
									aria-label="Re-fetch lyrics"
									onClick={() => {
										setRefetchTarget(s);
										void runLyricsRefetch(s);
									}}
								>
									<RefreshCcw className="h-4 w-4" />
								</Button>
								<Button
									variant="outline"
									size="icon"
									className="h-8 w-8"
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
								<label className="flex items-center gap-2 text-xs text-muted-foreground pl-1">
									<Checkbox
										checked={s.visible !== false}
										onCheckedChange={async (v) => {
											try {
												const nextVisible = v === true;
												await db.songs.update(s.id, { visible: nextVisible, updatedAt: Date.now() });
												toast.success(nextVisible ? 'Visible to users' : 'Hidden from users');
											} catch (err) {
												console.error(err);
												toast.error('Failed to update visibility');
											}
									}}
									/>
									<span>Visible</span>
								</label>
								<Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(s)} aria-label="Delete">
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						</div>
					))}
					{filteredSongs.length === 0 && <div className="p-8 text-center text-muted-foreground">No songs yet.</div>}
				</div>
			</Card>

			<Dialog
				open={!!refetchTarget}
				onOpenChange={(open) => {
					if (!open) {
						setRefetchTarget(null);
						setRefetchResults(null);
						setSelectedRefetchId('');
						setRefetchQuery('');
					}
				}}
			>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle>Re-fetch lyrics</DialogTitle>
						<DialogDescription>
							Search imported lyrics source by English name, preview, then verify to apply.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
							<div className="space-y-2">
								<Label>Search (English)</Label>
								<Input
									value={refetchQuery}
									onChange={(e) => setRefetchQuery(e.target.value)}
									placeholder="e.g. amader bhoy kahare"
									disabled={refetching}
								/>
								<div className="flex gap-2">
									<Button
										variant="outline"
										disabled={!refetchTarget || refetching}
										onClick={() => {
											if (!refetchTarget) return;
											void runLyricsRefetch(refetchTarget, refetchQuery);
										}}
									>
										{refetching ? 'Searching...' : 'Search'}
									</Button>
									<Button
										variant="outline"
										disabled={refetching}
										onClick={() => {
											setRefetchQuery(refetchTarget?.title || '');
											if (!refetchTarget) return;
											void runLyricsRefetch(refetchTarget, refetchTarget.title || '');
										}}
									>
										Reset
									</Button>
								</div>
							</div>
							<div className="space-y-2">
								<Label>Matches</Label>
								<div className="rounded-md border p-2 max-h-[240px] overflow-y-auto space-y-2">
									{(refetchResults ?? []).map((r) => (
										<label key={r.entry.id} className="flex items-start gap-2 text-sm">
											<input
												type="radio"
												name="lyricsMatch"
												checked={selectedRefetchId === r.entry.id}
												onChange={() => setSelectedRefetchId(r.entry.id)}
											/>
											<span className="min-w-0">
												<span className="font-medium">{r.entry.englishTitle}</span>
												<span className="text-xs text-muted-foreground"> (score {r.score})</span>
											</span>
										</label>
									))}
									{(!refetchResults || refetchResults.length === 0) && (
										<div className="text-xs text-muted-foreground">No matches.</div>
									)}
								</div>
							</div>
						</div>

						<div className="space-y-2">
							<Label>Preview (Bengali lyrics only)</Label>
							<div className="whitespace-pre-wrap border rounded-md bg-muted/30 p-4 text-sm max-h-[320px] overflow-y-auto overflow-x-hidden">
								{(() => {
									const selected = (refetchResults ?? []).find((r) => r.entry.id === selectedRefetchId)?.entry;
									return selected?.lyrics ?? '';
								})()}
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRefetchTarget(null)}>
							Close
						</Button>
						<Button
							disabled={!refetchTarget || !selectedRefetchId}
							onClick={async () => {
							if (!refetchTarget) return;
							const selected = (refetchResults ?? []).find((r) => r.entry.id === selectedRefetchId)?.entry;
							if (!selected) return;
							try {
								await db.songs.update(refetchTarget.id, {
									lyrics: selected.lyrics,
									writer: (refetchTarget.writer || '').trim().length ? refetchTarget.writer : (selected.writer || refetchTarget.writer),
									updatedAt: Date.now(),
								});
								toast.success('Lyrics updated');
								setRefetchTarget(null);
							} catch (e) {
								console.error(e);
								toast.error('Failed to update lyrics');
							}
						}}
						>
							Verify &amp; Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={duplicateDialogOpen}
				onOpenChange={(open) => {
					if (!open && duplicateDialogOpen) {
						closeDuplicateDialog({ action: 'cancel' });
					}
				}}
			>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Duplicate song title</DialogTitle>
						<DialogDescription>
							A song with the title <span className="font-semibold">{duplicateIncomingTitle}</span> already exists. Choose how you want to proceed.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-2">
							<div className="text-sm font-medium">Existing matches</div>
							<div className="rounded-md border p-2 max-h-[200px] overflow-y-auto space-y-2">
								{duplicateDupes.map((d) => (
									<label key={d.id} className="flex items-start gap-2 text-sm">
										<input
											type="radio"
											name="duplicateDupe"
											checked={duplicateSelectedDupeId === d.id}
											onChange={() => setDuplicateSelectedDupeId(d.id)}
										/>
										<span className="min-w-0">
											<span className="font-medium">{d.title}</span>
											{d.singer ? <span className="text-xs text-muted-foreground"> — {d.singer}</span> : null}
										</span>
									</label>
								))}
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<div className="text-sm font-medium">Rename the incoming song</div>
								<Input
									value={duplicateRenameIncoming}
									onChange={(e) => setDuplicateRenameIncoming(e.target.value)}
									placeholder="New title for the uploaded song"
								/>
								<Button
									variant="outline"
									disabled={!duplicateRenameIncoming.trim()}
									onClick={() => closeDuplicateDialog({ action: 'renameIncoming', title: duplicateRenameIncoming.trim() })}
								>
									Rename incoming & continue
								</Button>
							</div>
							<div className="space-y-2">
								<div className="text-sm font-medium">Rename the existing song</div>
								<Input
									value={duplicateRenameExisting}
									onChange={(e) => setDuplicateRenameExisting(e.target.value)}
									placeholder="New title for the selected existing song"
								/>
								<Button
									variant="outline"
									disabled={!duplicateRenameExisting.trim() || !duplicateSelectedDupeId}
									onClick={() =>
										closeDuplicateDialog({
											action: 'renameExisting',
											dupeId: duplicateSelectedDupeId,
											title: duplicateRenameExisting.trim(),
										})
									}
								>
									Rename existing & continue
								</Button>
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => closeDuplicateDialog({ action: 'keep' })}>
							Keep duplicate
						</Button>
						<Button
							type="button"
							disabled={!duplicateSelectedDupeId}
							onClick={() => closeDuplicateDialog({ action: 'replaceExisting', dupeId: duplicateSelectedDupeId })}
						>
							Replace existing
						</Button>
						<Button type="button" variant="outline" onClick={() => closeDuplicateDialog({ action: 'cancel' })}>
							Cancel
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={!!viewTarget}
				onOpenChange={(open) => {
					if (!open) setViewTarget(null);
				}}
			>
				<DialogContent className="max-w-5xl max-h-[86vh] overflow-y-auto">
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
							<ComboBox value={editSinger} onChange={setEditSinger} options={singerOptions} placeholder="Singer" />
						</div>
						<div className="space-y-2">
							<Label>Writer</Label>
							<ComboBox value={editWriter} onChange={setEditWriter} options={writerOptions} placeholder="Writer" />
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
							disabled={!editTarget || editing || !editTitle.trim()}
							onClick={async () => {
								if (!editTarget) return;
								setEditing(true);
								try {
									const decision = await resolveDuplicateBeforeCreateOrEdit({
										mode: 'edit',
										incomingTitle: editTitle.trim(),
										incomingLyrics: editLyrics,
										incomingSinger: editSinger.trim(),
										incomingWriter: editWriter.trim(),
										excludeId: editTarget.id,
									});
									if (decision.action === 'cancel') return;
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
										title: decision.title,
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
