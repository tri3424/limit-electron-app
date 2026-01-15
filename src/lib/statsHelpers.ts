import { db, Attempt, Module } from './db';
import { DailyStats, DailyStatsSummary } from './statsTypes';
import { v4 as uuidv4 } from 'uuid';

export type { DailyStats, DailyStatsSummary };

export async function recordDailyStats(attempt: Attempt, module: Module): Promise<void> {
  if (!attempt.completed || !attempt.perQuestionAttempts) return;
  const date = new Date(attempt.endedAt ?? attempt.startedAt).toISOString().slice(0, 10);
  const existing = await db.dailyStats.where('[date+moduleId]').equals([date, module.id]).first();
  const questionsDone = attempt.perQuestionAttempts.length;
  const totalCorrect = attempt.perQuestionAttempts.filter((a) => a.isCorrect).length;
  const totalTimeMs = attempt.durationMs ?? 0;
  const questionIds = attempt.perQuestionAttempts.map((a) => a.questionId);
  if (existing) {
    await db.dailyStats.update(existing.id, {
      questionsDone: existing.questionsDone + questionsDone,
      totalCorrect: existing.totalCorrect + totalCorrect,
      totalTimeMs: existing.totalTimeMs + totalTimeMs,
      attemptsCompleted: existing.attemptsCompleted + 1,
      questionIds: Array.from(new Set([...existing.questionIds, ...questionIds])),
    });
  } else {
    await db.dailyStats.add({
      id: uuidv4(),
      date,
      moduleId: module.id,
      moduleType: module.type,
      questionsDone,
      totalCorrect,
      totalTimeMs,
      attemptsCompleted: 1,
      questionIds,
      createdAt: Date.now(),
    } as DailyStats);
  }
}

export async function getDailyStatsSummary(date: string): Promise<DailyStatsSummary | null> {
  const dayStats = await db.dailyStats.where('date').equals(date).toArray();
  if (!dayStats.length) return null;
  const moduleIds = dayStats.map((s) => s.moduleId);
  const modules = await db.modules.bulkGet(moduleIds);
  const moduleMap = new Map(modules.filter(Boolean).map((m) => [m!.id, m!]));
  const totalQuestionsDone = dayStats.reduce((sum, s) => sum + s.questionsDone, 0);
  const totalCorrect = dayStats.reduce((sum, s) => sum + s.totalCorrect, 0);
  const totalTimeMs = dayStats.reduce((sum, s) => sum + s.totalTimeMs, 0);
  const attemptsCompleted = dayStats.reduce((sum, s) => sum + s.attemptsCompleted, 0);
  const accuracy = totalQuestionsDone > 0 ? Math.round((totalCorrect / totalQuestionsDone) * 100) : 0;
  const averageTimePerQuestionMs = totalQuestionsDone > 0 ? Math.round(totalTimeMs / totalQuestionsDone) : 0;
  const moduleBreakdown = dayStats.map((s) => {
    const mod = moduleMap.get(s.moduleId);
    return {
      moduleId: s.moduleId,
      moduleTitle: mod?.title ?? 'Unknown',
      moduleType: s.moduleType,
      questionsDone: s.questionsDone,
      totalCorrect: s.totalCorrect,
      totalTimeMs: s.totalTimeMs,
      attemptsCompleted: s.attemptsCompleted,
    };
  });
  return {
    date,
    totalQuestionsDone,
    totalCorrect,
    accuracy,
    averageTimePerQuestionMs,
    attemptsCompleted,
    examModulesCount: dayStats.filter((s) => s.moduleType === 'exam').length,
    practiceModulesCount: dayStats.filter((s) => s.moduleType === 'practice').length,
    moduleBreakdown,
  };
}

export async function listDailyStatsDates(limit = 30): Promise<string[]> {
  const uniqueDates = await db.dailyStats.orderBy('date').uniqueKeys();
  return (uniqueDates as string[]).sort().slice(-limit);
}

