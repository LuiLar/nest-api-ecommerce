import { z } from 'zod';
import { idSchema } from '../common/parse-id.pipe.js';
import { OrderStatus } from '../generated/prisma/client.js';

const itemSchema = z.object({
  productId: idSchema,
  quantity: z.int().min(1).max(100),
});

export const inputOrderSchema = z.object({
  items: z
    .array(itemSchema)
    .min(1)
    .refine(
      (items) =>
        new Set(items.map(({ productId }) => productId)).size === items.length,
      { message: 'Products must not repeat' },
    ),
});

export type InputOrder = z.infer<typeof inputOrderSchema>;

export const outputOrderSchema = z.object({
  id: z.number().positive(),
  status: z.enum(OrderStatus),
  items: z.array(
    itemSchema.extend({
      unitPrice: z.coerce.number(),
      name: z.string(),
    }),
  ),
  total: z.coerce.number(),
  createdAt: z.date(),
});

export type OutputOrder = z.infer<typeof outputOrderSchema>;

export const outputStatsSchema = z.object({
  productId: z.number().positive(),
  name: z.string().nonempty(),
  unitsSold: z.coerce.number(),
  revenue: z.coerce.number(),
});
