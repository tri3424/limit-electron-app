import { v4 as uuidv4 } from 'uuid';
import { db, type StoryChapter, type StoryChapterAttempt, type StoryAssignmentAnswer } from '@/lib/db';

export function toDateKey(ts: number): string {
	return new Date(ts).toISOString().slice(0, 10);
}

export function normalizeFillBlankAnswer(value: string): string {
	// Exact/case-sensitive comparison (only trimming outer whitespace)
	return String(value ?? '').trim();
}

export function isCorrectFillBlankAnswer(input: string, correct: string): boolean {
	return normalizeFillBlankAnswer(input) === normalizeFillBlankAnswer(correct);
}

export function scanBlanksFromHtml(html: string): { id: string; correct: string }[] {
	if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return [];
	const parser = new DOMParser();
	const doc = parser.parseFromString(html || '', 'text/html');
	const spans = Array.from(doc.querySelectorAll('[data-blank="true"]')) as HTMLElement[];
	return spans
		.map((el, index) => {
			let id = el.getAttribute('data-blank-id') || '';
			if (!id) {
				id = `b${index + 1}`;
				el.setAttribute('data-blank-id', id);
			}
			const correct = (el.innerText || '').trim();
			return { id, correct };
		})
		.filter((b) => !!b.id && !!b.correct);
}

export function computeAccuracyPercent(input: { correctParts: number; totalParts: number }): number {
	if (!input.totalParts) return 0;
	return Math.round((input.correctParts / input.totalParts) * 100);
}

export async function getAttemptsForUserAndChapter(userId: string, chapterId: string): Promise<StoryChapterAttempt[]> {
	const rows = await db.storyAttempts.where('[chapterId+userId]').equals([chapterId, userId]).toArray();
	return rows.slice().sort((a, b) => a.attemptNo - b.attemptNo);
}

export async function getNextAttemptNo(userId: string, chapterId: string): Promise<number> {
	const attempts = await getAttemptsForUserAndChapter(userId, chapterId);
	const used = attempts.length;
	return Math.min(3, used + 1);
}

export async function getLockedBlankIds(userId: string, chapterId: string): Promise<string[]> {
	const attempts = await getAttemptsForUserAndChapter(userId, chapterId);
	const locked = new Set<string>();
	for (const a of attempts) {
		for (const b of a.blanks || []) {
			if (b.correct) locked.add(b.blankId);
		}
	}
	return Array.from(locked);
}

export function scoreAssignment(statementCorrect: StoryAssignmentAnswer, answer: StoryAssignmentAnswer): boolean {
	return statementCorrect === answer;
}

export async function submitStoryChapterAttempt(input: {
	userId: string;
	username?: string;
	chapter: StoryChapter;
	startedAt: number;
	blankAnswers: Record<string, string>;
	assignmentAnswers?: Record<string, StoryAssignmentAnswer>;
}): Promise<StoryChapterAttempt> {
	const now = Date.now();
	const date = toDateKey(now);
	const previousAttempts = await getAttemptsForUserAndChapter(input.userId, input.chapter.id);
	if (previousAttempts.length >= 3) {
		throw new Error('No attempts remaining');
	}
	const attemptNo = previousAttempts.length + 1;
	const lockedBlankIds = await getLockedBlankIds(input.userId, input.chapter.id);
	const lockedSet = new Set(lockedBlankIds);

	const blanksMeta = input.chapter.fillBlanks?.blanks || [];
	const blanks: StoryChapterAttempt['blanks'] = blanksMeta.map((b) => {
		const raw = input.blankAnswers[b.id] ?? '';
		const correct = isCorrectFillBlankAnswer(raw, b.correct);
		return { blankId: b.id, answer: String(raw ?? ''), correct };
	});

	const shouldScoreAssignment = !!input.assignmentAnswers && Object.keys(input.assignmentAnswers).length > 0;
	const assignmentStatements = shouldScoreAssignment ? input.chapter.assignment?.statements || [] : [];
	const assignment = assignmentStatements.length
		? assignmentStatements
				.map((s) => {
					const ans = (input.assignmentAnswers?.[s.id] ?? '') as StoryAssignmentAnswer;
					if (ans !== 'yes' && ans !== 'no') return null;
					return { statementId: s.id, answer: ans, correct: scoreAssignment(s.correct, ans) };
				})
				.filter(Boolean)
		: undefined;

	const correctParts =
		blanks.filter((b) => b.correct).length +
		(assignment ? assignment.filter((a) => a.correct).length : 0);
	const totalParts = blanks.length + (assignment ? assignment.length : 0);
	const accuracyPercent = computeAccuracyPercent({ correctParts, totalParts });

	const nextLocked = new Set<string>(lockedSet);
	for (const b of blanks) {
		if (b.correct) nextLocked.add(b.blankId);
	}

	const row: StoryChapterAttempt = {
		id: uuidv4(),
		userId: input.userId,
		username: input.username,
		courseId: input.chapter.courseId,
		chapterId: input.chapter.id,
		date,
		attemptNo,
		startedAt: input.startedAt,
		submittedAt: now,
		durationMs: Math.max(0, now - input.startedAt),
		blanks,
		assignment,
		accuracyPercent,
		lockedBlankIds: Array.from(nextLocked),
	};

	await db.storyAttempts.add(row);
	return row;
}