export async function listDailyStatsDatesForModule(moduleId: string, limit = 30): Promise<string[]> {
	const rows = await db.dailyStats.where('moduleId').equals(moduleId).toArray();
	if (!rows.length) return [];
	const uniqueDates = Array.from(new Set(rows.map((r) => r.date))).sort();
	return uniqueDates.slice(-limit);
}

// Clear all dailyStats records used by the View Stats feature
export async function clearAllDailyStats(): Promise<void> {
  await db.dailyStats.clear();
}

export type DayQuestionDetail = {
  questionId: string;
  questionText: string;
  questionCode?: string;
  questionType?: 'mcq' | 'text' | 'matching' | 'fill_blanks';
  moduleId: string;
  moduleTitle: string;
  moduleType?: 'exam' | 'practice';
  userAnswer: string;
  correctAnswer: string;
  isCorrect?: boolean;
  explanationHtml?: string;
  startedAt: number;
  submittedAt: number;
  questionOptions?: Array<{ id: string; text: string }>; // For MCQ questions
  userAnswerIds?: string | string[]; // User's selected option IDs for MCQ, or ordered rightIds for matching
  correctAnswerIds?: string[]; // Correct option IDs for MCQ, or correct rightIds for matching
  questionMatching?: { // For matching questions
    headingHtml?: string;
    pairs: {
      leftId: string;
      leftText: string;
      rightId: string;
      rightText: string;
    }[];
  };
  questionFillBlanks?: { // For fill-blanks questions
    blanks: {
      id: string;
      correct: string;
    }[];
    userAnswers?: string[]; // User's answers for each blank
  };
  // Optional student info for this attempt
  userId?: string;
  username?: string;
};

