import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { HOME_ROUTE } from '@/constants/routes';
import { v4 as uuidv4 } from 'uuid';
import { Bug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExamTimerDisplay } from '@/components/ExamTimerDisplay';
import { MatchingQuestionSortable } from '@/components/MatchingQuestionSortable';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { checkDailyLimit } from '@/lib/dailyLimit';
import { getLastQuestionIndex, setLastQuestionIndex, clearProgress } from '@/lib/progressTracking';
import { useModule } from '@/hooks/useModules';
import { useExamTimer } from '@/hooks/useExamTimer';
import { db, Attempt, Module, Question, TimerState, IntegrityEvent, PerQuestionAttempt, GlobalGlossaryEntry, normalizeGlossaryMeaning, normalizeGlossaryWord } from '@/lib/db';
import { closeIntegrityChannel, incrementVisibilityLoss, logIntegrityEvent } from '@/utils/integrity';
import { recordDailyStats } from '@/lib/statsHelpers';
import { useAuth } from '@/contexts/AuthContext';
import { prepareContentForDisplay } from '@/lib/contentFormatting';
import { isInReviewPhase, isReviewExpired, getReviewTimeRemaining, recordReviewInteraction, getReviewedQuestionIds, areAllQuestionsReviewed } from '@/lib/reviewHelpers';
import { finalizeExamAtEndTime } from '@/lib/reviewHelpers';
import { toast } from 'sonner';

const FOCUS_WARNING_TIMEOUT = 8000;

export default function ModuleRunner() {
	const { id } = useParams();
	const navigate = useNavigate();
	const { user, isAdmin } = useAuth();
	const moduleEntity = useModule(id);
	const globalGlossaryEntries = useLiveQuery(
		() => db.globalGlossary.toArray(),
		[],
		[] as GlobalGlossaryEntry[]
	) ?? [];
	const [questions, setQuestions] = useState<Question[]>([]);
	const [questionsReady, setQuestionsReady] = useState(false);
	const [questionLoadError, setQuestionLoadError] = useState<string | null>(null);
	const [examConfig, setExamConfig] = useState<{
		startUtc: number;
		endUtc: number;
		durationMinutes: number;
	} | null>(null);

	const [now, setNow] = useState(() => Date.now());
	const [baseWall] = useState(() => Date.now());
	const [basePerf] = useState(() => (typeof performance !== 'undefined' ? performance.now() : 0));

	useEffect(() => {
		const id = window.setInterval(() => {
			if (typeof performance !== 'undefined') {
				const elapsed = performance.now() - basePerf;
				setNow(baseWall + elapsed);
			} else {
				setNow(Date.now());
			}
		}, 1000);
		return () => window.clearInterval(id);
	}, [basePerf, baseWall]);

	useEffect(() => {
		let cancelled = false;
		async function loadQuestions() {
			if (!moduleEntity) {
				// If the module entity is temporarily unavailable (e.g. live query reload),
				// avoid clearing questions so that an already-started exam does not
				// briefly show the "no questions" state.
				return;
			}
			if (!cancelled) {
				setQuestionsReady(false);
			}
			try {
				let loaded: Question[] = [];
				if (moduleEntity.questionIds?.length) {
					const hits = await db.questions.bulkGet(moduleEntity.questionIds);
					loaded = (hits.filter(Boolean) as Question[]) ?? [];
				}
				if (!loaded.length) {
					const fallback = await db.questions.where('modules').equals(moduleEntity.id).toArray();
					loaded = (fallback.filter(Boolean) as Question[]) ?? [];
				}
				if (cancelled) return;
				setQuestions(loaded);
				setQuestionLoadError(
					loaded.length
						? null
						: 'This module has no questions assigned. Edit the module to add questions before starting it.'
				);
				setQuestionsReady(true);
			} catch (error) {
				console.error(error);
				if (cancelled) return;
				setQuestions([]);
				setQuestionLoadError('Failed to load questions for this module. Refresh the page or edit the module.');
				setQuestionsReady(true);
			}
		}
		void loadQuestions();
		return () => {
			cancelled = true;
		};
	}, [moduleEntity]);

	// Initialize examConfig automatically for exam modules based on module schedule/settings
	useEffect(() => {
		if (!moduleEntity || moduleEntity.type !== 'exam') {
			setExamConfig(null);
			return;
		}
		if (examConfig) return; // Already initialized
		const nowWall = Date.now();
		const startUtc = moduleEntity.scheduledStartUtc ?? nowWall;
		const baseDuration = moduleEntity.settings.timeLimitMinutes ?? 0;
		const durationMinutes = baseDuration > 0 ? baseDuration : 0;
		const endUtc = moduleEntity.scheduledEndUtc ?? (durationMinutes > 0 ? startUtc + durationMinutes * 60000 : startUtc);
		setExamConfig({ startUtc, endUtc, durationMinutes });
	}, [moduleEntity]); // Remove examConfig from dependencies to avoid loop

	// Stable exam exit handler so downstream callbacks don't change every render.
	// IMPORTANT: this hook must stay before any early returns so that the hook
	// order is consistent across renders.
	const handleExamExit = useCallback(() => {
		navigate(HOME_ROUTE, { replace: true });
	}, [navigate]);

	if (!moduleEntity) {
		return (
			<div className="bg-white">
				<div className="p-8 text-muted-foreground">Loading module...</div>
			</div>
		);
	}

	const glossaryHintsEnabled = moduleEntity.settings?.glossaryHints !== false;

	if (!questionsReady) {
		return (
			<div className="bg-white">
				<div className="p-8 text-muted-foreground">Preparing module...</div>
			</div>
		);
	}

	if (!questions.length) {
		return (
			<div className="bg-white">
				<div className="p-8 space-y-4">
					<div className="text-destructive">
						{questionLoadError ?? 'This module does not contain any questions. Please edit the module and add questions.'}
					</div>
					<div>
						<Button variant="outline" onClick={() => navigate(HOME_ROUTE)}>
							Back to home
						</Button>
					</div>
				</div>
			</div>
		);
	}

	// Once the user has navigated into a module, always allow the runner to load.
	// Scheduling is enforced on the Home page for visibility and button state,
	// but should not prevent the runner from opening here.

	if (moduleEntity.type === 'exam') {
		if (!examConfig) {
			return (
				<div className="bg-white">
					<div className="p-8 text-muted-foreground">Preparing exam...</div>
				</div>
			);
		}
		return (
			<div className="bg-white">
				<ExamRunner
					moduleData={moduleEntity}
					baseQuestions={questions}
					glossaryEntries={globalGlossaryEntries}
					glossaryEnabled={glossaryHintsEnabled}
					onExit={handleExamExit}
					examConfig={examConfig}
				/>
			</div>
		);
	}

	return (
		<div className="bg-white">
			<PracticeRunner
				moduleData={moduleEntity}
				baseQuestions={questions}
				glossaryEntries={globalGlossaryEntries}
				glossaryEnabled={glossaryHintsEnabled}
				onExit={() => navigate(HOME_ROUTE)}
			/>
		</div>
	);
}

interface ExamRunnerProps {
	moduleData: Module;
	baseQuestions: Question[];
	glossaryEntries: GlobalGlossaryEntry[];
	glossaryEnabled: boolean;
	onExit: () => void;
	examConfig: {
		startUtc: number;
		endUtc: number;
		durationMinutes: number;
	};
}

function ExamRunner({ moduleData, baseQuestions, onExit, examConfig, glossaryEntries, glossaryEnabled }: ExamRunnerProps) {
	const { user, isAdmin } = useAuth();
	const [attempt, setAttempt] = useState<Attempt | null>(null);
	const [orderedQuestions, setOrderedQuestions] = useState<Question[]>([]);
	const [loading, setLoading] = useState(true);
	const questionMap = useMemo(() => {
		const map = new Map<string, Question>();
		baseQuestions.forEach((q) => map.set(q.id, q));
		return map;
	}, [baseQuestions]);

	useEffect(() => {
		let active = true;
		let isBooting = false; // Prevent multiple simultaneous boots
		async function bootstrapAttempt() {
			if (isBooting) return; // Prevent concurrent boots
			if (!moduleData || baseQuestions.length === 0 || !examConfig) {
				setLoading(false);
				return;
			}
			isBooting = true;
			
		try {
			// Use shared helper to determine review phase, so behavior matches Home
			const currentTime = Date.now();
			const examEndTime = examConfig?.endUtc ?? (moduleData.scheduledEndUtc ?? 0);
			const inReviewPhaseNow = isInReviewPhase(moduleData, currentTime);
			
			// Finalize any incomplete attempts when exam end time is reached - do this immediately and synchronously
			if (currentTime >= examEndTime && user?.id) {
				const incompleteAttempts = await db.attempts
					.where('moduleId')
					.equals(moduleData.id)
					.filter((a) => a.type === 'exam' && a.userId === user.id && !a.completed && !a.finalized)
					.toArray();
				
				// Finalize all attempts in parallel for speed
				await Promise.all(incompleteAttempts.map(async (incompleteAttempt) => {
					const attemptQuestions = (incompleteAttempt.questionOrder ?? moduleData.questionIds)
						.map((id) => questionMap.get(id))
						.filter(Boolean) as Question[];
					
					if (attemptQuestions.length > 0) {
						await finalizeExamAtEndTime(incompleteAttempt, attemptQuestions, examEndTime);
					}
				}));
			}
			
			// Also check for other users' incomplete attempts if admin (for system-wide finalization)
			if (currentTime >= examEndTime && isAdmin) {
				const allIncompleteAttempts = await db.attempts
					.where('moduleId')
					.equals(moduleData.id)
					.filter((a) => a.type === 'exam' && !a.completed && !a.finalized)
					.toArray();
				
				// Finalize all attempts in parallel for speed
				await Promise.all(allIncompleteAttempts.map(async (incompleteAttempt) => {
					const attemptQuestions = (incompleteAttempt.questionOrder ?? moduleData.questionIds)
						.map((id) => questionMap.get(id))
						.filter(Boolean) as Question[];
					
					if (attemptQuestions.length > 0) {
						await finalizeExamAtEndTime(incompleteAttempt, attemptQuestions, examEndTime);
					}
				}));
			}
			
			// If we're in review phase OR past exam end time, check for completed finalized attempts first
			// This ensures that after auto-submission, the review can be accessed immediately
			if (inReviewPhaseNow || (currentTime >= examEndTime && moduleData.settings.allowReview)) {
				// Check for completed finalized attempts with review enabled
				if (moduleData.settings.allowReview) {
					// Filter by user if not admin - query finalized attempts
					const allAttempts = await db.attempts
						.where('moduleId')
						.equals(moduleData.id)
						.filter((a) => {
							if (a.type !== 'exam' || !a.completed || !a.finalized) return false;
							if (isAdmin) return true;
							return a.userId === user?.id;
						})
						.toArray();
					
					// Get the most recent completed attempt
					const completedAttempt = allAttempts.length > 0 
						? allAttempts.sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0]
						: null;
				
					if (completedAttempt && active) {
						// Pre-load questions immediately for instant access
						const ordered = (completedAttempt.questionOrder ?? moduleData.questionIds)
							.map((id) => questionMap.get(id))
							.filter(Boolean) as Question[];
						
						if (ordered.length > 0) {
							// Set data immediately without waiting
							setAttempt(completedAttempt);
							setOrderedQuestions(ordered);
							setLoading(false);
							isBooting = false;
							return; // Will start in review phase if in review period
						}
					}
				}
				
				// If we're in review phase but no completed attempt (or questions) found,
				// do not create a new exam attempt. Leave the user on this screen so we can
				// show a clear message instead of bouncing them back home immediately.
				if (inReviewPhaseNow && active) {
					setLoading(false);
					isBooting = false;
					return; // Can't start new exam during review period
				}
			}
			
			// If we're NOT in review phase, first check for a completed attempt.
			// If one exists, always load it so that the learner sees a clear
			// "No more questions" state instead of starting a fresh attempt.
			if (!inReviewPhaseNow) {
				const completedAttempt = await db.attempts
					.where('moduleId')
					.equals(moduleData.id)
					.and((a) => a.type === 'exam' && a.completed && a.finalized)
					.sortBy('endedAt')
					.then(attempts => attempts[attempts.length - 1]); // most recent

				if (completedAttempt && active) {
					const baseOrderIds =
						completedAttempt.questionOrder && completedAttempt.questionOrder.length
							? completedAttempt.questionOrder
							: moduleData.questionIds;

					const ordered = baseOrderIds
						.map((id) => questionMap.get(id))
						.filter(Boolean) as Question[];

					if (ordered.length > 0) {
						setAttempt(completedAttempt);
						setOrderedQuestions(ordered);
						setLoading(false);
						isBooting = false;
						return; // Render completed state ("No more questions")
					}
				}

				// If there's no completed attempt, allow resuming an incomplete one
				// from the next unanswered question.
				const existing = await db.attempts
					.where('moduleId')
					.equals(moduleData.id)
					.and((a) => a.type === 'exam' && !a.completed)
					.first();
			
				if (existing && active) {
					const baseOrderIds = existing.questionOrder && existing.questionOrder.length
						? existing.questionOrder
						: moduleData.questionIds;

					const ordered = baseOrderIds
						.map((id) => questionMap.get(id))
						.filter(Boolean) as Question[];

					// If the existing attempt's question order no longer matches the current
					// module questions (e.g. questions were added/removed), discard this
					// incomplete attempt so we can start a fresh one with a clean order.
					const hasOrderMismatch =
						!existing.questionOrder ||
						existing.questionOrder.length !== ordered.length ||
						ordered.length === 0;

					if (hasOrderMismatch) {
						await db.attempts.delete(existing.id);
					} else if (ordered.length > 0) {
						// Determine next index based on which questions have answers
						const answers = existing.answers ?? {};
						let nextIndex = 0;
						for (let i = 0; i < ordered.length; i++) {
							const q = ordered[i];
							const ans = (answers as any)[q.id];
							const hasAnswer =
								ans !== undefined &&
								ans !== null &&
								ans !== '' &&
								(!Array.isArray(ans) || (ans as string[]).length > 0);
							if (!hasAnswer) {
								nextIndex = i;
								break;
							}
							// If all questions have answers, leave nextIndex at last index
							if (i === ordered.length - 1) {
								nextIndex = ordered.length - 1;
							}
						}
						
						// Update to computed next index
						const updatedAttempt = {
							...existing,
							currentQuestionIndex: nextIndex,
						};
						await db.attempts.update(existing.id, { currentQuestionIndex: nextIndex });
						
						setAttempt(updatedAttempt);
						setOrderedQuestions(ordered);
						setLoading(false);
						isBooting = false;
						return; // Resume from next unanswered question
					}
				}
			}

			// If we're in review phase but no completed attempt found, don't create a new one
			if (inReviewPhaseNow && active) {
				setLoading(false);
				isBooting = false;
				return; // Can't start new exam during review period
			}

			if (!active) {
				isBooting = false;
				return;
			}

			const baseOrder = moduleData.settings.randomizeQuestions
				? shuffleArray([...moduleData.questionIds])
				: [...moduleData.questionIds];

			const orderIds: string[] = baseOrder;

			const now = Date.now();
			// Always prefer explicit module time limit for exams
			const rawDurationMinutes = moduleData.settings.timeLimitMinutes ?? 0;
			const durationMinutes = rawDurationMinutes > 0 ? rawDurationMinutes : 0;
			const expectedDurationMs = durationMinutes > 0 ? durationMinutes * 60000 : 0;
			const hasTimer = expectedDurationMs > 0;

			const ordered = orderIds
				.map((id) => questionMap.get(id))
				.filter(Boolean) as Question[];

			const timerState: TimerState | undefined =
				hasTimer
					? {
							startUtc: now,
							expectedDurationMs,
							elapsedMs: 0,
							paused: false,
							mode: 'perModule',
						}
					: undefined;

			const scheduledStartUtc = examConfig?.startUtc ?? now;
			const scheduledEndUtc = examConfig?.endUtc ?? (hasTimer ? scheduledStartUtc + expectedDurationMs : scheduledStartUtc);
			const freshAttempt: Attempt = {
				id: uuidv4(),
				moduleId: moduleData.id,
				type: 'exam',
				startedAt: now,
				perQuestionAttempts: [],
				integrityEvents: [],
				syncStatus: 'local',
				completed: false,
				timerState,
				currentQuestionIndex: 0,
				answers: {},
				visibilityLosses: 0,
				questionOrder: orderIds,
				scheduledStartUtc,
				scheduledEndUtc,
				userId: user?.id,
				userProfile: user ? { name: user.username } : undefined,
			};

				await db.attempts.add(freshAttempt);
				if (!active) {
					isBooting = false;
					return;
				}
				setAttempt(freshAttempt);
				setOrderedQuestions(ordered);
				setLoading(false);
			} catch (error) {
				console.error('Error bootstrapping attempt', error);
				if (!active) return;
				setLoading(false);
			} finally {
				isBooting = false;
			}
		}

		void bootstrapAttempt();
		return () => {
			active = false;
			closeIntegrityChannel();
		};
	}, [baseQuestions.length, moduleData, questionMap, examConfig]);

	// Show loading only if we're actually bootstrapping, not if we have cached data
	// For review mode (completed and finalized attempts), render immediately even if loading
	// This prevents showing "preparing exam" when we already have the data
	if (attempt && orderedQuestions.length > 0) {
		// Render immediately - don't wait for loading to finish
		// The ExamSession component will handle the review phase correctly
	} else if (loading) {
		// Still bootstrapping
		return <div className="p-8 text-muted-foreground">Preparing exam...</div>;
	} else if (!attempt) {
		// No attempt found after loading completed
		return <div className="p-8 text-muted-foreground">Preparing exam...</div>;
	}

	// Determine initial phase: if attempt is completed/finalized and we're in review period, start in review
	const currentTime = Date.now();
	const examEndTime = examConfig?.endUtc ?? 0;
	const reviewDurationSeconds = moduleData.settings.reviewDurationSeconds ?? 0;
	const reviewEndTime = examEndTime + (reviewDurationSeconds * 1000);
	const isInReviewPeriod = moduleData.settings.allowReview && reviewDurationSeconds > 0 && 
		currentTime >= examEndTime && currentTime < reviewEndTime;
	
	const shouldStartInReview = attempt.completed && attempt.finalized && isInReviewPeriod;
	
	return (
		<ExamSession
			key={attempt.id}
			moduleData={moduleData}
			attempt={attempt}
			setAttempt={setAttempt}
			questions={orderedQuestions}
			onExit={onExit}
			examConfig={examConfig}
			initialPhase={shouldStartInReview ? "review" : "exam"}
			glossaryEntries={glossaryEntries}
			glossaryEnabled={glossaryEnabled}
		/>
	);
}

