import { z } from 'zod';

const EmbedResponseSchema = z.object({
  modelId: z.string(),
  dims: z.number(),
  vector: z.array(z.number()),
});

export type EmbedResponse = z.infer<typeof EmbedResponseSchema>;

export async function embedTextLocal(params: { text: string; modelId: string }): Promise<EmbedResponse> {
  if (!window.offlineAi?.embedText) {
    throw new Error('Offline AI runtime is unavailable.');
  }
  const result = await window.offlineAi.embedText({
    text: params.text,
    modelId: params.modelId,
    seed: 0,
    threads: 1,
  });
  return EmbedResponseSchema.parse(result);
}
