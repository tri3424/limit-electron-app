import { z } from 'zod';
import { getOfflineAiStatusCached, OfflineAiUnavailableError } from './offlineAiStatus';

const EmbedResponseSchema = z.object({
  modelId: z.string(),
  dims: z.number(),
  vector: z.array(z.number()),
});

export type EmbedResponse = z.infer<typeof EmbedResponseSchema>;

export async function embedTextLocal(params: { text: string; modelId: string }): Promise<EmbedResponse> {
	const st = await getOfflineAiStatusCached();
	if (!st.available) {
		throw new OfflineAiUnavailableError(st.reason);
	}
	if (!window.offlineAi?.embedText) {
		throw new OfflineAiUnavailableError('missing_embed_api');
	}
	const result = await window.offlineAi.embedText({
		text: params.text,
		modelId: params.modelId,
		seed: 0,
		threads: 1,
	});
	return EmbedResponseSchema.parse(result);
}