interface ExamSessionProps {
	moduleData: Module;
	attempt: Attempt;
	setAttempt: (attempt: Attempt) => void;
	questions: Question[];
	onExit: () => void;
	examConfig: { startUtc: number; endUtc: number; durationMinutes: number } | null;
	initialPhase?: 'exam' | 'review';
	glossaryEntries: GlobalGlossaryEntry[];
	glossaryEnabled: boolean;
}

function ExamSession({
	moduleData,
	attempt,
	setAttempt,
	questions,
	onExit,
	examConfig,
	initialPhase = 'exam',
	glossaryEntries,
	glossaryEnabled,
}: ExamSessionProps) {
	const location = useLocation();
	// Initialize from attempt's currentQuestionIndex, but ensure we're at the right question
	const savedIndex = attempt.currentQuestionIndex ?? 0;
	const [currentIndex, setCurrentIndex] = useState(savedIndex);
	const [answers, setAnswers] = useState<Record<string, string | string[]>>(attempt.answers ?? {});
	const answersRef = useRef(answers);
	useEffect(() => {
		answersRef.current = answers;
	}, [answers]);
	const [showFocusWarning, setShowFocusWarning] = useState(false);
	const warningTimeoutRef = useRef<number | null>(null);
	// Initialize questionTimeMap from existing perQuestionAttempts to preserve start times
	const questionTimeMap = useRef<Record<string, number>>((() => {
		const map: Record<string, number> = {};
		if (attempt.perQuestionAttempts) {
			for (const pqa of attempt.perQuestionAttempts) {
				if (pqa.questionStartedAt) {
					map[pqa.questionId] = pqa.questionStartedAt;
				}
			}
		}
		return map;
	})());
	const questionStartRef = useRef<number>(attempt.currentQuestionTimerState?.startUtc ?? Date.now());
	const previousPathRef = useRef<string>(location.pathname);
	const hasTriggeredNavigationAutosubmit = useRef<boolean>(false);
	const reviewStartTimeRef = useRef<number | null>(null);
	// Always prefer explicit module time limit for exams
	const rawDurationMinutes = moduleData.settings.timeLimitMinutes ?? 0;
	const durationMinutes = rawDurationMinutes > 0 ? rawDurationMinutes : 0;
	const configuredExpectedDurationMs = durationMinutes > 0 ? durationMinutes * 60000 : 0;
	const nowUtcForWindow = Date.now();
	const scheduledWindowTotalMs = examConfig ? Math.max(examConfig.endUtc - examConfig.startUtc, 0) : 0;
	const scheduledRemainingMs = examConfig ? Math.max(examConfig.endUtc - nowUtcForWindow, 0) : 0;
	const timerMode: 'perModule' = 'perModule';
	// Prefer a positive stored timerState duration; otherwise fall back to configuredExpectedDurationMs,
	// but clamp by the scheduled exam window so that remaining time is aligned with wall clock.
	const baseExpectedDurationMs =
		attempt.timerState && attempt.timerState.expectedDurationMs > 0
			? attempt.timerState.expectedDurationMs
			: configuredExpectedDurationMs;
	const windowBoundExpectedDurationMs = scheduledWindowTotalMs > 0 ? scheduledWindowTotalMs : baseExpectedDurationMs;
	const expectedDurationMs = windowBoundExpectedDurationMs;
	const hasTimer = expectedDurationMs > 0;
	
	// Determine if review is enabled and current phase
	const currentTimeForReview = Date.now();
	const examEndTimeForReview = examConfig?.endUtc ?? 0;
	const reviewDurationSecondsForReview = moduleData.settings.reviewDurationSeconds ?? 0;
	const reviewEndTimeForReview = examEndTimeForReview + (reviewDurationSecondsForReview * 1000);
	const reviewEnabled = moduleData.settings.allowReview && reviewDurationSecondsForReview > 0 && 
		currentTimeForReview >= examEndTimeForReview && currentTimeForReview < reviewEndTimeForReview;
	const reviewExpired = moduleData.settings.allowReview && reviewDurationSecondsForReview > 0 && 
		currentTimeForReview >= reviewEndTimeForReview;
	
	const { user } = useAuth();
	const [phase, setPhase] = useState<'exam' | 'review'>(initialPhase);
	const phaseRef = useRef<'exam' | 'review'>(initialPhase);
	useEffect(() => {
		phaseRef.current = phase;
	}, [phase]);
	const [showPerfectScoreCelebration, setShowPerfectScoreCelebration] = useState(false);
	const [reviewedQuestionIds, setReviewedQuestionIds] = useState<Set<string>>(new Set());
	const [reviewTimeRemaining, setReviewTimeRemainingState] = useState<number | null>(null);
	const [allQuestionsReviewed, setAllQuestionsReviewed] = useState(false);
	const reviewTimerIntervalRef = useRef<number | null>(null);
	const [reviewIndex, setReviewIndex] = useState(0);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		if (!attempt.completed || !attempt.finalized) return;
		if (!examConfig || typeof examConfig.endUtc !== 'number') return;
		const totalQuestions = questions.length;
		if (!totalQuestions) return;
		const per = attempt.perQuestionAttempts ?? [];
		if (!per.length) return;
		const correct = per.filter((p) => p.isCorrect).length;
		const accuracy = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;
		if (accuracy !== 100) return;
		const key = `perfect-score-celebrated:${attempt.id}`;
		try {
			if (window.sessionStorage.getItem(key) === '1') return;
		} catch {
		}

		const trigger = () => {
			setShowPerfectScoreCelebration(true);
			try {
				window.sessionStorage.setItem(key, '1');
			} catch {
			}
		};

		const delayMs = examConfig.endUtc - Date.now();
		if (delayMs <= 0) {
			trigger();
			return;
		}
		const timeoutId = window.setTimeout(trigger, delayMs);
		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [attempt.completed, attempt.finalized, attempt.id, attempt.perQuestionAttempts, examConfig, questions.length]);
	
	// Sync phase with initialPhase when it changes (e.g., when entering review from home)
	useEffect(() => {
		if (initialPhase === 'review' && phase !== 'review' && attempt.completed && attempt.finalized) {
			setPhase('review');
			setReviewIndex(0); // Reset to first question when entering review
		}
	}, [initialPhase, phase, attempt.completed, attempt.finalized]);
	
	// Ensure reviewIndex is always within bounds when in review phase
	useEffect(() => {
		if (phase === 'review' && questions.length > 0) {
			if (reviewIndex < 0) {
				setReviewIndex(0);
			} else if (reviewIndex >= questions.length) {
				setReviewIndex(questions.length - 1);
			}
		}
	}, [phase, reviewIndex, questions.length]);
	
	// Format time helper function
	const formatTime = (ms: number): string => {
		const totalSeconds = Math.max(0, Math.floor(ms / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	};
	
	// Load reviewed questions on mount if in review phase
	useEffect(() => {
		if (phase === 'review' && attempt.id && user?.id) {
			getReviewedQuestionIds(attempt.id).then(ids => {
				setReviewedQuestionIds(ids);
			});
		}
	}, [phase, attempt.id, user?.id]);
	
	// Set up review timer countdown - redirect to home when review time is over
	useEffect(() => {
		if (phase === 'review' && reviewEnabled && examConfig) {
			const updateTimer = () => {
				const remaining = getReviewTimeRemaining(moduleData, Date.now());
				setReviewTimeRemainingState(remaining);
				
				// When review time expires, exit review and go back home
				if (remaining <= 0 || isReviewExpired(moduleData, Date.now())) {
					onExit();
				}
			};
			
			updateTimer();
			const interval = window.setInterval(updateTimer, 1000);
			reviewTimerIntervalRef.current = interval;
			
			return () => {
				if (reviewTimerIntervalRef.current) {
					window.clearInterval(reviewTimerIntervalRef.current);
				}
			};
		}
	}, [phase, reviewEnabled, examConfig, moduleData, onExit]);
	
	// Use a ref to track reviewed question IDs to avoid dependency issues
	const reviewedQuestionIdsRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		reviewedQuestionIdsRef.current = reviewedQuestionIds;
	}, [reviewedQuestionIds]);
	
	// Record review interaction when question is viewed
	const handleQuestionViewed = useCallback(async (questionId: string) => {
		if (phase === 'review' && attempt.id && user?.id && !reviewedQuestionIdsRef.current.has(questionId)) {
			await recordReviewInteraction(attempt.id, moduleData.id, user.id, questionId);
			setReviewedQuestionIds(prev => {
				const newSet = new Set([...prev, questionId]);
				reviewedQuestionIdsRef.current = newSet;
				return newSet;
			});
			
			// Check if all questions reviewed
			const allReviewed = await areAllQuestionsReviewed(attempt.id, questions.length);
			setAllQuestionsReviewed(allReviewed);
		}
	}, [phase, attempt.id, user?.id, moduleData.id, questions.length]);
	
	// Track which question is currently being viewed in review
	// Use a ref to store the current question ID to avoid dependency on questions array
	const currentReviewQuestionIdRef = useRef<string | null>(null);
	const questionsRef = useRef(questions);
	useEffect(() => {
		questionsRef.current = questions;
	}, [questions]);
	
	useEffect(() => {
		if (phase === 'review' && reviewEnabled) {
			const currentQuestions = questionsRef.current;
			if (currentQuestions.length > 0 && reviewIndex >= 0 && reviewIndex < currentQuestions.length) {
				const questionId = currentQuestions[reviewIndex]?.id;
				if (questionId && questionId !== currentReviewQuestionIdRef.current) {
					currentReviewQuestionIdRef.current = questionId;
					// Only call if not already reviewed to prevent infinite loops
					if (!reviewedQuestionIdsRef.current.has(questionId)) {
						handleQuestionViewed(questionId).catch(err => {
							console.error('Error recording review interaction:', err);
						});
					}
				}
			} else if (reviewIndex < 0) {
				// Ensure reviewIndex is never negative
				setReviewIndex(0);
			} else if (reviewIndex >= currentQuestions.length && currentQuestions.length > 0) {
				// Ensure reviewIndex is within bounds
				setReviewIndex(currentQuestions.length - 1);
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [phase, reviewEnabled, reviewIndex]); // Removed questions and handleQuestionViewed to prevent infinite loops
	// Ensure currentIndex is within bounds
	const safeCurrentIndex = Math.min(Math.max(0, currentIndex), questions.length - 1);
	const currentQuestion = questions[safeCurrentIndex];
	const canReportIssue = moduleData.type === 'practice' || phase === 'review';
	const examContentRef = useRef<HTMLDivElement | null>(null);
	const [reportDialogOpen, setReportDialogOpen] = useState(false);
	const [reportMessage, setReportMessage] = useState('');
	const [isSubmittingReport, setIsSubmittingReport] = useState(false);
	const [submittedQuestionIds, setSubmittedQuestionIds] = useState<Set<string>>(new Set());

	const submitErrorReport = useCallback(async () => {
		if (!reportMessage.trim()) {
			toast.error('Please describe the issue.');
			return;
		}
		try {
			setIsSubmittingReport(true);
			const now = Date.now();
			await db.errorReports.add({
				id: uuidv4(),
				status: 'new',
				message: reportMessage.trim(),
				createdAt: now,
				updatedAt: now,
				route: location.pathname,
				moduleId: moduleData.id,
				moduleTitle: moduleData.title,
				questionId: currentQuestion?.id,
				questionCode: currentQuestion?.code,
				questionTags: currentQuestion?.tags,
				attemptId: attempt.id,
				phase: moduleData.type === 'practice' ? 'practice' : (phase ?? 'unknown'),
				reporterUserId: user?.id,
				reporterUsername: user?.username,
			});
			setReportDialogOpen(false);
			setReportMessage('');
			toast.success('Report sent');
		} catch (e) {
			console.error(e);
			toast.error('Failed to submit report');
		} finally {
			setIsSubmittingReport(false);
		}
	}, [attempt.id, currentQuestion, location.pathname, moduleData.id, moduleData.title, phase, reportMessage, user?.id, user?.username]);
	
	// Count how many questions have been submitted (not just answered)
	const answeredCount = useMemo(() => {
		return submittedQuestionIds.size;
	}, [submittedQuestionIds]);
	const progressPercent =
		questions.length > 0 ? Math.min(100, Math.round((answeredCount / questions.length) * 100)) : 0;
	const activeGlossaryQuestion = phase === 'review' ? questions[reviewIndex] : currentQuestion;
	const { handleGlossaryLookup, glossaryModal, closeGlossaryModal } = useQuestionGlossary(
		activeGlossaryQuestion,
		glossaryEntries,
		glossaryEnabled
	);
	const [isFinalizing, setIsFinalizing] = useState(false);
	const [showFeedback, setShowFeedback] = useState(false);
	const [lastScorePercent, setLastScorePercent] = useState<number | null>(null);
	const [finalGraceAnnounced, setFinalGraceAnnounced] = useState(false);
	const bcRef = useRef<BroadcastChannel | null>(null);
	const previousRemainingRef = useRef<number | null>(null);
	const hasTimeExpiredRef = useRef<boolean>(false);
	const remainingTimeRef = useRef<number>(0);
	const isFinalizingRef = useRef<boolean>(false);
	const autosubmitTriggeredRef = useRef<boolean>(false);
	const leaderKey = `attempt-leader-${attempt.id}`;
	const isLeader = useMemo(() => {
    if (typeof window === 'undefined') return true;
    const existing = localStorage.getItem(leaderKey);
    if (existing) return existing === 'true';
    // first claimant wins
    localStorage.setItem(leaderKey, 'true');
    return true;
  }, [leaderKey]);

	useEffect(() => {
		if (phase !== 'exam') return;
		if (!isLeader) return;
		if (attempt.completed) return;
		if (typeof window === 'undefined' || !window.examProctor?.captureAppScreenshot) return;

		let stopped = false;
		const intervalId = window.setInterval(() => {
			if (stopped || attemptRef.current.completed || isFinalizingRef.current) return;
			void (async () => {
				try {
					const rectEl = examContentRef.current;
					const rect = rectEl
						? (() => {
							const b = rectEl.getBoundingClientRect();
							return {
								x: b.left + window.scrollX,
								y: b.top + window.scrollY,
								width: b.width,
								height: b.height,
							};
						})()
						: undefined;
					const result = await window.examProctor!.captureAppScreenshot({
						attemptId: attemptRef.current.id,
						questionId: questionsRef.current[safeCurrentIndex]?.id,
						rect,
					});
					await logIntegrityEvent(attemptRef.current.id, 'screenshot_captured', result.filePath);
				} catch (err) {
					// Silent failure: do not disturb student during exam
				}
			})();
		}, 60_000);

		return () => {
			stopped = true;
			window.clearInterval(intervalId);
		};
	}, [phase, isLeader, attempt.completed, safeCurrentIndex]);

	// Keep currentIndex managed locally; initial value comes from attempt.currentQuestionIndex

	const attemptRef = useRef(attempt);
	useEffect(() => {
		attemptRef.current = attempt;
	}, [attempt]);
	
	// Initialize submitted questions from attempt's perQuestionAttempts
	useEffect(() => {
		if (attempt.perQuestionAttempts && attempt.perQuestionAttempts.length > 0) {
			const submitted = new Set(attempt.perQuestionAttempts
				.filter(pqa => pqa.status === 'attempted')
				.map(pqa => pqa.questionId));
			setSubmittedQuestionIds(submitted);
		}
	}, [attempt.perQuestionAttempts]);

	const handleTick = useCallback(
		async ({ elapsedMs, remainingTimeMs, paused, mode }: { elapsedMs: number; remainingTimeMs: number; paused: boolean; mode: 'perModule' | 'perQuestion' }) => {
			// Stop updating if time has expired and we're finalizing
			if (hasTimeExpiredRef.current || isFinalizingRef.current) return;
			
			// Clamp remaining time to prevent negative values
			const clampedRemaining = Math.max(0, remainingTimeMs);
			
			const currentAttempt = attemptRef.current;
			const timerState: TimerState = {
				startUtc: Date.now() - elapsedMs,
				expectedDurationMs,
				elapsedMs,
				paused,
				mode,
				questionId: mode === 'perQuestion' ? questions[safeCurrentIndex]?.id : undefined,
			};
			const update: Partial<Attempt> =
				mode === 'perModule'
					? {
							timerState,
							timeRemainingMs: clampedRemaining,
					  }
					: {
							currentQuestionTimerState: timerState,
							currentQuestionIndex: safeCurrentIndex,
					  };
			await db.attempts.update(currentAttempt.id, update);
			// Update using ref to avoid dependency on attempt
			const updatedAttempt = { ...attemptRef.current, ...update };
			attemptRef.current = updatedAttempt;
			setAttempt(updatedAttempt);
		},
		[safeCurrentIndex, expectedDurationMs, questions]
	);

	// Helper function to check IndexedDB availability with retry
	const ensureIndexedDBAvailable = async (maxRetries = 5, delayMs = 100): Promise<boolean> => {
		for (let i = 0; i < maxRetries; i++) {
			try {
				// Check if IndexedDB is available by attempting a simple operation
				if (typeof indexedDB === 'undefined') {
					await new Promise(resolve => setTimeout(resolve, delayMs));
					continue;
				}
				// Try to access the database
				await db.attempts.count();
				return true;
			} catch (error) {
				if (i < maxRetries - 1) {
					await new Promise(resolve => setTimeout(resolve, delayMs));
				} else {
					console.error('IndexedDB not available after retries:', error);
					return false;
				}
			}
		}
		return false;
	};

	// Helper function to save answers to IndexedDB with retry
	const saveAnswersToIndexedDB = async (attemptId: string, answers: Record<string, string | string[]>, maxRetries = 3): Promise<boolean> => {
		for (let i = 0; i < maxRetries; i++) {
			try {
				await db.attempts.update(attemptId, { answers });
				return true;
			} catch (error) {
				if (i < maxRetries - 1) {
					await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
				} else {
					console.error('Failed to save answers to IndexedDB after retries:', error);
					return false;
				}
			}
		}
		return false;
	};

	// Finalize with unanswered autosubmitted (used by timer expiry, focus loss, and user submit)
	// Note: keep dependencies minimal so this callback stays stable during the exam.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const autosubmitUnansweredAndFinalize = useCallback(async (reason: string) => {
		// Prevent multiple simultaneous finalizations
		if (isFinalizingRef.current) return;
		isFinalizingRef.current = true;
		setIsFinalizing(true);
		
		// Mark timer as expired immediately to prevent further updates
		hasTimeExpiredRef.current = true;
		autosubmitTriggeredRef.current = true;

		try {
			// Step 1: Ensure IndexedDB is available before proceeding
			const dbAvailable = await ensureIndexedDBAvailable();
			if (!dbAvailable) {
				console.error('IndexedDB not available, cannot finalize attempt');
				// Still try to proceed, but log the error
			}

			// Step 2: Save current answers to IndexedDB FIRST before finalization
			const currentAttempt = attemptRef.current;
			const currentAnswers = answersRef.current;
			
			// Save answers immediately to ensure they're persisted
			await saveAnswersToIndexedDB(currentAttempt.id, currentAnswers);
			
			// Step 3: Get latest attempt from database (with retry)
			let latest: Attempt | undefined;
			let retries = 0;
			while (!latest && retries < 3) {
				try {
					latest = await db.attempts.get(currentAttempt.id);
					if (!latest) {
						// If attempt not found, use current attempt as fallback
						latest = currentAttempt;
						break;
					}
				} catch (error) {
					retries++;
					if (retries >= 3) {
						console.error('Failed to get attempt from IndexedDB after retries:', error);
						// Use current attempt as fallback
						latest = currentAttempt;
						break;
					}
					await new Promise(resolve => setTimeout(resolve, 100 * retries));
				}
			}

			if (!latest) {
				console.error('Could not retrieve attempt for finalization');
				isFinalizingRef.current = false;
				setIsFinalizing(false);
				return;
			}

			// Step 4: Check if already finalized
			if (latest.completed || latest.finalized) {
				isFinalizingRef.current = false;
				setIsFinalizing(false);
				if (reason !== 'user-submit' && phaseRef.current === 'exam') {
					onExit();
				}
				return;
			}

			// Step 5: Defensive guard - avoid auto-submitting immediately after start
			if (reason !== 'user-submit') {
				const startedAt = latest.startedAt ?? currentAttempt.startedAt;
				const elapsedSinceStart = Date.now() - startedAt;
				if (elapsedSinceStart < 3000) {
					console.warn('Ignoring early auto-submit for exam attempt', {
						attemptId: latest.id,
						reason,
						elapsedSinceStart,
					});
					isFinalizingRef.current = false;
					setIsFinalizing(false);
					return;
				}
			}

			// Step 6: Build perQuestionAttempts with latest answers
			const now = Date.now();
			// Merge answers: prefer database answers, fallback to current state
			const sourceAnswers = latest.answers && Object.keys(latest.answers).length > 0 
				? { ...latest.answers, ...currentAnswers } // Merge to ensure we have all answers
				: currentAnswers;

			const perQuestionAttempts = questions.map((q, idx) => {
				const ans = sourceAnswers[q.id];
				// Check if answer exists and is not empty string
				const hasAnswer = ans !== undefined && ans !== null && ans !== '' && 
					(Array.isArray(ans) ? (ans as string[]).length > 0 : true);
				const scoring = hasAnswer 
					? evaluateScore(q, ans) 
					: { isCorrect: false, scorePercent: 0, correctParts: 0, totalParts: getTotalPartsForQuestion(q) };
				// Mark unanswered questions as unattempted/autosubmitted
				const autosubmitted = !hasAnswer;
				// For unattempted questions, ensure userAnswer is explicitly set to empty string/array
				// This ensures the performance modal can properly display "unattempted" status
				const userAnswer = hasAnswer 
					? (Array.isArray(ans) ? ans : (ans ?? ''))
					: (q.type === 'matching' || q.type === 'fill_blanks' ? [] : '');
				// Get question start time from multiple sources, in order of preference:
				// 1. questionTimeMap (tracks when questions were first viewed)
				// 2. Existing perQuestionAttempt (if question was previously submitted)
				// 3. currentQuestionTimerState (if this is the current question)
				// 4. Fallback to attempt start time (least accurate)
				const existingAttempt = latest.perQuestionAttempts?.find(pqa => pqa.questionId === q.id);
				const questionStartedAt = questionTimeMap.current[q.id] ??
					existingAttempt?.questionStartedAt ?? 
					(attempt.currentQuestionTimerState?.questionId === q.id ? attempt.currentQuestionTimerState.startUtc : undefined) ??
					attempt.startedAt;
				return {
					questionId: q.id,
					userAnswer: userAnswer,
					// For unattempted questions, isCorrect should be undefined, not false
					isCorrect: hasAnswer ? scoring.isCorrect : undefined,
					timeTakenMs: 0,
					timestamp: now, // Submit timestamp - precise to milliseconds
					questionStartedAt: questionStartedAt, // Start timestamp - precise to milliseconds
					questionIndexInModule: idx,
					attemptNumberForQuestion: 1,
					integrityEvents: [],
					status: (hasAnswer ? 'attempted' : 'unattempted') as 'attempted' | 'unattempted',
					autosubmitted: autosubmitted,
					scorePercent: scoring.scorePercent,
					correctParts: scoring.correctParts,
					totalParts: scoring.totalParts,
				};
			});

			const scoredQuestions = perQuestionAttempts.filter((a) => typeof a.scorePercent === 'number');
			const score = scoredQuestions.length > 0
				? Math.round(scoredQuestions.reduce((sum, a) => sum + (a.scorePercent || 0), 0) / scoredQuestions.length)
				: 0;
			
			// Step 7: Create finalized attempt object
			const finalizedAttempt = {
				...latest,
				answers: sourceAnswers, // Ensure answers are included
				perQuestionAttempts,
				endedAt: now,
				durationMs: now - (latest.startedAt ?? currentAttempt.startedAt),
				score,
				completed: true,
				finalized: true,
			} as Attempt;
			
			// Step 8: CRITICAL - Update attempt in database BEFORE navigation
			// This must complete before we navigate away
			let updateSuccess = false;
			retries = 0;
			while (!updateSuccess && retries < 5) {
				try {
					await db.attempts.update(latest.id, {
						answers: sourceAnswers, // Save answers
						perQuestionAttempts: finalizedAttempt.perQuestionAttempts,
						endedAt: finalizedAttempt.endedAt,
						durationMs: finalizedAttempt.durationMs,
						score: finalizedAttempt.score,
						completed: finalizedAttempt.completed,
						finalized: finalizedAttempt.finalized,
					} as Partial<Attempt>);
					updateSuccess = true;
				} catch (error) {
					retries++;
					if (retries >= 5) {
						console.error('Failed to update attempt in IndexedDB after retries:', error);
						// Still proceed, but log the error
						break;
					}
					await new Promise(resolve => setTimeout(resolve, 100 * retries));
				}
			}

			// Step 9: Verify the update was successful by reading back
			if (updateSuccess) {
				try {
					const verified = await db.attempts.get(latest.id);
					if (verified && verified.finalized) {
						// Successfully finalized
						attemptRef.current = finalizedAttempt;
						setAttempt(finalizedAttempt);
					} else {
						console.warn('Attempt finalization verification failed, but continuing');
					}
				} catch (error) {
					console.error('Error verifying attempt finalization:', error);
				}
			}

			// Step 10: Update ref and state
			attemptRef.current = finalizedAttempt;
			setAttempt(finalizedAttempt);

			// Step 11: Now safe to navigate (for non-user submissions)
			// For user submissions, stay on page to show completion
			if (reason !== 'user-submit' && phaseRef.current === 'exam') {
				isFinalizingRef.current = false;
				setIsFinalizing(false);
				onExit();
			} else {
				isFinalizingRef.current = false;
				setIsFinalizing(false);
			}

			// Step 12: Do non-critical database updates in background (after navigation is safe)
			Promise.all([
				// Record stats
				recordDailyStats(finalizedAttempt, moduleData).catch(error => {
					console.error('Error recording daily stats:', error);
				}),
				// Update module lock status
				(async () => {
					const isReviewExpired = reason === 'review-time-expired' || reason === 'review-final-grace';
					if (reviewEnabled && !isReviewExpired) {
						try {
							await db.modules.update(moduleData.id, { updatedAt: now });
						} catch (error) {
							console.error('Error updating module for review:', error);
						}
					} else {
						try {
							await db.modules.update(moduleData.id, { locked: true, updatedAt: now });
						} catch (error) {
							console.error('Error locking module:', error);
						}
					}
				})(),
				// Broadcast message
				(async () => {
					try {
						if (bcRef.current) {
							bcRef.current.postMessage({
								type: 'ATTEMPT_FINALIZED',
								moduleId: moduleData.id,
								attemptId: latest.id,
								ts: Date.now(),
								resultSummary: { score },
								finalizationReason: reason,
							});
						}
					} catch (err) {
						// Silently handle BroadcastChannel errors
					}
				})(),
			]).catch(error => {
				console.error('Error in background finalization tasks:', error);
			});

		} catch (error) {
			console.error('Error in autosubmit finalization:', error);
			// Reset finalizing state on error
			isFinalizingRef.current = false;
			setIsFinalizing(false);
			// For non-user submissions, still try to exit even on error (exam phase only)
			if (reason !== 'user-submit' && phaseRef.current === 'exam') {
				onExit();
			}
		}
	}, [moduleData.id, onExit, setAttempt, questions]);

	const handleTimeUp = useCallback(() => {
		// Prevent multiple calls
		if (hasTimeExpiredRef.current) return;
		hasTimeExpiredRef.current = true;
		
		// Always finalize and redirect to home, don't start review immediately
		// Review will be available when user opens the module again from home
		void autosubmitUnansweredAndFinalize('time-expired');
	}, [autosubmitUnansweredAndFinalize]);

	const handleClockDrift = useCallback(
		(drift: number) => {
			void logIntegrityEvent(attempt.id, 'clock_drift', `Drift ${Math.round(drift)}ms`);
		},
		[attempt.id]
	);

	const wallAlignedInitialElapsedMs = expectedDurationMs > 0 && scheduledRemainingMs > 0
		? Math.max(0, expectedDurationMs - scheduledRemainingMs)
		: attempt.timerState?.elapsedMs ?? 0;

	const examTimer = useExamTimer(
		{
			attemptId: attempt.id,
			moduleId: moduleData.id,
			expectedDurationMs,
			initialElapsedMs: wallAlignedInitialElapsedMs,
			mode: 'perModule',
			autoStart: hasTimer && expectedDurationMs > 0,
			paused: attempt.timerState?.paused ?? false,
		},
		{
			onTick: handleTick,
			onTimeUp: handleTimeUp,
			onClockDrift: handleClockDrift,
		}
	);

	// Ensure timer actually starts when we have a positive expected duration,
	// but avoid infinite update loops by only restarting once when needed.
	const hasRestartedTimerRef = useRef(false);
	useEffect(() => {
		if (!hasTimer) return;
		if (expectedDurationMs <= 0) return;
		// Only attempt a restart once for this session, and only if the attempt
		// is not completed and time has not already been marked as expired.
		if (
			!hasRestartedTimerRef.current &&
			!attempt.completed &&
			!hasTimeExpiredRef.current &&
			examTimer.remainingTimeMs <= 0
		) {
			hasRestartedTimerRef.current = true;
			examTimer.restartTimer({ expectedDurationMs, initialElapsedMs: 0, mode: 'perModule' });
		}
	}, [attempt.completed, examTimer.remainingTimeMs, expectedDurationMs, hasTimer]);

	// Sync currentIndex with attempt when it changes (e.g., when resuming) - only on mount or when attempt ID changes
	const attemptIdRef = useRef(attempt.id);
	useEffect(() => {
		// Only sync if this is a new attempt (different ID) or on initial mount
		if (attemptIdRef.current !== attempt.id) {
			attemptIdRef.current = attempt.id;
			const savedIndex = attempt.currentQuestionIndex ?? 0;
			setCurrentIndex(savedIndex);
		} else if (phase === 'exam' && !attempt.completed) {
			// Only sync if there's a significant difference (more than 1) to avoid loops
			const savedIndex = attempt.currentQuestionIndex ?? 0;
			if (Math.abs(savedIndex - currentIndex) > 1) {
				setCurrentIndex(savedIndex);
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [attempt.id, attempt.completed, phase]); // Removed currentIndex and attempt.currentQuestionIndex from deps

	useEffect(() => {
		if (phase === 'exam' && currentQuestion) {
			const now = Date.now();
			questionStartRef.current = now;
			setShowFeedback(false);
			setLastScorePercent(null);
			// Track question start time in the map (only record once per question)
			if (!questionTimeMap.current[currentQuestion.id]) {
				questionTimeMap.current[currentQuestion.id] = now;
			}
			// Record question start time in the attempt's currentQuestionTimerState
			// This will be used when finalizing to set questionStartedAt for each question
			db.attempts.update(attempt.id, {
				currentQuestionTimerState: {
					startUtc: now,
					expectedDurationMs: 0,
					elapsedMs: 0,
					paused: false,
					mode: 'perQuestion',
					questionId: currentQuestion.id,
				},
				currentQuestionIndex: currentIndex,
			}).catch(err => console.error('Error recording question start:', err));
		}
	}, [currentIndex, phase, currentQuestion, attempt.id]);

	// Review period features are disabled; no review countdown or auto-finalization.


  // Case 2: Auto-submit when 3-4 seconds remain (final grace period)
  // Use polling to check remaining time periodically - optimized to prevent re-renders
  useEffect(() => {
    const fgSec = moduleData.settings.finalGraceSeconds ?? 4; // Default to 4 seconds
    if (!hasTimer || fgSec <= 0 || phase !== 'exam' || isFinalizingRef.current || hasTimeExpiredRef.current) return;
    
    // Use ref to track if already triggered to avoid state updates
    const triggeredRef = { current: false };
    const threshold = fgSec * 1000; // 3-4 seconds threshold
    
    // Poll more frequently (every 100ms) for better responsiveness
    const intervalId = window.setInterval(() => {
      if (hasTimeExpiredRef.current || isFinalizingRef.current || triggeredRef.current) {
        window.clearInterval(intervalId);
        return;
      }
      
      // Access examTimer through closure - will get latest value
      const remaining = Math.max(0, examTimer.remainingTimeMs);
      
      // Trigger immediately when threshold is reached or time expires
      if (remaining <= threshold && !triggeredRef.current) {
        triggeredRef.current = true;
        hasTimeExpiredRef.current = true;
        setFinalGraceAnnounced(true);
        window.clearInterval(intervalId);
        
        // Broadcast trigger immediately
        try {
          if (bcRef.current) {
            bcRef.current.postMessage({ 
              type: 'FINAL_GRACE_TRIGGER', 
              moduleId: moduleData.id, 
              attemptId: attemptRef.current.id, 
              ts: Date.now() 
            });
          }
        } catch (err) {
          // Silently handle BroadcastChannel errors
        }
        
        // Auto-submit immediately
        if (isLeader) {
          void autosubmitUnansweredAndFinalize('final_grace');
        }
        return;
      }
    }, 100); // Check every 100ms for faster response
    
    return () => {
      window.clearInterval(intervalId);
    };
    // Note: examTimer is accessed through closure, so we don't need it in dependencies
    // The interval callback will always read the latest value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTimer, phase, moduleData.settings.finalGraceSeconds]);

	const markCurrentQuestionAutosubmitted = useCallback(async (reason: 'visibilitychange' | 'blur') => {
		const q = questions[currentIndex];
		if (!q) return;
		const currentAttempt = attemptRef.current;
		await db.integrityEvents.add({
			id: uuidv4(),
			attemptId: currentAttempt.id,
			type: 'focus_lost',
			timestamp: Date.now(),
			details: `focus_lost_autosubmit:${reason};questionId:${q.id}`,
		} as IntegrityEvent);
		try {
			if (bcRef.current) {
				bcRef.current.postMessage({ type: 'FOCUS_LOSS_AUTOSUBMIT', moduleId: moduleData.id, attemptId: currentAttempt.id, questionId: q.id, ts: Date.now(), reason });
			}
		} catch (err) {
			// Silently handle BroadcastChannel errors
		}
	}, [currentIndex, moduleData.id, questions]);

	// Submit current question as unattempted and move to next question
	const submitCurrentQuestionAndMoveNext = useCallback(async (reason: string) => {
		if (isFinalizingRef.current || attempt.completed) return;
		
		const q = questions[safeCurrentIndex];
		if (!q) return;
		
		const now = Date.now();
		const currentAttempt = attemptRef.current;
		
		// Mark current question as unattempted (no answer provided)
		const currentAnswers = answersRef.current;
		const hasAnswer = currentAnswers[q.id] !== undefined && 
			(Array.isArray(currentAnswers[q.id]) ? (currentAnswers[q.id] as string[]).length > 0 : !!currentAnswers[q.id]);
		
		// If question has no answer, mark it as unattempted
		// Save the current state (with empty answer for this question)
		const updatedAnswers = { ...currentAnswers };
		if (!hasAnswer) {
			// Explicitly mark as empty to indicate unattempted
			updatedAnswers[q.id] = '';
		}
		
		// Move to next question index
		const nextIndex = Math.min(safeCurrentIndex + 1, questions.length - 1);
		
		// Update attempt in database with new index and answers
		await db.attempts.update(currentAttempt.id, {
			answers: updatedAnswers,
			currentQuestionIndex: nextIndex,
		});
		
		// Update local state
		setAnswers(updatedAnswers);
		setCurrentIndex(nextIndex);
		const updatedAttempt = { ...currentAttempt, answers: updatedAnswers, currentQuestionIndex: nextIndex };
		attemptRef.current = updatedAttempt;
		setAttempt(updatedAttempt);
		
		// Log integrity event using valid type
		await logIntegrityEvent(currentAttempt.id, 'focus_lost', `navigation_away_question_${q.id}_marked_unattempted`);
	}, [safeCurrentIndex, questions, attempt.completed, setAttempt]);

  // Case 1: Auto-submit current question when user navigates to a different route
  useEffect(() => {
    const currentPath = location.pathname;
    const expectedPath = `/module/${moduleData.id}`;
    
    // Check if user navigated away from the quiz page
    if (previousPathRef.current === expectedPath && currentPath !== expectedPath && !hasTriggeredNavigationAutosubmit.current && phase === 'exam' && !attempt.completed) {
      hasTriggeredNavigationAutosubmit.current = true;
      // Auto-submit current question as unattempted and move to next
      void submitCurrentQuestionAndMoveNext('route-navigation');
    }
    
    previousPathRef.current = currentPath;
  }, [location.pathname, moduleData.id, phase, attempt.completed, submitCurrentQuestionAndMoveNext]);

	// Case 1: Auto-submit when user loses focus or navigates away (visibility change or blur)
	useEffect(() => {
		const currentAttempt = attemptRef.current;
		// Respect module onFocusLoss setting: 'ignore' | 'autosubmit_question' | 'autosubmit_and_end'
		const focusBehavior = moduleData.settings.onFocusLoss ?? 'autosubmit_question';
		const handleVisibility = async () => {
			if (document.visibilityState === 'hidden') {
				await logIntegrityEvent(currentAttempt.id, 'visibility_change', 'hidden');
				const losses = await incrementVisibilityLoss(currentAttempt.id);
				if (focusBehavior === 'ignore') return;
				await markCurrentQuestionAutosubmitted('visibilitychange');
				if (focusBehavior === 'autosubmit_and_end' && !hasTriggeredNavigationAutosubmit.current) {
					hasTriggeredNavigationAutosubmit.current = true;
					void autosubmitUnansweredAndFinalize('focus-loss');
				}
			} else {
				await logIntegrityEvent(currentAttempt.id, 'visibility_change', 'visible');
			}
		};
		const handleBlur = async () => {
			await logIntegrityEvent(currentAttempt.id, 'focus_lost');
			const losses = await incrementVisibilityLoss(currentAttempt.id);
			if (focusBehavior === 'ignore') return;
			await markCurrentQuestionAutosubmitted('blur');
			if (focusBehavior === 'autosubmit_and_end' && !hasTriggeredNavigationAutosubmit.current) {
				hasTriggeredNavigationAutosubmit.current = true;
				void autosubmitUnansweredAndFinalize('focus-loss');
			}
		};
		const handleFocus = async () => {
			await logIntegrityEvent(currentAttempt.id, 'focus_gain');
		};
		document.addEventListener('visibilitychange', handleVisibility);
		window.addEventListener('blur', handleBlur);
		window.addEventListener('focus', handleFocus);
		return () => {
			document.removeEventListener('visibilitychange', handleVisibility);
			window.removeEventListener('blur', handleBlur);
			window.removeEventListener('focus', handleFocus);
		};
	}, [autosubmitUnansweredAndFinalize, markCurrentQuestionAutosubmitted, moduleData.settings.maxVisibilityLosses, moduleData.settings.onFocusLoss]);

  // Setup BroadcastChannel after handlers are defined
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    let onMessage: ((e: MessageEvent) => Promise<void>) | null = null;
    try {
      channel = new BroadcastChannel('exam-sync');
      bcRef.current = channel;
      onMessage = async (e: MessageEvent) => {
        try {
          const msg: any = e.data;
          if (!msg || typeof msg !== 'object') return;
          if (msg.attemptId !== attemptRef.current.id) return;
          if (msg.type === 'FINAL_GRACE_TRIGGER') {
            if (isLeader) {
              await autosubmitUnansweredAndFinalize('final_grace');
            }
          } else if (msg.type === 'ATTEMPT_FINALIZED') {
            // Only auto-exit for non user-initiated finalizations
            if (msg.finalizationReason && msg.finalizationReason === 'user-submit') {
              return;
            }
            if (phase === 'exam') {
              onExit();
            }
          }
        } catch (err) {
          console.error('Error handling broadcast message', err);
        }
      };
      channel.addEventListener('message', onMessage as any);
    } catch (err) {
      console.error('Failed to create BroadcastChannel', err);
    }
    return () => {
      if (channel && onMessage) {
        try {
          channel.removeEventListener('message', onMessage as any);
          channel.close();
        } catch (err) {
          // Ignore errors when closing channel
        }
      }
      bcRef.current = null;
    };
  }, [attempt.id, isLeader, onExit, autosubmitUnansweredAndFinalize]);

	const handleAnswerChange = useCallback(
		(value: string | string[]) => {
			if (!currentQuestion) return;
			const nextAnswers = { ...answers, [currentQuestion.id]: value };
			setAnswers(nextAnswers);
			// Save immediately to database without blocking UI
			db.attempts.update(attempt.id, { answers: nextAnswers }).catch(error => {
				console.error('Error saving answer:', error);
			});
			setAttempt({ ...attempt, answers: nextAnswers });
		},
		[answers, attempt, currentQuestion]
	);

	const canGoBack = false;
	const isLastQuestion = currentIndex === questions.length - 1;

	return (
		<div className="relative max-w-7xl mx-auto space-y-4 bg-white select-none" onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onPaste={(e) => e.preventDefault()}>
			{showPerfectScoreCelebration && (
				<PerfectScoreCelebrationOverlay onDismiss={() => setShowPerfectScoreCelebration(false)} />
			)}
			{showFocusWarning && !isFinalizing && (
				<div className="absolute inset-0 z-20 flex items-center justify-center bg-white/85 backdrop-blur">
					<Card className="p-6 text-center space-y-3">
						<h2 className="text-xl font-semibold text-destructive">Focus Lost</h2>
						<p className="text-sm text-muted-foreground">
							Please return to the exam window to continue. Repeated focus loss may submit the exam automatically.
						</p>
					</Card>
				</div>
			)}
			{isFinalizing && phase === 'exam' && !attempt.completed && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-white/85 backdrop-blur">
					<Card className="p-6 text-center space-y-3">
						<div className="flex items-center justify-center mb-4">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
						</div>
						<h2 className="text-xl font-semibold">Submitting Exam...</h2>
						<p className="text-sm text-muted-foreground">
							Please wait while your exam is being submitted.
						</p>
					</Card>
				</div>
			)}

			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<Badge variant="destructive">EXAM</Badge>
						{canReportIssue && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => setReportDialogOpen(true)}
								className="bg-white"
							>
								<Bug className="h-4 w-4 mr-2" />
								Report issue
							</Button>
						)}
					</div>
					<div className="flex flex-col items-end gap-1">
						<div className="flex items-center gap-3">
							{hasTimer && phase === 'exam' && (
								<ExamTimerDisplay
									remainingMs={examTimer.remainingTimeMs}
									mode={timerMode}
									paused={examTimer.isPaused}
								/>
							)}
							{phase === 'review' && reviewEnabled && reviewTimeRemaining !== null && reviewTimeRemaining >= 0 && (
								<ExamTimerDisplay
									remainingMs={reviewTimeRemaining}
									mode={timerMode}
									paused={false}
								/>
							)}
							{phase === 'review' && (
								<div className="text-sm text-muted-foreground">
									Question {reviewIndex + 1} / {questions.length}
								</div>
							)}
						</div>
						{phase === 'exam' && questions.length > 0 && (
							<div className="flex flex-col items-end gap-1 w-full min-w-[180px]">
								<div className="h-1.5 w-40 rounded-full bg-white border border-white overflow-hidden">
									<div
										className="h-full rounded-full bg-primary transition-all"
										style={{ width: `${progressPercent}%` }}
									/>
								</div>
								<div className="text-xs text-muted-foreground">
									{answeredCount} of {questions.length} questions done
								</div>
							</div>
						)}
					</div>
				</div>
				<div className="border-b border-white" />
			</div>

			<Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Report an issue</DialogTitle>
						<DialogDescription>
							Send a detailed description so the admin can fix it.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="space-y-1">
							<div className="text-xs text-muted-foreground">Issue description</div>
							<Textarea
								value={reportMessage}
								onChange={(e) => setReportMessage(e.target.value)}
								placeholder="Please describe the issue in detail (what you expected vs what happened, steps to reproduce, etc.)"
								className="min-h-[180px]"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setReportDialogOpen(false)}>
							Cancel
						</Button>
						<Button type="button" onClick={submitErrorReport} disabled={isSubmittingReport}>
							{isSubmittingReport ? 'Sending…' : 'Send report'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{phase === 'exam' && (
				<div ref={examContentRef} className="space-y-4 pt-4 select-none" onDoubleClick={handleGlossaryLookup} onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onPaste={(e) => e.preventDefault()}>
					{currentIndex >= questions.length || attempt.completed ? (
						<div className="space-y-4 text-center">
							<h3 className="text-xl font-semibold">No More Questions to Serve</h3>
							<p className="text-muted-foreground">You have completed all questions in this exam.</p>
							<Button
								onClick={() => {
									// After the exam has been fully submitted, simply
									// allow the learner to go back home.
									onExit();
								}}
							>
								Back to home
							</Button>
						</div>
						) : currentQuestion ? (
							<>
								{(() => {
							if (currentQuestion.type !== 'fill_blanks') {
								return (
									<div
										className="text-xl md:text-2xl leading-relaxed content-html tk-question-text"
										dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(currentQuestion.text) }}
									/>
								);
							}
							const meta = currentQuestion.fillBlanks?.blanks?.length
								? currentQuestion.fillBlanks.blanks
								: getFillBlanksMetaFromText(currentQuestion);
							if (!meta.length) {
								return (
									<div
										className="text-xl md:text-2xl leading-relaxed content-html tk-question-text"
										dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(currentQuestion.text) }}
									/>
								);
							}
							const qWithMeta: Question = {
								...currentQuestion,
								fillBlanks: { blanks: meta },
							};
							return (
								<FillBlanksPassage
									question={qWithMeta}
									value={Array.isArray(answers[currentQuestion.id]) ? (answers[currentQuestion.id] as string[]) : []}
									onChange={(vals) => handleAnswerChange(vals)}
									disabled={showFeedback}
									revealCorrectness={false}
								/>
							);
						})()}
								<div className="mt-12 space-y-8">
								{currentQuestion.type === 'mcq' && (
									<div className="grid gap-y-4 gap-x-10 sm:grid-cols-2">
										{currentQuestion.options?.map((opt, optIndex) => {
											const value = answers[currentQuestion.id];
											const selected = Array.isArray(value)
												? (value as string[]).includes(opt.id)
												: value === opt.id;
											const multi = (currentQuestion.correctAnswers?.length ?? 0) > 1;
											const optionLabel = String.fromCharCode(65 + optIndex); // A, B, C, etc.
											// During exam, do not reveal correctness via colors. Keep submitted state neutral.
											const borderClass = showFeedback
												? selected
													? 'border-muted-foreground/30 bg-muted/20'
													: 'border-border'
												: selected
													? 'border-primary bg-primary/5'
													: 'border-border hover:bg-white';
											return (
												<button
													type="button"
													key={opt.id}
													disabled={showFeedback}
													className={`w-full h-full text-left rounded-md border p-3 transition-colors flex items-start gap-3 whitespace-normal break-words ${borderClass}`}
													onClick={() => {
														if (showFeedback) return;
														if (multi) {
															const current = Array.isArray(answers[currentQuestion.id])
																? [...(answers[currentQuestion.id] as string[])]
																: [];
															const exists = current.includes(opt.id);
															const next = exists ? current.filter((id) => id !== opt.id) : Array.from(new Set([...current, opt.id]));
															handleAnswerChange(next);
														} else {
															handleAnswerChange(opt.id);
														}
													}}
												>
													<span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-lg font-semibold ${
														selected ? 'border-primary text-primary bg-primary/10' : 'border-border/60 text-muted-foreground bg-white'
													}`}>
														{optionLabel}
													</span>
													<span className="flex-1 min-w-0 text-lg leading-relaxed content-html mcq-option-text" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(opt.text) }} />
												</button>
											);
										})}
									</div>
								)}
								{currentQuestion.type === 'text' && (
									<Input
										value={(answers[currentQuestion.id] as string) || ''}
										onChange={(e) => handleAnswerChange(e.target.value)}
										disabled={showFeedback}
										placeholder="Type your answer..."
										className="w-full max-w-sm h-12 px-3 text-lg border border-border/90 rounded-none"
									/>
								)}
								{currentQuestion.type === 'matching' && currentQuestion.matching && currentQuestion.matching.pairs.length > 0 && (
									<MatchingQuestionSortable
										question={currentQuestion}
										value={Array.isArray(answers[currentQuestion.id]) ? (answers[currentQuestion.id] as string[]) : []}
										onChange={(vals) => handleAnswerChange(vals)}
										disabled={showFeedback}
										revealCorrectness={false}
									/>
								)}
								</div>

						{showFeedback ? (
							<div className="space-y-3 pt-6">
								<div className="bg-white border border-border rounded-md p-3 flex items-center justify-between">
									<div className="text-sm font-semibold">Your answer has been recorded</div>
									<Button
										variant="outline"
										disabled={isFinalizing}
										onClick={async () => {
											if (isFinalizing) return;
											// Mark current question as submitted if not already
											if (currentQuestion && !submittedQuestionIds.has(currentQuestion.id)) {
												setSubmittedQuestionIds(prev => new Set([...prev, currentQuestion.id]));
											}
											setShowFeedback(false);
											// Move to the next question
											const nextIndex = Math.min(currentIndex + 1, questions.length - 1);
											if (nextIndex > currentIndex && nextIndex < questions.length) {
												const now = Date.now();
												questionStartRef.current = now;
												setCurrentIndex(nextIndex);
												await db.attempts.update(attempt.id, { 
													currentQuestionIndex: nextIndex 
												});
												setAttempt({ ...attempt, currentQuestionIndex: nextIndex });
											} else {
												// All questions have been answered. Immediately switch
												// UI to the completed state and finalize in background.
												const updated = { ...attemptRef.current, completed: true };
												attemptRef.current = updated;
												setAttempt(updated);
												setCurrentIndex(questions.length); // trigger "No more questions"
												setIsFinalizing(false);
												void autosubmitUnansweredAndFinalize('user-submit');
											}
										}}
									>
										Next
									</Button>
								</div>
								{phase !== 'exam' && currentQuestion.type === 'mcq' && currentQuestion.correctAnswers && currentQuestion.correctAnswers.length > 0 && (
									<div className="bg-white border border-border rounded-md p-3">
										<div className="text-sm font-semibold text-green-700 mb-2">Correct Answer:</div>
										<div className="text-lg">
											{currentQuestion.options
												?.filter(opt => currentQuestion.correctAnswers?.includes(opt.id))
												.map((opt, idx) => {
													const optIndex = currentQuestion.options?.indexOf(opt) ?? 0;
													const optionLabel = String.fromCharCode(65 + optIndex);
													return (
														<span key={opt.id}>
															{idx > 0 && ', '}
															<span className="font-semibold">{optionLabel}</span>
														</span>
													);
												})}
										</div>
									</div>
								)}
								{phase !== 'exam' && currentQuestion.type === 'text' && currentQuestion.correctAnswers && currentQuestion.correctAnswers.length > 0 && (
									<div className="bg-white border border-border rounded-md p-3">
										<div className="text-sm font-semibold text-green-700 mb-2">Correct Answer:</div>
										<div className="text-lg">
											{currentQuestion.correctAnswers.map((ans, idx) => (
												<span key={idx}>
													{idx > 0 && ', '}
													<span className="font-semibold">{ans}</span>
												</span>
											))}
										</div>
									</div>
								)}
								{phase !== 'exam' && currentQuestion.explanation && (
									<div className="bg-white border border-border rounded-md p-3">
										<div className="text-lg font-semibold mb-2">Explanation</div>
										<div className="prose prose-lg max-w-none content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(currentQuestion.explanation) }} />
									</div>
								)}
							</div>
						) : (
							<div className="flex items-center justify-between pt-6">
								<div className="flex gap-2">
									<Button
										disabled={isFinalizing || !currentQuestion || !answers[currentQuestion.id] || showFeedback}
										onClick={async () => {
											if (isFinalizing || !currentQuestion || showFeedback) return;
											if (!answers[currentQuestion.id]) return; // Require an answer
											
											// Mark this question as submitted
											setSubmittedQuestionIds(prev => new Set([...prev, currentQuestion.id]));
											
											if (isLastQuestion) {
												// For last question, immediately move UI to completed state
												// and finalize the attempt in the background.
												const updated = { ...attemptRef.current, completed: true };
												attemptRef.current = updated;
												setAttempt(updated);
												setCurrentIndex(questions.length); // show "No more questions"
												setIsFinalizing(false);
												void autosubmitUnansweredAndFinalize('user-submit');
											} else {
												// For non-last questions, show feedback immediately
												// Save to database asynchronously without blocking UI
												setShowFeedback(true);
												// Update database in background (don't await)
												db.attempts.update(attempt.id, { 
													answers: answers,
													currentQuestionIndex: currentIndex 
												}).catch(error => {
													console.error('Error saving answer:', error);
												});
												setAttempt({ ...attempt, answers });
											}
										}}
									>
										{isFinalizing ? 'Processing...' : (isLastQuestion ? 'Submit Exam' : 'Submit')}
									</Button>
								</div>
							</div>
						)}
					</>
					) : (
						<div>No questions available.</div>
					)}
				</div>
			)}

			{phase === 'review' && reviewEnabled && !reviewExpired && (
				<div className="space-y-6 pt-4 relative" onDoubleClick={handleGlossaryLookup}>
					
					{allQuestionsReviewed && (
						<div className="bg-white border-green-200 border rounded-md p-4">
							<div className="text-sm font-semibold text-green-900">Review complete</div>
						</div>
					)}
					
					{questions.length === 0 ? (
						<div>No questions available.</div>
					) : (
						(() => {
							// Ensure reviewIndex is within bounds (useEffect handles the actual update)
							const safeReviewIndex = Math.max(0, Math.min(reviewIndex, questions.length - 1));
							const q = questions[safeReviewIndex];
							if (!q) {
								return <div>No questions available.</div>;
							}
							
							// Get answer from attempt's perQuestionAttempts for accuracy (from finalized attempt)
							const perQuestionAttempt = attempt.perQuestionAttempts?.find(pqa => pqa.questionId === q.id);
							const userAns = perQuestionAttempt?.userAnswer ?? answers[q.id];
							const isMcq = q.type === 'mcq';
							// Check if answer exists - handle empty arrays and empty strings properly
							const hasAnswer = Array.isArray(userAns)
								? (userAns as string[]).length > 0 && userAns.some(a => a && a.trim().length > 0)
								: !!userAns && userAns !== '' && String(userAns).trim().length > 0;
							// Prefer status from perQuestionAttempts if available, otherwise determine from answer
							const status = perQuestionAttempt?.status ?? (hasAnswer ? 'attempted' : 'unattempted');
							// If we have an answer but status says unattempted, fix it
							const finalStatus = (hasAnswer && status === 'unattempted') ? 'attempted' : status;
							
							// Use the isCorrect and scorePercent from perQuestionAttempts if available
							const evaluated = hasAnswer ? evaluateScore(q, userAns) : { isCorrect: false, scorePercent: 0, correctParts: 0, totalParts: 1 };
							const scorePercent = perQuestionAttempt?.scorePercent ?? evaluated.scorePercent;
							const isCorrect = perQuestionAttempt?.isCorrect ?? (hasAnswer && evaluated.isCorrect);
							
							return (
								<div key={q.id} className="space-y-4">
									<div className="rounded-md border p-4 space-y-4 bg-white">
										<div className="flex items-start justify-between gap-2">
											<div className="text-sm font-semibold text-muted-foreground">Question {reviewIndex + 1} of {questions.length}</div>
										</div>
										<div className="text-xl md:text-2xl font-medium content-html tk-question-text" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(q.text) }} />
										
										{/* User's Answer Section */}
										<div className="space-y-2">
											<div className="text-sm font-semibold">Your Answer:</div>
											{isMcq ? (
												<div className="space-y-1">
													{(finalStatus === 'unattempted' || !hasAnswer) && (
														<div className="text-xs text-muted-foreground">Unattempted</div>
													)}
													<div className="grid gap-2 sm:grid-cols-2">
														{q.options?.map((opt, optIndex) => {
															const value = userAns;
															const selected = Array.isArray(value)
																? (value as string[]).includes(opt.id)
																: value === opt.id;
															const isCorrectOpt = (q.correctAnswers || []).includes(opt.id);
															// Highlight: green for correct, red for selected incorrect
															const feedbackClass = isCorrectOpt
																? 'border-green-600 bg-green-50'
																: selected && !isCorrectOpt
																	? 'border-red-600 bg-red-50'
																	: '';
															const optionLabel = String.fromCharCode(65 + optIndex);
															return (
																<div
																	key={opt.id}
																	className={`text-left rounded-md border p-3 flex items-start gap-2 whitespace-normal break-words ${feedbackClass}`}
																>
																<span className="font-semibold">{optionLabel}.</span>
																<span className="flex-1 min-w-0 text-lg leading-relaxed content-html mcq-option-text" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(opt.text) }} />
																{isCorrectOpt && <span className="text-lg font-semibold text-green-700">✓ Correct</span>}
																</div>
															);
														})}
													</div>
												</div>
											) : finalStatus === 'unattempted' || !hasAnswer ? (
												<div className="rounded-md border border-gray-300 bg-white px-3 py-2">
													<span className="text-gray-600 font-medium">Unattempted</span>
												</div>
											) : q.type === 'fill_blanks' ? (
												<div className="rounded-md border bg-white px-3 py-2">
													<div className="text-sm text-muted-foreground mb-1">Your answers:</div>
													{Array.isArray(userAns) && userAns.length > 0 ? (
														<div className="space-y-1">
															{userAns.map((ans, idx) => (
																<div key={idx} className="text-sm">
																	Blank {idx + 1}: {ans || '(empty)'}
																</div>
															))}
														</div>
													) : (
														<span className="text-gray-600">No answers provided</span>
													)}
												</div>
											) : q.type === 'matching' ? (
												<div className="rounded-md border bg-white px-3 py-2">
													{Array.isArray(userAns) && userAns.length > 0 ? (
														<MatchingQuestionSortable
															question={q}
															value={Array.isArray(userAns) ? (userAns as string[]) : []}
															onChange={() => {}}
															disabled={true}
														/>
													) : (
														<span className="text-gray-600">No matching provided</span>
													)}
												</div>
											) : (
												<div className="rounded-md border bg-white px-3 py-2 min-h-[2rem]">
													{Array.isArray(userAns) ? userAns.join(', ') : (userAns ?? '')}
												</div>
											)}
										</div>
										
										{/* Correct Answer Section */}
										<div className="space-y-2">
											<div className="text-sm font-semibold text-green-700">Correct Answer:</div>
											{isMcq ? (
												<div className="grid gap-2 sm:grid-cols-2">
													{q.options?.map((opt, optIndex) => {
														const isCorrectOpt = (q.correctAnswers || []).includes(opt.id);
														if (!isCorrectOpt) return null;
														const optionLabel = String.fromCharCode(65 + optIndex);
														return (
															<div
																key={opt.id}
																className="text-left rounded-md border-2 border-green-600 bg-green-50 p-3 flex items-start gap-2"
															>
																<span className="font-semibold">{optionLabel}.</span>
																<span className="flex-1 min-w-0 text-lg leading-relaxed content-html mcq-option-text" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(opt.text) }} />
															</div>
														);
													})}
												</div>
											) : q.type === 'fill_blanks' && q.fillBlanks?.blanks ? (
												<div className="rounded-md border-2 border-green-600 bg-green-50 px-3 py-2">
													<div className="space-y-1">
														{q.fillBlanks.blanks.map((blank, idx) => (
															<div key={blank.id} className="text-sm">
																Blank {idx + 1}: <span className="font-medium">{blank.correct}</span>
															</div>
														))}
													</div>
												</div>
											) : q.type === 'matching' && q.matching?.pairs ? (
												<div className="rounded-md border-2 border-green-600 bg-green-50 px-3 py-2">
													<div className="space-y-1">
														{q.matching.pairs.map((pair, idx) => (
															<div key={pair.leftId} className="text-sm">
																{pair.leftText} → <span className="font-medium">{pair.rightText}</span>
															</div>
														))}
													</div>
												</div>
											) : q.correctAnswers && q.correctAnswers.length > 0 ? (
												<div className="rounded-md border-2 border-green-600 bg-green-50 px-3 py-2">
													<div className="font-medium">{q.correctAnswers.join(', ')}</div>
												</div>
											) : null}
										</div>
										
										{/* Score Display - only show for attempted questions */}
										{finalStatus === 'attempted' && hasAnswer && (
											<div className={`${scorePercent > 0
												? 'bg-gradient-to-r from-emerald-500/15 via-emerald-400/10 to-emerald-500/15 border-emerald-600 text-emerald-950'
												: 'bg-gradient-to-r from-red-500/15 via-red-400/10 to-red-500/15 border-red-600 text-red-950'} rounded-md border p-3`}>
												<div className="text-sm font-semibold">Score: {scorePercent}%</div>
											</div>
										)}
										
										{/* Explanation */}
										{q.explanation && (
											<div className="rounded-md border p-3 bg-white">
												<div className="text-lg font-semibold mb-2">Explanation</div>
												<div className="prose prose-base md:prose-lg max-w-none content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(q.explanation) }} />
											</div>
										)}
									</div>
									
									{/* Navigation */}
									<div className="rounded-md border p-3 bg-white flex items-center justify-between">
										<div className="flex gap-2">
											<Button
												variant="outline"
												disabled={reviewIndex === 0}
												onClick={() => {
													if (reviewIndex > 0) {
														setReviewIndex(reviewIndex - 1);
													}
												}}
											>
												Previous
											</Button>
											<Button
												variant="outline"
												onClick={() => {
													const next = reviewIndex + 1;
													if (next >= questions.length) {
														// All questions reviewed - navigate to home
														onExit();
														return;
													} else {
														setReviewIndex(next);
													}
												}}
											>
												{reviewIndex + 1 >= questions.length ? 'Finish Review' : 'Next'}
											</Button>
										</div>
									</div>
								</div>
							);
						})()
					)}
				</div>
			)}
			
			{phase === 'review' && reviewExpired && (
				<div className="space-y-4 pt-4">
					<Card className="p-6">
						<h2 className="text-xl font-semibold mb-2">Review period has ended</h2>
						<p className="text-sm text-muted-foreground mb-4">
							{allQuestionsReviewed 
								? "You have completed reviewing all questions." 
								: "The review period has expired. You have been redirected."}
						</p>
						<Button onClick={onExit}>Back to Home</Button>
					</Card>
				</div>
			)}
			<Dialog open={!!glossaryModal} onOpenChange={(open) => { if (!open) closeGlossaryModal(); }}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>{glossaryModal?.word}</DialogTitle>
						<DialogDescription>Referenced word meaning</DialogDescription>
					</DialogHeader>
					<ul className="list-disc pl-4 space-y-2 text-sm text-foreground">
						{glossaryModal?.meanings.map((meaning, idx) => (
							<li key={`${meaning}-${idx}`} className="whitespace-pre-wrap">
								{meaning}
							</li>
						))}
					</ul>
					<DialogFooter>
						<Button type="button" onClick={closeGlossaryModal}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function usePrefersReducedMotion() {
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => setReduced(!!mq.matches);
		update();
		try {
			mq.addEventListener('change', update);
			return () => mq.removeEventListener('change', update);
		} catch {
			mq.addListener(update);
			return () => mq.removeListener(update);
		}
	}, []);
	return reduced;
}

type ConfettiParticle = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	rotation: number;
	vr: number;
	size: number;
	color: string;
	opacity: number;
	shape: 'rect' | 'line';
};

function PerfectScoreCelebrationOverlay({ onDismiss }: { onDismiss: () => void }) {
	const prefersReducedMotion = usePrefersReducedMotion();
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const rafRef = useRef<number | null>(null);
	const dismissingRef = useRef(false);
	const startTsRef = useRef<number>(0);
	const [closing, setClosing] = useState(false);

	const beginDismiss = useCallback(() => {
		if (dismissingRef.current) return;
		dismissingRef.current = true;
		setClosing(true);
		window.setTimeout(() => {
			onDismiss();
		}, 200);
	}, [onDismiss]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const auto = window.setTimeout(() => {
			beginDismiss();
		}, prefersReducedMotion ? 1400 : 2800);
		return () => window.clearTimeout(auto);
	}, [beginDismiss, prefersReducedMotion]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const onPointer = () => beginDismiss();
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				beginDismiss();
			}
		};
		document.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
		document.addEventListener('keydown', onKeyDown, { capture: true });
		return () => {
			document.removeEventListener('pointerdown', onPointer, true);
			document.removeEventListener('keydown', onKeyDown, true);
		};
	}, [beginDismiss]);

	useEffect(() => {
		if (prefersReducedMotion) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const palette = [
			'hsl(152 55% 38%)',
			'hsl(158 50% 34%)',
			'hsl(72 55% 45%)',
			'hsl(0 0% 100%)',
			'hsl(152 60% 40%)',
		];

		const particles: ConfettiParticle[] = [];
		const createParticles = (w: number, h: number) => {
			particles.length = 0;
			const count = Math.min(140, Math.max(90, Math.round((w * h) / 22000)));
			for (let i = 0; i < count; i++) {
				const fromLeft = i % 2 === 0;
				const x = fromLeft ? -20 : w + 20;
				const y = Math.random() * (h * 0.35);
				const baseVx = fromLeft ? 1 : -1;
				const spread = 1 + Math.random() * 1.2;
				particles.push({
					x,
					y,
					vx: baseVx * (140 + Math.random() * 180) * spread,
					vy: 120 + Math.random() * 220,
					rotation: Math.random() * Math.PI,
					vr: (Math.random() - 0.5) * 6,
					size: 6 + Math.random() * 6,
					color: palette[Math.floor(Math.random() * palette.length)],
					opacity: 0.92,
					shape: Math.random() > 0.85 ? 'line' : 'rect',
				});
			}
		};

		const resize = () => {
			const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
			canvas.width = Math.floor(window.innerWidth * dpr);
			canvas.height = Math.floor(window.innerHeight * dpr);
			canvas.style.width = '100%';
			canvas.style.height = '100%';
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			createParticles(window.innerWidth, window.innerHeight);
		};

		resize();
		window.addEventListener('resize', resize, { passive: true });
		startTsRef.current = performance.now();
		let last = startTsRef.current;

		const tick = (ts: number) => {
			const elapsed = ts - startTsRef.current;
			const dt = Math.min(0.032, Math.max(0.008, (ts - last) / 1000));
			last = ts;
			const w = window.innerWidth;
			const h = window.innerHeight;
			ctx.clearRect(0, 0, w, h);

			const fadeStartMs = 1700;
			const fadeDurMs = 800;
			const fadeT = elapsed <= fadeStartMs ? 1 : Math.max(0, 1 - (elapsed - fadeStartMs) / fadeDurMs);

			for (const p of particles) {
				p.vy += 420 * dt;
				p.vx *= 0.995;
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				p.rotation += p.vr * dt;
				p.opacity = 0.88 * fadeT;
				if (p.y > h + 40) {
					p.y = -20;
					p.vy = 120 + Math.random() * 240;
					p.opacity = 0.88 * fadeT;
				}

				ctx.save();
				ctx.globalAlpha = p.opacity;
				ctx.translate(p.x, p.y);
				ctx.rotate(p.rotation);
				ctx.fillStyle = p.color;
				if (p.shape === 'line') {
					ctx.fillRect(-p.size * 0.7, -1, p.size * 1.6, 2);
				} else {
					ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
				}
				ctx.restore();
			}

			if (fadeT <= 0 || closing) {
				return;
			}
			rafRef.current = window.requestAnimationFrame(tick);
		};

		rafRef.current = window.requestAnimationFrame(tick);
		return () => {
			window.removeEventListener('resize', resize);
			if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		};
	}, [closing, prefersReducedMotion]);

	return (
		<div
			className={
				'pointer-events-none fixed inset-0 z-50 transition-opacity duration-200 ' +
				(closing ? 'opacity-0' : 'opacity-100')
			}
			aria-live="polite"
			role="status"
		>
			<div className="absolute inset-0 bg-black/35 dark:bg-black/55 backdrop-blur-sm" />
			{!prefersReducedMotion && (
				<canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
			)}
			<div className="absolute inset-0 flex items-center justify-center px-6">
				<div className="w-full max-w-md rounded-2xl border border-primary/25 bg-background/95 text-foreground shadow-2xl ring-1 ring-primary/15">
					<div className="px-6 py-5 text-center">
						<div className="text-sm font-semibold tracking-wide text-primary">Achievement</div>
						<div className="mt-1 text-2xl font-semibold tracking-tight text-primary">
							100% Accuracy
						</div>
						<div className="mt-2 text-sm text-muted-foreground">
							Perfect score — exam completed.
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function FillBlanksPassage({
	question,
	value,
	onChange,
	disabled,
	revealCorrectness = true,
}: {
	question: Question;
	value: string[];
	onChange: (vals: string[]) => void;
	disabled?: boolean;
	revealCorrectness?: boolean;
}) {
	const blanks = question.fillBlanks?.blanks ?? [];
	const values: string[] = [...value];
	if (values.length < blanks.length) {
		for (let i = values.length; i < blanks.length; i++) {
			values[i] = '';
		}
	}

	const handleChange = (index: number, text: string) => {
		const next = [...values];
		next[index] = text;
		onChange(next);
	};

	// Check if answer is correct for a blank
	const isBlankCorrect = (idx: number) => {
		if (!disabled) return null;
		if (!revealCorrectness) return null;
		const blank = blanks[idx];
		if (!blank) return null;
		const userAnswer = (values[idx] || '').trim().toLowerCase();
		const correctAnswer = blank.correct.trim().toLowerCase();
		return userAnswer === correctAnswer;
	};

	// Guard for environments without DOMParser (e.g. SSR)
	if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
		return (
			<TooltipProvider>
				<div className="space-y-3">
					<div className="text-3xl font-semibold content-html tk-question-text" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(question.text) }} />
					{blanks.map((b, idx) => {
					const correct = isBlankCorrect(idx);
					const showTooltip = disabled && revealCorrectness && correct === false;
					const inputElement = (
						<Input
							className={
								disabled
								? revealCorrectness
									? correct === true
										? 'border-green-500 bg-green-50'
										: correct === false
											? 'border-red-500 bg-red-50'
											: 'border-gray-300'
									: 'border-muted-foreground/30 bg-muted/20'
								: ''
							}
							value={values[idx] || ''}
							onChange={(e) => handleChange(idx, e.target.value)}
							disabled={disabled}
							placeholder={`Answer for blank ${idx + 1}`}
						/>
					);
						return (
							<div key={b.id} className="flex items-center gap-3">
								<div className="text-sm font-medium">Blank {idx + 1}</div>
								{showTooltip ? (
									<Tooltip>
										<TooltipTrigger asChild>
											{inputElement}
										</TooltipTrigger>
										<TooltipContent>
											<p>Correct answer: <strong>{b.correct}</strong></p>
										</TooltipContent>
									</Tooltip>
								) : (
									inputElement
								)}
							</div>
						);
					})}
				</div>
			</TooltipProvider>
		);
	}

	const parser = new DOMParser();
	const doc = parser.parseFromString(`<div>${question.text}</div>`, 'text/html');
	const container = doc.body.firstElementChild;

		const renderNode = (node: ChildNode, key: string): any => {
		if (node.nodeType === Node.TEXT_NODE) {
			return node.textContent;
		}
		if (node.nodeType !== Node.ELEMENT_NODE) {
			return null;
		}
		const el = node as HTMLElement;
		const isBlank = el.getAttribute('data-blank') === 'true';
			if (isBlank) {
				const blankId = el.getAttribute('data-blank-id') || '';
				const blankIndex = blanks.findIndex((b) => b.id === blankId);
				const idx = blankIndex >= 0 ? blankIndex : 0;
				const correct = isBlankCorrect(idx);
				const blank = blanks[idx];
				const showTooltip = disabled && revealCorrectness && correct === false && blank;
				
				const inputElement = (
					<Input
						className={`inline-block w-auto min-w-[4rem] px-2 py-1 text-lg align-middle ${
							disabled
								? revealCorrectness
									? correct === true
										? 'border-green-500 bg-green-50'
										: correct === false
											? 'border-red-500 bg-red-50'
											: 'border-gray-300'
									: 'border-muted-foreground/30 bg-muted/20'
								: 'border-gray-300'
						}`}
						value={values[idx] || ''}
						onChange={(e) => {
							if (disabled) return;
							handleChange(idx, e.target.value);
						}}
						disabled={disabled}
						placeholder=""
					/>
				);

			if (showTooltip) {
				return (
					<span key={key} className="inline-block mx-1 my-1 align-baseline">
						<Tooltip>
							<TooltipTrigger asChild>
								{inputElement}
							</TooltipTrigger>
							<TooltipContent>
								<p>Correct answer: <strong>{blank.correct}</strong></p>
							</TooltipContent>
						</Tooltip>
					</span>
				);
			}

			return (
				<span key={key} className="inline-block mx-1 my-1 align-baseline">
					{inputElement}
				</span>
			);
		}
		const children = Array.from(el.childNodes).map((child, index) =>
			renderNode(child, `${key}-${index}`)
		);
		const Tag: any = el.tagName.toLowerCase();
		const baseProps: any = {};
		if (el.className) baseProps.className = el.className;
		const voidTags = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'track', 'area', 'base', 'col', 'embed', 'param', 'wbr']);
		if (voidTags.has(Tag)) {
			return <Tag key={key} {...baseProps} />;
		}
		return (
			<Tag key={key} {...baseProps}>
				{children}
			</Tag>
		);
	};

	if (!container) {
		return <div className="text-3xl font-semibold content-html tk-question-text" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(question.text) }} />;
	}

	const content = Array.from(container.childNodes).map((child, index) =>
		renderNode(child, `root-${index}`)
	);

	return (
		<TooltipProvider>
			<div className="text-3xl font-semibold space-y-1 tk-question-text">{content}</div>
		</TooltipProvider>
	);
}

function getFillBlanksMetaFromText(q: Question): { id: string; correct: string }[] {
	if (q.type !== 'fill_blanks') return [];
	if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return [];
	const parser = new DOMParser();
	const doc = parser.parseFromString(q.text || '', 'text/html');
	const spans = Array.from(doc.querySelectorAll('[data-blank="true"]')) as HTMLElement[];
	return spans
		.map((el, index) => {
			let id = el.getAttribute('data-blank-id') || '';
			if (!id) {
				id = `b${index + 1}`;
			}
			const correct = (el.innerText || '').trim();
			return { id, correct };
		})
		.filter((b) => b.correct.length > 0);
}

interface PracticeRunnerProps {
	moduleData: Module;
	baseQuestions: Question[];
	onExit: () => void;
	glossaryEntries: GlobalGlossaryEntry[];
	glossaryEnabled: boolean;
}

function PracticeRunner({ moduleData, baseQuestions, onExit, glossaryEntries, glossaryEnabled }: PracticeRunnerProps) {
	const navigate = useNavigate();
	const { user } = useAuth();
	const [index, setIndex] = useState(0);
	const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
	const [correctMap, setCorrectMap] = useState<Record<string, boolean>>({});
	const [questionStartRef, setQuestionStartRef] = useState(Date.now());
	const [orderedQuestions, setOrderedQuestions] = useState<Question[]>([]);
	const [showFeedback, setShowFeedback] = useState(false);
	const [lastWasCorrect, setLastWasCorrect] = useState<boolean | null>(null);
	const [lastScorePercent, setLastScorePercent] = useState<number | null>(null);
	const [history, setHistory] = useState<{ id: string; correct: boolean; difficulty: Question['metadata']['difficulty'] | undefined }[]>([]);
	const [windowExpired, setWindowExpired] = useState(false);
	const practiceContentRef = useRef<HTMLDivElement | null>(null);
	const [reportDialogOpen, setReportDialogOpen] = useState(false);
	const [reportMessage, setReportMessage] = useState('');
	const [isSubmittingReport, setIsSubmittingReport] = useState(false);

	useEffect(() => {
		let active = true;
		(async () => {
			// Always work from the current set of module questions.
			// We no longer filter out "completed" questions so that edited/added
			// questions are always served in full and navigation can't get stuck
			// with an unexpectedly short question list.
			let qs = [...baseQuestions];
			
			// Check if there's saved progress from yesterday
			const userKey = user?.id ?? user?.username ?? null;
			const savedProgress = await getLastQuestionIndex(moduleData.id, userKey);
			let startIndex = 0;
			let finalOrder: Question[] = [];
			
			if (savedProgress && savedProgress.questionOrder.length > 0) {
				// If the saved question order length no longer matches the current
				// module questions (module was edited), discard saved progress and
				// start fresh from the current set to avoid premature exits.
				if (savedProgress.questionOrder.length !== qs.length) {
					if (moduleData.settings.randomizeQuestions) {
						qs = shuffleArray(qs);
					}
					finalOrder = qs;
					startIndex = 0;
					await clearProgress(moduleData.id, userKey);
				} else {
					// Restore the question order from saved progress
					const savedOrder = savedProgress.questionOrder
						.map(id => qs.find(q => q.id === id))
						.filter(Boolean) as Question[];

					// If saved order no longer matches any current questions (e.g. module was edited),
					// discard the saved progress and start fresh from the current question set.
					if (savedOrder.length === 0 && qs.length > 0) {
						if (moduleData.settings.randomizeQuestions) {
							qs = shuffleArray(qs);
						}
						finalOrder = qs;
						startIndex = 0;
						await clearProgress(moduleData.id, userKey);
					} else {
						// Add any new questions that weren't in the saved order
						const savedIds = new Set(savedOrder.map(q => q.id));
						const newQuestions = qs.filter(q => !savedIds.has(q.id));
						finalOrder = [...savedOrder, ...newQuestions];

						// If the saved index is now out of bounds (because questions changed),
						// reset progress so the user starts cleanly at the beginning.
						if (finalOrder.length === 0) {
							startIndex = 0;
							await clearProgress(moduleData.id, userKey);
						} else {
							const clampedIndex = Math.max(0, Math.min(savedProgress.index, finalOrder.length - 1));
							if (clampedIndex !== savedProgress.index) {
								// Saved index no longer valid for this question set
								startIndex = 0;
								await clearProgress(moduleData.id, userKey);
							} else {
								startIndex = clampedIndex;
							}
						}
					}
				}
			} else {
				// No saved progress, start fresh
				if (moduleData.settings.randomizeQuestions) {
					qs = shuffleArray(qs);
				}
				finalOrder = qs;
				startIndex = 0;
			}
			
			if (!active) return;
			setOrderedQuestions(finalOrder);
			setIndex(startIndex);
			setQuestionStartRef(Date.now());
		})();
		return () => { active = false; };
	}, [baseQuestions, moduleData.id, moduleData.settings.randomizeQuestions]);

	const current = orderedQuestions[index];
	const total = orderedQuestions.length;
	const showInstant = moduleData.settings.showInstantFeedback;
	const { handleGlossaryLookup, glossaryModal, closeGlossaryModal } = useQuestionGlossary(
		current,
		glossaryEntries,
		glossaryEnabled
	);

	const submitErrorReport = useCallback(async () => {
		if (!reportMessage.trim()) {
			toast.error('Please describe the issue.');
			return;
		}
		try {
			setIsSubmittingReport(true);
			const now = Date.now();
			await db.errorReports.add({
				id: uuidv4(),
				status: 'new',
				message: reportMessage.trim(),
				createdAt: now,
				updatedAt: now,
				route: location.pathname,
				moduleId: moduleData.id,
				moduleTitle: moduleData.title,
				questionId: current?.id,
				questionCode: current?.code,
				questionTags: current?.tags,
				attemptId: undefined,
				phase: 'practice',
				reporterUserId: user?.id,
				reporterUsername: user?.username,
			});
			setReportDialogOpen(false);
			setReportMessage('');
			toast.success('Report sent');
		} catch (e) {
			console.error(e);
			toast.error('Failed to submit report');
		} finally {
			setIsSubmittingReport(false);
		}
	}, [current, moduleData.id, moduleData.title, reportMessage, user?.id, user?.username]);

	const handleAnswerChange = (value: string | string[]) => {
		if (!current) return;
		setAnswers((prev) => ({ ...prev, [current.id]: value }));
	};

	const handleSubmitQuestion = async () => {
		if (!current) return;
		
		const answer = answers[current.id];
		const scoring = evaluateScore(current, answer);
		const isCorrect = scoring.isCorrect;
		setCorrectMap((prev) => ({ ...prev, [current.id]: isCorrect }));
		setLastScorePercent(scoring.scorePercent);
		setHistory((prev) => [...prev, { id: current.id, correct: isCorrect, difficulty: current.metadata?.difficulty }]);
		const timeTaken = Date.now() - questionStartRef;
		const attemptId = uuidv4();
		await db.attempts.add({
			id: attemptId,
			moduleId: moduleData.id,
			type: 'practice',
			startedAt: questionStartRef,
			endedAt: Date.now(),
			durationMs: timeTaken,
			score: scoring.scorePercent,
			perQuestionAttempts: [
				{
					questionId: current.id,
					userAnswer: Array.isArray(answer) ? answer : (answer ?? ''),
					isCorrect,
					timeTakenMs: timeTaken,
					timestamp: Date.now(),
					questionStartedAt: questionStartRef,
					questionIndexInModule: index,
					attemptNumberForQuestion: 1,
					integrityEvents: [],
					scorePercent: scoring.scorePercent,
					correctParts: scoring.correctParts,
					totalParts: scoring.totalParts,
				},
			],
			integrityEvents: [],
			timeRemainingMs: undefined,
			syncStatus: 'local',
			completed: true,
			userId: user?.id,
			userProfile: user ? { name: user.username } : undefined,
		} as Attempt);
		try {
			const updated = await db.attempts.get(attemptId);
			if (updated) {
				await recordDailyStats(updated, moduleData);
			}
		} catch {}
		setLastWasCorrect(isCorrect);
		setShowFeedback(true);
	};

	return (
		<div className="max-w-7xl mx-auto space-y-4 bg-white select-none" onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onPaste={(e) => e.preventDefault()}>
			<div className="space-y-2">
				<div className="flex items-center justify-between gap-4">
					<div />
					<Button
						variant="outline"
						size="sm"
						onClick={() => setReportDialogOpen(true)}
						className="bg-white"
					>
						<Bug className="h-4 w-4 mr-2" />
						Report issue
					</Button>
				</div>
				<div className="border-b border-white" />
			</div>

			<Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Report an issue</DialogTitle>
						<DialogDescription>
							Send a detailed description so the admin can fix it.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="space-y-1">
							<div className="text-xs text-muted-foreground">Issue description</div>
							<Textarea
								value={reportMessage}
								onChange={(e) => setReportMessage(e.target.value)}
								placeholder="Please describe the issue in detail (what you expected vs what happened, steps to reproduce, etc.)"
								className="min-h-[180px]"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setReportDialogOpen(false)}>
							Cancel
						</Button>
						<Button type="button" onClick={submitErrorReport} disabled={isSubmittingReport}>
							{isSubmittingReport ? 'Sending…' : 'Send report'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<div ref={practiceContentRef} className="space-y-4 pt-4 select-none" onDoubleClick={handleGlossaryLookup} onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onPaste={(e) => e.preventDefault()}>
				{windowExpired ? (
					<div className="space-y-4">
						<Card className="p-6 space-y-3">
							<h2 className="text-xl font-semibold">Time for this module is over</h2>
							<p className="text-sm text-muted-foreground">
								The availability window for this module has ended. Please come back tomorrow to continue
								practising questions from this module.
							</p>
						</Card>
						<div className="flex justify-end">
							<Button onClick={onExit}>Back to home</Button>
						</div>
					</div>
				) : current ? (
					<>
						{(() => {
							if (!current || current.type !== 'fill_blanks') {
								return <div className="text-xl md:text-2xl font-medium content-html tk-question-text" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(current?.text || '') }} />;
							}
							const meta = current.fillBlanks?.blanks?.length
								? current.fillBlanks.blanks
								: getFillBlanksMetaFromText(current);
							if (!meta.length) {
								return <div className="text-xl md:text-2xl font-medium content-html tk-question-text" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(current.text) }} />;
							}
							const qWithMeta: Question = {
								...current,
								fillBlanks: { blanks: meta },
							};
							return (
								<FillBlanksPassage
									question={qWithMeta}
									value={Array.isArray(answers[current.id]) ? (answers[current.id] as string[]) : []}
									onChange={(vals) => handleAnswerChange(vals)}
									disabled={showFeedback}
								/>
							);
						})()}
						{current.type === 'mcq' && (
							<div className="grid gap-y-4 gap-x-10 sm:grid-cols-2">
								{current.options?.map((opt, optIndex) => {
									const value = answers[current.id];
									const selected = Array.isArray(value)
										? (value as string[]).includes(opt.id)
										: value === opt.id;
									const multi = (current.correctAnswers?.length ?? 0) > 1;
									const optionLabel = String.fromCharCode(65 + optIndex); // A, B, C, etc.
									const isCorrectOpt = (current.correctAnswers || []).includes(opt.id);
									// When feedback is shown, highlight correct answers in green and wrong selected answers in red
									const borderClass = showFeedback
										? isCorrectOpt
											? 'border-green-600 bg-green-50'
											: selected && !isCorrectOpt
												? 'border-red-600 bg-red-50'
												: 'border-border'
										: selected
											? 'border-primary bg-primary/5'
											: 'border-border hover:bg-white';
									return (
										<button
											type="button"
											key={opt.id}
											disabled={showFeedback}
											className={`w-full h-full text-left rounded-md border p-3 transition-colors flex items-start gap-3 whitespace-normal break-words ${borderClass}`}
											onClick={() => {
												if (showFeedback) return;
												if (multi) {
													const current = Array.isArray(answers[current.id])
														? [...(answers[current.id] as string[])]
														: [];
													const exists = current.includes(opt.id);
													const next = exists ? current.filter((id) => id !== opt.id) : Array.from(new Set([...current, opt.id]));
													handleAnswerChange(next);
												} else {
													handleAnswerChange(opt.id);
												}
											}}
										>
											<span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-lg font-semibold ${
													selected ? 'border-primary text-primary bg-primary/10' : 'border-border/60 text-muted-foreground bg-white'
												}`}>
													{optionLabel}
												</span>
												<span className="flex-1 min-w-0 text-lg leading-relaxed content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(opt.text) }} />
											</button>
										);
									})}
								</div>
							)}
								{current.type === 'text' && (
									<Input
										value={(answers[current.id] as string) || ''}
										onChange={(e) => handleAnswerChange(e.target.value)}
										disabled={showFeedback}
										placeholder="Type your answer..."
										className="w-full max-w-sm h-12 px-3 text-lg border border-border/90 rounded-none"
									/>
								)}
								{current.type === 'matching' && current.matching && current.matching.pairs.length > 0 && (
									<MatchingQuestionSortable
										question={current}
										value={Array.isArray(answers[current.id]) ? (answers[current.id] as string[]) : []}
										onChange={(vals) => handleAnswerChange(vals)}
										disabled={showFeedback}
									/>
								)}
					<div className="flex items-center justify-end pt-4">
						<Button onClick={handleSubmitQuestion} disabled={showFeedback}>Submit</Button>
					</div>
						{showFeedback && (
							<div className="space-y-3">
								<div className={`${(lastScorePercent ?? (lastWasCorrect ? 100 : 0)) > 0
									? 'bg-gradient-to-r from-emerald-500/15 via-emerald-400/10 to-emerald-500/15 border-emerald-600 text-emerald-950'
									: 'bg-gradient-to-r from-red-500/15 via-red-400/10 to-red-500/15 border-red-600 text-red-950'} rounded-md border p-3 flex items-center justify-between`}>
									<div className="text-sm font-semibold">
										Score: {(() => {
											const pct = lastScorePercent ?? (lastWasCorrect === null ? 0 : (lastWasCorrect ? 100 : 0));
											return `${pct}%`;
										})()}
									</div>
									<Button
										variant="outline"
										onClick={async () => {
											// Check daily limit before moving to next question
											if (moduleData.type === 'practice') {
												const limitCheck = await checkDailyLimit(moduleData.id, user?.id);
												if (limitCheck.reached) {
													onExit();
													navigate(`/daily-limit/${moduleData.id}`);
													return;
												}
											}
											
											setShowFeedback(false);
											const nextIdx = index + 1;

											// If the module's availability window has ended while the learner
											// was answering this question, show a friendly message instead
											// of serving more questions.
											const nowTs = Date.now();
											let availabilityActive = true;
											const settings = moduleData.settings;
											if (settings) {
												const d = new Date(nowTs);
												const day = d.getDay();
												const minutes = d.getHours() * 60 + d.getMinutes();
												const allowedDays = settings.allowedDaysOfWeek;
												const window = settings.allowedTimeWindow;

												if (Array.isArray(allowedDays) && allowedDays.length > 0 && !allowedDays.includes(day)) {
													availabilityActive = false;
												}

												if (
													window &&
													typeof window.startMinutes === 'number' &&
													typeof window.endMinutes === 'number' &&
													window.endMinutes > window.startMinutes
												) {
													if (minutes < window.startMinutes || minutes >= window.endMinutes) {
														availabilityActive = false;
													}
												}
											}

											if (!availabilityActive) {
												setWindowExpired(true);
												return;
											}

											// Save progress before moving to next question
											if (nextIdx < total) {
												const questionOrder = orderedQuestions.map(q => q.id);
												const userKey = user?.id ?? user?.username ?? null;
												await setLastQuestionIndex(moduleData.id, userKey, nextIdx, questionOrder);
											}
											
											if (nextIdx >= total) {
												// All questions completed - clear progress tracking
												const userKey = user?.id ?? user?.username ?? null;
												await clearProgress(moduleData.id, userKey);
												onExit();
												return;
											}
											setIndex(nextIdx);
											setQuestionStartRef(Date.now());
										}}
									>
										Next
									</Button>
								</div>
								{current.type === 'mcq' && current.correctAnswers && current.correctAnswers.length > 0 && (
									<div className="bg-white border border-border rounded-md p-3">
										<div className="text-sm font-semibold text-green-700 mb-2">Correct Answer:</div>
										<div className="text-lg">
											{current.options
												?.filter(opt => current.correctAnswers?.includes(opt.id))
												.map((opt, idx) => {
													const optIndex = current.options?.indexOf(opt) ?? 0;
													const optionLabel = String.fromCharCode(65 + optIndex);
													return (
														<span key={opt.id}>
															{idx > 0 && ', '}
															<span className="font-semibold">{optionLabel}</span>
														</span>
													);
												})}
										</div>
									</div>
								)}
								{current.type === 'text' && current.correctAnswers && current.correctAnswers.length > 0 && (
									<div className="bg-white border border-border rounded-md p-3">
										<div className="text-sm font-semibold text-green-700 mb-2">Correct Answer:</div>
										<div className="text-lg">
											{current.correctAnswers.map((ans, idx) => (
												<span key={idx}>
													{idx > 0 && ', '}
													<span className="font-semibold">{ans}</span>
												</span>
											))}
										</div>
									</div>
								)}
								{current.explanation && (
									<div className="bg-white border border-border rounded-md p-3">
										<div className="text-base font-semibold mb-1">Explanation</div>
										<div className="prose prose-base md:prose-lg max-w-none content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(current.explanation || '') }} />
									</div>
								)}
							</div>
						)}
					</>
				) : (
					<div>No questions available.</div>
				)}
			</div>
			<Dialog open={!!glossaryModal} onOpenChange={(open) => { if (!open) closeGlossaryModal(); }}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>{glossaryModal?.word}</DialogTitle>
						<DialogDescription>Referenced word meaning</DialogDescription>
					</DialogHeader>
					<ul className="list-disc pl-4 space-y-2 text-sm text-foreground">
						{glossaryModal?.meanings.map((meaning, idx) => (
							<li key={`${meaning}-${idx}`} className="whitespace-pre-wrap">
								{meaning}
							</li>
						))}
					</ul>
					<DialogFooter>
						<Button type="button" onClick={closeGlossaryModal}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function evaluateScore(q: Question, answer: any): { isCorrect: boolean; scorePercent: number; correctParts: number; totalParts: number } {
	// Multiple choice uses option IDs; require exact set match
	if (q.type === 'mcq') {
		if (!q.correctAnswers || q.correctAnswers.length === 0) {
			return { isCorrect: false, scorePercent: 0, correctParts: 0, totalParts: 0 };
		}
		const expected = new Set(q.correctAnswers);
		const given = new Set(Array.isArray(answer) ? answer : [answer].filter(Boolean));
		let isCorrect = expected.size === given.size;
		if (isCorrect) {
			for (const v of expected) {
				if (!given.has(v)) {
					isCorrect = false;
					break;
				}
			}
		}
		const scorePercent = isCorrect ? 100 : 0;
		return { isCorrect, scorePercent, correctParts: isCorrect ? 1 : 0, totalParts: 1 };
	}

	// Fill in the blanks: compare each blank against metadata
	if (q.type === 'fill_blanks') {
		let blanks = q.fillBlanks?.blanks ?? [];
		if (!blanks.length) {
			blanks = getFillBlanksMetaFromText(q);
		}
		if (!blanks.length) {
			return { isCorrect: false, scorePercent: 0, correctParts: 0, totalParts: 0 };
		}
		const values: string[] = Array.isArray(answer) ? answer : [];
		let correctParts = 0;
		for (let i = 0; i < blanks.length; i++) {
			const expected = blanks[i].correct.trim().toLowerCase();
			const given = (values[i] || '').toString().trim().toLowerCase();
			if (expected && expected === given) {
				correctParts++;
			}
		}
		const totalParts = blanks.length;
		const scorePercent = totalParts > 0 ? Math.round((correctParts / totalParts) * 100) : 0;
		const isCorrect = scorePercent === 100;
		return { isCorrect, scorePercent, correctParts, totalParts };
	}

	// Matching: answer is array of rightIds aligned with pairs
	if (q.type === 'matching' && q.matching && q.matching.pairs.length > 0) {
		const pairs = q.matching.pairs;
		const values: string[] = Array.isArray(answer) ? answer : [];
		let correctParts = 0;
		for (let i = 0; i < pairs.length; i++) {
			const expectedId = pairs[i].rightId;
			if (expectedId && values[i] === expectedId) {
				correctParts++;
			}
		}
		const totalParts = pairs.length;
		const scorePercent = totalParts > 0 ? Math.round((correctParts / totalParts) * 100) : 0;
		const isCorrect = scorePercent === 100;
		return { isCorrect, scorePercent, correctParts, totalParts };
	}

	// Free text: compare against list of acceptable answers
	if (!q.correctAnswers || q.correctAnswers.length === 0) {
		return { isCorrect: false, scorePercent: 0, correctParts: 0, totalParts: 0 };
	}
	const ans = (answer || '').toString().trim().toLowerCase();
	const isCorrect = q.correctAnswers.some((c) => c.trim().toLowerCase() === ans);
	const scorePercent = isCorrect ? 100 : 0;
	return { isCorrect, scorePercent, correctParts: isCorrect ? 1 : 0, totalParts: 1 };
}

