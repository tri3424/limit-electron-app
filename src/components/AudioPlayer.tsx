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
	onEnded?: () => void;
	onPlay?: () => void;
	onPause?: () => void;
	onTimeUpdate?: (payload: { currentTime: number; duration: number }) => void;
	onLoadedMetadata?: (payload: { duration: number }) => void;
};

export default function AudioPlayer({ src, className, title, showVolumeControls = true, onEnded, onPlay, onPause, onTimeUpdate, onLoadedMetadata }: Props) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [ready, setReady] = useState(false);
	const [playing, setPlaying] = useState(false);
	const [duration, setDuration] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [volume, setVolume] = useState(0.9);
	const [muted, setMuted] = useState(false);
	const [seeking, setSeeking] = useState(false);

	useEffect(() => {
		const el = audioRef.current;
		if (!el) return;

		const handleLoaded = () => {
			setDuration(Number.isFinite(el.duration) ? el.duration : 0);
			setReady(true);
			onLoadedMetadata?.({ duration: Number.isFinite(el.duration) ? el.duration : 0 });
		};
		const handleTime = () => {
			if (!seeking) setCurrentTime(el.currentTime || 0);
			onTimeUpdate?.({ currentTime: el.currentTime || 0, duration: Number.isFinite(el.duration) ? el.duration : 0 });
		};
		const handlePlay = () => {
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
		el.addEventListener("canplay", handleLoaded);
		el.addEventListener("timeupdate", handleTime);
		el.addEventListener("play", handlePlay);
		el.addEventListener("pause", handlePause);
		el.addEventListener("ended", handleEnded);

		return () => {
			el.removeEventListener("loadedmetadata", handleLoaded);
			el.removeEventListener("canplay", handleLoaded);
			el.removeEventListener("timeupdate", handleTime);
			el.removeEventListener("play", handlePlay);
			el.removeEventListener("pause", handlePause);
			el.removeEventListener("ended", handleEnded);
		};
	}, [onEnded, seeking]);

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
		try {
			el.pause();
			el.load();
		} catch {
			// ignore
		}
	}, [src]);

	const percent = useMemo(() => {
		if (!duration || !Number.isFinite(duration)) return 0;
		return Math.max(0, Math.min(100, (currentTime / duration) * 100));
	}, [currentTime, duration]);

	return (
		<div className={cn("w-full rounded-md border bg-background p-3", className)}>
			{title ? <div className="text-sm font-semibold mb-2 truncate">{title}</div> : null}

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
							if (el.paused) await el.play();
							else el.pause();
						} catch {
							// ignore
						}
					}}
				>
					{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
				</Button>

				<div className="flex-1">
					<Slider
						value={[percent]}
						max={100}
						step={0.1}
						onValueChange={(v) => {
							setSeeking(true);
							const p = Array.isArray(v) ? (v[0] ?? 0) : 0;
							if (!duration) return;
							setCurrentTime((p / 100) * duration);
						}}
						onValueCommit={(v) => {
							const el = audioRef.current;
							const p = Array.isArray(v) ? (v[0] ?? 0) : 0;
							if (!el || !duration) {
								setSeeking(false);
								return;
							}
							el.currentTime = Math.max(0, Math.min(duration, (p / 100) * duration));
							setSeeking(false);
						}}
						className="py-2"
					/>
				</div>

				<div className="shrink-0 text-xs tabular-nums text-muted-foreground w-[88px] text-right">
					{formatTime(currentTime)} / {formatTime(duration)}
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
