import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Mirror the `@/* -> ./src/*` alias from tsconfig.json so unit tests can import
// modules that use the `@/` path alias (e.g. proxy.ts -> @/lib/supabase/proxy).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
