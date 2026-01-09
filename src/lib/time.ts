export function formatMsAsTimestamp(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return '00:00.000';
	const totalMs = Math.floor(ms);
	const minutes = Math.floor(totalMs / 60000);
	const seconds = Math.floor((totalMs % 60000) / 1000);
	const millis = totalMs % 1000;
	return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
