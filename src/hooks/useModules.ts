import { useLiveQuery } from 'dexie-react-hooks';
import { db, Module } from '@/lib/db';

export function useModules() {
	return useLiveQuery<Module[]>(() => db.modules.toArray(), []);
}

export function useModule(moduleId?: string) {
	return useLiveQuery<Module | undefined>(() => {
		if (!moduleId) return Promise.resolve(undefined);
		return db.modules.get(moduleId);
	}, [moduleId]);
}


