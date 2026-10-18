import { z } from 'zod';

export const contactSectionSchema = z.object({
  fullname: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(254),
  comments: z.string().trim().min(1).max(10000),
});
