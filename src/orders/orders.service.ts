import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { outputOrderSchema, type InputOrder } from './orders.schema.js';

const orderInclude = {
  items: {
    orderBy: { productId: 'asc' },
    include: { product: { select: { name: true } } },
  },
} satisfies Prisma.OrderInclude;

export function toOutputOrder(
  order: Prisma.OrderGetPayload<{ include: typeof orderInclude }>,
) {
  return outputOrderSchema.parse({
    ...order,
    items: order.items.map(({ product, ...item }) => ({
      ...item,
      name: product.name,
    })),
  });
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, items: InputOrder['items']) {
    return this.prisma.$transaction(async (tx) => {
      const itemsAsc = [...items].sort((a, b) => a.productId - b.productId);
      const productsFound = await tx.product.findMany({
        where: { id: { in: itemsAsc.map((i) => i.productId) } },
      });

      if (productsFound.length !== itemsAsc.length) {
        throw new NotFoundException('All or some products not found');
      }

      const productsMap = new Map(productsFound.map((p) => [p.id, p]));
      let total = new Prisma.Decimal(0);
      const returnedItems = [];

      for (const { productId, quantity } of itemsAsc) {
        const { count } = await tx.product.updateMany({
          where: { id: productId, stock: { gte: quantity } },
          data: { stock: { decrement: quantity } },
        });

        if (count < 1) {
          throw new ConflictException('Out of stock');
        }

        const { price } = productsMap.get(productId)!;
        total = total.add(price.mul(quantity));

        returnedItems.push({ productId, quantity, unitPrice: price });
      }

      return await tx.order.create({
        data: { userId, total, items: { create: returnedItems } },
        include: orderInclude,
      });
    });
  }
}
