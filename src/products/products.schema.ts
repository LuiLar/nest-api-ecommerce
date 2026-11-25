import { z } from 'zod';

export const outputProductSchema = z.object({
  id: z.number().positive(),
  name: z.string(),
  price: z.coerce.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
