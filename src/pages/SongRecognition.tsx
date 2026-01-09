import { useMemo, useState, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { AppSettings, db, Song, SongListeningEvent, SongSrtCue } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import AudioPlayer from "@/components/AudioPlayer";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Check, ChevronsUpDown } from "lucide-react";
import { formatMsAsTimestamp } from "@/lib/time";

export default function SongRecognition() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const usedSnippetRangesRef = useRef<Map<string, Set<string>>>(new Map());

	const appSettings = useLiveQuery<AppSettings | undefined>(() => db.settings.get("1"), []);
	const songRecognitionEnabled = appSettings?.songRecognitionEnabled === true;

	const songs = useLiveQuery<Song[]>(
		async () => {
			const all = await db.songs.toArray();
			return all
				.filter((s) => s.visible !== false)
				.slice()
				.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
		},
		[],
	);

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

	const songIdsKey = useMemo(() => (songs ?? []).map((s) => s.id).sort().join("|"), [songs]);
	const listeningEvents = useLiveQuery<SongListeningEvent[]>(async () => {
		if (!user) return [] as SongListeningEvent[];
		try {
			return await db.songListeningEvents
				.where("userId")
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

	const [active, setActive] = useState(false);
	const [usedSongIds, setUsedSongIds] = useState<string[]>([]);
	const [usedSnippetKeys, setUsedSnippetKeys] = useState<string[]>([]);
	const [recentOutcomes, setRecentOutcomes] = useState<boolean[]>([]);
	const [difficultyLevel, setDifficultyLevel] = useState<number>(0);
	const [guessSongId, setGuessSongId] = useState<string>("");
	const [guessQuery, setGuessQuery] = useState<string>("");
	const [songPickerOpen, setSongPickerOpen] = useState(false);
	const [result, setResult] = useState<"idle" | "correct" | "wrong">("idle");
	const [challenge, setChallenge] = useState<
		| null
		| {
			songId: string;
			clipStartMs?: number;
			clipEndMs?: number;
			requiresSrt: boolean;
		}
	>(null);

	const makeChallenge = (prevUsedSongIds: string[], prevUsedSnippetKeys: string[], nextDifficultyLevel: number) => {
		const songPool = (songs ?? []).filter((s) => s.visible !== false);
		if (!songPool.length) return null;
		const withTimedLyrics = songPool.filter((s) => (songSrtBySongId.get(s.id) || []).length > 0);
		if (!withTimedLyrics.length) return null;
		const withEnoughCues = withTimedLyrics.filter((s) => (songSrtBySongId.get(s.id) || []).length >= 5);
		const chooseFrom = withEnoughCues.length ? withEnoughCues : withTimedLyrics;

		const listenedSorted = chooseFrom
			.map((s) => listenedMsBySongId.get(s.id) || 0)
			.slice()
			.sort((a, b) => a - b);
		const p30 = listenedSorted.length ? listenedSorted[Math.floor(0.3 * (listenedSorted.length - 1))] : 0;
		const p15 = listenedSorted.length ? listenedSorted[Math.floor(0.15 * (listenedSorted.length - 1))] : 0;
		const difficultyFiltered =
			nextDifficultyLevel >= 2
				? chooseFrom.filter((s) => (listenedMsBySongId.get(s.id) || 0) <= p15)
				: nextDifficultyLevel >= 1
					? chooseFrom.filter((s) => (listenedMsBySongId.get(s.id) || 0) <= p30)
					: chooseFrom;
		const difficultyPool = difficultyFiltered.length ? difficultyFiltered : chooseFrom;

		const prevUsedSet = new Set(prevUsedSongIds);
		const lastPickedSongId = prevUsedSongIds.length ? prevUsedSongIds[prevUsedSongIds.length - 1] : undefined;
		let available = difficultyPool.filter((s) => !prevUsedSet.has(s.id) && s.id !== lastPickedSongId);
		let nextUsedSongIds = prevUsedSongIds;
		if (!available.length) {
			// reset rotation, but still try not to repeat the immediately previous song
			nextUsedSongIds = [];
			available = difficultyPool.filter((s) => s.id !== lastPickedSongId);
			if (!available.length) available = difficultyPool;
		}
		const picked = available[Math.floor(Math.random() * available.length)]!;
		nextUsedSongIds = [...nextUsedSongIds, picked.id];
		let nextUsedSnippetKeys = prevUsedSnippetKeys;
		const cues = (songSrtBySongId.get(picked.id) || []).slice().sort((a, b) => a.cueIndex - b.cueIndex);
		if (cues.length < 5) {
			return {
				challenge: {
					songId: picked.id,
					clipStartMs: undefined,
					clipEndMs: undefined,
					requiresSrt: true,
				},
				nextUsedSongIds,
				nextUsedSnippetKeys,
			};
		}

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
		if (coreEndExclusive - coreStart < 1) {
			return {
				challenge: {
					songId: picked.id,
					clipStartMs: undefined,
					clipEndMs: undefined,
					requiresSrt: true,
				},
				nextUsedSongIds,
				nextUsedSnippetKeys,
			};
		}
		const windowStart = Math.max(coreStart, middleStartIdx);
		const windowEnd = Math.min(coreEndExclusive, middleEndExclusive);
		const eligibleWindow = cues.slice(windowStart, windowEnd);
		const eligible = eligibleWindow.filter(cuePasses);
		if (!eligible.length) {
			return {
				challenge: {
					songId: picked.id,
					clipStartMs: undefined,
					clipEndMs: undefined,
					requiresSrt: true,
				},
				nextUsedSongIds,
				nextUsedSnippetKeys,
			};
		}

		let pickedBlock: SongSrtCue[] | null = null;
		const eligibleByIdx = new Map<number, SongSrtCue>();
		for (const c of eligible) eligibleByIdx.set(c.cueIndex, c);
		const eligibleIdxSet = new Set(eligible.map((c) => c.cueIndex));

		const minDurationMs = 4500;
		const makeKey = (startMs: number, endMs: number) => `${startMs}-${endMs}`;
		const usedForSong = usedSnippetRangesRef.current.get(picked.id) ?? new Set<string>();
		usedSnippetRangesRef.current.set(picked.id, usedForSong);

		type Candidate = { cues: SongSrtCue[]; startMs: number; endMs: number; key: string };
		const candidates: Candidate[] = [];

		const addCandidate = (cueList: SongSrtCue[]) => {
			if (!cueList.length) return;
			const sorted = cueList.slice().sort((a, b) => a.cueIndex - b.cueIndex);
			const startMs = Math.max(0, sorted[0]!.startMs);
			const endMs = Math.max(startMs, sorted[sorted.length - 1]!.endMs);
			candidates.push({ cues: sorted, startMs, endMs, key: makeKey(startMs, endMs) });
		};

		// Base: all contiguous 2-line candidates inside eligible window
		for (const c of eligible) {
			const next = eligibleByIdx.get(c.cueIndex + 1);
			if (!next) continue;
			if (c.endMs !== next.startMs) continue;
			addCandidate([c, next]);
		}
		// Base: all single-line candidates
		for (const c of eligible) addCandidate([c]);

		const tryExtend = (base: Candidate): Candidate => {
			const duration = base.endMs - base.startMs;
			if (duration >= minDurationMs) return base;
			const first = base.cues[0]!;
			const last = base.cues[base.cues.length - 1]!;
			// Prefer previous eligible adjacent line (must be in eligible set and time-contiguous)
			const prevIdx = first.cueIndex - 1;
			const nextIdx = last.cueIndex + 1;
			const prev = eligibleIdxSet.has(prevIdx) ? eligibleByIdx.get(prevIdx) : undefined;
			if (prev && prev.endMs === first.startMs) {
				const extended = base.cues.length >= 3 ? base : { cues: [prev, ...base.cues], startMs: prev.startMs, endMs: base.endMs, key: makeKey(Math.max(0, prev.startMs), base.endMs) };
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

		// Prefer 2-line, then 1-line; allow 3-line only if needed for minDuration
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
				// Exhausted all options; allow reuse from now on.
				usedForSong.clear();
				usedForSong.add(chosen.key);
			}
			nextUsedSnippetKeys = [...nextUsedSnippetKeys, `${picked.id}:${chosen.key}:${pickedBlock.length}`].slice(-200);
			console.info(
				`[song-recognition] snippet ${picked.id} ${formatMsAsTimestamp(chosen.startMs)}-${formatMsAsTimestamp(chosen.endMs)} (${chosen.endMs - chosen.startMs}ms, ${pickedBlock.length} line(s))`,
			);
		}

		if (!pickedBlock || !pickedBlock.length) {
			return {
				challenge: {
					songId: picked.id,
					clipStartMs: undefined,
					clipEndMs: undefined,
					requiresSrt: true,
				},
				nextUsedSongIds,
				nextUsedSnippetKeys,
			};
		}

		const first = pickedBlock[0]!;
		const last = pickedBlock[pickedBlock.length - 1]!;
		const clipStartMs = Math.max(0, first.startMs);
		const clipEndMs = Math.max(clipStartMs, last.endMs);
		return {
			challenge: {
				songId: picked.id,
				clipStartMs,
				clipEndMs,
				requiresSrt: false,
			},
			nextUsedSongIds,
			nextUsedSnippetKeys,
		};
	};

	const guessOptions = useMemo(() => {
		const list = (songs ?? []).filter((s) => s.visible !== false);
		const q = guessQuery.trim().toLowerCase();
		if (!q) return list;
		return list.filter((s) => `${s.title || ""} ${s.singer || ""}`.toLowerCase().includes(q));
	}, [songs, guessQuery]);

	if (!songRecognitionEnabled) {
		return (
			<div className="max-w-5xl mx-auto space-y-4">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h1 className="text-3xl font-bold text-foreground">Song Recognition</h1>
						<p className="text-muted-foreground mt-2">This feature is disabled in Settings.</p>
					</div>
					<Button variant="outline" onClick={() => navigate("/songs")}>
						Back
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-5xl mx-auto space-y-6">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="text-3xl font-bold text-foreground">Song Recognition Test</h1>
					<p className="text-muted-foreground mt-2">Listen to the snippet and choose the correct song.</p>
				</div>
				<div className="shrink-0 flex items-center gap-2">
					<Button variant="outline" onClick={() => navigate("/songs")}>
						Back
					</Button>
					<Button
						variant={active ? "outline" : "default"}
						onClick={() => {
							if (active) {
								setActive(false);
								setChallenge(null);
								setUsedSongIds([]);
								setUsedSnippetKeys([]);
								setRecentOutcomes([]);
								setDifficultyLevel(0);
								setGuessSongId("");
								setGuessQuery("");
								setResult("idle");
								return;
							}
							const next = makeChallenge([], [], 0);
							if (!next) {
								toast.error("No songs with timestamped lyrics (.srt/.lrc) available");
								return;
							}
							setChallenge(next.challenge);
							setUsedSongIds(next.nextUsedSongIds);
							setUsedSnippetKeys(next.nextUsedSnippetKeys);
							setActive(true);
							setGuessSongId("");
							setGuessQuery("");
							setResult("idle");
						}}
					>
						{active ? "Close test" : "Start test"}
					</Button>
				</div>
			</div>

			{active && challenge ? (
				<Card className="p-4">
					<div className="space-y-3">
						{challenge.requiresSrt && ((songSrtBySongId.get(challenge.songId) || []).length === 0) ? (
							<div className="rounded-md border p-3 bg-muted/30 text-sm">
								This song has no timestamped lyrics (.srt/.lrc), so snippet playback is disabled.
							</div>
						) : null}
						{(() => {
							const song = (songs ?? []).find((s) => s.id === challenge.songId);
							if (!song) return null;
							return (
								<AudioPlayer
									src={song.audioFileUrl}
									showVolumeControls={false}
									hideSeekBar
									hideTimeDisplay
									clipStartMs={challenge.requiresSrt ? undefined : challenge.clipStartMs}
									clipEndMs={challenge.requiresSrt ? undefined : challenge.clipEndMs}
								/>
							);
						})()}

						<div className="space-y-2">
							<div className="text-sm font-semibold">Your answer</div>
							<Popover
								open={songPickerOpen}
								onOpenChange={(open) => {
									if (result !== 'idle') return;
									setSongPickerOpen(open);
								}}
							>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										role="combobox"
										aria-expanded={songPickerOpen}
										disabled={result !== 'idle'}
										className="w-full justify-between"
									>
										<span className={guessSongId ? 'truncate' : 'truncate text-muted-foreground'}>
											{guessSongId ? ((songs ?? []).find((s) => s.id === guessSongId)?.title || 'Selected song') : 'Select song'}
										</span>
										<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
									<Command>
										<CommandInput
											value={guessQuery}
											disabled={result !== 'idle'}
											onValueChange={(v) => {
												setGuessQuery(v);
												setResult('idle');
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
														setGuessSongId(s.id);
														setResult('idle');
														setSongPickerOpen(false);
													}}
												>
													<Check className={guessSongId === s.id ? 'h-4 w-4' : 'h-4 w-4 opacity-0'} />
													<span className="truncate">{s.title}</span>
												</CommandItem>
											))}
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>

							<div
							className={cn(
								"rounded-md border p-3 text-sm font-semibold",
								result === "idle" ? "bg-muted/20 text-muted-foreground" : "",
								result === "correct" ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300" : "",
								result === "wrong" ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300" : "",
							)}
						>
							{result === "idle" ? "Pick an answer, then check." : null}
							{result === "correct" ? "Correct!" : null}
							{result === "wrong"
								? (() => {
									const ch = challenge;
									const correct = ch ? (songs ?? []).find((s) => s.id === ch.songId) : undefined;
									return correct ? `Wrong. Correct: ${correct.title}${correct.singer ? ` — ${correct.singer}` : ''}` : 'Wrong.';
								})()
								: null}
						</div>

							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									onClick={() => {
										const next = makeChallenge(usedSongIds, usedSnippetKeys, difficultyLevel);
										if (!next) return;
										setChallenge(next.challenge);
										setUsedSongIds(next.nextUsedSongIds);
										setUsedSnippetKeys(next.nextUsedSnippetKeys);
										setGuessSongId("");
										setGuessQuery("");
										setResult("idle");
									}}
								>
									New snippet
								</Button>
								<Button
									disabled={!guessSongId || !challenge}
									onClick={() => {
										if (!challenge) return;
										const isCorrect = guessSongId === challenge.songId;
										setResult(isCorrect ? "correct" : "wrong");
										setRecentOutcomes((prev) => {
											const next = [...prev, isCorrect].slice(-10);
											if (next.length >= 8) {
												const correctCount = next.filter(Boolean).length;
												if (correctCount >= 8) {
													setDifficultyLevel((d) => {
														if (d >= 2) return d;
														toast.message("Difficulty increased");
														return d + 1;
													});
													return [];
												}
											}
											return next;
										});
									}}
								>
									Check
								</Button>
							</div>
						</div>
					</div>
				</Card>
			) : null}
		</div>
	);
}
