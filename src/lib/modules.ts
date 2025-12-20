import { db, type Module } from './db';
import { v4 as uuidv4 } from 'uuid';
import { recordModuleRemovalFeedback } from './intelligenceEngine';

export interface CreateModuleInput {
  title: string;
  description?: string;
  type: Module['type'];
  tags: string[];
  questionIds: string[];
  settings: Module['settings'];
  scheduledStartUtc?: number;
  scheduledEndUtc?: number;
}

export interface UpdateModuleInput extends CreateModuleInput {
  id: string;
}

export async function createModule(input: CreateModuleInput): Promise<Module> {
  const now = Date.now();
  const module: Module = {
    id: uuidv4(),
    title: input.title,
    description: input.description,
    type: input.type,
    questionIds: input.questionIds,
    tags: input.tags,
    scheduledStartUtc: input.scheduledStartUtc,
    scheduledEndUtc: input.scheduledEndUtc,
    settings: input.settings,
    createdAt: now,
    updatedAt: now,
    visible: true,
    locked: false,
  };

  await db.transaction('rw', db.modules, db.questions, async () => {
    await db.modules.add(module);
    if (module.questionIds.length) {
      const qs = await db.questions.bulkGet(module.questionIds);
      for (const q of qs) {
        if (!q) continue;
        const modules = Array.isArray(q.modules) ? q.modules : [];
        if (!modules.includes(module.id)) {
          modules.push(module.id);
          await db.questions.update(q.id, { modules });
        }
      }
    }
  });

  return module;
}

export async function updateModule(input: UpdateModuleInput): Promise<void> {
  const existing = await db.modules.get(input.id);
  if (!existing) {
    throw new Error('Module not found');
  }
  const removedQuestionIds = (existing.questionIds || []).filter((qid) => !input.questionIds.includes(qid));

  const updated: Module = {
    ...existing,
    title: input.title,
    description: input.description,
    type: input.type,
    tags: input.tags,
    questionIds: input.questionIds,
    settings: input.settings,
    scheduledStartUtc: input.scheduledStartUtc,
    scheduledEndUtc: input.scheduledEndUtc,
    updatedAt: Date.now(),
  };

  await db.transaction('rw', db.modules, db.questions, async () => {
    await db.modules.put(updated);

    const allIds = Array.from(
      new Set([...(existing.questionIds || []), ...updated.questionIds]),
    );
    const qs = await db.questions.bulkGet(allIds);
    for (const q of qs) {
      if (!q) continue;
      const modules = Array.isArray(q.modules) ? q.modules : [];
      const hasNow = updated.questionIds.includes(q.id);
      const next = hasNow
        ? Array.from(new Set([...modules, updated.id]))
        : modules.filter((mId) => mId !== updated.id);
      await db.questions.update(q.id, { modules: next });
    }
  });

  if (removedQuestionIds.length) {
    await recordModuleRemovalFeedback(updated.id, removedQuestionIds);
  }
}

export async function deleteModule(id: string): Promise<void> {
  await db.transaction('rw', [db.modules, db.questions, db.attempts, db.integrityEvents, db.dailyStats], async () => {
    const mod = await db.modules.get(id);
    if (!mod) {
      return;
    }

    await db.modules.delete(id);

    if (mod.questionIds?.length) {
      const qs = await db.questions.bulkGet(mod.questionIds);
      for (const q of qs) {
        if (!q) continue;
        const modules = (q.modules || []).filter((mId) => mId !== id);
        await db.questions.update(q.id, { modules });
      }
    }

    const attempts = await db.attempts.where('moduleId').equals(id).toArray();
    const attemptIds = attempts.map((a) => a.id);
    if (attemptIds.length) {
      await db.attempts.bulkDelete(attemptIds);
      await db.integrityEvents.where('attemptId').anyOf(attemptIds).delete();
    }

    await db.dailyStats.where('moduleId').equals(id).delete();
  });
}

export async function resetModuleProgress(moduleId: string): Promise<void> {
  await db.transaction('rw', [db.attempts, db.integrityEvents, db.dailyStats], async () => {
    const attempts = await db.attempts.where('moduleId').equals(moduleId).toArray();
    const attemptIds = attempts.map((a) => a.id);
    if (attemptIds.length) {
      await db.attempts.bulkDelete(attemptIds);
      await db.integrityEvents.where('attemptId').anyOf(attemptIds).delete();
    }

    await db.dailyStats.where('moduleId').equals(moduleId).delete();
  });
}

