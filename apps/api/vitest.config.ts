import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    globalSetup: './src/test/global-setup.ts',
    // Тести ділять одну базу, тому файли виконуються по черзі.
    fileParallelism: false,
  },
});
