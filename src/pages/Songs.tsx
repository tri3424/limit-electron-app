import { useEffect, useMemo, useState } from "react";
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
import { useLocation } from "react-router-dom";

// Note: This page is retained for backwards compatibility, but the main
// student-facing entrypoint is now Song Modules at /songs.

export default function Songs() {
	const location = useLocation();
	const { user } = useAuth();
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
	const [recognitionCorrectTitle, setRecognitionCorrectTitle] = useState<string>('');
	const [recognitionPauseSignal, setRecognitionPauseSignal] = useState(0);
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

	useEffect(() => {
		const params = new URLSearchParams(location.search || '');
		const songId = params.get('songId');
		if (!songId) return;
		if (!(songs || []).some((s) => s.id === songId)) return;
		setSelectedId(songId);
	}, [location.search, songs]);

	const selected = useMemo(() => {
		const list = filteredSongs ?? [];
		if (!list.length) return null;
		const found = selectedId ? list.find((s) => s.id === selectedId) : null;
		return found ?? list[list.length - 1];
	}, [filteredSongs, selectedId]);

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

	const getFirstLyricWords = (lyrics?: string, firstLines = 2) => {
		const lines = String(lyrics || '')
			.replace(/\r\n/g, '\n')
			.replace(/\r/g, '\n')
			.split('\n')
			.map((l) => normalizeLyricLine(l))
			.filter(Boolean);
		const words = new Set<string>();
		for (const l of lines.slice(0, firstLines)) {
			for (const w of l.split(' ')) {
				const ww = w.trim();
				if (!ww) continue;
				if (ww.length < 3) continue;
				words.add(ww);
			}
		}
		return words;
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

	const getInitialTimedCueHints = (cues: SongSrtCue[], firstLines = 3) => {
		const lines: string[] = [];
		const seen = new Set<string>();
		for (const c of cues) {
			if (shouldIgnoreTimedLyricText(c.text || '')) continue;
			const normalized = normalizeLyricLine(c.text || '');
			if (!normalized) continue;
			if (seen.has(normalized)) continue;
			seen.add(normalized);
			lines.push(normalized);
			if (lines.length >= firstLines) break;
		}
		const words = new Set<string>();
		for (const l of lines) {
			for (const w of l.split(' ')) {
				const ww = w.trim();
				if (!ww) continue;
				if (ww.length < 3) continue;
				words.add(ww);
			}
		}
		return { lines: new Set(lines), words };
	};

	const getHintLyricLines = (lyrics?: string, edgeLines = 3) => {
		const lines = String(lyrics || '')
			.replace(/\r\n/g, '\n')
			.replace(/\r/g, '\n')
			.split('\n')
			.map((l) => normalizeLyricLine(l))
			.filter(Boolean);
		const first = lines.slice(0, edgeLines);
		const last = lines.slice(Math.max(0, lines.length - edgeLines));
		return new Set([...first, ...last]);
	};

	const makeRecognitionChallenge = () => {
		const pool = (songs ?? []).filter((s) => s.visible !== false);
		if (!pool.length) return null;
		const withSrt = pool.filter((s) => (songSrtBySongId.get(s.id) || []).length >= 2);
		// Only allow songs that have timestamped lyrics (.srt/.lrc persisted as cues).
		if (!withSrt.length) return null;
		const chooseFrom = withSrt;
		const lastKey = recognitionUsedSnippetKeys.length ? recognitionUsedSnippetKeys[recognitionUsedSnippetKeys.length - 1] : undefined;
		const lastSongId = lastKey ? lastKey.split(':')[0] : undefined;
		const nonRepeating = lastSongId ? chooseFrom.filter((s) => s.id !== lastSongId) : chooseFrom;
		const pickFrom = nonRepeating.length ? nonRepeating : chooseFrom;
		const picked = pickFrom[Math.floor(Math.random() * pickFrom.length)]!;
		const cues = (songSrtBySongId.get(picked.id) || []).slice().sort((a, b) => a.cueIndex - b.cueIndex);
		if (cues.length < 2) return null;

		const looksLikeLrc = cues.length >= 40;
		const edgeSkip = looksLikeLrc ? 12 : 5;
		const hintLines = getHintLyricLines(picked.lyrics, looksLikeLrc ? 6 : 3);
		const firstWords = getFirstLyricWords(picked.lyrics, 2);
		const { titlePhrase, words: titleWords } = getTitleWords(picked.title);
		const timedInitial = getInitialTimedCueHints(cues, looksLikeLrc ? 4 : 3);

		const lyricLines = String(picked.lyrics || '')
			.replace(/\r\n/g, '\n')
			.replace(/\r/g, '\n')
			.split('\n')
			.map((l) => normalizeLyricLine(l))
			.filter(Boolean);
		const earlyLyricLines = lyricLines.slice(0, 3);
		const lyricLineCounts = (() => {
			const m = new Map<string, number>();
			for (const l of lyricLines) m.set(l, (m.get(l) || 0) + 1);
			return m;
		})();
		const lyricLineSet = new Set(lyricLines);
		const tokenSet = (s: string) => new Set(s.split(' ').map((w) => w.trim()).filter((w) => w.length >= 2));
		const overlapScore = (a: string, b: string) => {
			if (!a || !b) return 0;
			const aa = tokenSet(a);
			const bb = tokenSet(b);
			if (!aa.size || !bb.size) return 0;
			let inter = 0;
			for (const w of aa) if (bb.has(w)) inter += 1;
			return inter / Math.max(1, Math.min(aa.size, bb.size));
		};
		const cueTextByCueIndex = (() => {
			// Some Bengali timed lyrics can be inaccurate. Map each cue to the closest matching lyric line
			// (in order) so snippet selection heuristics don't get confused.
			const map = new Map<number, string>();
			let cursor = 0;

			for (const c of cues) {
				const cueIdx = Number(c.cueIndex ?? 0);
				const rawNorm = normalizeLyricLine(c.text || '');
				if (!rawNorm) continue;
				if (lyricLineSet.has(rawNorm)) {
					map.set(cueIdx, rawNorm);
					continue;
				}

				const start = Math.max(0, cursor - 4);
				const end = Math.min(lyricLines.length, cursor + 40);
				let bestI = -1;
				let best = 0;
				for (let i = start; i < end; i += 1) {
					const cand = lyricLines[i] || '';
					const s = overlapScore(rawNorm, cand);
					if (s > best) {
						best = s;
						bestI = i;
						if (best >= 0.95) break;
					}
				}

				if (bestI >= 0 && best >= 0.35) {
					map.set(cueIdx, lyricLines[bestI]!);
					cursor = Math.max(cursor, bestI + 1);
				} else {
					map.set(cueIdx, rawNorm);
				}
			}
			return map;
		})();

		const normalizedCueText = (c: SongSrtCue) => cueTextByCueIndex.get(Number(c.cueIndex ?? 0)) || normalizeLyricLine(c.text || '');
		const cuePasses = (c: SongSrtCue) => {
			if (shouldIgnoreTimedLyricText(c.text || '')) return false;
			const normalized = normalizedCueText(c);
			if (normalized && earlyLyricLines.length) {
				let tooClose = false;
				for (const early of earlyLyricLines) {
					if (!early) continue;
					if (overlapScore(normalized, early) >= 0.6) {
						tooClose = true;
						break;
					}
				}
				if (tooClose) return false;
			}
			if (!normalized) return false;
			if (hintLines.has(normalized)) return false;
			if (timedInitial.lines.has(normalized)) return false;
			if (titlePhrase && normalized.includes(titlePhrase)) return false;
			if (titleWords.size) {
				for (const w of normalized.split(' ')) {
					if (!w) continue;
					if (w.length < 3) continue;
					if (titleWords.has(w)) return false;
				}
			}
			if (firstWords.size) {
				for (const w of normalized.split(' ')) {
					if (!w) continue;
					if (w.length < 3) continue;
					if (firstWords.has(w)) return false;
				}
			}
			if (timedInitial.words.size) {
				for (const w of normalized.split(' ')) {
					if (!w) continue;
					if (w.length < 3) continue;
					if (timedInitial.words.has(w)) return false;
				}
			}
			return true;
		};
		const filtered = cues.filter(cuePasses);
		const startIdx = edgeSkip;
		const endExclusive = Math.max(startIdx + 1, filtered.length - edgeSkip);
		const usable = filtered.slice(startIdx, endExclusive);
		if (!usable.length) {
			return null;
		}
		const usedSnippetSet = new Set(recognitionUsedSnippetKeys);
		const LINE_LONG_MS = 10_000;
		const LINE_SHORT_MS = 6_000;
		const CLIP_TARGET_MS = 11_000;
		const CLIP_MIN_MS = 7_000;
		const CLIP_MAX_MS = 12_000;
		const lineOptions = [2, 1];
		const pickFromRegion = (starts: number[]) => {
			if (!starts.length) return null;
			const n = usable.length;
			const third = Math.max(1, Math.floor(n / 3));
			const middle = starts.filter((i) => i >= third && i < 2 * third);
			const late = starts.filter((i) => i >= 2 * third);
			const r = Math.random();
			const preferred = r < 0.5 ? middle : r < 0.8 ? late : starts;
			const region = preferred.length ? preferred : (late.length ? late : (middle.length ? middle : starts));
			return region[Math.floor(Math.random() * region.length)]!;
		};

		const scoreBlock = (block: SongSrtCue[]) => {
			const first = block[0]!;
			const last = block[block.length - 1]!;
			const dur = Math.max(0, (last.endMs ?? 0) - (first.startMs ?? 0));
			const firstDur = Math.max(0, (first.endMs ?? 0) - (first.startMs ?? 0));
			const preferredLen = firstDur >= LINE_LONG_MS ? 1 : (firstDur <= LINE_SHORT_MS ? 2 : null);
			let score = 0;
			if (dur <= 0) score -= 10_000;
			if (dur > CLIP_MAX_MS) score -= 5_000 + (dur - CLIP_MAX_MS);
			if (dur < CLIP_MIN_MS) score -= 2_000 + (CLIP_MIN_MS - dur);
			score -= Math.abs(dur - CLIP_TARGET_MS);
			if (preferredLen && block.length !== preferredLen) score -= 2_500;
			if (block.length === 2) {
				const a = normalizedCueText(block[0]!);
				const b = normalizedCueText(block[1]!);
				const aWords = new Set(a.split(' ').map((w) => w.trim()).filter((w) => w.length >= 3));
				const bWords = b.split(' ').map((w) => w.trim()).filter((w) => w.length >= 3);
				if (aWords.size && bWords.length) {
					let overlap = 0;
					for (const w of bWords) if (aWords.has(w)) overlap += 1;
					const overlapRatio = overlap / Math.max(1, bWords.length);
					if (overlapRatio > 0.6) score -= 1_000;
					else if (overlapRatio < 0.25) score += 150;
				}
			}
			return score;
		};

		type Candidate = { start: number; len: number; score: number };
		const candidates: Candidate[] = [];
		for (const len of lineOptions) {
			for (let i = 0; i + (len - 1) < usable.length; i += 1) {
				let ok = true;
				for (let j = 1; j < len; j += 1) {
					const prev = usable[i + j - 1]!;
					const cur = usable[i + j]!;
					if ((cur.cueIndex ?? 0) !== (prev.cueIndex ?? 0) + 1) {
						ok = false;
						break;
					}
				}
				if (!ok) continue;
				const block = usable.slice(i, i + len);
				const base = usable[i];
				const cueIdx = base?.cueIndex ?? i;
				const usedKey = `${picked.id}:${cueIdx}:${len}`;
				const wasUsed = usedSnippetSet.has(usedKey);
				const startText = normalizedCueText(block[0]!);
				const startCount = lyricLineCounts.get(startText) || 0;
				let chorusPenalty = startCount >= 2 ? 600 * (startCount - 1) : 0;
				if (i > 0) {
					const prevText = normalizedCueText(usable[i - 1]!);
					const prevCount = lyricLineCounts.get(prevText) || 0;
					if (prevCount >= 2 && startCount <= 1) chorusPenalty -= 150;
				}
				candidates.push({ start: i, len, score: scoreBlock(block) - chorusPenalty - (wasUsed ? 10_000 : 0) });
			}
		}

		candidates.sort((a, b) => b.score - a.score);
		const top = candidates.slice(0, 60);
		const topUnused = top.filter((c) => {
			const base = usable[c.start];
			const cueIdx = base?.cueIndex ?? c.start;
			const usedKey = `${picked.id}:${cueIdx}:${c.len}`;
			return !usedSnippetSet.has(usedKey);
		});
		const topPreferred = topUnused.length ? topUnused : top;
		const topStarts = topPreferred.map((c) => c.start);
		const pickedStart = pickFromRegion(topStarts);
		const chosen = typeof pickedStart === 'number' ? topPreferred.find((c) => c.start === pickedStart) : topPreferred[0];
		const pickedBlock = chosen ? usable.slice(chosen.start, chosen.start + chosen.len) : null;

		if (!pickedBlock || !pickedBlock.length || !chosen) return null;

		const first = pickedBlock[0]!;
		const last = pickedBlock[pickedBlock.length - 1]!;
		const clipStartMs = Math.max(0, first.startMs);
		const TAIL_PAD_MS = 450;
		const nextCueStartMs = (() => {
			if (!chosen) return undefined;
			const after = usable[chosen.start + chosen.len];
			return typeof after?.startMs === 'number' ? after.startMs : undefined;
		})();
		const paddedEnd = (typeof last.endMs === 'number' ? last.endMs : clipStartMs) + TAIL_PAD_MS;
		const cappedEnd = typeof nextCueStartMs === 'number' ? Math.max(clipStartMs, Math.min(paddedEnd, nextCueStartMs - 50)) : paddedEnd;
		const clipEndMs = Math.max(clipStartMs, cappedEnd);
		setRecognitionUsedSnippetKeys((prev) => {
			const cueIdx = first.cueIndex ?? chosen.start;
			return [...prev, `${picked.id}:${cueIdx}:${chosen.len}`].slice(-200);
		});

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
										toast.error('No songs available');
										return;
									}
									setRecognitionChallenge(ch);
									setRecognitionActive(true);
									setRecognitionUsedSnippetKeys([]);
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
							<div className="max-w-xl mx-auto space-y-4">
								<div>
									<div className="text-sm font-semibold">Recognition snippet</div>
									<div className="text-xs text-muted-foreground mt-0.5">Listen carefully, then pick the matching song.</div>
								</div>
								{(() => {
									const ch = recognitionChallenge;
									const song = (songs ?? []).find((s) => s.id === ch.songId);
									return (
										<div className="space-y-3">
											{ch.requiresSrt ? (
												<div className="rounded-md border-2 p-3 bg-muted/30 text-sm">
													This song has no timestamped lyrics (.srt), so snippet playback is disabled.
												</div>
											) : null}
											{song ? (
												<AudioPlayer
													src={song.audioFileUrl}
													showVolumeControls={false}
													hideSeekBar
													hideTimeDisplay
													pauseSignal={recognitionPauseSignal}
													clipStartMs={ch.requiresSrt ? undefined : ch.clipStartMs}
													clipEndMs={ch.requiresSrt ? undefined : ch.clipEndMs}
													className="p-6"
												/>
											) : null}

											<div className="space-y-2">
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
														'rounded-md border-2 px-3 py-2 text-sm font-semibold',
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
														? recognitionCorrectTitle ? `Wrong. Correct answer: ${recognitionCorrectTitle}` : 'Wrong.'
														: null}
												</div>

												<div className="grid grid-cols-2 gap-2">
													<Button
														variant="outline"
														disabled={!recognitionChallenge || recognitionResult === 'idle'}
														onClick={() => {
															setRecognitionChallenge(makeRecognitionChallenge());
															setRecognitionGuessSongId('');
															setRecognitionGuessQuery('');
															setRecognitionResult('idle');
															setRecognitionCorrectTitle('');
														}}
													>
														New snippet
													</Button>
													<Button
														className="w-full"
														disabled={!recognitionGuessSongId || !recognitionChallenge}
														onClick={() => {
															const ch = recognitionChallenge;
															if (!ch) return;
															setRecognitionPauseSignal((x) => x + 1);
															const isCorrect = recognitionGuessSongId === ch.songId;
															setRecognitionResult(isCorrect ? 'correct' : 'wrong');
															const correct = (songs ?? []).find((s) => s.id === ch.songId);
															setRecognitionCorrectTitle(String(correct?.title ?? ''));
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
								<AudioPlayer src={selected.audioFileUrl} trackTitle={selected.title} />
							</div>

							{recognitionActive ? null : (
								<div>
									<div className="text-sm font-semibold mb-2">Lyrics</div>
									<div className="whitespace-pre-wrap border rounded-md bg-muted/30 p-4 text-sm">
										{selected.lyrics}
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
