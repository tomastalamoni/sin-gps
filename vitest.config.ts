import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/data/**/*.test.ts', 'tests/sim/**/*.test.ts'],
    environment: 'node',
  },
});
