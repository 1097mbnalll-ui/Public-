// Device-to-device transfer without any server or account.
// The state is compressed, then encrypted (AES-GCM, key from PBKDF2 over a random code).
// The result travels as a link fragment (#…, never sent to any server) or as a file;
// only someone holding the code can open it.

import type { AppState } from './types';
import { migrate } from './defaults';
import { L } from './i18n';
import { isNative, SITE_URL } from './native';
import { toWestern } from './text';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const CODE_LEN = 12; // ≈ 59 bits
const ITER = 310_000;
const VERSION = 1;

export function newCode(): string {
  const r = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  let c = '';
  for (const x of r) c += ALPHABET[x % ALPHABET.length];
  return c;
}

/** "K7QM9XWD3PRA" → "K7QM-9XWD-3PRA" */
export const prettyCode = (c: string) => c.match(/.{1,4}/g)!.join('-');

/** forgiving input: lowercase, spaces, dashes, Arabic-Indic digits */
export function cleanCode(input: string): string {
  return toWestern(input)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

const enc = new TextEncoder();
const dec = new TextDecoder();

async function key(code: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', enc.encode(cleanCode(code)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const canGzip = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/** a course pack carried inside a link (#/import?pack=…): gzip + base64url, nothing stored on the server */
export async function unpackLinkPack(s: string): Promise<unknown> {
  const raw = await pipe(fromB64url(s), new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(raw));
}

/** the reverse: put a pack inside a link */
export async function packLinkPack(data: unknown): Promise<string> {
  return toB64url(await pipe(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream('gzip')));
}

export function toB64url(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/** layout: [version][flags][salt ×16][iv ×12][ciphertext…] — flags bit0 = gzip */
export async function seal(state: AppState, code: string): Promise<Uint8Array> {
  let body = enc.encode(JSON.stringify({ app: 'masar', exportedAt: new Date().toISOString(), data: state }));
  const gz = canGzip();
  if (gz) body = (await pipe(body, new CompressionStream("gzip"))) as Uint8Array<ArrayBuffer>;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(code, salt), body as BufferSource));
  const out = new Uint8Array(2 + 16 + 12 + ct.length);
  out[0] = VERSION;
  out[1] = gz ? 1 : 0;
  out.set(salt, 2);
  out.set(iv, 18);
  out.set(ct, 30);
  return out;
}

export class WrongCode extends Error {}

export async function open(packed: Uint8Array, code: string): Promise<{ state: AppState; exportedAt?: string }> {
  if (packed.length < 31 || packed[0] !== VERSION) throw new Error(L('هذا الرابط أو الملف ليس نقلًا من «مسار» أو أنه ناقص.', "This link or file isn't a Masar transfer, or it's incomplete."));
  const salt = packed.subarray(2, 18);
  const iv = packed.subarray(18, 30);
  let body: Uint8Array;
  try {
    body = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await key(code, salt), packed.subarray(30) as BufferSource));
  } catch {
    throw new WrongCode(L('الكود غير صحيح.', "Wrong code."));
  }
  if (packed[1] & 1) body = await pipe(body, new DecompressionStream('gzip'));
  const raw = JSON.parse(dec.decode(body));
  return { state: migrate(raw.data ?? raw), exportedAt: raw.exportedAt };
}

/** links above this size get awkward in chat apps; offer the file instead */
export const LINK_LIMIT = 60_000;

export function transferLink(packed: Uint8Array): string {
  // links made inside the Android app point at the site, so anyone can open them
  const base = isNative() ? SITE_URL : location.href.split('#')[0];
  return `${base}#/receive?d=${toB64url(packed)}`;
}

// ---------- merge (keep both devices' data) ----------

type WithId = { id: string; updatedAt?: number; createdAt?: number; at?: number };

function unionById<T extends WithId>(mine: T[], theirs: T[]): T[] {
  const map = new Map(mine.map((x) => [x.id, x]));
  for (const t of theirs) {
    const m = map.get(t.id);
    if (!m) map.set(t.id, t);
    else {
      const mt = m.updatedAt ?? m.at ?? m.createdAt ?? 0;
      const tt = t.updatedAt ?? t.at ?? t.createdAt ?? 0;
      if (tt > mt) map.set(t.id, t); // the more recently edited copy wins
    }
  }
  return [...map.values()];
}

