// Your own Arabic font (e.g. خط ثمانية), picked from your device. Its licence allows use on your own
// devices but not hosting the files anywhere, so they're never in the app, the repo, a backup or a
// sync: the files you pick stay in this browser's storage and are only read back here.

import { useSyncExternalStore } from 'react';

const DB = 'masar-fonts';
const KEY = 'files';

interface FontFile {
  /** 'sans' for everything, 'display' for page titles */
  role: 'sans' | 'display';
  weight: number;
  data: ArrayBuffer;
}

const WEIGHTS: Record<string, number> = { thin: 100, extralight: 200, light: 300, regular: 400, book: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900, heavy: 900 };

/** "thmanyahsans-Bold.woff2" → sans 700; "thmanyahserifdisplay-Black.otf" → display 900 */
function describe(name: string): Omit<FontFile, 'data'> | null {
  const base = name.split('/').pop() || '';
  if (base.startsWith('.') || !/\.(woff2?|otf|ttf)$/i.test(base)) return null;
  const w = base.replace(/\.[^.]+$/, '').split(/[-_ ]/).pop()!.toLowerCase();
  const weight = WEIGHTS[w] ?? 400;
  // body text from the sans; serif display only for titles; serif text isn't used
  if (/serif\s*display|display/i.test(base)) return { role: 'display', weight };
  if (/serif/i.test(base)) return null;
  return { role: 'sans', weight };
}

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function readStored(): Promise<FontFile[]> {
  try {
    const d = await db();
    return await new Promise((res) => {
      const q = d.transaction('kv').objectStore('kv').get(KEY);
      q.onsuccess = () => res((q.result as FontFile[]) || []);
      q.onerror = () => res([]);
    });
  } catch {
    return [];
  }
}

async function writeStored(files: FontFile[] | null) {
  const d = await db();
  await new Promise<void>((res, rej) => {
    const t = d.transaction('kv', 'readwrite');
    if (files) t.objectStore('kv').put(files, KEY);
    else t.objectStore('kv').delete(KEY);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

// ---------------- reading a .zip (the font family comes zipped) ----------------

async function inflate(data: Uint8Array): Promise<ArrayBuffer> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(out).arrayBuffer();
}

/** the font files inside a zip: name → bytes (stored or deflated entries) */
async function unzip(buf: ArrayBuffer): Promise<{ name: string; data: ArrayBuffer }[]> {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: { name: string; data: ArrayBuffer }[] = [];
  for (let n = 0; n < count && v.getUint32(p, true) === 0x02014b50; n++) {
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.startsWith('__MACOSX') || !describe(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = new Uint8Array(buf, start, size);
    if (method === 0) out.push({ name, data: raw.slice().buffer });
    else if (method === 8) out.push({ name, data: await inflate(raw) });
  }
  return out;
}

// ---------------- applying it ----------------

const FAMILY = { sans: 'Masar Own Sans', display: 'Masar Own Display' } as const;
let active = false;
const ls = new Set<() => void>();

function apply(files: FontFile[]) {
  for (const f of files) document.fonts.add(new FontFace(FAMILY[f.role], f.data, { weight: String(f.weight) }));
  const root = document.documentElement.style;
  const hasSans = files.some((f) => f.role === 'sans');
  const hasDisplay = files.some((f) => f.role === 'display');
  if (hasSans) root.setProperty('--font', `'${FAMILY.sans}', 'Tajawal', 'SF Arabic', -apple-system, sans-serif`);
  else root.removeProperty('--font');
  if (hasDisplay) root.setProperty('--font-display', `'${FAMILY.display}', var(--font)`);
  else root.removeProperty('--font-display');
  active = hasSans || hasDisplay;
  ls.forEach((f) => f());
}

/** on start: the font you picked before, if any */
export async function loadOwnFont() {
  const files = await readStored();
  if (files.length) apply(files);
}

/** pick the zip or the font files; returns how many weights were taken */
export async function setOwnFont(picked: File[]): Promise<number> {
  const found: { name: string; data: ArrayBuffer }[] = [];
  for (const f of picked) {
    if (/\.zip$/i.test(f.name)) found.push(...(await unzip(await f.arrayBuffer())));
    else if (describe(f.name)) found.push({ name: f.name, data: await f.arrayBuffer() });
  }
  // one file per role and weight; woff2 over otf when both are there
  const byKey = new Map<string, FontFile & { woff2: boolean }>();
  for (const x of found) {
    const d = describe(x.name)!;
    const k = `${d.role}${d.weight}`;
    const woff2 = /\.woff2$/i.test(x.name);
    if (!byKey.has(k) || (woff2 && !byKey.get(k)!.woff2)) byKey.set(k, { ...d, data: x.data, woff2 });
  }
  const files = [...byKey.values()].map(({ woff2: _w, ...f }) => f);
  if (!files.some((f) => f.role === 'sans')) throw new Error('none');
  await writeStored(files);
  apply(files);
  return files.filter((f) => f.role === 'sans').length;
}

export async function clearOwnFont() {
  await writeStored(null);
  apply([]);
}

export function useOwnFont(): boolean {
  return useSyncExternalStore(
    (f) => {
      ls.add(f);
      return () => ls.delete(f);
    },
    () => active,
  );
}
