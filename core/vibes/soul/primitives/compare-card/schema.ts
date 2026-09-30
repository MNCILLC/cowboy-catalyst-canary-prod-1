import { z } from 'zod';

export const compareAddToCartFormDataSchema = z.object({
  id: z.string(),
  quantity: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});
