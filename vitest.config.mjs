import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.{js,cjs,mjs}'],
    environment: 'node'
  }
});
