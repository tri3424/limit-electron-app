import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { v4 as uuidv4 } from "uuid";
import { db, LyricsSourceEntry, Song, SongSrtCue } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Eye, FileText, Pencil, Play, Pause, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AudioPlayer from "@/components/AudioPlayer";
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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

function parseSrtTimeToMs(value: string): number {
	const v = value.trim();
	const m = v.match(/^(\d+):(\d+):(\d+)[,.](\d+)$/);
	if (!m) return 0;
	const hh = Number(m[1] || 0);
	const mm = Number(m[2] || 0);
	const ss = Number(m[3] || 0);
	let ms = Number(m[4] || 0);
	// normalize millis length ("7" => 7ms, "70" => 70ms, "700" => 700ms)
	if (m[4] && m[4].length === 1) ms *= 1;
	if (m[4] && m[4].length === 2) ms *= 1;
	if (m[4] && m[4].length > 3) ms = Number(String(m[4]).slice(0, 3));
	return (((hh * 60 + mm) * 60 + ss) * 1000 + ms) | 0;
}

function parseLrcTimeToMs(value: string): number {
	const v = value.trim();
	const m = v.match(/^(\d+):(\d+)(?:[\.:](\d+))?$/);
	if (!m) return 0;
	const mm = Number(m[1] || 0);
	const ss = Number(m[2] || 0);
	const frac = String(m[3] || '');
	let ms = 0;
	if (frac.length === 1) ms = Number(frac) * 100;
	else if (frac.length === 2) ms = Number(frac) * 10;
	else if (frac.length >= 3) ms = Number(frac.slice(0, 3));
	return ((mm * 60 + ss) * 1000 + ms) | 0;
}

function shouldIgnoreLrcLyricText(text: string): boolean {
	const t = text.trim();
	if (!t) return true;
	const lower = t.toLowerCase();
	if (/(https?:\/\/|www\.)/.test(lower)) return true;
	if (lower.includes('lrc generator')) return true;
	if (lower.includes('lrcgenerator')) return true;
	if (lower.includes('ailrcgenerator')) return true;
	if (lower.startsWith('by ') && lower.includes('generator')) return true;
	return false;
}

function parseLrc(text: string): Array<{ cueIndex: number; startMs: number; endMs: number; text: string }> {
	const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const lines = normalized.split("\n");
	const items: Array<{ startMs: number; text: string }> = [];

	for (const rawLine of lines) {
		const line = rawLine.replace(/^\uFEFF/, '').trimEnd();
		if (!line.trim()) continue;
		// Skip metadata tags like [ar:...], [ti:...], [offset:...]
		if (/^\[[a-zA-Z]+\s*:[^\]]*\]\s*$/.test(line.trim())) continue;

		const timeTags = Array.from(line.matchAll(/\[(\d{1,3}:\d{2}(?:[\.:]\d{1,3})?)\]/g)).map((m) => m[1] || '');
		if (!timeTags.length) continue;
		const lyricText = line.replace(/\[(\d{1,3}:\d{2}(?:[\.:]\d{1,3})?)\]/g, '').trim();
		if (shouldIgnoreLrcLyricText(lyricText)) continue;

		for (const t of timeTags) {
			items.push({ startMs: Math.max(0, parseLrcTimeToMs(t)), text: lyricText });
		}
	}

	items.sort((a, b) => a.startMs - b.startMs);
	const cues: Array<{ cueIndex: number; startMs: number; endMs: number; text: string }> = [];
	for (let i = 0; i < items.length; i += 1) {
		const cur = items[i]!;
		const next = items[i + 1];
		const startMs = cur.startMs;
		const endMs = next ? Math.max(startMs, next.startMs) : startMs + 2500;
		cues.push({ cueIndex: i, startMs, endMs, text: cur.text });
	}
	return cues;
}

