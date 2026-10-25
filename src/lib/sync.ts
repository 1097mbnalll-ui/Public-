// Sync between the user's own devices through their own Google Apps Script (see syncServer.ts).
// The whole state travels gzip + AES-GCM encrypted with a key that only the paired devices hold;
// the script just stores the blob with a revision number. Bank messages the iPhone Shortcut posts
// to the script are taken once (and deleted there) by whichever device opens first.
//
// The sync settings live in this browser only (never in the synced state, backups or transfers).

import { useSyncExternalStore } from 'react';
import type { AppState } from './types';
import { getState, mutate, replaceState, subscribe } from './store';
import { migrate } from './defaults';
import { fromB64url, idSnapshot, mergeSynced, pipe, toB64url, type IdSnapshot } from './transfer';
import { parseBankSms } from './engine/money';
import { uid } from './text';
import { L } from './i18n';
import { isNative, SITE_URL } from './native';

export interface SyncConf {
  url: string;
  token: string;
  key: string;
  /** last server revision this device has */
  rev: number;
  /** changed here since the last push */
  dirty: boolean;
  last?: number;
  error?: string;
}

const LS = 'masar.sync';
const BASE = 'masar.sync.base';

function getBase(): IdSnapshot | null {
  try {
    return JSON.parse(localStorage.getItem(BASE) || 'null');
  } catch {
    return null;
  }
}

/** remember what the server holds now, so a later merge can tell deletions from additions */
function setBase(s: AppState | null) {
  try {
    if (s) localStorage.setItem(BASE, JSON.stringify(idSnapshot(s)));
    else localStorage.removeItem(BASE);
  } catch {
    /* ignore */
  }
}
const PENDING = 'masar.sync.pending';

const ls = new Set<() => void>();
let cache: SyncConf | null | undefined;

export function getSync(): SyncConf | null {
  if (cache !== undefined) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(LS) || 'null');
  } catch {
    cache = null;
  }
  return cache ?? null;
}

function setSync(c: SyncConf | null) {
  cache = c;
  try {
    if (c) localStorage.setItem(LS, JSON.stringify(c));
    else localStorage.removeItem(LS);
  } catch {
    /* storage blocked — sync just won't persist */
  }
  ls.forEach((f) => f());
}

const patch = (p: Partial<SyncConf>) => {
  const c = getSync();
  if (c) setSync({ ...c, ...p });
};

export function useSyncConf(): SyncConf | null {
  return useSyncExternalStore(
    (f) => {
      ls.add(f);
      return () => ls.delete(f);
    },
    getSync,
    getSync,
  );
}

const randomB64 = (n: number) => toB64url(crypto.getRandomValues(new Uint8Array(n)));

/** token + key made before the script exists (the user copies the code, goes to Google, comes back) */
export function pendingSetup(): { token: string; key: string } {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING) || 'null');
    if (p?.token && p?.key) return p;
  } catch {
    /* fall through */
  }
  const p = { token: randomB64(18), key: randomB64(32) };
  try {
    localStorage.setItem(PENDING, JSON.stringify(p));
  } catch {
    /* ignore */
  }
  return p;
}

export const validScriptUrl = (u: string) => /^https:\/\/script\.google\.com\/macros\/(s|u\/\d+\/s)\/[\w-]+\/exec$/.test(u.trim());

// ---------------- crypto ----------------

async function aes(key: string) {
  return crypto.subtle.importKey('raw', fromB64url(key) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptState(state: AppState, key: string): Promise<string> {
  const body = await pipe(new TextEncoder().encode(JSON.stringify(state)), new CompressionStream('gzip'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(key), body as BufferSource));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return toB64url(out);
}

export async function decryptState(data: string, key: string): Promise<AppState> {
  const raw = fromB64url(data);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) as BufferSource }, await aes(key), raw.subarray(12) as BufferSource));
  return migrate(JSON.parse(new TextDecoder().decode(await pipe(plain, new DecompressionStream('gzip')))));
}

// ---------------- talking to the script ----------------

