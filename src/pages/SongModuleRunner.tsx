import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { AppSettings, db, Song, SongListeningEvent, SongModule, SongSrtCue } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import AudioPlayer from '@/components/AudioPlayer';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function SongModuleRunner() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const { id } = useParams();
	const moduleId = id || '';

	const module = useLiveQuery<SongModule | undefined>(() => (moduleId ? db.songModules.get(moduleId) : undefined), [moduleId]);
	const songs = useLiveQuery<Song[]>(() => db.songs.toArray(), []);
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

	const [search, setSearch] = useState('');
	const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
	const [reportDialogOpen, setReportDialogOpen] = useState(false);
	const [reportMessage, setReportMessage] = useState('');
	const [reportScreenshotDataUrl, setReportScreenshotDataUrl] = useState<string | undefined>(undefined);
	const [isCapturingReportScreenshot, setIsCapturingReportScreenshot] = useState(false);
	const [isSubmittingReport, setIsSubmittingReport] = useState(false);
	const [knownSongDurationSec, setKnownSongDurationSec] = useState<number | undefined>(undefined);
	const [knownPositionSec, setKnownPositionSec] = useState<number>(0);
	const [isListening, setIsListening] = useState(false);
	const [segmentStartedAt, setSegmentStartedAt] = useState<number | null>(null);
	const [lastListenReportedAt, setLastListenReportedAt] = useState<number | null>(null);
	const [segmentSongId, setSegmentSongId] = useState<string | null>(null);
	const segmentSongIdRef = useRef<string | null>(null);
	const lastListenReportedAtRef = useRef<number | null>(null);
	const [viewStartedAt, setViewStartedAt] = useState<number | null>(null);
	const [viewSongId, setViewSongId] = useState<string | null>(null);
	const [lyricsScrollable, setLyricsScrollable] = useState<boolean>(false);
	const [didScrollLyrics, setDidScrollLyrics] = useState<boolean>(false);
	const lyricsRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		setSelectedSongId(null);
		setSearch('');
	}, [moduleId]);

	const moduleSongs = useMemo(() => {
		if (!module) return [];
		const map = new Map((songs ?? []).map((s) => [s.id, s]));
		return (module.songIds || [])
			.map((sid) => map.get(sid))
			.filter((s): s is Song => !!s && s.visible !== false);
	}, [module, songs]);

	const moduleSongIds = useMemo(() => moduleSongs.map((s) => s.id), [moduleSongs]);
	const listeningEvents = useLiveQuery(async () => {
		try {
			const all = await db.songListeningEvents.toArray();
			const userId = user?.id;
			const username = user?.username;
			return all.filter((e) => {
				if (!moduleId || e.songModuleId !== moduleId) return false;
				if (!moduleSongIds.includes(e.songId)) return false;
				if (userId && e.userId === userId) return true;
				if (!userId && username && e.username === username) return true;
				return false;
			});
		} catch {
			return [] as SongListeningEvent[];
		}
	}, [moduleId, moduleSongIds.join('|'), user?.id, user?.username], [] as SongListeningEvent[]);
	const listenedMsBySongId = useMemo(() => {
		const map = new Map<string, number>();
		for (const e of listeningEvents ?? []) {
			if (typeof e.listenedMs !== 'number') continue;
			map.set(e.songId, (map.get(e.songId) || 0) + Math.max(0, e.listenedMs));
		}
		return map;
	}, [listeningEvents]);

	const sortedModuleSongs = useMemo(() => {
		return moduleSongs.slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
	}, [moduleSongs]);

	const filteredSongs = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return sortedModuleSongs;
		return sortedModuleSongs.filter((s) => {
			return (
				s.title.toLowerCase().includes(q) ||
				s.singer.toLowerCase().includes(q) ||
				s.writer.toLowerCase().includes(q)
			);
		});
	}, [sortedModuleSongs, search]);

	const selectedSong = useMemo(() => {
		if (!filteredSongs.length) return null;
		if (!selectedSongId) return null;
		return filteredSongs.find((s) => s.id === selectedSongId) ?? null;
	}, [filteredSongs, selectedSongId]);

	const openReportDialogWithCapture = async () => {
		setReportDialogOpen(true);
		setReportMessage('');
		setReportScreenshotDataUrl(undefined);
		if (isCapturingReportScreenshot) return;
		if (!window.examProctor?.captureViewportScreenshot) return;
		try {
			setIsCapturingReportScreenshot(true);
			const res = await window.examProctor.captureViewportScreenshot();
			if (res?.dataUrl) setReportScreenshotDataUrl(res.dataUrl);
		} catch (e) {
			console.error('Failed to capture report screenshot:', e);
		} finally {
			setIsCapturingReportScreenshot(false);
		}
	};

	const recordListenDelta = async (eventType: SongListeningEvent['eventType']) => {
		const songId = segmentSongIdRef.current;
		const lastAt = lastListenReportedAtRef.current;
		if (!module || !songId || !lastAt) return;
		const now = Date.now();
		const listenedMs = Math.max(0, now - lastAt);
		if (listenedMs <= 0) return;
		try {
			await db.songListeningEvents.add({
				id: uuidv4(),
				date: new Date(now).toISOString().slice(0, 10),
				timestamp: now,
				userId: user?.id,
				username: user?.username,
				songModuleId: module.id,
				songId,
				songTitle: songs?.find((s) => s.id === songId)?.title,
				eventType,
				positionSec: knownPositionSec,
				songDurationSec: knownSongDurationSec,
				listenedMs,
			});
		} catch (e) {
			console.error('Failed to save song listening event', e);
		}
		lastListenReportedAtRef.current = now;
		setLastListenReportedAt(now);
	};

	const flushListeningSegment = async (eventType: SongListeningEvent['eventType']) => {
		if (!module || !segmentSongIdRef.current) return;
		await recordListenDelta(eventType);
		setSegmentStartedAt(null);
		lastListenReportedAtRef.current = null;
		setLastListenReportedAt(null);
		segmentSongIdRef.current = null;
		setIsListening(false);
	};

	useEffect(() => {
		if (!isListening) return;
		const id = window.setInterval(() => {
			void recordListenDelta('play');
		}, 1000);
		return () => window.clearInterval(id);
	}, [isListening, recordListenDelta]);

	async function flushViewSegment() {
		if (!module || !viewStartedAt || !viewSongId) return;
		const now = Date.now();
		const timeInSongMs = Math.max(0, now - viewStartedAt);
		try {
			await db.songListeningEvents.add({
				id: uuidv4(),
				date: new Date(now).toISOString().slice(0, 10),
				timestamp: now,
				userId: user?.id,
				username: user?.username,
				songModuleId: module.id,
				songId: viewSongId,
				songTitle: songs?.find((s) => s.id === viewSongId)?.title,
				eventType: 'view_end',
				songDurationSec: knownSongDurationSec,
				timeInSongMs,
				lyricsScrollable,
				didScrollLyrics,
			});
		} catch (e) {
			console.error('Failed to save song view event', e);
		}
		setViewStartedAt(null);
		setViewSongId(null);
	}

	useEffect(() => {
		const onVisibility = () => {
			if (document.hidden) {
				if (isListening) void flushListeningSegment('pause');
				void flushViewSegment();
			}
		};
		const onBeforeUnload = () => {
			if (isListening) void flushListeningSegment('pause');
			void flushViewSegment();
		};
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('beforeunload', onBeforeUnload);
		};
	}, [isListening, flushListeningSegment]);

	useEffect(() => {
		// If the user switches songs while one is playing, close the previous segment.
		if (!selectedSong) return;
		if (segmentSongId && selectedSong.id !== segmentSongId && isListening) {
			void flushListeningSegment('switch');
		}
		if (viewSongId && selectedSong.id !== viewSongId) {
			void flushViewSegment();
		}
		try {
			const now = Date.now();
			void db.songListeningEvents.add({
				id: uuidv4(),
				date: new Date(now).toISOString().slice(0, 10),
				timestamp: now,
				userId: user?.id,
				username: user?.username,
				songModuleId: module.id,
				songId: selectedSong.id,
				songTitle: selectedSong.title,
				eventType: 'view_start',
				songDurationSec: knownSongDurationSec,
			});
		} catch (e) {
			console.error('Failed to save song view start event', e);
		}
		setViewSongId(selectedSong.id);
		setViewStartedAt(Date.now());
		setDidScrollLyrics(false);
		setLyricsScrollable(false);
		segmentSongIdRef.current = selectedSong.id;
		setSegmentSongId(selectedSong.id);
		setKnownPositionSec(0);
		setKnownSongDurationSec(undefined);
	}, [selectedSong?.id]);

	useEffect(() => {
		if (!selectedSong) return;
		const el = lyricsRef.current;
		if (!el) return;
		const update = () => {
			setLyricsScrollable(el.scrollHeight > el.clientHeight + 2);
		};
		update();
		const ro = new ResizeObserver(() => update());
		ro.observe(el);
		return () => ro.disconnect();
	}, [selectedSong?.id]);

	useEffect(() => {
		return () => {
			if (isListening) void flushListeningSegment('pause');
			void flushViewSegment();
		};
	}, [isListening, lastListenReportedAt, segmentSongId, viewStartedAt, viewSongId, lyricsScrollable, didScrollLyrics]);

	const submitErrorReport = async () => {
		if (!reportMessage.trim()) {
			toast.error('Please describe the issue.');
			return;
		}
		if (!module) {
			toast.error('Module not loaded');
			return;
		}
		try {
			setIsSubmittingReport(true);
			const now = Date.now();
			await db.errorReports.add({
				id: uuidv4(),
				status: 'new',
				message: reportMessage.trim(),
				screenshotDataUrl: reportScreenshotDataUrl,
				createdAt: now,
				updatedAt: now,
				route: window.location.hash || window.location.pathname,
				moduleId: module.id,
				moduleTitle: module.title,
				// Reuse question fields for song context (to avoid schema changes)
				questionId: selectedSong?.id,
				questionCode: selectedSong?.title,
				phase: 'unknown',
				appState: {
					kind: 'song',
					songModuleId: module.id,
					songModuleTitle: module.title,
					songId: selectedSong?.id,
					songTitle: selectedSong?.title,
					search,
				},
				reporterUserId: user?.id,
				reporterUsername: user?.username,
			});
			setReportDialogOpen(false);
			setReportMessage('');
			setReportScreenshotDataUrl(undefined);
			toast.success('Report sent');
		} catch (e) {
			console.error(e);
			toast.error('Failed to submit report');
		} finally {
			setIsSubmittingReport(false);
		}
	};

	if (!module) {
		return (
			<div className="max-w-7xl mx-auto space-y-4">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-semibold">Song Module</h1>
						<p className="text-sm text-muted-foreground">Loading...</p>
					</div>
					<Button variant="outline" onClick={() => navigate('/songs')}>Back</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-7xl mx-auto space-y-6">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="text-3xl font-bold text-foreground truncate">{module.title}</h1>
					{module.description ? <p className="text-muted-foreground mt-2">{module.description}</p> : null}
				</div>
				<div className="flex items-center gap-2">
					{songRecognitionEnabled ? (
						<Button
							variant="outline"
							onClick={() => navigate('/song-recognition')}
						>
							Song Recognition Test
						</Button>
					) : null}
					<Button variant="outline" onClick={() => void openReportDialogWithCapture()}>
						Report issue
					</Button>
					<Button variant="outline" onClick={() => navigate('/songs')}>Back</Button>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<Card className="p-4 lg:col-span-1">
					<div className="flex items-center justify-between gap-3 mb-3">
						<div className="text-sm font-semibold">Songs</div>
					</div>
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search list"
						className="mb-3"
					/>
					<div className="space-y-2 max-h-[60vh] overflow-y-auto overflow-x-hidden pr-1">
						{filteredSongs.map((s) => (
							<Button
								key={s.id}
								variant="ghost"
								className={cn(
									"w-full justify-start h-auto py-3 px-3 rounded-md border",
									selectedSong?.id === s.id ? 'bg-muted' : 'bg-background',
								)}
								onClick={() => setSelectedSongId(s.id)}
							>
								<div className="min-w-0 text-left w-full">
									<div className="font-medium truncate">{s.title}</div>
									<div className="text-xs text-muted-foreground truncate">{s.singer}</div>
								</div>
							</Button>
						))}
						{filteredSongs.length === 0 && (
							<div className="text-sm text-muted-foreground">No songs match your search.</div>
						)}
					</div>
				</Card>

				<Card className="p-4 lg:col-span-2">
					{!selectedSong ? (
						<div className="text-sm text-muted-foreground">Select a song to start.</div>
					) : (
						<div className="space-y-4">
							<div>
								<div className="text-2xl font-semibold">{selectedSong.title}</div>
								<div className="text-sm text-muted-foreground mt-1">
									Singer: <span className="text-foreground font-medium">{selectedSong.singer}</span>
								</div>
								<div className="text-sm text-muted-foreground">
									Writer: <span className="text-foreground font-medium">{selectedSong.writer}</span>
								</div>
							</div>

							<AudioPlayer
								src={selectedSong.audioFileUrl}
								showVolumeControls={false}
								onLoadedMetadata={({ duration }) => setKnownSongDurationSec(duration)}
								onTimeUpdate={({ currentTime }) => setKnownPositionSec(currentTime)}
								onPlay={() => {
									if (!module || !selectedSong) return;
									segmentSongIdRef.current = selectedSong.id;
									setIsListening(true);
									setSegmentSongId(selectedSong.id);
									setSegmentStartedAt(Date.now());
									lastListenReportedAtRef.current = Date.now();
									setLastListenReportedAt(lastListenReportedAtRef.current);
								}}
								onPause={() => {
									void flushListeningSegment('pause');
								}}
								onEnded={() => {
									void flushListeningSegment('ended');
								}}
							/>

							<div>
								<div className="text-sm font-semibold mb-2">Lyrics</div>
								<div
									ref={lyricsRef}
									className="whitespace-pre-wrap border rounded-md bg-muted/30 p-4 text-lg md:text-xl leading-relaxed max-h-[340px] overflow-y-auto overflow-x-hidden"
									onScroll={() => setDidScrollLyrics(true)}
								>
									{selectedSong.lyrics}
								</div>
							</div>
						</div>
					)}
				</Card>
			</div>

			<Dialog open={reportDialogOpen} onOpenChange={(open) => { if (!open) setReportDialogOpen(false); }}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Report an issue</DialogTitle>
						<DialogDescription>
							Describe the issue you encountered.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						{reportScreenshotDataUrl ? (
							<div className="max-h-[40vh] overflow-auto rounded-md border">
								<img src={reportScreenshotDataUrl} alt="Report screenshot" className="w-full h-auto" />
							</div>
						) : (
							<div className="rounded-md border p-3 text-xs text-muted-foreground">
								{isCapturingReportScreenshot ? 'Capturing screenshot…' : 'Screenshot (optional) will appear here if available.'}
							</div>
						)}
						<div className="space-y-1">
							<div className="text-xs text-muted-foreground">Issue description</div>
							<Textarea
								value={reportMessage}
								onChange={(e) => setReportMessage(e.target.value)}
								placeholder="Describe what happened and what you expected..."
								className="min-h-[180px]"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setReportDialogOpen(false)} disabled={isSubmittingReport}>
							Cancel
						</Button>
						<Button type="button" onClick={() => void submitErrorReport()} disabled={isSubmittingReport}>
							{isSubmittingReport ? 'Sending…' : 'Send report'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

		</div>
	);
}
