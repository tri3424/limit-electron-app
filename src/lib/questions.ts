import { db } from './db';
import { removeQuestionGlossaryLinks } from './glossary';

export async function deleteQuestion(questionId: string): Promise<void> {
  await db.transaction('rw', [db.questions, db.modules], async () => {
    // Load all modules and filter locally because questionIds is not indexed
    const allModules = await db.modules.toArray();
    const modulesWithQuestion = allModules.filter((m) => (m.questionIds || []).includes(questionId));
    if (modulesWithQuestion.length) {
      const updates = modulesWithQuestion.map((m) => ({
        key: m.id,
        changes: { questionIds: (m.questionIds || []).filter((id) => id !== questionId) },
      }));
      await db.modules.bulkUpdate(updates);
    }
    // Delete the question
    await db.questions.delete(questionId);
  });
  await removeQuestionGlossaryLinks(questionId);
}
