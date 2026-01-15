import { db } from './db';
import { getDailyStatsSummaryForModule } from './statsHelpers';

/**
 * Checks if the daily question limit has been reached for a specific module
 * @param moduleId The module ID to check
 * @param userId Optional user ID - when provided, the limit is enforced per student
 * @returns Object with { reached: boolean, current: number, limit: number }
 */
export async function checkDailyLimit(moduleId: string, userId?: string | null): Promise<{
  reached: boolean;
  current: number;
  limit: number;
}> {
  const module = await db.modules.get(moduleId);
  
  if (!module) {
    return { reached: false, current: 0, limit: 0 };
  }
  
  // Check module-specific daily limit
  if (!module.settings.dailyLimit?.enabled) {
    return { reached: false, current: 0, limit: 0 };
  }
  
  const limit = module.settings.dailyLimit.maxQuestionsPerDay;
  const today = new Date().toISOString().slice(0, 10);

  let current = 0;

  if (userId) {
    // Per-student enforcement: count questions for this module and user today
    const attempts = await db.attempts
      .where('moduleId')
      .equals(moduleId)
      .and((a) => a.userId === userId)
      .toArray();

    const toDateString = (ts: number | undefined) =>
      ts ? new Date(ts).toISOString().slice(0, 10) : '';

    for (const a of attempts) {
      const per = a.perQuestionAttempts || [];
      for (const p of per) {
        const day = toDateString(p.timestamp);
        if (day === today) {
          current += 1;
        }
      }
    }
  } else {
    // Fallback: aggregate across all students (legacy behaviour, used only when no user context)
    const summary = await getDailyStatsSummaryForModule(today, moduleId);
    current = summary?.totalQuestionsDone || 0;
  }
  
  return {
    reached: current >= limit,
    current,
    limit,
  };
}

