import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

function formatTime(seconds: number) {
	if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
	const s = Math.floor(seconds);
	const mm = Math.floor(s / 60);
	const ss = s % 60;
	return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

type Props = {
	src: string;
	className?: string;
	title?: string;
	showVolumeControls?: boolean;
	clipStartMs?: number;
	clipEndMs?: number;
	hideSeekBar?: boolean;
	onEnded?: () => void;
	onPlay?: () => void;
	onPause?: () => void;
	onTimeUpdate?: (payload: { currentTime: number; duration: number }) => void;
	onLoadedMetadata?: (payload: { duration: number }) => void;
};

export default function AudioPlayer({
	src,
	className,
	title,
	showVolumeControls = true,
	clipStartMs,
	clipEndMs,
	hideSeekBar = false,
	onEnded,
	onPlay,
	onPause,
	onTimeUpdate,
	onLoadedMetadata,
}: Props) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const didInitClipRef = useRef(false);
	const [ready, setReady] = useState(false);
	const [playing, setPlaying] = useState(false);
	const [duration, setDuration] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [volume, setVolume] = useState(0.9);
	const [muted, setMuted] = useState(false);
	const [seeking, setSeeking] = useState(false);

	const displayTitle = useMemo(() => {
		if (!title) return undefined;
		let t = String(title).trim();
		t = t.replace(/\|+\s*$/, '');
		const byIdx = t.toLowerCase().indexOf(' by ');
		if (byIdx >= 0) t = t.slice(0, byIdx).trim();
		return t || undefined;
	}, [title]);

	const clipStartSec = useMemo(() => {
		if (typeof clipStartMs !== 'number' || !Number.isFinite(clipStartMs) || clipStartMs < 0) return undefined;
		return clipStartMs / 1000;
	}, [clipStartMs]);
	const clipEndSec = useMemo(() => {
		if (typeof clipEndMs !== 'number' || !Number.isFinite(clipEndMs) || clipEndMs < 0) return undefined;
		return clipEndMs / 1000;
	}, [clipEndMs]);
	const clipActive = typeof clipStartSec === 'number' && typeof clipEndSec === 'number' && clipEndSec > clipStartSec;

	useEffect(() => {
		const el = audioRef.current;
		if (!el) return;

		const handleLoaded = () => {
			setDuration(Number.isFinite(el.duration) ? el.duration : 0);
			setReady(true);
			onLoadedMetadata?.({ duration: Number.isFinite(el.duration) ? el.duration : 0 });
			if (!didInitClipRef.current && clipActive && typeof clipStartSec === 'number') {
				try {
					const next = Math.max(0, clipStartSec);
					if (!Number.isFinite(el.currentTime) || el.currentTime < next || (typeof clipEndSec === 'number' && el.currentTime >= clipEndSec)) {
						el.currentTime = next;
					}
					setCurrentTime(el.currentTime || 0);
					didInitClipRef.current = true;
				} catch {
					// ignore
				}
			}
		};
		const handleTime = () => {
			if (clipActive && typeof clipEndSec === 'number' && Number.isFinite(el.currentTime) && el.currentTime >= clipEndSec) {
				try {
					el.pause();
					el.currentTime = clipEndSec;
				} catch {
					// ignore
				}
				setPlaying(false);
				setCurrentTime(clipEndSec);
				onEnded?.();
				return;
			}
			if (!seeking) setCurrentTime(el.currentTime || 0);
			onTimeUpdate?.({ currentTime: el.currentTime || 0, duration: Number.isFinite(el.duration) ? el.duration : 0 });
		};
		const handlePlay = () => {
			if (clipActive) {
				try {
					if (typeof clipStartSec === 'number' && Number.isFinite(el.currentTime) && el.currentTime < clipStartSec) {
						el.currentTime = clipStartSec;
					}
					if (typeof clipEndSec === 'number' && Number.isFinite(el.currentTime) && el.currentTime >= clipEndSec) {
						el.currentTime = clipStartSec ?? 0;
					}
				} catch {
					// ignore
				}
			}
			setPlaying(true);
			onPlay?.();
		};
		const handlePause = () => {
			setPlaying(false);
			onPause?.();
		};
		const handleEnded = () => {
			setPlaying(false);
			onEnded?.();
		};

		el.addEventListener("loadedmetadata", handleLoaded);
		el.addEventListener("timeupdate", handleTime);
		el.addEventListener("play", handlePlay);
		el.addEventListener("pause", handlePause);
		el.addEventListener("ended", handleEnded);

		return () => {
			el.removeEventListener("loadedmetadata", handleLoaded);
			el.removeEventListener("timeupdate", handleTime);
			el.removeEventListener("play", handlePlay);
			el.removeEventListener("pause", handlePause);
			el.removeEventListener("ended", handleEnded);
		};
	}, [clipActive, clipEndSec, clipStartSec, onEnded, onLoadedMetadata, onPlay, onPause, onTimeUpdate, seeking]);

	useEffect(() => {
		const el = audioRef.current;
		if (!el) return;
		el.volume = Math.max(0, Math.min(1, volume));
	}, [volume]);

	useEffect(() => {
		const el = audioRef.current;
		if (!el) return;
		el.muted = muted;
	}, [muted]);

	useEffect(() => {
		const el = audioRef.current;
		if (!el) return;
		setReady(false);
		setPlaying(false);
		setDuration(0);
		setCurrentTime(0);
		didInitClipRef.current = false;
		try {
			el.pause();
			el.load();
		} catch {
			// ignore
		}
	}, [src, clipStartMs, clipEndMs]);

	const effectiveDuration = useMemo(() => {
		if (!Number.isFinite(duration) || duration <= 0) return 0;
		if (!clipActive || typeof clipStartSec !== 'number' || typeof clipEndSec !== 'number') return duration;
		return Math.max(0, Math.min(duration, clipEndSec) - Math.max(0, clipStartSec));
	}, [clipActive, clipEndSec, clipStartSec, duration]);

	const effectiveTime = useMemo(() => {
		if (!Number.isFinite(currentTime) || currentTime < 0) return 0;
		if (!clipActive || typeof clipStartSec !== 'number') return currentTime;
		return Math.max(0, currentTime - clipStartSec);
	}, [clipActive, clipStartSec, currentTime]);

	const percent = useMemo(() => {
		if (!effectiveDuration || !Number.isFinite(effectiveDuration)) return 0;
		return Math.max(0, Math.min(100, (effectiveTime / effectiveDuration) * 100));
	}, [effectiveDuration, effectiveTime]);

	return (
		<div className={cn("w-full rounded-md border bg-background p-3", className)}>
			{displayTitle ? <div className="text-sm font-semibold mb-2 truncate">{displayTitle}</div> : null}

			<audio ref={audioRef} src={src} preload="metadata" />

			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="icon"
					disabled={!src || !ready}
					onClick={async () => {
						const el = audioRef.current;
						if (!el) return;
						try {
							if (el.paused) {
								if (clipActive) {
									const next = typeof clipStartSec === 'number' ? clipStartSec : 0;
									if (!Number.isFinite(el.currentTime) || el.currentTime < next || (typeof clipEndSec === 'number' && el.currentTime >= clipEndSec)) {
										el.currentTime = next;
									}
								}
								await el.play();
							}
							else el.pause();
						} catch {
							// ignore
						}
					}}
				>
					{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
				</Button>

				{hideSeekBar ? null : (
					<div className="flex-1">
						<Slider
							value={[percent]}
							max={100}
							step={0.1}
							onValueChange={(v) => {
								setSeeking(true);
								const p = Array.isArray(v) ? (v[0] ?? 0) : 0;
								if (!effectiveDuration) return;
								setCurrentTime((p / 100) * effectiveDuration + (clipActive && typeof clipStartSec === 'number' ? clipStartSec : 0));
							}}
							onValueCommit={(v) => {
								const el = audioRef.current;
								const p = Array.isArray(v) ? (v[0] ?? 0) : 0;
								if (!el || !effectiveDuration) {
									setSeeking(false);
									return;
								}
								const base = clipActive && typeof clipStartSec === 'number' ? clipStartSec : 0;
								let next = base + (p / 100) * effectiveDuration;
								if (clipActive && typeof clipEndSec === 'number') {
									next = Math.max(base, Math.min(clipEndSec, next));
								} else {
									next = Math.max(0, Math.min(duration, next));
								}
								el.currentTime = next;
								setSeeking(false);
							}}
							className="py-2"
						/>
					</div>
				)}

				<div className="shrink-0 text-xs tabular-nums text-muted-foreground w-[88px] text-right">
					{formatTime(effectiveTime)} / {formatTime(effectiveDuration)}
				</div>
			</div>

			{showVolumeControls ? (
				<div className="mt-2 flex items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={() => setMuted((m) => !m)}
						title={muted ? "Unmute" : "Mute"}
					>
						{muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
					</Button>
					<div className="w-40">
						<Slider
							value={[muted ? 0 : volume * 100]}
							max={100}
							step={1}
							onValueChange={(v) => {
								const p = Array.isArray(v) ? (v[0] ?? 0) : 0;
								setMuted(false);
								setVolume(p / 100);
							}}
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}
