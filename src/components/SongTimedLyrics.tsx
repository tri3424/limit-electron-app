import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { SongSrtCue } from '@/lib/db';
import { formatMsAsTimestamp } from '@/lib/time';

type Props = {
	cues: SongSrtCue[];
	positionMs: number;
	lyricsText?: string;
	songTitle?: string;
	className?: string;
};

function formatMsAsMinutesSeconds(ms: number): string {
	const t = formatMsAsTimestamp(ms);
	return t.split('.')[0] || '00:00';
}

function normalizeLyricTextForLinking(text: string): string {
	let t = String(text ?? '');
	t = t.replace(/\s+/g, ' ').trim();
	// Controlled punctuation normalization: keep letters/numbers/spaces; drop punctuation symbols.
	t = t.replace(/[\u200B-\u200D\uFEFF]/g, '');
	t = t.replace(/[\p{P}\p{S}]+/gu, '');
	t = t.replace(/\s+/g, ' ').trim();
	return t;
}

function findActiveCueIndex(cues: SongSrtCue[], positionMs: number): number {
	if (!cues.length) return -1;
	const t = Math.max(0, Math.floor(positionMs));
	let lo = 0;
	let hi = cues.length - 1;
	let best = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const s = cues[mid]!.startMs;
		if (s <= t) {
			best = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	if (best < 0) return -1;
	const c = cues[best]!;
	// Strict window: [startMs, endMs)
	if (t >= c.startMs && t < c.endMs) return best;
	return -1;
}

export default function SongTimedLyrics({ cues, positionMs, lyricsText, songTitle, className }: Props) {
	const sorted = useMemo(() => {
		return cues
			.slice()
			.filter((c) => typeof c.startMs === 'number' && typeof c.endMs === 'number' && c.endMs > c.startMs)
			.sort((a, b) => (a.cueIndex ?? 0) - (b.cueIndex ?? 0));
	}, [cues]);

	const lyricLines = useMemo(() => {
		const raw = String(lyricsText ?? '');
		if (!raw) return [] as string[];
		return raw.split(/\r?\n/);
	}, [lyricsText]);

	const displayLines = useMemo(() => {
		if (!lyricLines.length) return sorted.map((c) => String(c.text ?? ''));
		const lines = lyricLines.slice();
		return sorted.map((cue, i) => {
			const idx = cue.cueIndex ?? i;
			return String(lines[idx] ?? '');
		});
	}, [lyricLines, sorted]);

	const normalizedSongTitle = useMemo(() => {
		return songTitle ? normalizeLyricTextForLinking(songTitle) : '';
	}, [songTitle]);

	const normalizedByIdx = useMemo(() => {
		return displayLines.map((t) => normalizeLyricTextForLinking(String(t ?? '')));
	}, [displayLines]);

	const activeIndex = useMemo(() => findActiveCueIndex(sorted, positionMs), [sorted, positionMs]);
	const activeNorm = activeIndex >= 0 ? normalizedByIdx[activeIndex] : '';

	const earlierLinked = useMemo(() => {
		if (!activeNorm) return new Set<number>();
		const set = new Set<number>();
		for (let i = 0; i < normalizedByIdx.length; i++) {
			if (i >= activeIndex) break;
			if (normalizedByIdx[i] && normalizedByIdx[i] === activeNorm) set.add(i);
		}
		return set;
	}, [activeIndex, activeNorm, normalizedByIdx]);

	return (
		<div className={cn('space-y-2', className)}>
			{sorted.map((cue, i) => {
				const isPrimary = i === activeIndex;
				const isLinked = !isPrimary && earlierLinked.has(i);
				const text = displayLines[i] ?? '';
				const isTitleLine = !!normalizedSongTitle && normalizeLyricTextForLinking(text) === normalizedSongTitle;
				return (
					<div
						key={cue.id}
						className={cn(
							'rounded-md px-3 py-2 transition-none',
							isPrimary
								? 'bg-primary text-primary-foreground font-semibold'
								: isLinked
									? 'bg-primary/10 text-foreground border border-primary/30'
									: 'bg-transparent text-foreground/90',
						)}
					>
						<div className={cn('text-xs opacity-80', isTitleLine ? 'opacity-100' : '')}>
							{formatMsAsMinutesSeconds(Math.max(0, cue.startMs))}–{formatMsAsMinutesSeconds(Math.max(0, cue.endMs))}
						</div>
						<div className={cn('mt-1', isTitleLine ? 'text-base md:text-lg font-bold tracking-tight' : '')}>{text}</div>
					</div>
				);
			})}
		</div>
	);
}
