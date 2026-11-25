import { z } from 'zod';

export const inputProductsSchema = z.object({
  name: z.string().trim().min(1),
  price: z.number().positive().multipleOf(0.01).max(99_999_999.99),
});

export type InputProduct = z.infer<typeof inputProductsSchema>;

export const outputProductSchema = z.object({
  id: z.number().positive(),
  name: z.string(),
  price: z.coerce.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
