import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { prepareContentForDisplay } from '@/lib/contentFormatting';

type ChatMsg = { role: 'user' | 'assistant'; content: string };

export default function Chat() {
	const [input, setInput] = useState('');
	const [loading, setLoading] = useState(false);
	const [messages, setMessages] = useState<ChatMsg[]>([]);

	const canUseOfflineChat = useMemo(() => {
		return !!window.offlineAi && typeof window.offlineAi.chat === 'function' && typeof window.offlineAi.reasoningStatus === 'function';
	}, []);

	const send = useCallback(async () => {
		const msg = input.trim();
		if (!msg) return;
		setInput('');
		setLoading(true);
		try {
			const api = window.offlineAi;
			if (!api || typeof api.chat !== 'function' || typeof api.reasoningStatus !== 'function') {
				toast.error('Local chat is only available in the Electron app');
				return;
			}
			const st = await api.reasoningStatus();
			if (!st.available) {
				toast.error(`Local chat unavailable: ${st.reason}`);
				return;
			}

			const system =
				'You are an offline tutor. Use KaTeX-friendly LaTeX: inline $...$ and display $$...$$. Be concise, correct, and helpful.';

			const next = [...messages, { role: 'user', content: msg } as const];
			setMessages(next);
			const res = await api.chat({
				system,
				messages: next,
				maxTokens: 700,
				temperature: 0.7,
				seed: 0,
			});
			setMessages([...next, { role: 'assistant', content: res.text || '' }]);
		} catch (e) {
			console.error(e);
			toast.error('Chat failed');
		} finally {
			setLoading(false);
		}
	}, [input, messages]);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-2">
				<div>
					<h1 className="text-2xl font-semibold">Chat</h1>
					<p className="text-sm text-muted-foreground">
						{canUseOfflineChat ? 'Runs locally (Electron only).' : 'Open the Electron app to use local chat.'}
					</p>
				</div>
			</div>

			<Card className="p-4">
				<div className="h-[55vh] overflow-auto space-y-3">
					{messages.length ? (
						messages.map((m, idx) => (
							<div key={idx}>
								<div className="text-xs text-muted-foreground mb-1">{m.role === 'user' ? 'You' : 'Tutor'}</div>
								{m.role === 'assistant' ? (
									<div className="prose prose-sm max-w-none content-html" dangerouslySetInnerHTML={{ __html: prepareContentForDisplay(m.content) }} />
								) : (
									<div className="text-sm whitespace-pre-wrap">{m.content}</div>
								)}
							</div>
						))
					) : (
						<div className="text-sm text-muted-foreground">Start by asking something…</div>
					)}
				</div>

				<div className="mt-3 flex items-center gap-2">
					<Input
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="Type a message…"
						onKeyDown={(e) => {
							if (e.key === 'Enter') void send();
						}}
					/>
					<Button type="button" disabled={loading} onClick={() => void send()}>
						{loading ? 'Sending…' : 'Send'}
					</Button>
				</div>
			</Card>
		</div>
	);
}