function getTotalPartsForQuestion(q: Question): number {
	if (q.type === 'fill_blanks' && q.fillBlanks) {
		return q.fillBlanks.blanks.length;
	}
	if (q.type === 'matching' && q.matching) {
		return q.matching.pairs.length;
	}
	return 1;
}

function evaluateCorrect(q: Question, answer: any): boolean {
	const scoring = evaluateScore(q, answer);
	return scoring.isCorrect;
}

type GlossaryModalState = { word: string; meanings: string[] };

function useQuestionGlossary(
	question: Question | undefined,
	globalEntries: GlobalGlossaryEntry[],
	enabled: boolean
) {
	const [modal, setModal] = useState<GlossaryModalState | null>(null);
	const glossaryMap = useMemo(() => buildGlossaryMap(question, globalEntries), [question, globalEntries]);

	const handleGlossaryLookup = useCallback(() => {
		if (!enabled) return;
		if (typeof window === 'undefined') return;
		const selection = window.getSelection();
		const selectedWord = selection?.toString().trim();
		if (!selectedWord) return;
		const normalized = normalizeGlossaryWord(selectedWord);
		if (!normalized) return;
		const entry = glossaryMap.get(normalized);
		if (entry && entry.meanings.length > 0) {
			setModal({
				word: entry.word,
				meanings: entry.meanings,
			});
		}
	}, [enabled, glossaryMap]);

	const closeGlossaryModal = useCallback(() => setModal(null), []);

	return {
		glossaryModal: modal,
		closeGlossaryModal,
		handleGlossaryLookup: enabled ? handleGlossaryLookup : undefined,
	};
}

function buildGlossaryMap(
	question: Question | undefined,
	globalEntries: GlobalGlossaryEntry[]
): Map<string, { word: string; meanings: string[] }> {
	const map = new Map<string, { word: string; meanings: string[] }>();
	const addEntry = (word?: string, meaning?: string) => {
		if (!word || !meaning) return;
		const normalizedWord = normalizeGlossaryWord(word);
		const normalizedMeaning = normalizeGlossaryMeaning(meaning);
		if (!normalizedWord || !normalizedMeaning) return;
		const existing = map.get(normalizedWord);
		if (existing) {
			if (!existing.meanings.some((m) => normalizeGlossaryMeaning(m) === normalizedMeaning)) {
				existing.meanings.push(meaning);
			}
		} else {
			map.set(normalizedWord, { word, meanings: [meaning] });
		}
	};

	(question?.glossary ?? []).forEach((entry) => addEntry(entry.word, entry.meaning));
	globalEntries.forEach((entry) => addEntry(entry.word, entry.meaning));

	return map;
}

function shuffleArray<T>(arr: T[]): T[] {
	const copy = [...arr];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}
