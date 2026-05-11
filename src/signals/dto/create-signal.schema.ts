import { z } from 'zod';

/**
 * Schema Zod para validação de Signal recebido do news-analyzer.
 */
export const createSignalSchema = z.object({
  ticker: z.string().min(1, 'Ticker é obrigatório'),
  source: z.enum(['SENTIMENT', 'FUNDAMENTAL', 'PRICE']),
  score: z.number().min(-1).max(1),
  reasoning: z.string().min(1, 'Reasoning é obrigatório').optional(),
});

export type CreateSignalDto = z.infer<typeof createSignalSchema>;