function toDateString(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

export async function getDailyStatsSummaryForModule(date: string, moduleId: string): Promise<DailyStatsSummary | null> {
	const dayStats = await db.dailyStats.where('[date+moduleId]').equals([date, moduleId]).toArray();
	if (!dayStats.length) return null;
	const moduleIds = dayStats.map((s) => s.moduleId);
	const modules = await db.modules.bulkGet(moduleIds);
	const moduleMap = new Map(modules.filter(Boolean).map((m) => [m!.id, m!]));
	const totalQuestionsDone = dayStats.reduce((sum, s) => sum + s.questionsDone, 0);
	const totalCorrect = dayStats.reduce((sum, s) => sum + s.totalCorrect, 0);
	const totalTimeMs = dayStats.reduce((sum, s) => sum + s.totalTimeMs, 0);
	const attemptsCompleted = dayStats.reduce((sum, s) => sum + s.attemptsCompleted, 0);
	const accuracy = totalQuestionsDone > 0 ? Math.round((totalCorrect / totalQuestionsDone) * 100) : 0;
	const averageTimePerQuestionMs = totalQuestionsDone > 0 ? Math.round(totalTimeMs / totalQuestionsDone) : 0;
	const moduleBreakdown = dayStats.map((s) => {
		const mod = moduleMap.get(s.moduleId);
		return {
			moduleId: s.moduleId,
			moduleTitle: mod?.title ?? 'Unknown',
			moduleType: s.moduleType,
			questionsDone: s.questionsDone,
			totalCorrect: s.totalCorrect,
			totalTimeMs: s.totalTimeMs,
			attemptsCompleted: s.attemptsCompleted,
		};
	});
	return {
		date,
		totalQuestionsDone,
		totalCorrect,
		accuracy,
		averageTimePerQuestionMs,
		attemptsCompleted,
		examModulesCount: dayStats.filter((s) => s.moduleType === 'exam').length,
		practiceModulesCount: dayStats.filter((s) => s.moduleType === 'practice').length,
		moduleBreakdown,
	};
}

export async function getDailyStatsSummaryForModuleAndUsers(
	date: string,
	moduleId: string,
	userIds: string[],
): Promise<DailyStatsSummary | null> {
	if (!userIds.length) {
		return getDailyStatsSummaryForModule(date, moduleId);
	}

	const attempts = await db.attempts
		.where('moduleId')
		.equals(moduleId)
		.toArray();

	const filtered = attempts.filter((a) => {
		const endOrStart = a.endedAt ?? a.startedAt;
		if (!endOrStart) return false;
		if (!a.userId || !userIds.includes(a.userId)) return false;
		return toDateString(endOrStart) === date;
	});

	if (!filtered.length) {
		return null;
	}

	const questionsDone = filtered.reduce(
		(sum, a) => sum + (a.perQuestionAttempts ? a.perQuestionAttempts.length : 0),
		0,
	);
	const totalCorrect = filtered.reduce(
		(sum, a) =>
			sum +
			(a.perQuestionAttempts
				? a.perQuestionAttempts.filter((p) => p.isCorrect).length
				: 0),
		0,
	);
	const totalTimeMs = filtered.reduce(
		(sum, a) => sum + (a.durationMs ?? 0),
		0,
	);
	const attemptsCompleted = filtered.length;
	const accuracy =
		questionsDone > 0 ? Math.round((totalCorrect / questionsDone) * 100) : 0;
	const averageTimePerQuestionMs =
		questionsDone > 0 ? Math.round(totalTimeMs / questionsDone) : 0;

	return {
		date,
		totalQuestionsDone: questionsDone,
		totalCorrect,
		accuracy,
		averageTimePerQuestionMs,
		attemptsCompleted,
		examModulesCount: filtered.filter((a) => a.type === 'exam').length,
		practiceModulesCount: filtered.filter((a) => a.type === 'practice').length,
		moduleBreakdown: [
			{
				moduleId,
				moduleTitle: '',
				moduleType: filtered[0]?.type === 'exam' ? 'exam' : 'practice',
				questionsDone,
				totalCorrect,
				totalTimeMs,
				attemptsCompleted,
			},
		],
	};
}

export async function getDayQuestionDetails(
  date: string,
  opts?: { moduleId?: string; userIds?: string[] },
): Promise<DayQuestionDetail[]> {
  const attempts = await db.attempts.toArray();
  const filtered = attempts.filter((a) => {
    const endOrStart = a.endedAt ?? a.startedAt;
    if (!endOrStart) return false;
    if (opts?.moduleId && a.moduleId !== opts.moduleId) return false;
    if (opts?.userIds && opts.userIds.length > 0) {
      if (!a.userId || !opts.userIds.includes(a.userId)) return false;
    }
    return toDateString(endOrStart) === date || (a.perQuestionAttempts || []).some((p) => toDateString(p.timestamp) === date);
  });
  if (!filtered.length) return [];
  const moduleIds = Array.from(new Set(filtered.map((a) => a.moduleId)));
  const modules = await db.modules.bulkGet(moduleIds);
  const moduleMap = new Map(modules.filter(Boolean).map((m) => [m!.id, m!]));

  // Collect all questionIds we need to resolve answers for MCQ
  const allQuestionIds = Array.from(new Set(filtered.flatMap((a) => (a.perQuestionAttempts || []).map((p) => p.questionId))));
  const questions = await db.questions.bulkGet(allQuestionIds);
  const questionMap = new Map(questions.filter(Boolean).map((q) => [q!.id, q!]));

  // Load user records for any attempts that are associated with a specific user
  const userIds = Array.from(
    new Set(
      filtered
        .map((a) => a.userId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );
  const users = userIds.length ? await db.users.bulkGet(userIds) : [];
  const userMap = new Map(users.filter(Boolean).map((u) => [u!.id, u!]));

  const details: DayQuestionDetail[] = [];
  for (const a of filtered) {
    const mod = moduleMap.get(a.moduleId);
    const per = a.perQuestionAttempts || [];
    for (const p of per) {
      if (toDateString(p.timestamp) !== date) continue;
      const q = questionMap.get(p.questionId);
      const questionText = q?.text ?? 'Unknown question';
      const questionCode = q?.code;
      const questionType = q?.type as 'mcq' | 'text' | 'matching' | 'fill_blanks' | undefined;
      // Prefer the per-question attempt's recorded answer; fall back to the attempt.answers map if needed
      const rawAns = p.userAnswer ?? (a.answers || {})[p.questionId];
      let userAnswer = '';
      let userAnswerIds: string | string[] | undefined;
      let userAnswersArray: string[] | undefined;
      
      if (q?.type === 'matching') {
        // For matching, rawAns is an array of rightIds in order
        if (Array.isArray(rawAns)) {
          userAnswerIds = rawAns;
          // Create a readable string representation
          const pairs = q.matching?.pairs || [];
          userAnswer = rawAns.map((rightId, idx) => {
            const pair = pairs[idx];
            const rightItem = pairs.find(p => p.rightId === rightId);
            return pair ? `${pair.leftText} → ${rightItem?.rightText || rightId}` : '';
          }).filter(Boolean).join('; ');
        } else {
          userAnswer = '—';
        }
      } else if (q?.type === 'fill_blanks') {
        // For fill-blanks, rawAns is an array of answers
        if (Array.isArray(rawAns)) {
          userAnswersArray = rawAns;
          userAnswer = rawAns.join(', ');
        } else if (typeof rawAns === 'string' && rawAns.trim().length > 0) {
          userAnswersArray = [rawAns];
          userAnswer = rawAns;
        } else {
          userAnswer = '—';
        }
      } else if (Array.isArray(rawAns)) {
        // MCQ with multiple answers
        userAnswer = rawAns
          .map((id) => q?.options?.find((o) => o.id === id)?.text || id)
          .join(', ');
        userAnswerIds = rawAns;
      } else if (typeof rawAns === 'string' && rawAns.trim().length > 0) {
        userAnswer = rawAns;
        if (q?.type === 'mcq') {
          userAnswerIds = rawAns;
        }
      } else {
        userAnswer = '—';
      }
      
      // Resolve correct answers into human-readable text
      let correctAnswer = '';
      if (q?.type === 'matching') {
        const pairs = q.matching?.pairs || [];
        correctAnswer = pairs.map(p => `${p.leftText} → ${p.rightText}`).join('; ');
      } else if (q?.type === 'fill_blanks') {
        const blanks = q.fillBlanks?.blanks || [];
        correctAnswer = blanks.map(b => b.correct).join(', ');
      } else if (q?.correctAnswers && q.correctAnswers.length) {
        if (q.type === 'mcq' && q.options) {
          correctAnswer = q.correctAnswers
            .map((id) => q.options!.find((o) => o.id === id)?.text || id)
            .join(', ');
        } else {
          correctAnswer = q.correctAnswers.join(', ');
        }
      }
      
      // For unattempted questions, isCorrect should be undefined, not false
      const isCorrect = p.status === 'unattempted' ? undefined : (typeof p.isCorrect === 'boolean' ? p.isCorrect : undefined);
      const submittedAt = p.timestamp;
      // Prefer questionStartedAt if available, otherwise calculate from timeTakenMs
      const startedAt = p.questionStartedAt ?? (p.timeTakenMs ? p.timestamp - p.timeTakenMs : p.timestamp);
      
      const userId = a.userId;
      const user = userId ? userMap.get(userId) : undefined;
      const username =
        (user && (user as any).username) ||
        (a.userProfile && a.userProfile.name) ||
        undefined;

      details.push({
        questionId: p.questionId,
        questionText,
        questionCode,
        questionType,
        moduleId: a.moduleId,
        moduleTitle: mod?.title ?? 'Unknown',
        moduleType: mod?.type,
        userAnswer,
        correctAnswer,
        isCorrect,
        explanationHtml: q?.explanation,
        startedAt,
        submittedAt,
        questionOptions: q?.type === 'mcq' ? q.options : undefined,
        userAnswerIds,
        correctAnswerIds: q?.type === 'matching' ? q.matching?.pairs.map(p => p.rightId) : q?.correctAnswers,
        questionMatching: q?.type === 'matching' ? q.matching : undefined,
        questionFillBlanks: q?.type === 'fill_blanks'
          ? {
              blanks: q.fillBlanks?.blanks || [],
              userAnswers: userAnswersArray,
            }
          : undefined,
        userId,
        username,
      });
    }
  }
  // Sort by submit timestamp descending so the most recent answers appear first
  details.sort((x, y) => y.submittedAt - x.submittedAt);
  return details;
}
