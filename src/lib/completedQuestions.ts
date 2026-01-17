import { db } from './db';

/**
 * Gets all question IDs that have been completed for a specific module
 * @param moduleId The module ID
 * @returns Set of completed question IDs
 */
export async function getCompletedQuestionIds(moduleId: string): Promise<Set<string>> {
  const attempts = await db.attempts
    .where('moduleId')
    .equals(moduleId)
    .and(a => a.completed === true)
    .toArray();

  const completedIds = new Set<string>();
  
  for (const attempt of attempts) {
    if (attempt.perQuestionAttempts) {
      for (const perQuestionAttempt of attempt.perQuestionAttempts) {
        // Consider a question completed if it has been attempted
        if (perQuestionAttempt.questionId) {
          completedIds.add(perQuestionAttempt.questionId);
        }
      }
    }
  }

  return completedIds;
}

/**
 * Checks if all questions in a practice module have been completed by a specific user
 * @param moduleId The module ID
 * @param userId The user ID (optional - if not provided, checks for any user)
 * @returns true if all questions have been completed, false otherwise
 */
export async function areAllQuestionsCompleted(moduleId: string, userId?: string | null): Promise<boolean> {
  const module = await db.modules.get(moduleId);
  if (!module || module.type !== 'practice') {
    return false;
  }

  const allQuestionIds = new Set(module.questionIds);
  if (allQuestionIds.size === 0) {
    return false; // No questions to complete
  }

  // Get all completed attempts for this module and user
  // Use a single filter function to avoid issues with chained .and() calls
  const completedAttempts = await db.attempts
    .where('moduleId')
    .equals(moduleId)
    .filter(attempt => {
      if (!attempt.completed) return false;
      if (userId && attempt.userId !== userId) return false;
      return true;
    })
    .toArray();

  const completedQuestionIds = new Set<string>();
  
  for (const attempt of completedAttempts) {
    if (attempt.perQuestionAttempts) {
      for (const perQuestionAttempt of attempt.perQuestionAttempts) {
        if (perQuestionAttempt.questionId) {
          completedQuestionIds.add(perQuestionAttempt.questionId);
        }
      }
    }
  }

  // Check if all question IDs in the module have been completed
  const missingQuestionIds: string[] = [];
  for (const questionId of allQuestionIds) {
    if (!completedQuestionIds.has(questionId)) {
      missingQuestionIds.push(questionId);
    }
  }

  if (missingQuestionIds.length > 0) {
    return false;
  }
  return true;
}

