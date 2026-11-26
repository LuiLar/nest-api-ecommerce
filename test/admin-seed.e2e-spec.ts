import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// The test env has no ADMIN_* variables, so the startup hook skips the seed.
// These tests call the same method the hook calls.
describe('Admin seed (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auth: AuthService;
  let hash: string;
  const password = 'Admin123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
    hash = await argon2.hash(password);

    await prisma.order.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an admin who can log in with the password behind the hash', async () => {
    await auth.createAdmin('boss@mail.com', hash);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { email: 'boss@mail.com' },
    });
    expect(stored.role).toBe(Role.admin);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'boss@mail.com', password })
      .expect(200);
  });

  it('is idempotent: running it again does not fail or duplicate the admin', async () => {
    await auth.createAdmin('boss@mail.com', hash);
    await auth.createAdmin('boss@mail.com', hash);

    expect(await prisma.user.count({ where: { email: 'boss@mail.com' } })).toBe(
      1,
    );
  });

  it('stores the email trimmed and in lower case, like register', async () => {
    await auth.createAdmin('  Chief@Mail.COM ', hash);

    expect(
      await prisma.user.findUnique({ where: { email: 'chief@mail.com' } }),
    ).not.toBeNull();
  });

  it('is idempotent also when the same email comes with different case or spaces', async () => {
    await auth.createAdmin('  Chief@Mail.COM ', hash);
    await auth.createAdmin('CHIEF@mail.com', hash);

    expect(
      await prisma.user.count({ where: { email: 'chief@mail.com' } }),
    ).toBe(1);
  });

  it('fails when the email belongs to a customer, and does not promote them', async () => {
    const customer = { email: 'taken@mail.com', password: 'Secreta123!' };
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(customer)
      .expect(201);

    await expect(auth.createAdmin(customer.email, hash)).rejects.toThrow(
      'ADMIN_EMAIL belongs to a non-admin user',
    );

    const stored = await prisma.user.findUniqueOrThrow({
      where: { email: customer.email },
    });
    expect(stored.role).toBe(Role.customer);
  });

  it('fails when the email is not valid', async () => {
    await expect(auth.createAdmin('not-an-email', hash)).rejects.toThrow(
      'ADMIN_EMAIL is not a valid email',
    );
  });
});
