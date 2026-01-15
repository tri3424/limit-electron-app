/**
 * Stores the last attempted question index for a module
 * This allows users to resume from where they left off
 */
function buildProgressKey(moduleId: string, userId?: string | null): string {
  const userPart = userId && userId.trim().length > 0 ? `_${userId}` : '';
  return `module_progress_${moduleId}${userPart}`;
}

export async function setLastQuestionIndex(
  moduleId: string,
  userId: string | null | undefined,
  questionIndex: number,
  questionOrder: string[],
): Promise<void> {
  const key = buildProgressKey(moduleId, userId ?? undefined);
  const data = {
    lastIndex: questionIndex,
    questionOrder: questionOrder,
    timestamp: Date.now(),
  };
  localStorage.setItem(key, JSON.stringify(data));
}

/**
 * Gets the last attempted question index for a module
 * Returns null if no progress is found or if it's from a different day
 */
export async function getLastQuestionIndex(
  moduleId: string,
  userId: string | null | undefined,
): Promise<{ index: number; questionOrder: string[] } | null> {
  const key = buildProgressKey(moduleId, userId ?? undefined);
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  
  try {
    const data = JSON.parse(stored);
    // Check if progress is from today (within last 24 hours)
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    if (data.timestamp < dayAgo) {
      // Progress is old, clear it
      localStorage.removeItem(key);
      return null;
    }
    return {
      index: data.lastIndex + 1, // Resume from next question
      questionOrder: data.questionOrder || [],
    };
  } catch {
    return null;
  }
}

/**
 * Clears progress for a module
 */
export async function clearProgress(moduleId: string, userId: string | null | undefined): Promise<void> {
  const key = buildProgressKey(moduleId, userId ?? undefined);
  localStorage.removeItem(key);
}

