// Local persistence: IndexedDB (primary) + localStorage mirror (fallback).
// Daily snapshots are kept so a bad edit or import can be rolled back.

import type { AppState } from './types';

const DB_NAME = 'masar';
const LS_KEY = 'masar.state';
const KEEP_SNAPSHOTS = 14;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        if (!db) return resolve(undefined);
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export async function loadState(): Promise<unknown | null> {
  try {
    const v = await tx<unknown>('kv', 'readonly', (s) => s.get('state'));
    if (v) return v;
  } catch {
    /* fall through to localStorage */
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

export async function saveState(state: AppState): Promise<boolean> {
  let ok = false;
  try {
    await tx('kv', 'readwrite', (s) => s.put(state, 'state'));
    ok = (await openDb()) !== null;
  } catch {
    ok = false;
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    ok = true;
  } catch {
    /* quota or private mode — IndexedDB copy still exists */
  }
  return ok;
}

export async function saveSnapshot(day: string, state: AppState): Promise<void> {
  try {
    await tx('snapshots', 'readwrite', (s) => s.put(state, day));
    const keys = ((await tx<IDBValidKey[]>('snapshots', 'readonly', (s) => s.getAllKeys())) || []) as string[];
    keys.sort();
    const extra = keys.slice(0, Math.max(0, keys.length - KEEP_SNAPSHOTS));
    for (const k of extra) await tx('snapshots', 'readwrite', (s) => s.delete(k));
  } catch {
    /* snapshots are best effort */
  }
}

export async function listSnapshots(): Promise<string[]> {
  try {
    const keys = ((await tx<IDBValidKey[]>('snapshots', 'readonly', (s) => s.getAllKeys())) || []) as string[];
    return keys.sort().reverse();
  } catch {
    return [];
  }
}

export async function getSnapshot(day: string): Promise<unknown | null> {
  try {
    return (await tx<unknown>('snapshots', 'readonly', (s) => s.get(day))) ?? null;
  } catch {
    return null;
  }
}

export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function isPersisted(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persisted) return null;
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}
