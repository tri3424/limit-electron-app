function isExternalUrl(url: string): boolean {
	try {
		const u = new URL(url, window.location.href);
		if (u.protocol === 'file:' || u.protocol === 'app:' || u.protocol === 'chrome-extension:') return false;
		return u.origin !== window.location.origin;
	} catch {
		return false;
	}
}

export function installProductionNetworkGuard() {
	try {
		if (import.meta.env.DEV) return;
		const w = window as any;

		if (typeof w.fetch === 'function') {
			const origFetch = w.fetch.bind(w);
			w.fetch = (input: any, init?: any) => {
				const url = typeof input === 'string' ? input : input?.url;
				if (typeof url === 'string' && isExternalUrl(url)) {
					return Promise.reject(new Error('External network requests are blocked in production.'));
				}
				return origFetch(input, init);
			};
		}

		if (typeof w.XMLHttpRequest === 'function') {
			const OrigXHR = w.XMLHttpRequest;
			function PatchedXHR(this: any) {
				const xhr = new OrigXHR();
				const origOpen = xhr.open;
				xhr.open = function (method: string, url: string) {
					if (typeof url === 'string' && isExternalUrl(url)) {
						throw new Error('External network requests are blocked in production.');
					}
					return origOpen.apply(xhr, arguments as any);
				};
				return xhr;
			}
			PatchedXHR.prototype = OrigXHR.prototype;
			w.XMLHttpRequest = PatchedXHR as any;
		}

		if (typeof w.WebSocket === 'function') {
			const OrigWS = w.WebSocket;
			w.WebSocket = function (url: any, protocols?: any) {
				if (typeof url === 'string' && isExternalUrl(url)) {
					throw new Error('External network requests are blocked in production.');
				}
				return new OrigWS(url, protocols);
			} as any;
			w.WebSocket.prototype = OrigWS.prototype;
		}

		if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
			const orig = navigator.sendBeacon.bind(navigator);
			navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
				const s = typeof url === 'string' ? url : url.toString();
				if (isExternalUrl(s)) return false;
				return orig(url as any, data as any);
			};
		}
	} catch {
		return;
	}
}
