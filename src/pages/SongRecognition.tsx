import { useMemo, useState } from "react";
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

export default function SongRecognition() {
	const navigate = useNavigate();
	const { user } = useAuth();

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

	const [active, setActive] = useState(false);
	const [usedSongIds, setUsedSongIds] = useState<string[]>([]);
	const [usedSnippetKeys, setUsedSnippetKeys] = useState<string[]>([]);
	const [recentOutcomes, setRecentOutcomes] = useState<boolean[]>([]);
	const [difficultyLevel, setDifficultyLevel] = useState<number>(0);
	const [guessSongId, setGuessSongId] = useState<string>("");
	const [guessQuery, setGuessQuery] = useState<string>("");
	const [songPickerOpen, setSongPickerOpen] = useState(false);
	const [result, setResult] = useState<"idle" | "correct" | "wrong">("idle");
	const [correctTitle, setCorrectTitle] = useState<string>('');
	const [pauseSignal, setPauseSignal] = useState(0);
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
		const pool = (songs ?? []).filter((s) => s.visible !== false);
		if (!pool.length) return null;
		const withSrt = pool.filter((s) => (songSrtBySongId.get(s.id) || []).length >= 2);
		// Only allow songs that have timestamped lyrics (.srt/.lrc persisted as cues).
		if (!withSrt.length) return null;
		const chooseFrom = withSrt;

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
		if (cues.length < 2) {
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

		const looksLikeLrc = cues.length >= 40;
		const baseEdgeSkip = looksLikeLrc ? 12 : 5;
		const maxEdgeSkip = Math.max(0, Math.floor((cues.length - 6) / 2));
		const edgeSkip = Math.min(baseEdgeSkip, maxEdgeSkip);
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
			// ratio of intersection to smaller set (more forgiving for short lines)
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

				// Search a window forward from the last matched line.
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
					// fallback to the cue text itself
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
				// Extra protection: don't allow snippets that match the first lyric lines (often reveals song name).
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
			if (normalized && hintLines.has(normalized)) return false;
			if (normalized && timedInitial.lines.has(normalized)) return false;
			if (normalized && titlePhrase && normalized.includes(titlePhrase)) return false;
			if (normalized && titleWords.size) {
				for (const w of normalized.split(' ')) {
					if (!w) continue;
					if (w.length < 3) continue;
					if (titleWords.has(w)) return false;
				}
			}
			if (normalized && firstWords.size) {
				for (const w of normalized.split(' ')) {
					if (!w) continue;
					if (w.length < 3) continue;
					if (firstWords.has(w)) return false;
				}
			}
			if (normalized && timedInitial.words.size) {
				for (const w of normalized.split(' ')) {
					if (!w) continue;
					if (w.length < 3) continue;
					if (timedInitial.words.has(w)) return false;
				}
			}
			return true;
		};

		const startIdx = edgeSkip;
		const endExclusive = Math.max(startIdx + 1, cues.length - edgeSkip);
		const trimmed = cues.slice(startIdx, endExclusive);
		if (trimmed.length < 2) {
			return {
				challenge: {
					songId: picked.id,
					clipStartMs: undefined,
					clipEndMs: undefined,
					requiresSrt: true,
				},
				nextUsedSongIds,
			};
		}

		const LINE_LONG_MS = 10_000;
		const LINE_SHORT_MS = 6_000;
		const CLIP_TARGET_MS = 11_000;
		const CLIP_MIN_MS = 7_000;
		const CLIP_MAX_MS = 12_000;
		const lineOptions = [2, 1];

		const usedSnippetSet = new Set(prevUsedSnippetKeys);
		const lastKeyForSong = [...prevUsedSnippetKeys]
			.slice()
			.reverse()
			.find((k) => k.startsWith(`${picked.id}:`));
		const lastParts = lastKeyForSong ? lastKeyForSong.split(':') : [];
		const lastCueIdx = lastParts.length >= 3 ? Number(lastParts[1]) : NaN;
		const lastLen = lastParts.length >= 3 ? Number(lastParts[2]) : NaN;
		const pickFromRegion = (starts: number[]) => {
			if (!starts.length) return null;
			const n = trimmed.length;
			const third = Math.max(1, Math.floor(n / 3));
			const middle = starts.filter((i) => i >= third && i < 2 * third);
			const late = starts.filter((i) => i >= 2 * third);
			const r = Math.random();
			const preferred = r < 0.5 ? middle : r < 0.8 ? late : starts;
			const list = preferred.length ? preferred : (late.length ? late : (middle.length ? middle : starts));
			return list[Math.floor(Math.random() * list.length)]!;
		};

		const scoreBlock = (block: SongSrtCue[]) => {
			const first = block[0]!;
			const last = block[block.length - 1]!;
			const dur = Math.max(0, (last.endMs ?? 0) - (first.startMs ?? 0));
			const firstDur = Math.max(0, (first.endMs ?? 0) - (first.startMs ?? 0));
			const preferredLen = firstDur >= LINE_LONG_MS ? 1 : (firstDur <= LINE_SHORT_MS ? 2 : null);
			let score = 0;
			// hard constraints
			if (dur <= 0) score -= 10_000;
			if (dur > CLIP_MAX_MS) score -= 5_000 + (dur - CLIP_MAX_MS);
			if (dur < CLIP_MIN_MS) score -= 2_000 + (CLIP_MIN_MS - dur);
			// prefer near target
			score -= Math.abs(dur - CLIP_TARGET_MS);
			// prefer 1 long line vs 2 short lines based on the first line duration
			if (preferredLen && block.length !== preferredLen) score -= 2_500;

			// discourage selecting a 2-line block if the second line is mostly repetition
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
			for (let i = 0; i + (len - 1) < trimmed.length; i += 1) {
				let ok = true;
				for (let j = 0; j < len; j += 1) {
					const cur = trimmed[i + j]!;
					if (!cuePasses(cur)) {
						ok = false;
						break;
					}
					if (j > 0) {
						const prev = trimmed[i + j - 1]!;
						if ((cur.cueIndex ?? 0) !== (prev.cueIndex ?? 0) + 1) {
							ok = false;
							break;
						}
					}
				}
				if (!ok) continue;
				const block = trimmed.slice(i, i + len);
				const base = trimmed[i];
				const cueIdx = base?.cueIndex ?? i;
				const usedKey = `${picked.id}:${cueIdx}:${len}`;
				const wasUsed = usedSnippetSet.has(usedKey);
				const immediateRepeatPenalty =
					Number.isFinite(lastCueIdx) && Number.isFinite(lastLen) && lastLen === len && cueIdx === lastCueIdx ? 1_250 : 0;
				const startText = normalizedCueText(block[0]!);
				const startCount = lyricLineCounts.get(startText) || 0;
				let chorusPenalty = startCount >= 2 ? 600 * (startCount - 1) : 0;
				if (i > 0) {
					const prevText = normalizedCueText(trimmed[i - 1]!);
					const prevCount = lyricLineCounts.get(prevText) || 0;
					// Prefer entering a unique verse line after a repeated chorus line.
					if (prevCount >= 2 && startCount <= 1) chorusPenalty -= 150;
				}
				candidates.push({ start: i, len, score: scoreBlock(block) - immediateRepeatPenalty - chorusPenalty - (wasUsed ? 10_000 : 0) });
			}
		}

		candidates.sort((a, b) => b.score - a.score);
		const top = candidates.slice(0, 60);
		const topUnused = top.filter((c) => {
			const base = trimmed[c.start];
			const cueIdx = base?.cueIndex ?? c.start;
			const usedKey = `${picked.id}:${cueIdx}:${c.len}`;
			return !usedSnippetSet.has(usedKey);
		});
		const topPreferred = topUnused.length ? topUnused : top;
		const topStarts = topPreferred.map((c) => c.start);
		const pickedStart = pickFromRegion(topStarts);
		const chosen = typeof pickedStart === 'number' ? topPreferred.find((c) => c.start === pickedStart) : topPreferred[0];
		const pickedBlock = chosen ? trimmed.slice(chosen.start, chosen.start + chosen.len) : null;
		if (chosen) {
			const base = trimmed[chosen.start];
			const cueIdx = base?.cueIndex ?? chosen.start;
			nextUsedSnippetKeys = [...nextUsedSnippetKeys, `${picked.id}:${cueIdx}:${chosen.len}`].slice(-200);
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
		const TAIL_PAD_MS = 450;
		const nextCueStartMs = (() => {
			if (!chosen) return undefined;
			const after = trimmed[chosen.start + chosen.len];
			return typeof after?.startMs === 'number' ? after.startMs : undefined;
		})();
		const paddedEnd = (typeof last.endMs === 'number' ? last.endMs : clipStartMs) + TAIL_PAD_MS;
		const cappedEnd = typeof nextCueStartMs === 'number' ? Math.max(clipStartMs, Math.min(paddedEnd, nextCueStartMs - 50)) : paddedEnd;
		const clipEndMs = Math.max(clipStartMs, cappedEnd);
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
								setCorrectTitle('');
								return;
							}
							const next = makeChallenge([], [], 0);
							if (!next) {
								toast.error("No songs available");
								return;
							}
							setChallenge(next.challenge);
							setUsedSongIds(next.nextUsedSongIds);
							setUsedSnippetKeys(next.nextUsedSnippetKeys);
							setActive(true);
							setGuessSongId("");
							setGuessQuery("");
							setResult("idle");
							setCorrectTitle('');
						}}
					>
						{active ? "Close test" : "Start test"}
					</Button>
				</div>
			</div>

		{active && challenge ? (
			<Card className="p-5">
				<div className="max-w-xl mx-auto space-y-4">
					<div>
						<div className="text-sm font-semibold">Recognition snippet</div>
						<div className="text-xs text-muted-foreground mt-0.5">Listen carefully, then pick the matching song.</div>
					</div>

					{challenge.requiresSrt ? (
						<div className="rounded-md border-2 p-3 bg-muted/30 text-sm">
							This song has no timestamped lyrics (.srt), so snippet playback is disabled.
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
									pauseSignal={pauseSignal}
									clipStartMs={challenge.requiresSrt ? undefined : challenge.clipStartMs}
									clipEndMs={challenge.requiresSrt ? undefined : challenge.clipEndMs}
									className="p-6"
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
					</div>

					<div className="flex justify-center">
						<div
							className={cn(
								"rounded-md border-4 px-3 py-2 text-sm font-semibold",
								result === "idle" ? "bg-muted/20 text-muted-foreground" : "",
								result === "correct" ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300" : "",
								result === "wrong" ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300" : "",
							)}
						>
							{result === "idle" ? "Pick an answer, then check." : null}
							{result === "correct" ? "Correct!" : null}
							{result === "wrong" ? (correctTitle ? `Wrong. Correct answer: ${correctTitle}` : 'Wrong.') : null}
						</div>
					</div>

					<div className="flex justify-center">
						<div className="grid grid-cols-2 gap-2">
							<Button
								variant="outline"
								disabled={!challenge || result === 'idle'}
								onClick={() => {
									const next = makeChallenge(usedSongIds, usedSnippetKeys, difficultyLevel);
									if (!next) return;
									setChallenge(next.challenge);
									setUsedSongIds(next.nextUsedSongIds);
									setUsedSnippetKeys(next.nextUsedSnippetKeys);
									setGuessSongId("");
									setGuessQuery("");
									setResult("idle");
									setCorrectTitle('');
								}}
							>
								New snippet
							</Button>
							<Button
								className="w-full"
								disabled={!guessSongId || !challenge}
								onClick={() => {
									if (!challenge) return;
									setPauseSignal((x) => x + 1);
									const isCorrect = guessSongId === challenge.songId;
									setResult(isCorrect ? "correct" : "wrong");
									const correct = (songs ?? []).find((s) => s.id === challenge.songId);
									setCorrectTitle(String(correct?.title ?? ''));
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
