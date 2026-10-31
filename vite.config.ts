import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { CHANGES, VERSION } from './src/lib/changelog';

// The built file names are hashed, so the service worker learns them here: it caches all of them
// on install (offline works after the very first visit) and its cache name changes with every build.
function precache(): Plugin {
  const files: string[] = [];
  let outDir = 'dist';
  return {
    name: 'masar-precache',
    apply: 'build',
    configResolved: (c) => void (outDir = c.build.outDir),
    generateBundle(_, bundle) {
      files.push(...Object.keys(bundle).filter((f) => /\.(js|css|woff2?)$/.test(f)));
    },
    closeBundle() {
      const sw = resolve(outDir, 'sw.js');
      const version = files.slice().sort().join('|');
      let h = 0;
      for (const ch of version) h = (h * 31 + ch.charCodeAt(0)) | 0;
      writeFileSync(sw, readFileSync(sw, 'utf8').replace("'__VERSION__'", JSON.stringify((h >>> 0).toString(36))).replace('[] /* __PRECACHE__ */', JSON.stringify(files.map((f) => './' + f))));
    },
  };
}

// version.json next to the site: the app compares it with its own version to say an update is out
function versionFile(): Plugin {
  let outDir = 'dist';
  return {
    name: 'masar-version',
    apply: 'build',
    configResolved: (c) => void (outDir = c.build.outDir),
    closeBundle() {
      writeFileSync(resolve(outDir, 'version.json'), JSON.stringify({ version: VERSION, release: CHANGES[0] }));
    },
  };
}

// Only scripts shipped with the site may run; the AI key and sync secrets live in this origin.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  // course packs can be opened from any https link; sync and Claude are https too
  "connect-src 'self' https:",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const csp = (): Plugin => ({
  name: 'masar-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

// base: './' keeps the build portable (GitHub Pages sub-path, local file server, etc.)
export default defineConfig({
  base: './',
  plugins: [react(), csp(), precache(), versionFile()],
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], env: { TZ: 'Asia/Riyadh' } },
});