function parseSrt(text: string): Array<{ cueIndex: number; startMs: number; endMs: number; text: string }> {
	const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const blocks = normalized.split(/\n{2,}/g);
	const cues: Array<{ cueIndex: number; startMs: number; endMs: number; text: string }> = [];
	let fallbackIndex = 1;
	for (const raw of blocks) {
		const lines = raw.split("\n").map((l) => l.trimEnd());
		const nonEmpty = lines.filter((l) => l.trim().length > 0);
		if (nonEmpty.length < 2) continue;

		let idx = 0;
		let cueIndex = fallbackIndex;
		if (/^[0-9]+$/.test(nonEmpty[0] || '')) {
			cueIndex = Number(nonEmpty[0]);
			idx = 1;
		}
		const timeLine = nonEmpty[idx] || '';
		const tm = timeLine.match(/^(\d+:\d+:\d+[,.]\d+)\s*-->\s*(\d+:\d+:\d+[,.]\d+)/);
		if (!tm) continue;
		const startMs = parseSrtTimeToMs(tm[1] || '');
		const endMs = parseSrtTimeToMs(tm[2] || '');
		const textLines = nonEmpty.slice(idx + 1).map((l) => l.replace(/^\uFEFF/, '')).filter((l) => l.trim().length > 0);
		const cueText = textLines.join("\n").trim();
		if (!cueText) {
			fallbackIndex += 1;
			continue;
		}
		cues.push({ cueIndex, startMs: Math.max(0, startMs), endMs: Math.max(0, endMs), text: cueText });
		fallbackIndex += 1;
	}
	return cues;
}

async function persistSongSrtCues(songId: string, srtText: string) {
	const parsed = parseSrt(srtText);
	const now = Date.now();
	await db.transaction('rw', [db.songSrtCues], async () => {
		await db.songSrtCues.where('songId').equals(songId).delete();
		if (!parsed.length) return;
		const rows: SongSrtCue[] = parsed
			.map((c, i) => ({
				id: `${songId}:${i}:${c.cueIndex}:${uuidv4()}`,
				songId,
				cueIndex: i,
				startMs: c.startMs,
				endMs: c.endMs,
				text: c.text,
				createdAt: now,
			}));
		await db.songSrtCues.bulkPut(rows);
	});
}

