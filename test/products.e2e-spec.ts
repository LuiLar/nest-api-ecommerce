import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { Role } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const admin = { email: 'admin@mail.com', password: 'Admin123!' };

const seed = [
  { name: 'Remera', price: 10.99 },
  { name: 'Pantalon', price: 10 },
  { name: 'Gorra', price: 6.5 },
];

const nameAndPrice = ({ name, price }: { name: string; price: number }) => ({
  name,
  price,
});

describe('Products (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let seededIds: number[];
  let adminToken: string;

  // POST /products with the admin's token.
  const createProduct = (body: object) =>
    request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();
    const created = await prisma.product.createManyAndReturn({ data: seed });
    seededIds = created.map(({ id }) => id).sort((a, b) => a - b);

    // Register can't create admins, so the admin goes straight into the DB.
    await prisma.user.create({
      data: {
        email: admin.email,
        hashedPass: await argon2.hash(admin.password),
        role: Role.admin,
      },
    });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send(admin)
      .expect(200);
    adminToken = res.body.token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /products', () => {
    it('returns 200 with the seeded products, ordered by id', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .expect(200);

      expect(res.body.map(nameAndPrice)).toEqual(seed);
    });

    it('returns each product with exactly id, name, price as a number and dates', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .expect(200);

      expect(res.body[0]).toEqual({
        id: seededIds[0],
        name: 'Remera',
        price: 10.99,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('filters by maxPrice, inclusive', async () => {
      const res = await request(app.getHttpServer())
        .get('/products?maxPrice=10')
        .expect(200);

      expect(res.body.map(nameAndPrice)).toEqual(
        seed.filter(({ price }) => price <= 10),
      );
    });

    it('treats an empty maxPrice as no filter', async () => {
      const res = await request(app.getHttpServer())
        .get('/products?maxPrice=')
        .expect(200);

      expect(res.body).toHaveLength(seed.length);
    });

    it('treats maxPrice=0 as a filter, not as "no filter"', async () => {
      const res = await request(app.getHttpServer())
        .get('/products?maxPrice=0')
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('returns 400 when maxPrice is not a number', async () => {
      const res = await request(app.getHttpServer())
        .get('/products?maxPrice=abc')
        .expect(400);

      expect(res.body).toEqual({ message: 'maxPrice has to be a number' });
    });
  });

  describe('GET /products/:id', () => {
    it('returns 200 with the product', async () => {
      const res = await request(app.getHttpServer())
        .get(`/products/${seededIds[0]}`)
        .expect(200);

      expect(nameAndPrice(res.body)).toEqual(seed[0]);
    });

    it('returns 404 when the product does not exist', async () => {
      const res = await request(app.getHttpServer())
        .get(`/products/${seededIds[seededIds.length - 1] + 1}`)
        .expect(404);

      expect(res.body).toEqual({ message: 'Product not found' });
    });

    it('returns 404 for the max INT id (valid but missing)', async () => {
      await request(app.getHttpServer())
        .get('/products/2147483647')
        .expect(404);
    });

    it.each(['abc', '1.5', '0', '-1', '2147483648', '99999999999'])(
      'returns 400 when the id is %s',
      async (id) => {
        const res = await request(app.getHttpServer())
          .get(`/products/${id}`)
          .expect(400);

        expect(res.body).toEqual({ message: 'Invalid ID' });
      },
    );
  });

  describe('POST /products: authentication (JwtAuthGuard)', () => {
    const post = () =>
      request(app.getHttpServer())
        .post('/products')
        .send({ name: 'Sin token', price: 1 });

    it.each([
      ['there is no Authorization header', undefined],
      ['the scheme is not Bearer', 'Basic abc'],
    ])(
      'returns 401 "Authentication token required" when %s',
      async (_, header) => {
        const req = post();
        if (header) req.set('Authorization', header);

        const res = await req.expect(401);

        expect(res.body).toEqual({ message: 'Authentication token required' });
      },
    );

    it('returns 401 "Invalid or expired token" for a token that is not a JWT', async () => {
      const res = await post()
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);

      expect(res.body).toEqual({ message: 'Invalid or expired token' });
    });

    it('returns 401 "Invalid or expired token" for a token signed with another secret', async () => {
      const forged = await new JwtService({
        secret: 'another_secret',
      }).signAsync({ sub: 1 });

      const res = await post()
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);

      expect(res.body).toEqual({ message: 'Invalid or expired token' });
    });

    it('returns 401 "Invalid or expired token" for an expired token', async () => {
      const expired = await new JwtService({
        secret: process.env.JWT_SECRET,
      }).signAsync({ sub: 1, exp: Math.floor(Date.now() / 1000) - 60 });

      const res = await post()
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);

      expect(res.body).toEqual({ message: 'Invalid or expired token' });
    });

    it('returns 401 for a valid token whose user no longer exists', async () => {
      const ghost = await prisma.user.create({
        data: { email: 'ghost@mail.com', hashedPass: 'x' },
      });
      const token = await new JwtService({
        secret: process.env.JWT_SECRET,
      }).signAsync({ sub: ghost.id });
      await prisma.user.delete({ where: { id: ghost.id } });

      const res = await post()
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(res.body).toEqual({ message: 'Invalid or expired token' });
    });

    it('checks the token before the body: an invalid body without a token is 401, not 400', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .send({ name: '', price: -1 })
        .expect(401);
    });

    it('keeps GET /products public', async () => {
      await request(app.getHttpServer()).get('/products').expect(200);
    });
  });

  describe('POST /products: authorization (RolesGuard)', () => {
    let customerToken: string;

    beforeAll(async () => {
      const customer = { email: 'customer@mail.com', password: 'Secreta123!' };
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(customer)
        .expect(201);
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send(customer)
        .expect(200);
      customerToken = res.body.token;
    });

    it('returns 403 for a customer, and the product is not created', async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ name: 'Customer product', price: 1 })
        .expect(403);

      expect(res.body).toEqual({
        message: 'User does not have enough permissions',
      });
      expect(
        await prisma.product.findUnique({
          where: { name: 'Customer product' },
        }),
      ).toBeNull();
    });

    it('checks the role before the body: an invalid body from a customer is 403, not 400', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ name: '', price: -1 })
        .expect(403);
    });
  });

  describe('POST /products', () => {
    it('returns 400 with one { field, message } per problem', async () => {
      const res = await createProduct({ name: '', price: -1 }).expect(400);

      expect(res.body).toEqual([
        { field: 'name', message: expect.any(String) },
        { field: 'price', message: expect.any(String) },
      ]);
    });

    it('returns 201 with the product, and it is listed afterwards', async () => {
      const res = await createProduct({ name: 'Taza', price: 5 }).expect(201);

      expect(res.body).toEqual({
        id: expect.any(Number),
        name: 'Taza',
        price: 5,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      const byId = await request(app.getHttpServer())
        .get(`/products/${res.body.id}`)
        .expect(200);
      expect(byId.body).toEqual(res.body);
    });

    it('trims the name', async () => {
      const res = await createProduct({ name: '  Vaso  ', price: 3 }).expect(
        201,
      );

      expect(res.body.name).toBe('Vaso');
    });

    it('returns 201 for the max price allowed by DECIMAL(10,2)', async () => {
      const res = await createProduct({
        name: 'Max price',
        price: 99_999_999.99,
      }).expect(201);

      expect(res.body.price).toBe(99_999_999.99);
    });

    it('returns 400 for the first price above DECIMAL(10,2)', async () => {
      const res = await createProduct({
        name: 'Over max price',
        price: 100_000_000,
      }).expect(400);

      expect(res.body.map(({ field }: { field: string }) => field)).toEqual([
        'price',
      ]);
    });

    it('returns 400 for a price with more than 2 decimals', async () => {
      const res = await createProduct({
        name: 'Three decimals',
        price: 1.001,
      }).expect(400);

      expect(res.body.map(({ field }: { field: string }) => field)).toEqual([
        'price',
      ]);
    });

    it('returns 415 when the body is not application/json', async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set('Content-Type', 'text/plain')
        .send('taza')
        .expect(415);

      expect(res.body).toEqual({
        message: '"Content-Type" must be "application/json"',
      });
    });

    it('returns 409 when the name already exists', async () => {
      const product = { name: 'Temp', price: 43.84 };
      await createProduct(product).expect(201);

      const res = await createProduct(product).expect(409);

      expect(res.body).toEqual({ message: 'Product already exists' });
    });
  });

  describe('error format', () => {
    it('answers an unknown route with 404 and only a message', async () => {
      const res = await request(app.getHttpServer()).get('/nope').expect(404);

      expect(res.body).toEqual({ message: expect.any(String) });
    });
  });
});