async function call(c: Pick<SyncConf, 'url' | 'token'>, a: string, body?: string, extra = '') {
  const u = `${c.url.trim()}?a=${a}&t=${encodeURIComponent(c.token)}${extra}`;
  // text/plain keeps it a "simple" request — Apps Script can't answer CORS preflights
  const r = await fetch(u, body === undefined ? { cache: 'no-store' } : { method: 'POST', body, headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
  if (!r.ok) throw new Error(L(`خطأ من قوقل (${r.status})`, `Google error (${r.status})`));
  let j: any;
  try {
    j = await r.json();
  } catch {
    throw new Error(L('الرابط ما رجّع رد صحيح — تأكد إنه رابط «تطبيق الويب» وإن الوصول «أي شخص».', "The link didn't answer properly — make sure it's the Web app link with access set to “Anyone”."));
  }
  if (j?.error === 'token') throw new Error(L('الكود في قوقل ما يطابق هذا الجهاز — انسخ الكود من جديد والصقه.', "The code in Google doesn't match this device — copy the code again and paste it."));
  return j;
}

const hasData = (s: AppState) => s.tasks.length + s.procedures.length + s.courses.length + s.expenses.length > 0;

/** first device: check the script answers, then start syncing */
export async function connect(url: string) {
  const p = pendingSetup();
  const c = { url: url.trim(), token: p.token, key: p.key };
  const ping = await call(c, 'ping');
  if (!ping?.ok) throw new Error(L('ما قدرت أتصل — راجع الخطوات.', "Couldn't connect — check the steps."));
  setSync({ ...c, rev: 0, dirty: true });
  try {
    localStorage.removeItem(PENDING);
  } catch {
    /* ignore */
  }
  await syncNow();
  const err = getSync()?.error;
  if (err) throw new Error(err);
}

/** the link another device opens (or pastes) to join */
export function pairLink(): string {
  const c = getSync();
  if (!c) return '';
  // links made inside the Android app point at the site, so anyone can open them
  const base = isNative() ? SITE_URL : location.href.split('#')[0];
  return `${base}#/sync?c=${toB64url(new TextEncoder().encode(JSON.stringify({ u: c.url, t: c.token, k: c.key })))}`;
}

export async function joinFromLink(text: string) {
  const m = text.match(/[?&]c=([\w-]+)/);
  if (!m) throw new Error(L('هذا مو رابط ربط من «مدار».', "That's not a Madar pairing link."));
  let j: { u?: unknown; t?: string; k?: string };
  try {
    j = JSON.parse(new TextDecoder().decode(fromB64url(m[1])));
  } catch {
    throw new Error(L('رابط الربط تالف.', 'The pairing link is damaged.'));
  }
  if (!j?.u || !j?.t || !j?.k) throw new Error(L('رابط الربط ناقص.', 'The pairing link is incomplete.'));
  // only ever talk to a Google Apps Script — a crafted link must not send the data anywhere else
  if (typeof j.u !== 'string' || !validScriptUrl(j.u)) throw new Error(L('رابط الربط لا يشير إلى سكربت قوقل — لا تستخدمه.', "This pairing link doesn't point to a Google script — don't use it."));
  await call({ url: j.u, token: j.t }, 'ping');
  // with nothing here yet, simply take the other device's data; otherwise merge both
  setSync({ url: j.u, token: j.t, key: j.k, rev: 0, dirty: hasData(getState()) });
  await syncNow();
  const err = getSync()?.error;
  if (err) throw new Error(err);
}

export function stopSync() {
  setSync(null);
  setBase(null);
}

/** the address the iPhone Shortcut posts bank messages to */
export function smsHookUrl(): string {
  const c = getSync();
  return c ? `${c.url}?a=sms&t=${encodeURIComponent(c.token)}` : '';
}

// ---------------- the sync loop ----------------

let applying = false;
let busy = false;
let again = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

async function apply(next: AppState) {
  applying = true;
  try {
    await replaceState(next, L('مزامنة', 'Sync'), false);
  } finally {
    applying = false;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** bank messages waiting in the script → expenses (each message is handed to one device only) */
async function takeSms(c: SyncConf) {
  const t = await call(c, 'take');
  const list: { id: string; at: number; text: string }[] = t?.sms || [];
  if (!list.length) return 0;
  const seen = new Set(getState().money.smsSeen || []);
  const found = list.flatMap((m) => parseBankSms(/^\s*\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}/.test(m.text) ? m.text : `${stamp(m.at)}\n${m.text}`)).filter((f) => !seen.has(f.key));
  if (!found.length) return 0;
  mutate((s) => {
    for (const { key: _k, ...f } of found) s.expenses.push({ ...f, id: uid(), source: 'sms', createdAt: Date.now() });
    s.money.smsSeen = [...(s.money.smsSeen || []), ...found.map((f) => f.key)].slice(-3000);
  });
  return found.length;
}

let onSms: ((n: number) => void) | null = null;
export function onSmsAdded(fn: (n: number) => void) {
  onSms = fn;
}

export async function syncNow(): Promise<void> {
  if (!getSync()) return;
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  try {
    let c = getSync()!;
    // 1) bring in what the other device did
    const p = await call(c, 'pull', undefined, `&rev=${c.rev}`);
    if (p.rev > c.rev) {
      if (p.data) {
        const remote = await decryptState(p.data, c.key);
        // re-read: something may have changed here while we were waiting on the network
        const dirty = getSync()!.dirty;
        await apply(dirty ? mergeSynced(getState(), remote, getBase()) : remote);
        if (!dirty) setBase(remote);
      }
      patch({ rev: p.rev });
    }
    // 2) bank messages from the Shortcut
    const n = await takeSms(getSync()!);
    if (n) onSms?.(n);
    // 3) send what changed here
    for (let tries = 0; tries < 3 && getSync()?.dirty; tries++) {
      c = getSync()!;
      const sent = getState();
      const r = await call(c, 'push', JSON.stringify({ base: c.rev, data: await encryptState(sent, c.key) }));
      if (r.ok) {
        // the base is what the server now holds — not whatever was added while uploading
        setBase(sent);
        patch({ rev: r.rev, dirty: getState() !== sent });
      } else if (r.conflict) {
        // both devices changed: keep both, then try again on top of theirs
        if (r.data) await apply(mergeSynced(getState(), await decryptState(r.data, c.key), getBase()));
        patch({ rev: r.rev, dirty: true });
      } else throw new Error(L('ما قدرت أرفع التعديلات.', "Couldn't upload the changes."));
    }
    patch({ last: Date.now(), error: undefined });
  } catch (e) {
    patch({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    busy = false;
    if (again) {
      again = false;
      void syncNow();
    }
  }
}

/** keep in step: on open, when the app comes back to the screen, every 30 s while visible, and shortly after each change */
export function startSync() {
  subscribe(() => {
    if (applying || !getSync()) return;
    if (!getSync()!.dirty) patch({ dirty: true });
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void syncNow(), 1500);
  });
  const tick = () => document.visibilityState === 'visible' && navigator.onLine !== false && void syncNow();
  addEventListener('visibilitychange', tick);
  addEventListener('online', tick);
  addEventListener('focus', tick);
  setInterval(tick, 30_000);
  tick();
}
