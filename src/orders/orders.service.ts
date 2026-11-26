import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { outputOrderSchema, type InputOrder } from './orders.schema.js';

type StatsRow = {
  productId: number;
  name: string;
  unitsSold: bigint;
  revenue: Prisma.Decimal;
};

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

  stats() {
    return this.prisma.$queryRaw<StatsRow[]>`
      SELECT
        p.id AS "productId",
        p.name,
        COALESCE(SUM(s.quantity), 0) AS "unitsSold",
        COALESCE(SUM(s.quantity * s.unit_price), 0) AS revenue
      FROM products p
      LEFT JOIN (
        SELECT oi.product_id, oi.quantity, oi.unit_price
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status <> 'cancelled'
      ) s ON s.product_id = p.id
      GROUP BY p.id, p.name
      ORDER BY revenue DESC, p.id ASC
    `;
  }

  list(userId: number) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: orderInclude,
    });
  }

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

        // exists: the length check above guarantees it
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
