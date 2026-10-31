import { defineConfig } from 'vitest/config';

// Testy reguł Firestore – uruchamiane w emulatorze: npm run test:rules
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20000,
  },
});
