// @ts-check

// Vendor imports
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import eslintConfigPrettier from 'eslint-config-prettier/flat'
import tseslint from 'typescript-eslint'

export default defineConfig(globalIgnores(['src/generated/**', 'dist/**', 'node_modules/**']), {
  files: ['src/**/*.ts'],
  extends: [
    js.configs.recommended,
    tseslint.configs.recommended,
    // Must be last: disables stylistic rules that would fight Prettier.
    eslintConfigPrettier,
  ],
})
