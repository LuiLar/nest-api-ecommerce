import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: './test/setup-env.ts',
    // The e2e files share one test database, so they run one at a time (Jest's --runInBand in Express).
    fileParallelism: false,
  },
});
