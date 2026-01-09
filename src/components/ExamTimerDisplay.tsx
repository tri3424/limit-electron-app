import { cn } from '@/lib/utils';

interface ExamTimerDisplayProps {
	remainingMs: number;
	mode: 'perModule' | 'perQuestion';
	paused?: boolean;
	className?: string;
}

function formatTime(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function ExamTimerDisplay({ remainingMs, mode, paused = false, className }: ExamTimerDisplayProps) {
	const danger = remainingMs <= 5 * 60 * 1000;
	return (
		<div
			className={cn(
				'flex items-center gap-2 rounded-md border px-3 py-1 text-sm font-semibold',
				danger ? 'border-red-500 text-red-500' : 'border-muted text-foreground',
				paused && 'opacity-75',
				className
			)}
		>
			<span>Time Left</span>
			<span className="tabular-nums">{formatTime(remainingMs)}</span>
			{paused && <span className="text-xs text-muted-foreground">(Paused)</span>}
		</div>
	);
}