export async function attachAssignmentToAttempt(input: {
	attemptId: string;
	chapter: StoryChapter;
	assignmentAnswers: Record<string, StoryAssignmentAnswer>;
}): Promise<StoryChapterAttempt> {
	const existing = await db.storyAttempts.get(input.attemptId);
	if (!existing) throw new Error('Attempt not found');

	const now = Date.now();
	const assignmentStatements = input.chapter.assignment?.statements || [];
	const assignment = assignmentStatements.length
		? assignmentStatements
				.map((s) => {
					const ans = (input.assignmentAnswers?.[s.id] ?? '') as StoryAssignmentAnswer;
					if (ans !== 'yes' && ans !== 'no') return null;
					return { statementId: s.id, answer: ans, correct: scoreAssignment(s.correct, ans) };
				})
				.filter(Boolean)
		: undefined;

	const correctParts =
		(existing.blanks || []).filter((b) => b.correct).length +
		(assignment ? assignment.filter((a) => a.correct).length : 0);
	const totalParts = (existing.blanks || []).length + (assignment ? assignment.length : 0);
	const accuracyPercent = computeAccuracyPercent({ correctParts, totalParts });

	await db.storyAttempts.update(existing.id, {
		assignment,
		accuracyPercent,
		submittedAt: now,
		durationMs: Math.max(0, now - existing.startedAt),
	});

	const updated = await db.storyAttempts.get(existing.id);
	if (!updated) throw new Error('Attempt update failed');
	return updated;
}

export async function createStoryAttemptForAssignmentRetry(input: {
	userId: string;
	username?: string;
	chapter: StoryChapter;
	previousAttemptId: string;
}): Promise<StoryChapterAttempt> {
	const previous = await db.storyAttempts.get(input.previousAttemptId);
	if (!previous) throw new Error('Attempt not found');
	if (previous.userId !== input.userId || previous.chapterId !== input.chapter.id) throw new Error('Attempt mismatch');

	const now = Date.now();
	const date = toDateKey(now);
	const previousAttempts = await getAttemptsForUserAndChapter(input.userId, input.chapter.id);
	if (previousAttempts.length >= 3) throw new Error('No attempts remaining');
	const attemptNo = previousAttempts.length + 1;

	const blanks = (previous.blanks || []).map((b) => ({ ...b }));
	const correctParts = blanks.filter((b) => b.correct).length;
	const totalParts = blanks.length;
	const accuracyPercent = computeAccuracyPercent({ correctParts, totalParts });

	const row: StoryChapterAttempt = {
		id: uuidv4(),
		userId: input.userId,
		username: input.username,
		courseId: input.chapter.courseId,
		chapterId: input.chapter.id,
		date,
		attemptNo,
		startedAt: now,
		submittedAt: now,
		durationMs: 0,
		blanks,
		assignment: undefined,
		accuracyPercent,
		lockedBlankIds: Array.from(new Set(previous.lockedBlankIds || [])),
	};

	await db.storyAttempts.add(row);
	return row;
}
