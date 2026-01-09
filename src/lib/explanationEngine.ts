import type { Question, QuestionSemanticAnalysis } from './db';
import { extractPlainText, stableHashString } from './semanticUtils';

function pickVariant<T>(arr: T[], idx: number): T {
	return arr[Math.max(0, Math.min(arr.length - 1, idx))];
}

export async function generateDeterministicExplanationHtml(params: {
	question: Question;
	analysis: QuestionSemanticAnalysis | null | undefined;
	regenerateIndex: number;
}): Promise<string> {
	const qPlain = extractPlainText(params.question.text || '').trim();
	const base = `${qPlain}`.trim();
	const h = await stableHashString(`${params.question.id}::${params.analysis?.id || 'no-analysis'}::${base}`);
	const seed = parseInt(String(h).slice(0, 8), 16) || 0;
	const v = (seed + params.regenerateIndex * 9973) >>> 0;

	const tags = (params.analysis?.tags || []).slice(0, 6);
	const topSignals = (params.analysis?.rationale?.topSignals || []).slice(0, 5);

	const openings = [
		'This problem is mainly about',
		'The core idea here is',
		'This question focuses on',
		'You can think of this as a',
	];
	const stepsIntros = [
		'A clean way to proceed is:',
		'One structured approach is:',
		'A reliable method is:',
		'Follow these steps:',
	];

	const opening = pickVariant(openings, v % openings.length);
	const stepsIntro = pickVariant(stepsIntros, (v >>> 3) % stepsIntros.length);

	const tagNames = tags.map((t) => t.tagName);
	const difficultyBand = params.analysis?.difficultyBand ? String(params.analysis.difficultyBand).replace(/_/g, ' ') : null;
	const difficultyScore = typeof params.analysis?.difficultyScore === 'number' ? params.analysis.difficultyScore : null;
	const confidence = tags.length ? Math.round((tags[0]?.score ?? 0) * 100) : null;

	const bullets: string[] = [];
	if (tagNames.length) {
		bullets.push(`<li><b>Likely topics:</b> ${tagNames.map((t) => escapeHtml(t)).join(', ')}</li>`);
	}
	if (difficultyBand) {
		bullets.push(
			`<li><b>Estimated difficulty:</b> ${escapeHtml(difficultyBand)}${difficultyScore != null ? ` (${Math.round(difficultyScore * 100)}/100)` : ''}</li>`,
		);
	}
	if (topSignals.length) {
		const sig = topSignals
			.map((s) => `${escapeHtml(String(s.label))}`)
			.join(', ');
		bullets.push(`<li><b>Main difficulty drivers:</b> ${sig}</li>`);
	}

	const templates = [
		{
			goal: 'Goal',
			plan: ['Rewrite the problem in your own words.', 'List the known values/conditions.', 'Pick the correct rule/formula.', 'Solve step-by-step and verify.'],
			mistakes: ['Rushing algebraic steps', 'Unit/format mismatch', 'Forgetting constraints (domain/sign)'],
		},
		{
			goal: 'What we need to find',
			plan: ['Identify the target quantity.', 'Connect it to given information.', 'Transform/simplify carefully.', 'Check the final answer logically.'],
			mistakes: ['Skipping intermediate simplification', 'Arithmetic slip', 'Not checking special cases'],
		},
		{
			goal: 'Objective',
			plan: ['Mark givens vs unknowns.', 'Use the most direct relationship.', 'Compute in a clean order.', 'Sanity-check with estimation.'],
			mistakes: ['Choosing an unrelated formula', 'Sign errors', 'Misreading the question'],
		},
	];
	const tpl = pickVariant(templates, (v >>> 5) % templates.length);

	const planList = tpl.plan.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
	const mistakesList = tpl.mistakes.map((s) => `<li>${escapeHtml(s)}</li>`).join('');

	const evidence = tagNames.length
		? `<p><b>Why these topics:</b> The wording and symbols in the question align most with ${tagNames
				.slice(0, 3)
				.map((t) => `<b>${escapeHtml(t)}</b>`)
				.join(', ')}.</p>`
		: `<p><b>Why this approach:</b> We pick the most direct standard method and verify it with consistency checks.</p>`;

	return [
		`<div class="prose prose-base max-w-none">`,
		`<p>${escapeHtml(opening)} ${tagNames.length ? tagNames.map((t) => `<b>${escapeHtml(t)}</b>`).join(', ') : '<b>the underlying concept</b>'}.</p>`,
		bullets.length ? `<ul>${bullets.join('')}</ul>` : '',
		`<h3>${escapeHtml(tpl.goal)}</h3>`,
		`<p>We want to produce a clear path to the answer using stable, offline reasoning.</p>`,
		confidence != null ? `<p><b>Top-tag confidence:</b> ${confidence}%</p>` : '',
		evidence,
		`<h3>${escapeHtml(stepsIntro)}</h3>`,
		`<ol>${planList}</ol>`,
		`<h3>Common mistakes to avoid</h3>`,
		`<ul>${mistakesList}</ul>`,
		`</div>`,
	].join('');
}

function escapeHtml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}