async function persistSongTimedLyricsCues(songId: string, timedText: string, format: 'srt' | 'lrc') {
	const parsed = format === 'lrc' ? parseLrc(timedText) : parseSrt(timedText);
	const now = Date.now();
	await db.transaction('rw', [db.songSrtCues], async () => {
		await db.songSrtCues.where('songId').equals(songId).delete();
		if (!parsed.length) return;
		const rows: SongSrtCue[] = parsed
			.map((c, i) => ({
				id: `${songId}:${i}:${c.cueIndex}:${uuidv4()}`,
				songId,
				cueIndex: i,
				startMs: c.startMs,
				endMs: c.endMs,
				text: c.text,
				createdAt: now,
			}));
		await db.songSrtCues.bulkPut(rows);
	});
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
	const srtCues = useLiveQuery(async () => {
		try {
			return await db.songSrtCues.toArray();
		} catch {
			return [] as SongSrtCue[];
		}
	}, [], [] as SongSrtCue[]);
	const srtCountBySongId = useMemo(() => {
		const map = new Map<string, number>();
		for (const c of srtCues ?? []) {
			map.set(c.songId, (map.get(c.songId) || 0) + 1);
		}
		return map;
	}, [srtCues]);
	const uploadAudioInputRef = useRef<HTMLInputElement | null>(null);
	const bulkUploadAudioInputRef = useRef<HTMLInputElement | null>(null);
	const bulkUploadLyricsInputRef = useRef<HTMLInputElement | null>(null);

	const [title, setTitle] = useState("");
	const [singer, setSinger] = useState("");
	const [writer, setWriter] = useState("");
	const [lyrics, setLyrics] = useState("");
	const [audioFile, setAudioFile] = useState<File | null>(null);
	const [srtFile, setSrtFile] = useState<File | null>(null);
	const [saving, setSaving] = useState(false);
	const uploadTimedLyricsInputRef = useRef<HTMLInputElement | null>(null);

	const [deleteTarget, setDeleteTarget] = useState<Song | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [viewTarget, setViewTarget] = useState<Song | null>(null);
	const [editTarget, setEditTarget] = useState<Song | null>(null);
	const [editTitle, setEditTitle] = useState("");
	const [editSinger, setEditSinger] = useState("");
	const [editWriter, setEditWriter] = useState("");
	const [editLyrics, setEditLyrics] = useState("");
	const [editAudioFile, setEditAudioFile] = useState<File | null>(null);
	const [editSrtFile, setEditSrtFile] = useState<File | null>(null);
	const [editing, setEditing] = useState(false);
	const editTimedLyricsInputRef = useRef<HTMLInputElement | null>(null);

	const [syncLyricsTarget, setSyncLyricsTarget] = useState<Song | null>(null);
	const [syncLyricsLoading, setSyncLyricsLoading] = useState(false);
	const [syncLyricsCandidates, setSyncLyricsCandidates] = useState<LyricsSourceEntry[]>([]);
	const [syncLyricsSelectedId, setSyncLyricsSelectedId] = useState<string | null>(null);
	const [syncLyricsManual, setSyncLyricsManual] = useState('');
	const [syncLyricsSearch, setSyncLyricsSearch] = useState('');

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

	const songSrtBySongId = useMemo(() => {
		const map = new Map<string, SongSrtCue[]>();
		for (const cue of srtCues ?? []) {
			if (!map.has(cue.songId)) map.set(cue.songId, []);
			map.get(cue.songId)!.push(cue);
		}
		for (const [k, list] of map) {
			list.sort((a, b) => (a.cueIndex ?? 0) - (b.cueIndex ?? 0));
			map.set(k, list);
		}
		return map;
	}, [srtCues]);

	const [adminSearchSongId, setAdminSearchSongId] = useState<string>('');
	const [adminSearchText, setAdminSearchText] = useState<string>('');
	const [adminCueId, setAdminCueId] = useState<string>('');
	const [adminSongPickerOpen, setAdminSongPickerOpen] = useState(false);
	const adminSearchMatches = useMemo(() => {
		const q = adminSearchText.trim().toLowerCase();
		if (!q) return [] as SongSrtCue[];
		if (adminSearchSongId) {
			return (songSrtBySongId.get(adminSearchSongId) || [])
				.filter((c) => !shouldIgnoreLrcLyricText(c.text || ''))
				.filter((c) => (c.text || '').toLowerCase().includes(q));
		}
		return (srtCues ?? [])
			.filter((c) => !shouldIgnoreLrcLyricText(c.text || ''))
			.filter((c) => (c.text || '').toLowerCase().includes(q));
	}, [adminSearchSongId, adminSearchText, songSrtBySongId, srtCues]);
	const adminActiveCue = useMemo(() => {
		if (!adminSearchMatches.length) return null;
		const picked = adminSearchMatches.find((c) => c.id === adminCueId) || adminSearchMatches[0] || null;
		if (!picked) return null;
		if (shouldIgnoreLrcLyricText(picked.text || '')) return null;
		return picked;
	}, [adminSearchMatches, adminCueId]);

	// Lyrics source search UI was removed from this screen (bulk lyrics sync added instead).

	const canSave = useMemo(() => {
		return title.trim().length > 0 && audioFile != null;
	}, [title, audioFile]);

	const normalizeEnglishTitle = (value: string) =>
		value
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();

	const normalizeSongTitle = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
	const normalizeSongTitleStrict = (value: string) =>
		value
			.trim()
			.toLowerCase()
			.replace(/\s+/g, ' ')
			.replace(/[^a-z0-9\s]/g, '')
			.trim();

	const levenshteinDistance = (aRaw: string, bRaw: string): number => {
		const a = aRaw || '';
		const b = bRaw || '';
		if (a === b) return 0;
		const n = a.length;
		const m = b.length;
		if (!n) return m;
		if (!m) return n;
		const dp = new Array(m + 1);
		for (let j = 0; j <= m; j++) dp[j] = j;
		for (let i = 1; i <= n; i++) {
			let prev = dp[0];
			dp[0] = i;
			for (let j = 1; j <= m; j++) {
				const tmp = dp[j];
				const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
				dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
				prev = tmp;
			}
		}
		return dp[m];
	};

	const fuzzyLyricsSourceScore = (queryRaw: string, entry: LyricsSourceEntry): number => {
		const q = normalizeEnglishTitle(queryRaw || '');
		if (!q) return 0;
		const title = normalizeEnglishTitle(entry.englishTitle || entry.normalizedEnglishTitle || '');
		const writer = normalizeEnglishTitle(entry.writer || '');
		const hay = `${title} ${writer}`.trim();
		if (!hay) return 0;
		if (title === q) return 1;
		if (title.includes(q) || q.includes(title)) return 0.92;

		const qt = q.split(' ').filter(Boolean);
		const tt = title.split(' ').filter(Boolean);
		const setT = new Set(tt);
		let overlap = 0;
		for (const token of qt) if (setT.has(token)) overlap++;
		const denom = qt.length + tt.length - overlap;
		const jaccard = denom > 0 ? overlap / denom : 0;
		const prefixBoost = title.startsWith(q) || q.startsWith(title) ? 0.2 : 0;

		const short = Math.max(1, Math.min(36, Math.max(q.length, title.length)));
		const dist = levenshteinDistance(q.slice(0, 36), title.slice(0, 36));
		const editSim = Math.max(0, 1 - dist / short);
		const editBoost = q.length >= 3 && title.length >= 3 ? 0.25 * editSim : 0;

		return Math.min(0.9, 0.65 * jaccard + prefixBoost + editBoost);
	};

	const scoreLyricsSourceMatch = (song: Song, entry: LyricsSourceEntry): number => {
		const songTitle = normalizeSongTitleStrict(song.title || '');
		const entryTitle = normalizeSongTitleStrict(entry.englishTitle || entry.normalizedEnglishTitle || '');
		if (!songTitle || !entryTitle) return 0;
		if (songTitle === entryTitle) return 100;
		if (entryTitle.includes(songTitle) || songTitle.includes(entryTitle)) return 85;

		const a = songTitle.split(' ').filter(Boolean);
		const b = entryTitle.split(' ').filter(Boolean);
		if (!a.length || !b.length) return 0;
		const setB = new Set(b);
		let overlap = 0;
		for (const t of a) if (setB.has(t)) overlap++;
		const jaccard = overlap / (a.length + b.length - overlap);
		const prefix = entryTitle.startsWith(songTitle) || songTitle.startsWith(entryTitle) ? 1 : 0;
		return Math.round(60 * jaccard + 15 * prefix);
	};

	const openSyncLyricsForSong = async (song: Song) => {
		setSyncLyricsTarget(song);
		setSyncLyricsCandidates([]);
		setSyncLyricsSelectedId(null);
		setSyncLyricsManual(song.lyrics || '');
		setSyncLyricsSearch(song.title || '');
		try {
			setSyncLyricsLoading(true);
			const all = await db.lyricsSource.orderBy('normalizedEnglishTitle').toArray();
			const scored = all
				.map((entry) => ({ entry, score: scoreLyricsSourceMatch(song, entry) }))
				.sort((a, b) => b.score - a.score || (a.entry.englishTitle || '').localeCompare(b.entry.englishTitle || ''));
			const sorted = scored.map((s) => s.entry);
			setSyncLyricsCandidates(sorted);
			const best = scored[0];
			if (best && best.score >= 60) {
				setSyncLyricsSelectedId(best.entry.id);
				setSyncLyricsManual(best.entry.lyrics || '');
			}
		} catch (e) {
			console.error(e);
			toast.error('Failed to load lyrics source matches');
		} finally {
			setSyncLyricsLoading(false);
		}
	};

	const filteredSyncLyricsCandidates = useMemo(() => {
		const list = syncLyricsCandidates ?? [];
		const qRaw = syncLyricsSearch.trim();
		if (!qRaw) return list;
		const q = normalizeEnglishTitle(qRaw);
		if (!q) return list;
		return list
			.map((e) => ({ e, score: fuzzyLyricsSourceScore(qRaw, e) }))
			.filter((x) => x.score >= 0.2)
			.sort((a, b) => b.score - a.score || (a.e.englishTitle || '').localeCompare(b.e.englishTitle || ''))
			.map((x) => x.e);
	}, [syncLyricsCandidates, syncLyricsSearch]);

	const resolveSongForLyricsFile = useMemo(() => {
		const list = songs ?? [];
		const byNorm = new Map<string, Song>();
		for (const s of list) {
			const k = normalizeSongTitleStrict(s.title || '');
			if (k) byNorm.set(k, s);
		}
		return (fileName: string) => {
			const baseTitle = fileNameToTitle(fileName);
			const exact = byNorm.get(normalizeSongTitleStrict(baseTitle));
			if (exact) return { song: exact, inferredTitle: baseTitle };

			const alt = baseTitle.replace(/\s*\((?:\d+|copy|duplicate|final)\)\s*$/i, '').trim();
			const exactAlt = byNorm.get(normalizeSongTitleStrict(alt));
			if (exactAlt) return { song: exactAlt, inferredTitle: alt };

			return { song: null as Song | null, inferredTitle: baseTitle };
		};
	}, [songs]);

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
						<div className="space-y-2">
							<Label>Timestamped lyrics (.srt / .lrc) (optional)</Label>
							<Input
								ref={uploadTimedLyricsInputRef}
								type="file"
								accept=".srt,.lrc,text/plain"
								onChange={(e) => setSrtFile(e.target.files?.[0] ?? null)}
							/>
							<div className="text-xs text-muted-foreground">
								If provided, this will be parsed and used for song recognition + timestamp playback.
							</div>
						</div>
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
					<Input
						ref={bulkUploadLyricsInputRef}
						type="file"
						accept=".txt,text/plain"
						multiple
						className="hidden"
						onChange={(e) => {
							const files = Array.from(e.target.files || []);
							if (!files.length) return;
							void (async () => {
								setSaving(true);
								try {
									let updated = 0;
									const missed: string[] = [];
									for (const f of files) {
										const { song, inferredTitle } = resolveSongForLyricsFile(f.name);
										if (!song) {
											missed.push(inferredTitle);
											continue;
										}
										const txt = (await f.text()).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
										if (!txt) continue;
										await db.songs.update(song.id, { lyrics: txt, updatedAt: Date.now() });
										updated += 1;
									}
									if (updated) toast.success(`Lyrics synced for ${updated} song${updated === 1 ? '' : 's'}`);
									else toast.error('No lyrics were synced');
									if (missed.length) {
										toast.error(`No matching song found for ${missed.length} file${missed.length === 1 ? '' : 's'}`);
									}
								} catch (err) {
									console.error(err);
									toast.error('Failed to bulk sync lyrics');
								} finally {
									setSaving(false);
									if (bulkUploadLyricsInputRef.current) bulkUploadLyricsInputRef.current.value = '';
								}
							})();
						}}
					/>
					<Button
						variant="outline"
						disabled={saving}
						onClick={() => bulkUploadAudioInputRef.current?.click()}
					>
						Bulk upload audio
					</Button>
					<Button
						variant="outline"
						disabled={saving}
						onClick={() => bulkUploadLyricsInputRef.current?.click()}
					>
						Bulk sync lyrics (.txt)
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
								let songIdForSrt: string | null = null;
								if (decision.action === 'replaceExisting') {
									const targetId = decision.dupeId;
									songIdForSrt = targetId;
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
									const createdId = uuidv4();
									songIdForSrt = createdId;
									await db.songs.add({
										id: createdId,
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
								if (srtFile && songIdForSrt) {
									const timedText = await srtFile.text();
									const name = (srtFile.name || '').toLowerCase();
									const format = name.endsWith('.lrc') ? 'lrc' : 'srt';
									await persistSongTimedLyricsCues(songIdForSrt, timedText, format);
								}
								setTitle("");
								setSinger("");
								setWriter("");
								setLyrics("");
								setAudioFile(null);
								setSrtFile(null);
								if (uploadTimedLyricsInputRef.current) uploadTimedLyricsInputRef.current.value = "";
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

			<Card className="p-4">
				<div className="text-sm font-semibold">Timestamped lyric search</div>
				<div className="text-xs text-muted-foreground mt-1">Search SRT cues and play the exact timestamp snippet.</div>
				<div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
					<div className="md:col-span-1">
						<Label>Song</Label>
						<Popover open={adminSongPickerOpen} onOpenChange={setAdminSongPickerOpen}>
							<PopoverTrigger asChild>
								<Button variant="outline" role="combobox" aria-expanded={adminSongPickerOpen} className="mt-1 w-full justify-between">
									<span className={adminSearchSongId ? "truncate" : "truncate text-muted-foreground"}>
										{adminSearchSongId
											? ((songs ?? []).find((s) => s.id === adminSearchSongId)?.title || 'Selected song')
											: 'All songs'}
									</span>
									<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
								<Command>
									<CommandInput placeholder="Search songs..." />
									<CommandList>
										<CommandEmpty>No matches.</CommandEmpty>
										<CommandItem
											value="__all__"
											onSelect={() => {
												setAdminSearchSongId('');
												setAdminCueId('');
												setAdminSongPickerOpen(false);
											}}
										>
											<Check className={adminSearchSongId ? "h-4 w-4 opacity-0" : "h-4 w-4"} />
											<span className="truncate">All songs</span>
										</CommandItem>
										{(songs ?? []).map((s) => (
											<CommandItem
												key={s.id}
												value={s.title}
												onSelect={() => {
													setAdminSearchSongId(s.id);
													setAdminCueId('');
													setAdminSongPickerOpen(false);
												}}
											>
												<Check className={adminSearchSongId === s.id ? "h-4 w-4" : "h-4 w-4 opacity-0"} />
												<span className="truncate">{s.title}</span>
											</CommandItem>
										))}
									</CommandList>
								</Command>
							</PopoverContent>
						</Popover>
					</div>
					<div className="md:col-span-2">
						<Label>Lyric contains</Label>
						<Input
							value={adminSearchText}
							onChange={(e) => {
								setAdminSearchText(e.target.value);
								setAdminCueId('');
							}}
							placeholder="Search lyric line..."
							className="mt-1"
						/>
					</div>
				</div>
				{adminSearchText.trim() ? (
					adminSearchMatches.length ? (
						<div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
							<div className="lg:col-span-2 rounded-md border p-2 max-h-[260px] overflow-y-auto space-y-2">
								{adminSearchMatches.slice(0, 50).map((c) => (
									<Button
										key={c.id}
										variant={c.id === adminActiveCue?.id ? 'default' : 'outline'}
										className="w-full justify-start h-auto text-left whitespace-pre-wrap"
										onClick={() => setAdminCueId(c.id)}
									>
										<div className="w-full">
											{adminSearchSongId ? null : (
												<div className="text-xs text-muted-foreground truncate">
													{(songs ?? []).find((s) => s.id === c.songId)?.title || 'Unknown song'}
												</div>
											)}
											<div className="text-xs text-muted-foreground">
												{Math.max(0, c.startMs)}–{Math.max(0, c.endMs)} ms
											</div>
											<div className="mt-1">{c.text}</div>
										</div>
									</Button>
								))}
							</div>
							<div className="lg:col-span-1 space-y-2">
								{(() => {
									const songId = adminActiveCue?.songId;
									const song = songId ? (songs ?? []).find((s) => s.id === songId) : undefined;
									if (!song || !adminActiveCue) return null;
									return (
										<AudioPlayer
											src={song.audioFileUrl}
											trackTitle={song.title}
											showVolumeControls={false}
											clipStartMs={adminActiveCue.startMs}
											clipEndMs={adminActiveCue.endMs}
											hideSeekBar
										/>
									);
								})()}
								<div className="text-xs text-muted-foreground">Plays only within the cue timestamps.</div>
							</div>
						</div>
					) : (
						<div className="mt-3 text-sm text-muted-foreground">No matches.</div>
					)
				) : null}
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
								{(Boolean((s.lyrics || '').trim()) || Boolean(srtCountBySongId.get(s.id))) ? (
									<div className="text-[11px] px-2 py-1 rounded-md border bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
										Lyrics
									</div>
								) : (
									<div className="text-[11px] px-2 py-1 rounded-md border bg-muted/20 text-muted-foreground">
										No lyrics
									</div>
								)}
								{srtCountBySongId.get(s.id) ? (
									<div className="text-[11px] px-2 py-1 rounded-md border bg-muted/30 text-muted-foreground">
										SRT: {srtCountBySongId.get(s.id)}
									</div>
								) : (
									<div className="text-[11px] px-2 py-1 rounded-md border bg-muted/20 text-muted-foreground">
										SRT: none
									</div>
								)}
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
									onClick={() => {
										try {
											audioRef.current?.pause();
										} catch {
											// ignore
										}
										setPlayingSongId(null);
										setViewTarget(s);
									}}
									aria-label="View"
								>
									<Eye className="h-4 w-4" />
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
										setEditSrtFile(null);
									}}
									aria-label="Edit"
								>
									<Pencil className="h-4 w-4" />
								</Button>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="outline"
											size="icon"
											className="h-8 w-8"
											onClick={() => {
												void openSyncLyricsForSong(s);
											}}
											aria-label="Sync lyrics"
										>
											<FileText className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>Sync lyrics</TooltipContent>
								</Tooltip>
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
							<RadioGroup
								value={duplicateSelectedDupeId}
								onValueChange={(v) => setDuplicateSelectedDupeId(v)}
								className="rounded-md border p-2 max-h-[200px] overflow-y-auto space-y-2"
							>
								{duplicateDupes.map((d) => (
									<label key={d.id} className="flex items-start gap-2 text-sm">
										<RadioGroupItem value={d.id} id={`duplicate-${d.id}`} className="mt-0.5" />
										<span className="min-w-0">
											<span className="font-medium">{d.title}</span>
											{d.singer ? <span className="text-xs text-muted-foreground"> (score {d.singer})</span> : null}
										</span>
									</label>
								))}
							</RadioGroup>
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
				open={!!syncLyricsTarget}
				onOpenChange={(open) => {
					if (!open) {
						setSyncLyricsTarget(null);
						setSyncLyricsCandidates([]);
						setSyncLyricsSelectedId(null);
						setSyncLyricsManual('');
						setSyncLyricsSearch('');
					}
				}}
			>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle>Sync lyrics</DialogTitle>
						<DialogDescription>
							Select an imported lyrics source entry for this song, or paste lyrics manually.
						</DialogDescription>
					</DialogHeader>
					{syncLyricsTarget ? (
						<div className="space-y-4">
							<div className="rounded-md border bg-muted/20 p-3">
								<div className="font-medium">{syncLyricsTarget.title}</div>
								<div className="text-xs text-muted-foreground">Singer: {syncLyricsTarget.singer || '—'}</div>
							</div>

							<div className="space-y-2">
								<div className="flex items-center justify-between gap-3">
									<div className="text-sm font-medium">Choose lyrics from imported .txt entries</div>
								</div>
								<Input
									value={syncLyricsSearch}
									onChange={(e) => setSyncLyricsSearch(e.target.value)}
									placeholder="Search by song name (English)…"
									className="h-9"
									disabled={syncLyricsLoading}
								/>
								{syncLyricsLoading ? (
									<div className="text-sm text-muted-foreground">Loading…</div>
								) : filteredSyncLyricsCandidates.length ? (
									<RadioGroup
										value={syncLyricsSelectedId || ''}
										onValueChange={(v) => {
											setSyncLyricsSelectedId(v);
											const entry = filteredSyncLyricsCandidates.find((e) => e.id === v);
											if (entry) setSyncLyricsManual(entry.lyrics || '');
										}}
										className="max-h-[260px] overflow-y-auto space-y-2 pr-1"
									>
										{filteredSyncLyricsCandidates.slice(0, 200).map((entry) => (
											<label key={entry.id} className="flex items-start gap-2 rounded-md border p-2">
												<RadioGroupItem value={entry.id} id={`lyrics-${entry.id}`} className="mt-0.5" />
												<div className="min-w-0 flex-1">
													<div className="text-sm font-medium truncate">{entry.englishTitle}</div>
													<div className="text-xs text-muted-foreground truncate">Writer: {entry.writer || '—'}</div>
												</div>
											</label>
										))}
									</RadioGroup>
								) : (
									<div className="text-sm text-muted-foreground">No imported lyrics matched that search.</div>
								)}
							</div>

							<div className="space-y-2">
								<Label>Lyrics</Label>
								<Textarea value={syncLyricsManual} onChange={(e) => setSyncLyricsManual(e.target.value)} rows={12} />
								<div className="text-xs text-muted-foreground">
									Saving will overwrite the current lyrics for this song.
								</div>
							</div>
						</div>
					) : null}
					<DialogFooter>
						<Button variant="outline" onClick={() => setSyncLyricsTarget(null)} disabled={syncLyricsLoading}>
							Cancel
						</Button>
						<Button
							disabled={!syncLyricsTarget || syncLyricsLoading}
							onClick={async () => {
								if (!syncLyricsTarget) return;
								try {
									setSyncLyricsLoading(true);
									await db.songs.update(syncLyricsTarget.id, { lyrics: syncLyricsManual.trim(), updatedAt: Date.now() });
									toast.success('Lyrics synced');
									setSyncLyricsTarget(null);
								} catch (e) {
									console.error(e);
									toast.error('Failed to sync lyrics');
								} finally {
									setSyncLyricsLoading(false);
								}
							}}
						>
							Save lyrics
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
							<AudioPlayer src={viewTarget.audioFileUrl} trackTitle={viewTarget.title} />
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
						setEditSrtFile(null);
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
						<div className="space-y-2">
							<Label>Upload timestamped lyrics (.srt / .lrc) (optional)</Label>
							<Input ref={editTimedLyricsInputRef} type="file" accept=".srt,.lrc,text/plain" onChange={(e) => setEditSrtFile(e.target.files?.[0] ?? null)} />
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
									if (editSrtFile) {
										const timedText = await editSrtFile.text();
										const name = (editSrtFile.name || '').toLowerCase();
										const format = name.endsWith('.lrc') ? 'lrc' : 'srt';
										await persistSongTimedLyricsCues(editTarget.id, timedText, format);
									}
									toast.success('Song updated');
									setEditTarget(null);
									setEditAudioFile(null);
									setEditSrtFile(null);
									if (editTimedLyricsInputRef.current) editTimedLyricsInputRef.current.value = "";
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
