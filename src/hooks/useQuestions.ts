import { useLiveQuery } from 'dexie-react-hooks';
import { db, Question } from '@/lib/db';

export interface QuestionFilters {
	tags?: string[];
	search?: string;
	type?: 'mcq' | 'text' | 'fill_blanks' | 'matching';
}

export function useQuestions(filters?: QuestionFilters) {
	return useLiveQuery<Question[]>(async () => {
		let coll = db.questions.toCollection();
		if (filters?.type) {
			coll = db.questions.where('type').equals(filters.type);
		}
		let list = await coll.toArray();
		if (filters?.tags && filters.tags.length) {
			list = list.filter(q => filters.tags!.every(t => q.tags.includes(t)));
		}
		if (filters?.search && filters.search.trim()) {
			const s = filters.search.trim().toLowerCase();
			list = list.filter(q => {
				const inText = q.text.toLowerCase().includes(s);
				const inCode = q.code ? q.code.toLowerCase().includes(s) : false;
				return inText || inCode;
			});
		}
		return list;
	}, [JSON.stringify(filters || {})]);
}


