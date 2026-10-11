import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// apps/web має власний eslint.config.js
export default defineConfig([
  globalIgnores(['**/dist', '**/coverage', 'apps/web', 'apps/api/drizzle', 'apps/api/legacy-src']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
]);
