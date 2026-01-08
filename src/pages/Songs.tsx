import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppSettings, db, Song, SongListeningEvent, SongSrtCue } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import AudioPlayer from "@/components/AudioPlayer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Note: This page is retained for backwards compatibility, but the main
// student-facing entrypoint is now Song Modules at /songs.

export default function Songs() {
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
				.filter((e) => e.eventType === 'listened')
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

	const makeRecognitionChallenge = () => {
		const pool = (songs ?? []).filter((s) => s.visible !== false);
		if (!pool.length) return null;
		const withSrt = pool.filter((s) => (songSrtBySongId.get(s.id) || []).length >= 5);
		const chooseFrom = withSrt.length ? withSrt : pool;
		const picked = chooseFrom[Math.floor(Math.random() * chooseFrom.length)]!;
		const cues = (songSrtBySongId.get(picked.id) || []).slice().sort((a, b) => a.cueIndex - b.cueIndex);
		if (cues.length < 5) {
			return {
				songId: picked.id,
				clipStartMs: undefined,
				clipEndMs: undefined,
				requiresSrt: true,
			};
		}

		const listenedMs = listenedMsBySongId.get(picked.id) || 0;
		const listenedSorted = pool
			.map((s) => listenedMsBySongId.get(s.id) || 0)
			.slice()
			.sort((a, b) => a - b);
		const p70 = listenedSorted.length ? listenedSorted[Math.floor(0.7 * (listenedSorted.length - 1))] : 0;
		const highFreq = listenedMs >= p70 && listenedMs > 0;
		const linesToPlay = highFreq ? 1 : 2;

		const startIdx = 2;
		const endExclusive = Math.max(startIdx + 1, cues.length - 2);
		const usable = cues.slice(startIdx, endExclusive);
		if (!usable.length) {
			return {
				songId: picked.id,
				clipStartMs: undefined,
				clipEndMs: undefined,
				requiresSrt: true,
			};
		}
		const idx = Math.floor(Math.random() * usable.length);
		const first = usable[idx]!;
		const second = linesToPlay === 2 ? usable[Math.min(idx + 1, usable.length - 1)]! : first;
		const clipStartMs = Math.max(0, first.startMs);
		const clipEndMs = Math.max(clipStartMs, second.endMs);

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
											{ch.requiresSrt ? (
												<div className="rounded-md border p-3 bg-muted/30 text-sm">
													This song has no timestamped lyrics (.srt), so snippet playback is disabled.
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
											<div className="space-y-2">
												<Input
													value={recognitionGuessQuery}
													onChange={(e) => {
														setRecognitionGuessQuery(e.target.value);
														setRecognitionResult('idle');
													}}
													placeholder="Search songs..."
												/>
												<Select
													value={recognitionGuessSongId}
													onValueChange={(v) => {
														setRecognitionGuessSongId(v);
														setRecognitionResult('idle');
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
														'rounded-md border p-3 text-sm font-semibold',
														recognitionResult === 'idle' ? 'bg-muted/20 text-muted-foreground' : '',
														recognitionResult === 'correct' ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300' : '',
														recognitionResult === 'wrong' ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300' : '',
													)}
												>
													{recognitionResult === 'idle' ? 'Pick an answer, then check.' : null}
													{recognitionResult === 'correct' ? 'Correct!' : null}
													{recognitionResult === 'wrong' ? 'Wrong.' : null}
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
								<AudioPlayer src={selected.audioFileUrl} title={selected.title} />
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
