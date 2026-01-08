import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { AppSettings, db, Song, SongListeningEvent, SongSrtCue } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AudioPlayer from "@/components/AudioPlayer";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

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
				.filter((e) => e.eventType === "listened")
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

	const [active, setActive] = useState(false);
	const [usedSongIds, setUsedSongIds] = useState<string[]>([]);
	const [recentOutcomes, setRecentOutcomes] = useState<boolean[]>([]);
	const [difficultyLevel, setDifficultyLevel] = useState<number>(0);
	const [guessSongId, setGuessSongId] = useState<string>("");
	const [guessQuery, setGuessQuery] = useState<string>("");
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

	const makeChallenge = (prevUsedSongIds: string[], nextDifficultyLevel: number) => {
		const pool = (songs ?? []).filter((s) => s.visible !== false);
		if (!pool.length) return null;
		const withSrt = pool.filter((s) => (songSrtBySongId.get(s.id) || []).length >= 5);
		const chooseFrom = withSrt.length ? withSrt : pool;

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
		let available = difficultyPool.filter((s) => !prevUsedSet.has(s.id));
		let nextUsedSongIds = prevUsedSongIds;
		if (!available.length) {
			available = difficultyPool;
			nextUsedSongIds = [];
		}
		const picked = available[Math.floor(Math.random() * available.length)]!;
		nextUsedSongIds = [...nextUsedSongIds, picked.id];
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
			};
		}

		const startIdx = 2;
		const endExclusive = Math.max(startIdx + 1, cues.length - 2);
		const usable = cues.slice(startIdx, endExclusive);
		if (!usable.length) {
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
		const idx = Math.floor(Math.random() * usable.length);
		const first = usable[idx]!;
		const linesToPlay = nextDifficultyLevel >= 1 ? 1 : 2;
		const second = linesToPlay >= 2 ? usable[Math.min(idx + 1, usable.length - 1)]! : first;
		const clipStartMs = Math.max(0, first.startMs);
		const rawEndMs = Math.max(clipStartMs, second.endMs);
		const maxClipMs = nextDifficultyLevel >= 2 ? 4000 : nextDifficultyLevel >= 1 ? 6000 : undefined;
		const clipEndMs = maxClipMs ? Math.min(rawEndMs, clipStartMs + maxClipMs) : rawEndMs;
		return {
			challenge: {
				songId: picked.id,
				clipStartMs,
				clipEndMs,
				requiresSrt: false,
			},
			nextUsedSongIds,
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
								setRecentOutcomes([]);
								setDifficultyLevel(0);
								setGuessSongId("");
								setGuessQuery("");
								setResult("idle");
								return;
							}
							const next = makeChallenge([], 0);
							if (!next) {
								toast.error("No songs available");
								return;
							}
							setChallenge(next.challenge);
							setUsedSongIds(next.nextUsedSongIds);
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
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
						<div className="lg:col-span-2 space-y-2">
							{challenge.requiresSrt ? (
								<div className="rounded-md border p-3 bg-muted/30 text-sm">
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
										clipStartMs={challenge.requiresSrt ? undefined : challenge.clipStartMs}
										clipEndMs={challenge.requiresSrt ? undefined : challenge.clipEndMs}
									/>
								);
							})()}
						</div>

						<div className="lg:col-span-1 space-y-2">
							<div className="text-sm font-semibold">Your answer</div>
							<Input
								value={guessQuery}
								onChange={(e) => {
									setGuessQuery(e.target.value);
									setResult("idle");
								}}
								placeholder="Search songs..."
							/>
							<Select
								value={guessSongId}
								onValueChange={(v) => {
									setGuessSongId(v);
									setResult("idle");
								}}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select song" />
								</SelectTrigger>
								<SelectContent>
									{guessOptions.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

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
								{result === "wrong" ? "Wrong." : null}
							</div>

							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									onClick={() => {
										const next = makeChallenge(usedSongIds, difficultyLevel);
										if (!next) return;
										setChallenge(next.challenge);
										setUsedSongIds(next.nextUsedSongIds);
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
