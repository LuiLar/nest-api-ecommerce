import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { OrderStatus, type Product } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const ADMIN = { email: 'admin@test.com', password: 'Admin123!' };
const CUSTOMER = { email: 'customer@test.com', password: 'Customer123!' };
const OTHER = { email: 'other@test.com', password: 'Other123!' };

type SeedItem = { productId: number; quantity: number; unitPrice: number };

describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let customerToken: string;
  let customerId: number;
  let otherId: number;
  let taza: Product; // price 10.99, stock 5
  let chicle: Product; // price 0.10, stock 10
  let ultima: Product; // price 20.00, stock 1

  const login = async (body: object) =>
    (await request(app.getHttpServer()).post('/auth/login').send(body)).body
      .token as string;
  const register = (body: object) =>
    request(app.getHttpServer()).post('/auth/register').send(body).expect(201);
  const postOrder = (token: string, body: object) =>
    request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const getOrders = (token: string) =>
    request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${token}`);
  const getStats = (token: string) =>
    request(app.getHttpServer())
      .get('/orders/stats')
      .set('Authorization', `Bearer ${token}`);
  const stockOf = async (id: number) =>
    (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;

  // Seeds an order straight into the DB: full control over createdAt, prices and status.
  const seedOrder = (
    userId: number,
    createdAt: string,
    items: SeedItem[],
    status: OrderStatus = OrderStatus.pending,
  ) =>
    prisma.order.create({
      data: {
        userId,
        status,
        createdAt: new Date(createdAt),
        total: items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
        items: { create: items },
      },
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.order.deleteMany();
    await prisma.user.deleteMany();
    await app
      .get(AuthService)
      .createAdmin(ADMIN.email, await argon2.hash(ADMIN.password));
    await register(CUSTOMER);
    await register(OTHER);
    adminToken = await login(ADMIN);
    customerToken = await login(CUSTOMER);
    customerId = (
      await prisma.user.findUniqueOrThrow({ where: { email: CUSTOMER.email } })
    ).id;
    otherId = (
      await prisma.user.findUniqueOrThrow({ where: { email: OTHER.email } })
    ).id;
  });

  // Each test starts with fresh stock and no orders.
  beforeEach(async () => {
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    [taza, chicle, ultima] = await prisma.product.createManyAndReturn({
      data: [
        { name: 'Taza', price: 10.99, stock: 5 },
        { name: 'Chicle', price: 0.1, stock: 10 },
        { name: 'Ultima', price: 20, stock: 1 },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /orders', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: taza.id, quantity: 1 }] })
        .expect(401);
    });

    it('returns 403 for an admin', async () => {
      const res = await postOrder(adminToken, {
        items: [{ productId: taza.id, quantity: 1 }],
      }).expect(403);

      expect(res.body).toEqual({
        message: 'User does not have enough permissions',
      });
    });

    it('returns 415 when the body is not application/json', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Content-Type', 'text/plain')
        .send('x')
        .expect(415);
    });

    it('returns 201 with the order: prices from the DB, exact total, items with name', async () => {
      const res = await postOrder(customerToken, {
        items: [
          { productId: taza.id, quantity: 3, unitPrice: 0.01 }, // must be ignored
          { productId: chicle.id, quantity: 3 },
        ],
      }).expect(201);

      expect(res.body).toEqual({
        id: expect.any(Number),
        status: 'pending',
        total: 33.27, // 3 × 10.99 + 3 × 0.10, no float drift
        createdAt: expect.any(String),
        items: [
          { productId: taza.id, name: 'Taza', quantity: 3, unitPrice: 10.99 },
          { productId: chicle.id, name: 'Chicle', quantity: 3, unitPrice: 0.1 },
        ],
      });
    });

    it('returns the items sorted by productId even if they come in another order', async () => {
      const res = await postOrder(customerToken, {
        items: [
          { productId: ultima.id, quantity: 1 },
          { productId: taza.id, quantity: 1 },
        ],
      }).expect(201);

      expect(
        res.body.items.map(({ productId }: { productId: number }) => productId),
      ).toEqual([taza.id, ultima.id]);
    });

    it('saves the order to the logged-in customer', async () => {
      const res = await postOrder(customerToken, {
        items: [{ productId: taza.id, quantity: 1 }],
      }).expect(201);

      const stored = await prisma.order.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(stored.userId).toBe(customerId);
    });

    it('decrements the stock of each product', async () => {
      await postOrder(customerToken, {
        items: [
          { productId: taza.id, quantity: 2 },
          { productId: chicle.id, quantity: 4 },
        ],
      }).expect(201);

      expect(await stockOf(taza.id)).toBe(3);
      expect(await stockOf(chicle.id)).toBe(6);
    });

    it('accepts buying the whole stock', async () => {
      await postOrder(customerToken, {
        items: [{ productId: taza.id, quantity: 5 }],
      }).expect(201);

      expect(await stockOf(taza.id)).toBe(0);
    });

    it.each([
      ['missing items', {}, ['items']],
      ['empty items', { items: [] }, ['items']],
      [
        'quantity 0',
        { items: [{ productId: 1, quantity: 0 }] },
        ['items.0.quantity'],
      ],
      [
        'decimal quantity',
        { items: [{ productId: 1, quantity: 1.5 }] },
        ['items.0.quantity'],
      ],
      [
        'quantity over 100',
        { items: [{ productId: 1, quantity: 101 }] },
        ['items.0.quantity'],
      ],
      [
        'productId out of INT range',
        { items: [{ productId: 2147483648, quantity: 1 }] },
        ['items.0.productId'],
      ],
      [
        'duplicated productId',
        {
          items: [
            { productId: 1, quantity: 1 },
            { productId: 1, quantity: 2 },
          ],
        },
        ['items'],
      ],
    ])('returns 400 for %s, with the field path', async (_, body, fields) => {
      const res = await postOrder(customerToken, body).expect(400);

      expect(res.body.map(({ field }: { field: string }) => field)).toEqual(
        fields,
      );
    });

    it('returns 404 when a product does not exist, and changes nothing', async () => {
      const res = await postOrder(customerToken, {
        items: [
          { productId: taza.id, quantity: 1 },
          { productId: ultima.id + 1000, quantity: 1 },
        ],
      }).expect(404);

      expect(res.body).toEqual({ message: 'All or some products not found' });
      expect(await stockOf(taza.id)).toBe(5);
      expect(await prisma.order.count()).toBe(0);
    });

    it('returns 409 when the stock is not enough, and changes nothing (rollback)', async () => {
      const res = await postOrder(customerToken, {
        items: [
          { productId: taza.id, quantity: 2 },
          { productId: ultima.id, quantity: 2 },
        ],
      }).expect(409);

      expect(res.body).toEqual({ message: 'Out of stock' });
      expect(await stockOf(taza.id)).toBe(5);
      expect(await stockOf(ultima.id)).toBe(1);
      expect(await prisma.order.count()).toBe(0);
    });

    it('two simultaneous orders for the last unit: one 201, one 409, stock never negative', async () => {
      const body = { items: [{ productId: ultima.id, quantity: 1 }] };

      const responses = await Promise.all([
        postOrder(customerToken, body),
        postOrder(customerToken, body),
      ]);

      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(await stockOf(ultima.id)).toBe(0);
      expect(await prisma.order.count()).toBe(1);
    });
  });

  describe('GET /orders', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/orders').expect(401);
    });

    it('returns 403 for an admin', async () => {
      await getOrders(adminToken).expect(403);
    });

    it('returns 200 with an empty array when the customer has no orders', async () => {
      await seedOrder(otherId, '2026-01-01', [
        { productId: taza.id, quantity: 1, unitPrice: 10.99 },
      ]);

      const res = await getOrders(customerToken).expect(200);

      expect(res.body).toEqual([]);
    });

    it('returns only my orders, newest first, with items and product names', async () => {
      const older = await seedOrder(customerId, '2026-01-01', [
        { productId: taza.id, quantity: 2, unitPrice: 10.99 },
      ]);
      await seedOrder(otherId, '2026-01-02', [
        { productId: chicle.id, quantity: 1, unitPrice: 0.1 },
      ]);
      const newer = await seedOrder(customerId, '2026-01-03', [
        { productId: ultima.id, quantity: 1, unitPrice: 20 },
        { productId: chicle.id, quantity: 3, unitPrice: 0.1 },
      ]);

      const res = await getOrders(customerToken).expect(200);

      expect(res.body).toEqual([
        {
          id: newer.id,
          status: 'pending',
          total: 20.3,
          createdAt: '2026-01-03T00:00:00.000Z',
          items: [
            {
              productId: chicle.id,
              name: 'Chicle',
              quantity: 3,
              unitPrice: 0.1,
            },
            {
              productId: ultima.id,
              name: 'Ultima',
              quantity: 1,
              unitPrice: 20,
            },
          ],
        },
        {
          id: older.id,
          status: 'pending',
          total: 21.98,
          createdAt: '2026-01-01T00:00:00.000Z',
          items: [
            { productId: taza.id, name: 'Taza', quantity: 2, unitPrice: 10.99 },
          ],
        },
      ]);
    });

    it('keeps the price paid even if the product price changes later', async () => {
      await postOrder(customerToken, {
        items: [{ productId: taza.id, quantity: 1 }],
      }).expect(201);
      await prisma.product.update({
        where: { id: taza.id },
        data: { price: 99.99 },
      });

      const res = await getOrders(customerToken).expect(200);

      expect(res.body[0].total).toBe(10.99);
      expect(res.body[0].items[0].unitPrice).toBe(10.99);
    });
  });

  describe('GET /orders/stats', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/orders/stats').expect(401);
    });

    it('returns 403 for a customer', async () => {
      await getStats(customerToken).expect(403);
    });

    it('lists every product with 0 when nothing was sold', async () => {
      const res = await getStats(adminToken).expect(200);

      expect(res.body).toEqual([
        { productId: taza.id, name: 'Taza', unitsSold: 0, revenue: 0 },
        { productId: chicle.id, name: 'Chicle', unitsSold: 0, revenue: 0 },
        { productId: ultima.id, name: 'Ultima', unitsSold: 0, revenue: 0 },
      ]);
    });

    it('sums units and revenue per product across users, ignoring cancelled orders, by revenue desc', async () => {
      await seedOrder(customerId, '2026-01-01', [
        { productId: taza.id, quantity: 2, unitPrice: 10.99 },
        { productId: chicle.id, quantity: 3, unitPrice: 0.1 },
      ]);
      await seedOrder(
        otherId,
        '2026-01-02',
        [{ productId: taza.id, quantity: 1, unitPrice: 10.99 }],
        OrderStatus.paid,
      );
      // Cancelled: must not count. Ultima was ONLY sold here, so it still appears with 0.
      await seedOrder(
        customerId,
        '2026-01-03',
        [
          { productId: chicle.id, quantity: 5, unitPrice: 0.1 },
          { productId: ultima.id, quantity: 1, unitPrice: 20 },
        ],
        OrderStatus.cancelled,
      );

      const res = await getStats(adminToken).expect(200);

      expect(res.body).toEqual([
        { productId: taza.id, name: 'Taza', unitsSold: 3, revenue: 32.97 },
        { productId: chicle.id, name: 'Chicle', unitsSold: 3, revenue: 0.3 },
        { productId: ultima.id, name: 'Ultima', unitsSold: 0, revenue: 0 },
      ]);
    });

    it('uses the price paid, not the current product price', async () => {
      await seedOrder(customerId, '2026-01-01', [
        { productId: taza.id, quantity: 1, unitPrice: 5 },
      ]);

      const res = await getStats(adminToken).expect(200);

      expect(res.body[0]).toEqual({
        productId: taza.id,
        name: 'Taza',
        unitsSold: 1,
        revenue: 5,
      });
    });
  });
});
