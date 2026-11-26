import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const decodePayload = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  const register = (body: object) =>
    request(app.getHttpServer()).post('/auth/register').send(body);
  const login = (body: object) =>
    request(app.getHttpServer()).post('/auth/login').send(body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const prisma = app.get(PrismaService);
    await prisma.order.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('returns 201 with exactly id, email and role, never the hash', async () => {
      const res = await register({
        email: 'ana@mail.com',
        password: 'Secreta123!',
      }).expect(201);

      expect(res.body).toEqual({
        id: expect.any(Number),
        email: 'ana@mail.com',
        role: 'customer',
      });
    });

    it('stores the email trimmed and in lower case', async () => {
      const res = await register({
        email: '  Bruno@Mail.COM ',
        password: 'Secreta123!',
      }).expect(201);

      expect(res.body.email).toBe('bruno@mail.com');
    });

    it('returns 409 when the email is already registered, ignoring case and spaces', async () => {
      await register({ email: 'dup@mail.com', password: 'Secreta123!' }).expect(
        201,
      );

      const res = await register({
        email: '  DUP@Mail.com ',
        password: 'Secreta123!',
      }).expect(409);

      expect(res.body).toEqual({ message: 'Email already registered' });
    });

    it('ignores a role sent in the body', async () => {
      const res = await register({
        email: 'hacker@mail.com',
        password: 'Secreta123!',
        role: 'admin',
      }).expect(201);

      expect(res.body.role).toBe('customer');
    });

    it.each([
      ['empty body', {}, ['email', 'password']],
      ['invalid email', { email: 'nope', password: 'Secreta123!' }, ['email']],
      [
        'weak password',
        { email: 'weak@mail.com', password: 'abc' },
        ['password', 'password', 'password', 'password'],
      ],
    ])(
      'returns 400 for %s, with one field per problem',
      async (_, body, fields) => {
        const res = await register(body).expect(400);

        expect(res.body.map(({ field }: { field: string }) => field)).toEqual(
          fields,
        );
      },
    );

    it('lets only one of two simultaneous registrations with the same email succeed', async () => {
      const body = { email: 'race@mail.com', password: 'Secreta123!' };

      const responses = await Promise.all([register(body), register(body)]);

      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
    });

    it('returns 415 when the body is not application/json', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Content-Type', 'text/plain')
        .send('')
        .expect(415);

      expect(res.body).toEqual({
        message: '"Content-Type" must be "application/json"',
      });
    });
  });

  describe('POST /auth/login', () => {
    const user = { email: 'login@mail.com', password: 'Secreta123!' };

    beforeAll(async () => {
      await register(user).expect(201);
    });

    it('returns 200 (not 201) with only a token', async () => {
      const res = await login(user).expect(200);

      expect(res.body).toEqual({ token: expect.any(String) });
    });

    it('signs a token whose payload has only sub, iat and exp, valid for 15 minutes', async () => {
      const res = await login(user).expect(200);

      const payload = decodePayload(res.body.token);
      expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub']);
      expect(Number(payload.exp) - Number(payload.iat)).toBe(15 * 60);
    });

    it('puts the user id in sub', async () => {
      const prisma = app.get(PrismaService);
      const stored = await prisma.user.findUniqueOrThrow({
        where: { email: user.email },
      });

      const res = await login(user).expect(200);

      expect(decodePayload(res.body.token).sub).toBe(stored.id);
    });

    it('returns 401 "Invalid credentials" when the password is wrong', async () => {
      const res = await login({
        email: user.email,
        password: 'wrongPass',
      }).expect(401);

      expect(res.body).toEqual({ message: 'Invalid credentials' });
    });

    it('returns 401 with the SAME body when the email does not exist', async () => {
      const res = await login({
        email: 'nobody@mail.com',
        password: user.password,
      }).expect(401);

      expect(res.body).toEqual({ message: 'Invalid credentials' });
    });

    it('accepts the email with different case and surrounding spaces', async () => {
      await login({
        email: ` ${user.email.toUpperCase()} `,
        password: user.password,
      }).expect(200);
    });

    it('returns 400 when the password is empty', async () => {
      const res = await login({ email: user.email, password: '' }).expect(400);

      expect(res.body.map(({ field }: { field: string }) => field)).toEqual([
        'password',
      ]);
    });

    it('returns 415 when the body is not application/json', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Content-Type', 'text/plain')
        .send('')
        .expect(415);

      expect(res.body).toEqual({
        message: '"Content-Type" must be "application/json"',
      });
    });
  });
});
