import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Prisma (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('connects to the test database, never the development one', async () => {
    const rows = await prisma.$queryRaw<{ db: string }[]>`
      SELECT current_database() AS db`;
    expect(rows).toEqual([{ db: 'ecommerce_nest_test' }]);
  });

  it('has the migrations applied, with every CHECK constraint from Express', async () => {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT conname AS name
      FROM pg_constraint
      WHERE contype = 'c' AND connamespace = 'public'::regnamespace
      ORDER BY conname`;
    expect(rows.map((row) => row.name)).toEqual([
      'order_items_quantity_check',
      'order_items_unit_price_check',
      'orders_total_check',
      'products_price_check',
      'products_stock_check',
    ]);
  });
});
