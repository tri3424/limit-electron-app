import { db, Module, Attempt, ReviewInteraction } from './db';
import { v4 as uuidv4 } from 'uuid';

/**
 * Checks if an exam is in review phase
 */
export function isInReviewPhase(module: Module, now: number): boolean {
  if (module.type !== 'exam' || !module.scheduledEndUtc) return false;
  if (!module.settings.allowReview || !module.settings.reviewDurationSeconds) return false;
  
  const reviewEndTime = module.scheduledEndUtc + (module.settings.reviewDurationSeconds * 1000);
  return now >= module.scheduledEndUtc && now < reviewEndTime;
}

/**
 * Checks if review phase has expired
 */
export function isReviewExpired(module: Module, now: number): boolean {
  if (module.type !== 'exam' || !module.scheduledEndUtc) return false;
  if (!module.settings.allowReview || !module.settings.reviewDurationSeconds) return false;
  
  const reviewEndTime = module.scheduledEndUtc + (module.settings.reviewDurationSeconds * 1000);
  return now >= reviewEndTime;
}

/**
 * Gets review time remaining in milliseconds
 */
export function getReviewTimeRemaining(module: Module, now: number): number {
  if (!isInReviewPhase(module, now)) return 0;
  const reviewEndTime = module.scheduledEndUtc! + (module.settings.reviewDurationSeconds! * 1000);
  return Math.max(0, reviewEndTime - now);
}

/**
 * Records that a student reviewed a question
 */
export async function recordReviewInteraction(
  attemptId: string,
  moduleId: string,
  userId: string,
  questionId: string
): Promise<void> {
  // Check if already recorded
  const existing = await db.reviewInteractions
    .where('[attemptId+questionId]')
    .equals([attemptId, questionId])
    .first();
  
  if (!existing) {
    await db.reviewInteractions.add({
      id: uuidv4(),
      attemptId,
      moduleId,
      userId,
      questionId,
      timestamp: Date.now(),
    } as ReviewInteraction);
  }
}

/**
 * Gets all reviewed question IDs for an attempt
 */
export async function getReviewedQuestionIds(attemptId: string): Promise<Set<string>> {
  const interactions = await db.reviewInteractions
    .where('attemptId')
    .equals(attemptId)
    .toArray();
  
  return new Set(interactions.map(i => i.questionId));
}

/**
 * Checks if all questions have been reviewed
 */
export async function areAllQuestionsReviewed(attemptId: string, totalQuestions: number): Promise<boolean> {
  const reviewedIds = await getReviewedQuestionIds(attemptId);
  return reviewedIds.size >= totalQuestions;
}

/**
 * Finalizes exam attempt at end time - marks unattempted questions and applies no negative marking
 */
export async function finalizeExamAtEndTime(
  attempt: Attempt,
  questions: any[],
  examEndTime: number
): Promise<void> {
  if (attempt.completed || attempt.finalized) return;
  
  const now = examEndTime;
  const answers = attempt.answers ?? {};
  
  // Build perQuestionAttempts with no negative marking
  const perQuestionAttempts = questions.map((q, idx) => {
    const ans = answers[q.id];
    const hasAnswer = ans !== undefined && ans !== null && ans !== '' && 
      (Array.isArray(ans) ? (ans as string[]).length > 0 : true);
    
    // No negative marking: correct = positive, incorrect = zero, unattempted = unattempted
    let scorePercent = 0;
    let isCorrect: boolean | undefined = undefined;
    
    if (hasAnswer) {
      // Evaluate answer
      const scoring = evaluateScore(q, ans);
      isCorrect = scoring.isCorrect;
      scorePercent = isCorrect ? scoring.scorePercent : 0; // No negative marking
    }
    
    // Try to get questionStartedAt from existing perQuestionAttempts or currentQuestionTimerState
    // Note: questionStartedAt should be recorded when questions are viewed, but if missing,
    // we use attempt start time as a fallback (though this is less accurate)
    const existingAttempt = attempt.perQuestionAttempts?.find(pqa => pqa.questionId === q.id);
    const questionStartedAt = existingAttempt?.questionStartedAt ?? 
      (attempt.currentQuestionTimerState?.questionId === q.id ? attempt.currentQuestionTimerState.startUtc : undefined) ??
      attempt.startedAt; // Fallback to attempt start time
    
    return {
      questionId: q.id,
      userAnswer: hasAnswer ? (Array.isArray(ans) ? ans : (ans ?? '')) : (q.type === 'matching' || q.type === 'fill_blanks' ? [] : ''),
      // For unattempted questions, isCorrect should be undefined, not false
      isCorrect,
      timeTakenMs: 0,
      timestamp: now,
      questionStartedAt,
      questionIndexInModule: idx,
      attemptNumberForQuestion: 1,
      integrityEvents: [],
      status: (hasAnswer ? 'attempted' : 'unattempted') as 'attempted' | 'unattempted',
      autosubmitted: !hasAnswer,
      scorePercent,
      correctParts: isCorrect ? (isCorrect ? 1 : 0) : 0,
      totalParts: 1,
    };
  });
  
  // Calculate score (only correct answers contribute)
  const scoredQuestions = perQuestionAttempts.filter((a) => typeof a.scorePercent === 'number');
  const score = scoredQuestions.length > 0
    ? Math.round(scoredQuestions.reduce((sum, a) => sum + (a.scorePercent || 0), 0) / scoredQuestions.length)
    : 0;
  
  // Finalize the attempt
  await db.attempts.update(attempt.id, {
    perQuestionAttempts,
    endedAt: now,
    durationMs: now - attempt.startedAt,
    score,
    completed: true,
    finalized: true,
  });
}

