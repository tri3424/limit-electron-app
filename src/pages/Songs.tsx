import { useMemo, useState, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppSettings, db, Song, SongListeningEvent, SongSrtCue } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import AudioPlayer from "@/components/AudioPlayer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Check, ChevronsUpDown } from "lucide-react";
import { formatMsAsTimestamp } from "@/lib/time";
import SongTimedLyrics from "@/components/SongTimedLyrics";

// Note: This page is retained for backwards compatibility, but the main
// student-facing entrypoint is now Song Modules at /songs.

export default function Songs() {
	const { user } = useAuth();
	const usedRecognitionSnippetRangesRef = useRef<Map<string, Set<string>>>(new Map());
	const [selectedPositionMs, setSelectedPositionMs] = useState(0);
	const appSettings = useLiveQuery<AppSettings | undefined>(() => db.settings.get('1'), []);
	const songRecognitionEnabled = appSettings?.songRecognitionEnabled === true;
	const srtCues = useLiveQuery<SongSrtCue[]>(async () => {
		try {
			return await db.songSrtCues.toArray();
		} catch {
			return [] as SongSrtCue[];
		}
	}, []);
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

	const songs = useLiveQuery<Song[]>(
		async () => {
			const all = await db.songs.toArray();
			return all
				.filter((s) => s.visible !== false)
				.slice()
				.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
		},
		[],
	);

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [searchText, setSearchText] = useState("");
	const [recognitionActive, setRecognitionActive] = useState(false);
	const [recognitionGuessSongId, setRecognitionGuessSongId] = useState<string>('');
	const [recognitionGuessQuery, setRecognitionGuessQuery] = useState<string>('');
	const [recognitionResult, setRecognitionResult] = useState<'idle' | 'correct' | 'wrong'>('idle');
	const [recognitionSongPickerOpen, setRecognitionSongPickerOpen] = useState(false);
	const [recognitionUsedSnippetKeys, setRecognitionUsedSnippetKeys] = useState<string[]>([]);
	const [recognitionChallenge, setRecognitionChallenge] = useState<
		| null
		| {
			songId: string;
			clipStartMs?: number;
			clipEndMs?: number;
			requiresSrt: boolean;
		}
	>(null);

	const filteredSongs = useMemo(() => {
		const list = songs ?? [];
		const q = searchText.trim().toLowerCase();
		if (!q) return list;
		return list.filter((s) => {
			const hay = `${s.title || ''} ${s.singer || ''} ${s.writer || ''} ${s.lyrics || ''}`.toLowerCase();
			return hay.includes(q);
		});
	}, [songs, searchText]);

	const selected = useMemo(() => {
		if (!filteredSongs.length) return null;
		if (!selectedId) return null;
		return filteredSongs.find((s) => s.id === selectedId) ?? null;
	}, [filteredSongs, selectedId]);

	useEffect(() => {
		setSelectedPositionMs(0);
	}, [selected?.id]);

	const songIdsKey = useMemo(() => (songs ?? []).map((s) => s.id).sort().join('|'), [songs]);
	const listeningEvents = useLiveQuery<SongListeningEvent[]>(async () => {
		if (!user) return [] as SongListeningEvent[];
		try {
			return await db.songListeningEvents
				.where('userId')
				.equals(user.id)
				.filter((e) => typeof e.listenedMs === 'number' && e.listenedMs > 0)
				.toArray();
		} catch {
			return [] as SongListeningEvent[];
		}
	}, [user?.id, songIdsKey]);

	const listenedMsBySongId = useMemo(() => {
		const map = new Map<string, number>();
		for (const e of listeningEvents ?? []) {
			if (!e.songId) continue;
			const prev = map.get(e.songId) || 0;
			map.set(e.songId, prev + (e.listenedMs || 0));
		}
		return map;
	}, [listeningEvents]);

	const normalizeCueText = (value: string) =>
		(value || '')
			.toLowerCase()
			.replace(/\s+/g, ' ')
			.replace(/[\u200B-\u200D\uFEFF]/g, '')
			.trim();

	const shouldIgnoreTimedLyricText = (value: string) => {
		const t = normalizeCueText(value);
		if (!t) return true;
		if (/(https?:\/\/|www\.)/.test(t)) return true;
		if (t.includes('lrc generator')) return true;
		if (t.includes('lrcgenerator')) return true;
		if (t.includes('ailrcgenerator')) return true;
		if (t.startsWith('by ') && t.includes('generator')) return true;
		return false;
	};

	const normalizeLyricLine = (value: string) =>
		(value || '')
			.toLowerCase()
			.replace(/[\u200B-\u200D\uFEFF]/g, '')
			.replace(/[^\p{L}\p{N}\s]/gu, ' ')
			.replace(/\s+/g, ' ')
			.trim();

	const isStructuralMarkerLine = (value: string) => {
		const t = normalizeCueText(value);
		if (!t) return false;
		if (/^\s*[[{(].+[\]})]\s*$/.test(t)) {
			return /(verse|chorus|intro|bridge|hook|refrain|outro|pre\s*chorus|post\s*chorus|interlude|instrumental|breakdown|repeat)/i.test(t);
		}
		return /^\s*(verse|chorus|intro|bridge|hook|refrain|outro|pre\s*chorus|post\s*chorus|interlude|instrumental|breakdown|repeat)\b/i.test(t);
	};

	const getTitleWords = (title?: string) => {
		const t = normalizeLyricLine(title || '');
		const words = new Set<string>();
		for (const w of t.split(' ')) {
			const ww = w.trim();
			if (!ww) continue;
			if (ww.length < 3) continue;
			words.add(ww);
		}
		return { titlePhrase: t, words };
	};

	const getIdentifierWords = (song: Song) => {
		const title = getTitleWords(song.title);
		const singerPhrase = normalizeLyricLine(song.singer || '');
		const singerWords = new Set<string>();
		for (const w of singerPhrase.split(' ')) {
			const ww = w.trim();
			if (!ww) continue;
			if (ww.length < 3) continue;
			singerWords.add(ww);
		}
		const writerPhrase = normalizeLyricLine(song.writer || '');
		const writerWords = new Set<string>();
		for (const w of writerPhrase.split(' ')) {
			const ww = w.trim();
			if (!ww) continue;
			if (ww.length < 3) continue;
			writerWords.add(ww);
		}
		return {
			titlePhrase: title.titlePhrase,
			titleWords: title.words,
			singerPhrase,
			singerWords,
			writerPhrase,
			writerWords,
		};
	};

	const makeRecognitionChallenge = () => {
		const songPool = (songs ?? []).filter((s) => s.visible !== false);
		if (!songPool.length) return null;
		const withSrt = songPool.filter((s) => (songSrtBySongId.get(s.id) || []).length >= 5);
		const chooseFrom = withSrt;
		if (!chooseFrom.length) return null;
		const lastKey = recognitionUsedSnippetKeys.length ? recognitionUsedSnippetKeys[recognitionUsedSnippetKeys.length - 1] : undefined;
		const lastSongId = lastKey ? lastKey.split(':')[0] : undefined;
		const nonRepeating = lastSongId ? chooseFrom.filter((s) => s.id !== lastSongId) : chooseFrom;
		const pickFrom = nonRepeating.length ? nonRepeating : chooseFrom;
		const picked = pickFrom[Math.floor(Math.random() * pickFrom.length)]!;
		const cues = (songSrtBySongId.get(picked.id) || []).slice().sort((a, b) => a.cueIndex - b.cueIndex);
		if (cues.length < 5) return null;

		const nAll = cues.length;
		const pctStart = 0.35;
		const pctEnd = 0.65;
		const middleStartIdx = Math.max(0, Math.floor(pctStart * nAll));
		const middleEndExclusive = Math.min(nAll, Math.ceil(pctEnd * nAll));
		const identifiers = getIdentifierWords(picked);

		const firstOccurrenceCueIndex = new Map<string, number>();
		for (const c of cues) {
			if (shouldIgnoreTimedLyricText(c.text || '')) continue;
			if (isStructuralMarkerLine(c.text || '')) continue;
			const n = normalizeLyricLine(c.text || '');
			if (!n) continue;
			if (!firstOccurrenceCueIndex.has(n)) firstOccurrenceCueIndex.set(n, c.cueIndex);
		}

		const cuePasses = (c: SongSrtCue) => {
			if (shouldIgnoreTimedLyricText(c.text || '')) return false;
			if (isStructuralMarkerLine(c.text || '')) return false;
			const normalized = normalizeLyricLine(c.text || '');
			if (!normalized) return false;
			const firstIdx = firstOccurrenceCueIndex.get(normalized);
			if (typeof firstIdx === 'number' && firstIdx !== c.cueIndex) return false;
			if (identifiers.titlePhrase && normalized.includes(identifiers.titlePhrase)) return false;
			if (identifiers.singerPhrase && normalized.includes(identifiers.singerPhrase)) return false;
			if (identifiers.writerPhrase && normalized.includes(identifiers.writerPhrase)) return false;
			for (const w of normalized.split(' ')) {
				if (!w) continue;
				if (w.length < 3) continue;
				if (identifiers.titleWords.has(w)) return false;
				if (identifiers.singerWords.has(w)) return false;
				if (identifiers.writerWords.has(w)) return false;
			}
			return true;
		};

		const coreStart = 2;
		const coreEndExclusive = Math.max(coreStart, nAll - 2);
		const windowStart = Math.max(coreStart, middleStartIdx);
		const windowEnd = Math.min(coreEndExclusive, middleEndExclusive);
		const eligibleWindow = cues.slice(windowStart, windowEnd);
		const eligible = eligibleWindow.filter(cuePasses);
		if (!eligible.length) {
			return {
				songId: picked.id,
				clipStartMs: undefined,
				clipEndMs: undefined,
				requiresSrt: true,
			};
		}

		let pickedBlock: SongSrtCue[] | null = null;
		const eligibleByIdx = new Map<number, SongSrtCue>();
		for (const c of eligible) eligibleByIdx.set(c.cueIndex, c);
		const eligibleIdxSet = new Set(eligible.map((c) => c.cueIndex));

		const minDurationMs = 4500;
		const makeKey = (startMs: number, endMs: number) => `${startMs}-${endMs}`;
		const usedForSong = usedRecognitionSnippetRangesRef.current.get(picked.id) ?? new Set<string>();
		usedRecognitionSnippetRangesRef.current.set(picked.id, usedForSong);

		type Candidate = { cues: SongSrtCue[]; startMs: number; endMs: number; key: string };
		const candidates: Candidate[] = [];
		const addCandidate = (cueList: SongSrtCue[]) => {
			if (!cueList.length) return;
			const sorted = cueList.slice().sort((a, b) => a.cueIndex - b.cueIndex);
			const startMs = Math.max(0, sorted[0]!.startMs);
			const endMs = Math.max(startMs, sorted[sorted.length - 1]!.endMs);
			candidates.push({ cues: sorted, startMs, endMs, key: makeKey(startMs, endMs) });
		};

		for (const c of eligible) {
			const next = eligibleByIdx.get(c.cueIndex + 1);
			if (!next) continue;
			if (c.endMs !== next.startMs) continue;
			addCandidate([c, next]);
		}
		for (const c of eligible) addCandidate([c]);

		const tryExtend = (base: Candidate): Candidate => {
			const duration = base.endMs - base.startMs;
			if (duration >= minDurationMs) return base;
			const first = base.cues[0]!;
			const last = base.cues[base.cues.length - 1]!;
			const prevIdx = first.cueIndex - 1;
			const nextIdx = last.cueIndex + 1;
			const prev = eligibleIdxSet.has(prevIdx) ? eligibleByIdx.get(prevIdx) : undefined;
			if (prev && prev.endMs === first.startMs) {
				const startMs = Math.max(0, prev.startMs);
				const endMs = base.endMs;
				const extended = base.cues.length >= 3 ? base : { cues: [prev, ...base.cues], startMs, endMs, key: makeKey(startMs, endMs) };
				return extended.cues.length <= 3 ? extended : base;
			}
			const next = eligibleIdxSet.has(nextIdx) ? eligibleByIdx.get(nextIdx) : undefined;
			if (next && last.endMs === next.startMs) {
				const startMs = base.startMs;
				const endMs = next.endMs;
				const extended = base.cues.length >= 3 ? base : { cues: [...base.cues, next], startMs, endMs, key: makeKey(startMs, endMs) };
				return extended.cues.length <= 3 ? extended : base;
			}
			return base;
		};

		const extendedCandidates = candidates
			.map(tryExtend)
			.filter((c, idx, arr) => arr.findIndex((x) => x.key === c.key) === idx);

		const rank = (c: Candidate) => {
			const dur = c.endMs - c.startMs;
			const len = c.cues.length;
			const lenScore = len === 2 ? 0 : len === 1 ? 1 : 2;
			const durPenalty = dur < minDurationMs ? 10 : 0;
			return lenScore + durPenalty;
		};
		const sortedCandidates = extendedCandidates.slice().sort((a, b) => rank(a) - rank(b));
		const notUsed = sortedCandidates.filter((c) => !usedForSong.has(c.key));
		const candidatePool = notUsed.length ? notUsed : sortedCandidates;
		if (!candidatePool.length) {
			pickedBlock = null;
		} else {
			const chosen = candidatePool[Math.floor(Math.random() * candidatePool.length)]!;
			pickedBlock = chosen.cues;
			usedForSong.add(chosen.key);
			if (!notUsed.length) {
				usedForSong.clear();
				usedForSong.add(chosen.key);
			}
			setRecognitionUsedSnippetKeys((prev) => [...prev, `${picked.id}:${chosen.key}:${pickedBlock.length}`].slice(-200));
			console.info(
				`[songs-recognition] snippet ${picked.id} ${formatMsAsTimestamp(chosen.startMs)}-${formatMsAsTimestamp(chosen.endMs)} (${chosen.endMs - chosen.startMs}ms, ${pickedBlock.length} line(s))`,
			);
		}

		if (!pickedBlock || !pickedBlock.length) {
			return {
				songId: picked.id,
				clipStartMs: undefined,
				clipEndMs: undefined,
				requiresSrt: true,
			};
		}

		const first = pickedBlock[0]!;
		const last = pickedBlock[pickedBlock.length - 1]!;
		const clipStartMs = Math.max(0, first.startMs);
		const clipEndMs = Math.max(clipStartMs, last.endMs);

		return {
			songId: picked.id,
			clipStartMs,
			clipEndMs,
			requiresSrt: false,
		};
	};

	const guessOptions = useMemo(() => {
		const list = (songs ?? []).filter((s) => s.visible !== false);
		const q = recognitionGuessQuery.trim().toLowerCase();
		if (!q) return list;
		return list.filter((s) => `${s.title || ''} ${s.singer || ''}`.toLowerCase().includes(q));
	}, [songs, recognitionGuessQuery]);

	return (
		<div className="max-w-7xl mx-auto space-y-6">
			<div>
				<h1 className="text-3xl font-bold text-foreground">Songs</h1>
				<p className="text-muted-foreground mt-2">Pick a song to start playing and view its details.</p>
			</div>

			{songRecognitionEnabled ? (
				<Card className="p-4">
					<div className="flex items-start justify-between gap-4">
						<div className="min-w-0">
							<div className="text-sm font-semibold">Song Recognition Test</div>
							<div className="text-xs text-muted-foreground mt-1">Listen to the snippet and guess the song. Lyrics are hidden.</div>
						</div>
						<div className="shrink-0 flex items-center gap-2">
							<Button
								variant={recognitionActive ? 'outline' : 'default'}
								onClick={() => {
									if (recognitionActive) {
										setRecognitionActive(false);
										setRecognitionChallenge(null);
										setRecognitionUsedSnippetKeys([]);
										setRecognitionGuessSongId('');
										setRecognitionGuessQuery('');
										setRecognitionResult('idle');
										return;
									}
									const ch = makeRecognitionChallenge();
									if (!ch) {
										toast.error('No songs with .lrc or .srt files available');
										return;
									}
									setRecognitionChallenge(ch);
									setRecognitionActive(true);
									setRecognitionGuessSongId('');
									setRecognitionGuessQuery('');
									setRecognitionResult('idle');
								}}
							>
								{recognitionActive ? 'Close test' : 'Start test'}
							</Button>
						</div>
					</div>

					{recognitionActive && recognitionChallenge ? (
						<div className="mt-4 space-y-3">
							{(() => {
								const ch = recognitionChallenge;
								const song = (songs ?? []).find((s) => s.id === ch.songId);
								return (
									<div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
										<div className="lg:col-span-2 space-y-2">
											{ch.requiresSrt && ((songSrtBySongId.get(ch.songId) || []).length === 0) ? (
												<div className="rounded-md border p-3 bg-muted/30 text-sm">
													This song has no timestamped lyrics (.srt/.lrc), so snippet playback is disabled.
												</div>
											) : null}
											{song ? (
												<AudioPlayer
													src={song.audioFileUrl}
													showVolumeControls={false}
													hideSeekBar
													clipStartMs={ch.requiresSrt ? undefined : ch.clipStartMs}
													clipEndMs={ch.requiresSrt ? undefined : ch.clipEndMs}
												/>
											) : null}
										</div>

										<div className="lg:col-span-1 space-y-2">
											<div className="text-sm font-semibold">Your answer</div>
											<Popover
												open={recognitionSongPickerOpen}
												onOpenChange={(open) => {
													if (recognitionResult !== 'idle') return;
													setRecognitionSongPickerOpen(open);
												}}
											>
												<PopoverTrigger asChild>
													<Button
														variant="outline"
														role="combobox"
														aria-expanded={recognitionSongPickerOpen}
														disabled={recognitionResult !== 'idle'}
														className="w-full justify-between"
													>
														<span className={recognitionGuessSongId ? "truncate" : "truncate text-muted-foreground"}>
															{recognitionGuessSongId
																? ((songs ?? []).find((s) => s.id === recognitionGuessSongId)?.title || 'Selected song')
																: 'Select song'}
														</span>
														<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
													<Command>
														<CommandInput
															value={recognitionGuessQuery}
															disabled={recognitionResult !== 'idle'}
															onValueChange={(v) => {
																setRecognitionGuessQuery(v);
																setRecognitionResult('idle');
															}}
															placeholder="Search songs..."
														/>
														<CommandList>
															<CommandEmpty>No matches.</CommandEmpty>
															{guessOptions.map((s) => (
																<CommandItem
																	key={s.id}
																	value={`${s.title || ''} ${s.singer || ''}`}
																	onSelect={() => {
																		setRecognitionGuessSongId(s.id);
																		setRecognitionResult('idle');
																		setRecognitionSongPickerOpen(false);
																	}}
																>
																	<Check className={recognitionGuessSongId === s.id ? 'h-4 w-4' : 'h-4 w-4 opacity-0'} />
																	<span className="truncate">{s.title}</span>
																</CommandItem>
															))}
														</CommandList>
													</Command>
												</PopoverContent>
											</Popover>

											<div
												className={cn(
													'rounded-md border p-3 text-sm font-semibold',
													recognitionResult === 'idle' ? 'bg-muted/20 text-muted-foreground' : '',
													recognitionResult === 'correct'
														? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300'
														: '',
													recognitionResult === 'wrong' ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300' : '',
												)}
											>
												{recognitionResult === 'idle' ? 'Pick an answer, then check.' : null}
												{recognitionResult === 'correct' ? 'Correct!' : null}
												{recognitionResult === 'wrong'
													? (() => {
														const ch = recognitionChallenge;
														const correct = ch ? (songs ?? []).find((s) => s.id === ch.songId) : undefined;
														return correct ? `Wrong. Correct: ${correct.title}${correct.singer ? ` — ${correct.singer}` : ''}` : 'Wrong.';
													})()
													: null}
											</div>

											<div className="flex items-center gap-2">
												<Button
													variant="outline"
													onClick={() => {
														setRecognitionChallenge(makeRecognitionChallenge());
														setRecognitionGuessSongId('');
														setRecognitionGuessQuery('');
														setRecognitionResult('idle');
													}}
												>
													New snippet
												</Button>
												<Button
													disabled={!recognitionGuessSongId || !recognitionChallenge}
													onClick={() => {
														const ch = recognitionChallenge;
														if (!ch) return;
														setRecognitionResult(recognitionGuessSongId === ch.songId ? 'correct' : 'wrong');
													}}
												>
													Check
												</Button>
											</div>
										</div>
									</div>
								);
							})()}
						</div>
					) : null}
				</Card>
			) : null}

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<Card className="p-4 lg:col-span-1">
					<div className="text-sm font-semibold mb-3">Song list</div>
					<Input
						value={searchText}
						onChange={(e) => setSearchText(e.target.value)}
						placeholder="Search songs..."
						className="mb-3"
					/>
					<div className="space-y-2">
						{filteredSongs.map((s) => (
							<Button
								key={s.id}
								variant="ghost"
								className={cn(
									"w-full justify-start h-auto py-3 px-3 rounded-md border",
									selected?.id === s.id ? "bg-muted" : "bg-background",
								)}
								onClick={() => setSelectedId(s.id)}
							>
								<div className="min-w-0 text-left">
									<div className="font-medium truncate">{s.title}</div>
									<div className="text-xs text-muted-foreground truncate">{s.singer}</div>
								</div>
							</Button>
						))}
						{filteredSongs.length === 0 && (
							<div className="text-sm text-muted-foreground">No songs available.</div>
						)}
					</div>
				</Card>

				<Card className="p-4 lg:col-span-2">
					{!selected ? (
						<div className="text-sm text-muted-foreground">Select a song to begin.</div>
					) : (
						<div className="space-y-4">
							<div>
								<div className="text-2xl font-semibold">{selected.title}</div>
								<div className="text-sm text-muted-foreground mt-1">
									Singer: <span className="text-foreground font-medium">{selected.singer}</span>
								</div>
								<div className="text-sm text-muted-foreground">
									Writer: <span className="text-foreground font-medium">{selected.writer}</span>
								</div>
							</div>

							<div>
								<AudioPlayer
									src={selected.audioFileUrl}
									title={selected.title}
									onPositionMsChange={({ currentTimeMs }) => setSelectedPositionMs(currentTimeMs)}
								/>
							</div>

							{recognitionActive ? null : (
								<div>
									<div className="text-sm font-semibold mb-2">Lyrics</div>
									<div className="whitespace-pre-wrap border rounded-md bg-muted/30 p-4 text-sm">
										{(songSrtBySongId.get(selected.id) || []).length ? (
											<SongTimedLyrics cues={songSrtBySongId.get(selected.id) || []} positionMs={selectedPositionMs} lyricsText={selected.lyrics} songTitle={selected.title} />
										) : (
											selected.lyrics
										)}
									</div>
								</div>
							)}
						</div>
					)}
				</Card>
			</div>
		</div>
	);
}
