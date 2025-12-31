import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { db, Song, SongListeningEvent, SongModule } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import AudioPlayer from '@/components/AudioPlayer';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function SongModuleRunner() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const { id } = useParams();
	const moduleId = id || '';

	const module = useLiveQuery(() => (moduleId ? db.songModules.get(moduleId) : undefined), [moduleId]);
	const songs = useLiveQuery(() => db.songs.toArray(), [], [] as Song[]);

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
	const [segmentSongId, setSegmentSongId] = useState<string | null>(null);

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

	const filteredSongs = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return moduleSongs;
		return moduleSongs.filter((s) => {
			return (
				s.title.toLowerCase().includes(q) ||
				s.singer.toLowerCase().includes(q) ||
				s.writer.toLowerCase().includes(q)
			);
		});
	}, [moduleSongs, search]);

	const selectedSong = useMemo(() => {
		if (!filteredSongs.length) return null;
		if (selectedSongId) {
			return filteredSongs.find((s) => s.id === selectedSongId) ?? filteredSongs[0];
		}
		return filteredSongs[0];
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

	const flushListeningSegment = async (eventType: SongListeningEvent['eventType']) => {
		if (!module || !segmentStartedAt || !segmentSongId) return;
		const now = Date.now();
		const listenedMs = Math.max(0, now - segmentStartedAt);
		try {
			await db.songListeningEvents.add({
				id: uuidv4(),
				date: new Date(now).toISOString().slice(0, 10),
				timestamp: now,
				userId: user?.id,
				username: user?.username,
				songModuleId: module.id,
				songId: segmentSongId,
				songTitle: songs?.find((s) => s.id === segmentSongId)?.title,
				eventType,
				positionSec: knownPositionSec,
				songDurationSec: knownSongDurationSec,
				listenedMs,
			});
		} catch (e) {
			console.error('Failed to save song listening event', e);
		}
		setSegmentStartedAt(null);
		setIsListening(false);
	};

	useEffect(() => {
		// If the user switches songs while one is playing, close the previous segment.
		if (!selectedSong) return;
		if (segmentSongId && selectedSong.id !== segmentSongId && isListening) {
			void flushListeningSegment('switch');
		}
		setSegmentSongId(selectedSong.id);
		setKnownPositionSec(0);
		setKnownSongDurationSec(undefined);
	}, [selectedSong?.id]);

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
						placeholder="Search by title / singer / writer..."
						className="mb-3"
					/>
					<div className="space-y-2">
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
						<div className="text-sm text-muted-foreground">No songs in this module.</div>
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
								title={selectedSong.title}
								onLoadedMetadata={({ duration }) => setKnownSongDurationSec(duration)}
								onTimeUpdate={({ currentTime }) => setKnownPositionSec(currentTime)}
								onPlay={() => {
									if (!module || !selectedSong) return;
									setIsListening(true);
									setSegmentSongId(selectedSong.id);
									setSegmentStartedAt(Date.now());
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
								<div className="whitespace-pre-wrap border rounded-md bg-muted/30 p-4 text-base md:text-lg leading-relaxed max-h-[340px] overflow-y-auto overflow-x-hidden">
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
						<DialogDescription>Describe the issue you faced with this song/module.</DialogDescription>
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