const LISTS = ['tasks', 'procedures', 'goals', 'courses', 'units', 'exams', 'sessions', 'thoughts', 'templates', 'expenses', 'subs', 'schedule'] as const;
export type IdSnapshot = Partial<Record<(typeof LISTS)[number], string[]>>;

/** the ids in each list — what both devices agreed on at the last sync */
export function idSnapshot(s: AppState): IdSnapshot {
  const out: IdSnapshot = {};
  for (const k of LISTS) out[k] = ((s[k] || []) as { id: string }[]).map((x) => x.id);
  return out;
}

/** merge with deletions: an item that existed at the last sync and is now missing on either side was deleted there */
export function mergeSynced(mine: AppState, theirs: AppState, base: IdSnapshot | null): AppState {
  const out = mergeStates(mine, theirs);
  if (!base) return out;
  for (const k of LISTS) {
    const was = new Set(base[k] || []);
    if (!was.size) continue;
    const m = new Set(((mine[k] || []) as { id: string }[]).map((x) => x.id));
    const t = new Set(((theirs[k] || []) as { id: string }[]).map((x) => x.id));
    (out as any)[k] = ((out[k] || []) as { id: string }[]).filter((x) => !(was.has(x.id) && (!m.has(x.id) || !t.has(x.id))));
  }
  return out;
}

/** combine two devices' data; on conflicts the most recently edited item wins, this device's settings stay */
export function mergeStates(mine: AppState, theirs: AppState): AppState {
  const out: AppState = structuredClone(mine);
  out.tasks = unionById(mine.tasks, theirs.tasks);
  out.procedures = unionById(mine.procedures, theirs.procedures);
  out.goals = unionById(mine.goals, theirs.goals);
  out.courses = unionById(mine.courses, theirs.courses);
  out.units = unionById(mine.units, theirs.units);
  out.exams = unionById(mine.exams, theirs.exams);
  out.sessions = unionById(mine.sessions, theirs.sessions);
  out.thoughts = unionById(mine.thoughts, theirs.thoughts);
  out.expenses = unionById(mine.expenses || [], theirs.expenses || []);
  out.subs = unionById(mine.subs || [], theirs.subs || []);
  out.schedule = unionById(mine.schedule || [], theirs.schedule || []);
  out.money = {
    ...theirs.money,
    ...mine.money,
    swaps: { ...theirs.money?.swaps, ...mine.money?.swaps },
    cats: unionById(mine.money?.cats || [], theirs.money?.cats || []),
    smsSeen: [...new Set([...(theirs.money?.smsSeen || []), ...(mine.money?.smsSeen || [])])].slice(-3000),
    ...(mine.money?.goal || theirs.money?.goal ? { goal: mine.money?.goal && theirs.money?.goal ? { ...mine.money.goal, saved: Math.max(mine.money.goal.saved, theirs.money.goal.saved) } : mine.money?.goal || theirs.money?.goal } : {}),
  };
  // templates: same name means the same template — keep one
  const names = new Set(mine.templates.map((t) => t.name.trim()));
  out.templates = unionById(mine.templates, theirs.templates.filter((t) => !names.has(t.name.trim()) || mine.templates.some((m) => m.id === t.id)));
  out.dayOverrides = { ...theirs.dayOverrides, ...mine.dayOverrides };
  out.skipClass = { ...theirs.skipClass, ...mine.skipClass };
  out.studyOverrides = { ...theirs.studyOverrides, ...mine.studyOverrides };
  out.studyDefer = { ...theirs.studyDefer, ...mine.studyDefer };
  out.studyOff = { ...theirs.studyOff, ...mine.studyOff };
  out.quotaLog = { ...theirs.quotaLog, ...mine.quotaLog };
  for (const [d, r] of Object.entries(theirs.days)) {
    const m = out.days[d];
    out.days[d] = m ? { done: Math.max(m.done, r.done), minutes: Math.max(m.minutes, r.minutes), study: Math.max(m.study, r.study) } : r;
  }
  return migrate(out);
}
