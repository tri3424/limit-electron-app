import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TimerState } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

type ExamTimerMode = 'perModule' | 'perQuestion';

interface ExamTimerOptions {
	attemptId: string;
	moduleId: string;
	expectedDurationMs: number;
	initialElapsedMs?: number;
	mode: ExamTimerMode;
	autoStart?: boolean;
	paused?: boolean;
}

interface ExamTimerCallbacks {
	onTick?: (payload: { elapsedMs: number; remainingTimeMs: number; paused: boolean; mode: ExamTimerMode }) => void;
	onTimeUp?: () => void;
	onClockDrift?: (driftMs: number) => void;
}

interface ExamTimerHookResult {
	remainingTimeMs: number;
	elapsedMs: number;
	isRunning: boolean;
	isPaused: boolean;
	startTimer: (override?: Partial<Omit<ExamTimerOptions, 'attemptId' | 'moduleId'>>) => void;
	pauseTimer: () => void;
	resumeTimer: () => void;
	restartTimer: (override: { expectedDurationMs: number; initialElapsedMs?: number; mode?: ExamTimerMode }) => void;
	stopTimer: () => void;
	currentState: TimerState | null;
}

type WorkerMessage =
	| { type: 'tick'; attemptId: string; elapsedMs: number; remainingTimeMs: number; paused: boolean; mode: ExamTimerMode }
	| { type: 'timeup'; attemptId: string }
	| { type: 'clock-drift'; attemptId: string; driftMs: number }
	| { type: 'paused'; attemptId: string; elapsedMs: number }
	| { type: 'resumed'; attemptId: string; elapsedMs: number }
	| { type: 'state'; attemptId: string; remainingTimeMs: number; elapsedMs: number; paused: boolean; mode: ExamTimerMode }
	| { type: 'stopped'; attemptId: string };

type BroadcastMessage =
	| { type: 'tick'; attemptId: string; elapsedMs: number; remainingTimeMs: number; paused: boolean; mode: ExamTimerMode; tabId: string }
	| { type: 'timeup'; attemptId: string; tabId: string }
	| { type: 'clock-drift'; attemptId: string; driftMs: number; tabId: string }
	| { type: 'request-state'; attemptId: string; tabId: string }
	| { type: 'state'; attemptId: string; elapsedMs: number; remainingTimeMs: number; paused: boolean; mode: ExamTimerMode; tabId: string };

