export type OfflineAiStatus =
	| { available: true; reason: 'ok'; exePath?: string; modelPath?: string }
	| { available: false; reason: string };

let cached: Promise<OfflineAiStatus> | null = null;

export function getOfflineAiStatusCached(): Promise<OfflineAiStatus> {
	if (cached) return cached;
	cached = (async () => {
		if (typeof window === 'undefined') return { available: false, reason: 'no_window' };
		const api = window.offlineAi;
		if (!api || typeof api.status !== 'function') return { available: false, reason: 'not_electron' };
		try {
			const res = await api.status();
			if (res && typeof res === 'object' && typeof (res as any).available === 'boolean') {
				return res as OfflineAiStatus;
			}
			return { available: false, reason: 'invalid_status_response' };
		} catch {
			return { available: false, reason: 'status_failed' };
		}
	})();
	return cached;
}

export class OfflineAiUnavailableError extends Error {
	reason: string;
	constructor(reason: string) {
		super(`Offline AI unavailable: ${reason}`);
		this.name = 'OfflineAiUnavailableError';
		this.reason = reason;
	}
}

export function isOfflineAiUnavailableError(err: unknown): err is OfflineAiUnavailableError {
	return !!err && typeof err === 'object' && (err as any).name === 'OfflineAiUnavailableError';
}
