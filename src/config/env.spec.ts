import { validateEnv } from './env.js';

const valid = {
  JWT_SECRET: 'test-secret',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/ecommerce_nest_test',
};

const ADMIN_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';

describe('validateEnv', () => {
  it('defaults PORT to 3000 when it is missing', () => {
    expect(validateEnv(valid).PORT).toBe(3000);
  });

  it('defaults PORT to 3000 when it is an empty string', () => {
    expect(validateEnv({ ...valid, PORT: '' }).PORT).toBe(3000);
  });

  it('parses PORT as a number', () => {
    expect(validateEnv({ ...valid, PORT: '4000' }).PORT).toBe(4000);
  });

  it('accepts the env without admin variables', () => {
    expect(() => validateEnv(valid)).not.toThrow();
  });

  it('treats empty admin variables as missing, like a copied .env.example', () => {
    const env = validateEnv({
      ...valid,
      ADMIN_EMAIL: '',
      ADMIN_PASSWORD_HASH: '',
    });
    expect(env.ADMIN_EMAIL).toBeUndefined();
    expect(env.ADMIN_PASSWORD_HASH).toBeUndefined();
  });

  it('accepts an admin email together with an argon2id hash', () => {
    expect(() =>
      validateEnv({
        ...valid,
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD_HASH: ADMIN_HASH,
      }),
    ).not.toThrow();
  });

  it.each([
    ['JWT_SECRET missing', { ...valid, JWT_SECRET: undefined }, 'JWT_SECRET'],
    ['JWT_SECRET empty', { ...valid, JWT_SECRET: '' }, 'JWT_SECRET'],
    [
      'DATABASE_URL missing',
      { ...valid, DATABASE_URL: undefined },
      'DATABASE_URL',
    ],
    [
      'DATABASE_URL not postgresql',
      { ...valid, DATABASE_URL: 'mysql://user@localhost/db' },
      'DATABASE_URL',
    ],
    [
      'ADMIN_EMAIL without hash',
      { ...valid, ADMIN_EMAIL: 'admin@example.com' },
      'ADMIN_PASSWORD_HASH',
    ],
    [
      'hash without ADMIN_EMAIL',
      { ...valid, ADMIN_PASSWORD_HASH: ADMIN_HASH },
      'ADMIN_EMAIL',
    ],
    [
      'hash is not argon2id',
      {
        ...valid,
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD_HASH: 'plain-password',
      },
      'ADMIN_PASSWORD_HASH',
    ],
  ])('rejects: %s, and the message names the field', (_name, env, field) => {
    expect(() => validateEnv(env)).toThrow(field);
  });
});