// Helper function for scoring (simplified version - should match ModuleRunner's evaluateScore)
function evaluateScore(q: any, answer: any): { isCorrect: boolean; scorePercent: number; correctParts: number; totalParts: number } {
  if (q.type === 'mcq') {
    if (!q.correctAnswers || q.correctAnswers.length === 0) {
      return { isCorrect: false, scorePercent: 0, correctParts: 0, totalParts: 1 };
    }
    const userAnswers = Array.isArray(answer) ? answer : [answer];
    const correctSet = new Set(q.correctAnswers);
    const userSet = new Set(userAnswers.filter(Boolean));
    const isCorrect = correctSet.size === userSet.size && 
      Array.from(correctSet).every(id => userSet.has(id));
    return { isCorrect, scorePercent: isCorrect ? 100 : 0, correctParts: isCorrect ? 1 : 0, totalParts: 1 };
  }
  
  if (q.type === 'text') {
    if (!q.correctAnswers || q.correctAnswers.length === 0) {
      return { isCorrect: false, scorePercent: 0, correctParts: 0, totalParts: 1 };
    }
    const userAnswer = (answer || '').toString().trim().toLowerCase();
    const isCorrect = q.correctAnswers.some((correct: string) => 
      correct.toString().trim().toLowerCase() === userAnswer
    );
    return { isCorrect, scorePercent: isCorrect ? 100 : 0, correctParts: isCorrect ? 1 : 0, totalParts: 1 };
  }
  
  if (q.type === 'fill_blanks') {
    if (!q.fillBlanks?.blanks || q.fillBlanks.blanks.length === 0) {
      return { isCorrect: false, scorePercent: 0, correctParts: 0, totalParts: 1 };
    }
    const userAnswers = Array.isArray(answer) ? answer : [];
    const blanks = q.fillBlanks.blanks;
    let correctCount = 0;
    for (let i = 0; i < blanks.length; i++) {
      const userAns = (userAnswers[i] || '').toString().trim().toLowerCase();
      const correctAns = (blanks[i].correct || '').toString().trim().toLowerCase();
      if (userAns === correctAns) correctCount++;
    }
    const totalParts = blanks.length;
    const isCorrect = correctCount === totalParts;
    const scorePercent = totalParts > 0 ? Math.round((correctCount / totalParts) * 100) : 0;
    return { isCorrect, scorePercent, correctParts: correctCount, totalParts };
  }
  
  if (q.type === 'matching') {
    if (!q.matching?.pairs || q.matching.pairs.length === 0) {
      return { isCorrect: false, scorePercent: 0, correctParts: 0, totalParts: 1 };
    }
    const userAnswers = Array.isArray(answer) ? answer : [];
    const pairs = q.matching.pairs;
    const correctOrder = pairs.map(p => p.rightId);
    let correctCount = 0;
    for (let i = 0; i < Math.min(userAnswers.length, correctOrder.length); i++) {
      if (userAnswers[i] === correctOrder[i]) correctCount++;
    }
    const totalParts = pairs.length;
    const isCorrect = correctCount === totalParts;
    const scorePercent = totalParts > 0 ? Math.round((correctCount / totalParts) * 100) : 0;
    return { isCorrect, scorePercent, correctParts: correctCount, totalParts };
  }
  
  // Add other question types as needed
  return { isCorrect: false, scorePercent: 0, correctParts: 0, totalParts: 1 };
}
