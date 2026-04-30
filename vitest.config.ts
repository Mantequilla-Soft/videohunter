import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 60_000, // first run downloads the MongoDB binary
    coverage: {
      provider: 'v8',
      include: ['src/services/**'],
    },
  },
});