export function useExamTimer(options: ExamTimerOptions, callbacks: ExamTimerCallbacks = {}): ExamTimerHookResult {
	const { attemptId, moduleId, expectedDurationMs, initialElapsedMs = 0, mode, autoStart = false, paused = false } = options;
	const [remainingTimeMs, setRemaining] = useState(() => Math.max(expectedDurationMs - initialElapsedMs, 0));
	const [elapsedMs, setElapsed] = useState(initialElapsedMs);
	const [isPaused, setIsPaused] = useState(paused);
	const [currentState, setCurrentState] = useState<TimerState | null>(null);

	// Update refs when state changes
	useEffect(() => {
		elapsedMsRef.current = elapsedMs;
	}, [elapsedMs]);
	useEffect(() => {
		remainingTimeMsRef.current = remainingTimeMs;
	}, [remainingTimeMs]);
	useEffect(() => {
		isPausedRef.current = isPaused;
	}, [isPaused]);

	const portRef = useRef<MessagePort | null>(null);
	const workerRef = useRef<SharedWorker | null>(null);
	const broadcastRef = useRef<BroadcastChannel | null>(null);
	const startedRef = useRef(false);
	const tabIdRef = useRef(uuidv4());
	const latestOptionsRef = useRef(options);
	const fallbackIntervalRef = useRef<number | null>(null);
	const fallbackActiveRef = useRef(false);
	const fallbackStartUtcRef = useRef<number | null>(null);
	const elapsedMsRef = useRef(initialElapsedMs);
	const remainingTimeMsRef = useRef(Math.max(expectedDurationMs - initialElapsedMs, 0));
	const isPausedRef = useRef(paused);

	useEffect(() => {
		latestOptionsRef.current = options;
	}, [options]);

	const sendToWorker = useCallback(
		(type: string, payload?: Record<string, unknown>) => {
			const port = portRef.current;
			if (!port) return;
			port.postMessage({
				type,
				attemptId,
				payload: {
					moduleId,
					expectedDurationMs,
					elapsedMs,
					mode,
					paused: isPaused,
					...payload,
				},
			});
		},
		[attemptId, moduleId, expectedDurationMs, elapsedMs, mode, isPaused]
	);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		// Temporarily disable SharedWorker path and always use in-tab fallback timer
		fallbackActiveRef.current = true;
		if (fallbackStartUtcRef.current == null) {
			fallbackStartUtcRef.current = Date.now() - elapsedMs;
		}
	}, [elapsedMs]);

	// Store callbacks in ref to avoid dependency issues
	const callbacksRef = useRef(callbacks);
	useEffect(() => {
		callbacksRef.current = callbacks;
	}, [callbacks]);

	// In-tab fallback timer when SharedWorker is unavailable
	useEffect(() => {
		if (typeof window === 'undefined') return;
		if (!fallbackActiveRef.current) return;
		if (expectedDurationMs <= 0) return;

		if (fallbackIntervalRef.current !== null) {
			window.clearInterval(fallbackIntervalRef.current);
			fallbackIntervalRef.current = null;
		}

		// Use initial elapsedMs only on mount, then calculate from start time
		const initialElapsed = elapsedMs;
		const baseStartUtc = fallbackStartUtcRef.current ?? Date.now() - initialElapsed;
		fallbackStartUtcRef.current = baseStartUtc;

		const tick = () => {
			const nowUtc = Date.now();
			const elapsed = Math.max(0, nowUtc - baseStartUtc);
			const remaining = Math.max(expectedDurationMs - elapsed, 0);
			
			// Only update state if values actually changed to prevent unnecessary re-renders
			setElapsed(prev => {
				if (Math.abs(prev - elapsed) < 100) return prev; // Only update if difference is significant
				return elapsed;
			});
			setRemaining(prev => {
				if (Math.abs(prev - remaining) < 100) return prev; // Only update if difference is significant
				return remaining;
			});
			setIsPaused(false);
			
			callbacksRef.current.onTick?.({
				elapsedMs: elapsed,
				remainingTimeMs: remaining,
				paused: false,
				mode,
			});
			if (remaining <= 0) {
				callbacksRef.current.onTimeUp?.();
				if (fallbackIntervalRef.current !== null) {
					window.clearInterval(fallbackIntervalRef.current);
					fallbackIntervalRef.current = null;
				}
			}
		};

		tick();
		const id = window.setInterval(tick, 1000);
		fallbackIntervalRef.current = id;

		return () => {
			if (fallbackIntervalRef.current !== null) {
				window.clearInterval(fallbackIntervalRef.current);
				fallbackIntervalRef.current = null;
			}
		};
		// Remove elapsedMs from dependencies to prevent infinite loop
		// Only re-run if expectedDurationMs or mode changes
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [attemptId, expectedDurationMs, mode]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		let channel: BroadcastChannel | null = null;
		let handleBroadcast: ((event: MessageEvent<BroadcastMessage>) => void) | null = null;
		try {
			channel = new BroadcastChannel('exam-sync');
			broadcastRef.current = channel;

			handleBroadcast = (event: MessageEvent<BroadcastMessage>) => {
				try {
					const message = event.data;
					if (!message || (message as any).tabId === tabIdRef.current || message.attemptId !== attemptId) return;
					switch (message.type) {
						case 'tick':
							// Use functional updates to avoid dependency on current state
							setElapsed(prev => {
								if (Math.abs(prev - message.elapsedMs) < 100) return prev;
								return message.elapsedMs;
							});
							setRemaining(prev => {
								if (Math.abs(prev - message.remainingTimeMs) < 100) return prev;
								return message.remainingTimeMs;
							});
							setIsPaused(message.paused);
							break;
						case 'timeup':
							setRemaining(0);
							setIsPaused(false);
							callbacksRef.current.onTimeUp?.();
							break;
						case 'clock-drift':
							callbacksRef.current.onClockDrift?.(message.driftMs);
							break;
						case 'request-state':
							try {
								// Use refs to get current values without causing re-renders
								channel?.postMessage({
									type: 'state',
									attemptId,
									elapsedMs: elapsedMsRef.current,
									remainingTimeMs: remainingTimeMsRef.current,
									paused: isPausedRef.current,
									mode,
									tabId: tabIdRef.current,
								} satisfies BroadcastMessage);
							} catch (err) {
								// Silently handle BroadcastChannel errors
							}
							break;
						case 'state':
							setElapsed(prev => {
								if (Math.abs(prev - message.elapsedMs) < 100) return prev;
								return message.elapsedMs;
							});
							setRemaining(prev => {
								if (Math.abs(prev - message.remainingTimeMs) < 100) return prev;
								return message.remainingTimeMs;
							});
							setIsPaused(message.paused);
							break;
						default:
							break;
					}
				} catch (err) {
					console.error('Error handling broadcast message', err);
				}
			};

			channel.addEventListener('message', handleBroadcast as any);
			try {
				channel.postMessage({ type: 'request-state', attemptId, tabId: tabIdRef.current } satisfies BroadcastMessage);
			} catch (err) {
				// Silently handle BroadcastChannel errors
			}
		} catch (err) {
			console.error('Failed to create BroadcastChannel', err);
		}

		return () => {
			if (channel) {
				try {
					if (handleBroadcast) {
						channel.removeEventListener('message', handleBroadcast as any);
					}
					channel.close();
				} catch (err) {
					// Ignore errors when closing channel
				}
			}
			broadcastRef.current = null;
		};
		// Remove state values from dependencies to prevent infinite loops
		// Only depend on attemptId and mode which are stable
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [attemptId, mode]);

	const startTimer = useCallback<ExamTimerHookResult['startTimer']>(
		(override) => {
			if (startedRef.current) return;
			startedRef.current = true;
			const duration = override?.expectedDurationMs ?? expectedDurationMs;
			const startUtc = Date.now();
			const elapsed = override?.initialElapsedMs ?? initialElapsedMs;
			setElapsed(elapsed);
			setRemaining(Math.max(duration - elapsed, 0));
			setIsPaused(false);
			sendToWorker('start', {
				expectedDurationMs: duration,
				startUtc,
				elapsedMs: elapsed,
				mode: override?.mode ?? mode,
				paused: false,
			});
		},
		[expectedDurationMs, initialElapsedMs, mode, sendToWorker]
	);

	const pauseTimer = useCallback(() => {
		startedRef.current = false;
		sendToWorker('pause');
		setIsPaused(true);
	}, [sendToWorker]);

	const resumeTimer = useCallback(() => {
		startedRef.current = true;
		sendToWorker('resume');
		setIsPaused(false);
	}, [sendToWorker]);

	const restartTimer = useCallback<ExamTimerHookResult['restartTimer']>(
		(override) => {
			startedRef.current = true;
			const duration = override.expectedDurationMs;
			const elapsed = override.initialElapsedMs ?? 0;
			setElapsed(elapsed);
			setRemaining(Math.max(duration - elapsed, 0));
			setIsPaused(false);
			sendToWorker('restart', {
				expectedDurationMs: duration,
				startUtc: Date.now(),
				elapsedMs: elapsed,
				mode: override.mode ?? mode,
			});
		},
		[mode, sendToWorker]
	);

	const stopTimer = useCallback(() => {
		startedRef.current = false;
		sendToWorker('stop');
	}, [sendToWorker]);

	useEffect(() => {
		if (autoStart) {
			startTimer();
		}
	}, [autoStart, startTimer]);

	const isRunning = useMemo(() => !isPaused && remainingTimeMs > 0, [isPaused, remainingTimeMs]);

	return {
		remainingTimeMs,
		elapsedMs,
		isRunning,
		isPaused,
		startTimer,
		pauseTimer,
		resumeTimer,
		restartTimer,
		stopTimer,
		currentState,
	};
}

