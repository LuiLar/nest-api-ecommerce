import { z } from 'zod';

// `ADMIN_EMAIL=` in a .env arrives as '', which must mean "not set", the same as a missing line.
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

const envSchema = z
  .object({
    JWT_SECRET: z
      .string({ error: 'is required' })
      .min(1, { error: 'cannot be empty' }),
    DATABASE_URL: z
      .string({ error: 'is required' })
      .startsWith('postgresql://', { error: 'must start with postgresql://' }),
    // '' and missing both mean "use the default". z.coerce.number() alone turns '' into 0.
    PORT: z.preprocess(
      (value) => (value === '' || value === undefined ? 3000 : value),
      z.coerce.number(),
    ),
    ADMIN_EMAIL: z.preprocess(emptyAsUndefined, z.string().optional()),
    ADMIN_PASSWORD_HASH: z.preprocess(
      emptyAsUndefined,
      z
        .string()
        .startsWith('$argon2id$', { error: 'must start with $argon2id$' })
        .optional(),
    ),
  })
  // "both or neither" is a rule between two fields, so it lives on the whole object.
  .superRefine((env, ctx) => {
    if (
      env.ADMIN_EMAIL !== undefined &&
      env.ADMIN_PASSWORD_HASH === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['ADMIN_PASSWORD_HASH'],
        message: 'required when ADMIN_EMAIL is set',
      });
    }
    if (
      env.ADMIN_PASSWORD_HASH !== undefined &&
      env.ADMIN_EMAIL === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['ADMIN_EMAIL'],
        message: 'required when ADMIN_PASSWORD_HASH is set',
      });
    }
  });

type Env = z.infer<typeof envSchema>;

const validateEnv = (envs: Record<string, string | undefined>): Env => {
  const result = envSchema.safeParse(envs);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables: ${details}`);
  }
  return result.data;
};

export { validateEnv };
export type { Env };
