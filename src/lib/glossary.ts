import { v4 as uuidv4 } from 'uuid';
import { db, GlossaryEntry, GlobalGlossaryEntry, normalizeGlossaryMeaning, normalizeGlossaryWord } from './db';

type NormalizedEntry = {
  id: string;
  word: string;
  meaning: string;
  normalizedWord: string;
  normalizedMeaning: string;
};

function sanitizeEntries(entries: GlossaryEntry[]): NormalizedEntry[] {
  return entries
    .filter((entry) => entry.word && entry.meaning)
    .map((entry) => {
      const word = entry.word.trim();
      const meaning = entry.meaning.trim();
      return {
        id: entry.id || uuidv4(),
        word,
        meaning,
        normalizedWord: normalizeGlossaryWord(word),
        normalizedMeaning: normalizeGlossaryMeaning(meaning),
      };
    })
    .filter((entry) => entry.normalizedWord && entry.normalizedMeaning);
}

async function findExistingEntry(normalizedWord: string, normalizedMeaning: string): Promise<GlobalGlossaryEntry | undefined> {
  return db.globalGlossary
    .where('normalizedWord')
    .equals(normalizedWord)
    .filter((entry) => normalizeGlossaryMeaning(entry.meaning) === normalizedMeaning)
    .first();
}

export async function syncQuestionGlossary(questionId: string, entries: GlossaryEntry[]): Promise<void> {
  const normalized = sanitizeEntries(entries);
  const now = Date.now();
  const incomingKeys = new Set(normalized.map((entry) => `${entry.normalizedWord}::${entry.normalizedMeaning}`));

  await db.transaction('rw', db.globalGlossary, async () => {
    const existingForQuestion = await db.globalGlossary.filter((entry) => (entry.questionIds || []).includes(questionId)).toArray();

    for (const entry of existingForQuestion) {
      const key = `${entry.normalizedWord}::${normalizeGlossaryMeaning(entry.meaning)}`;
      if (!incomingKeys.has(key)) {
        const nextQuestionIds = (entry.questionIds || []).filter((id) => id !== questionId);
        if (nextQuestionIds.length === 0) {
          await db.globalGlossary.delete(entry.id);
        } else {
          await db.globalGlossary.update(entry.id, {
            questionIds: nextQuestionIds,
            updatedAt: now,
          });
        }
      }
    }

    for (const entry of normalized) {
      const existing = await findExistingEntry(entry.normalizedWord, entry.normalizedMeaning);
      if (existing) {
        const nextQuestionIds = Array.from(new Set([...(existing.questionIds || []), questionId]));
        await db.globalGlossary.update(existing.id, {
          word: entry.word,
          meaning: entry.meaning,
          questionIds: nextQuestionIds,
          updatedAt: now,
        });
      } else {
        await db.globalGlossary.add({
          id: uuidv4(),
          word: entry.word,
          normalizedWord: entry.normalizedWord,
          meaning: entry.meaning,
          questionIds: [questionId],
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  });
}

export async function removeQuestionGlossaryLinks(questionId: string): Promise<void> {
  await db.transaction('rw', db.globalGlossary, async () => {
    const entries = await db.globalGlossary.filter((entry) => (entry.questionIds || []).includes(questionId)).toArray();
    const now = Date.now();
    for (const entry of entries) {
      const nextQuestionIds = (entry.questionIds || []).filter((id) => id !== questionId);
      if (nextQuestionIds.length === 0) {
        await db.globalGlossary.delete(entry.id);
      } else {
        await db.globalGlossary.update(entry.id, {
          questionIds: nextQuestionIds,
          updatedAt: now,
        });
      }
    }
  });
}

export async function mergeGlobalGlossaryDuplicates(): Promise<number> {
  return db.transaction('rw', db.globalGlossary, async () => {
    const entries = await db.globalGlossary.toArray();
    const seen = new Map<string, GlobalGlossaryEntry>();
    const now = Date.now();
    let merged = 0;

    for (const entry of entries) {
      if (!entry.word || !entry.meaning) {
        await db.globalGlossary.delete(entry.id);
        continue;
      }
      const normalizedWord = normalizeGlossaryWord(entry.word);
      const normalizedMeaning = normalizeGlossaryMeaning(entry.meaning);
      if (!normalizedWord || !normalizedMeaning) {
        await db.globalGlossary.delete(entry.id);
        continue;
      }
      const key = `${normalizedWord}::${normalizedMeaning}`;
      if (seen.has(key)) {
        const target = seen.get(key)!;
        const mergedIds = Array.from(new Set([...(target.questionIds || []), ...(entry.questionIds || [])]));
        await db.globalGlossary.update(target.id, {
          word: entry.word.length > target.word.length ? entry.word : target.word,
          meaning: entry.meaning.length > target.meaning.length ? entry.meaning : target.meaning,
          questionIds: mergedIds,
          updatedAt: now,
        });
        await db.globalGlossary.delete(entry.id);
        merged++;
      } else {
        seen.set(key, entry);
        await db.globalGlossary.update(entry.id, {
          normalizedWord,
          questionIds: Array.from(new Set(entry.questionIds || [])),
          updatedAt: now,
        });
      }
    }

    return merged;
  });
}

