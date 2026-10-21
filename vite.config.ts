import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps the build portable (GitHub Pages sub-path, local file server, etc.)
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
