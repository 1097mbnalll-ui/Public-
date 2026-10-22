// Single source of truth. State is immutable per change (cloned), autosaved locally,
// synced across open tabs, with a short undo history.

import { useSyncExternalStore } from 'react';
import type { AppState } from './types';
import { initialState, migrate } from './defaults';
import { loadState, saveSnapshot, saveState } from './db';
import { todayKey } from './dates';
import { setLang } from './i18n';
import { L } from './i18n';

let state: AppState = initialState();
let ready = false;
const listeners = new Set<() => void>();
const undoStack: { label: string; state: AppState }[] = [];

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
let saveStatus: SaveStatus = 'idle';
const statusListeners = new Set<() => void>();

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('masar') : null;
const tabId = Math.random().toString(36).slice(2);

function emit() {
  setLang(state.settings?.lang);
  for (const l of listeners) l();
}

function setStatus(s: SaveStatus) {
  saveStatus = s;
  for (const l of statusListeners) l();
}

export const getState = () => state;
export const isReady = () => ready;

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useApp(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(
    (fn) => {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    },
    () => saveStatus,
    () => saveStatus,
  );
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  setStatus('saving');
  const ok = await saveState(state);
  setStatus(ok ? 'saved' : 'error');
  channel?.postMessage({ from: tabId, type: 'changed' });
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}

/**
 * Apply a change. Pass `undo` to make the change reversible from the toast.
 */
export function mutate(fn: (s: AppState) => void, undo?: string) {
  if (undo) {
    undoStack.push({ label: undo, state });
    if (undoStack.length > 15) undoStack.shift();
  }
  const next = structuredClone(state);
  fn(next);
  state = next;
  emit();
  scheduleSave();
}

export function canUndo() {
  return undoStack.length > 0;
}

export function undo(): string | null {
  const last = undoStack.pop();
  if (!last) return null;
  state = last.state;
  emit();
  scheduleSave();
  return last.label;
}

/** replace everything (import / restore). Old state is kept in undo. */
export function replaceState(raw: unknown, label = L('استعادة', "Restore")) {
  undoStack.push({ label, state });
  state = migrate(raw);
  emit();
  return flush();
}

/** day-change housekeeping: unfinished plans for past days come back as deferred */
export function rollover(now = Date.now()) {
  const today = todayKey(now);
  const stale =
    state.tasks.some((t) => t.status === 'open' && t.plannedFor && t.plannedFor < today) ||
    state.procedures.some((p) => p.plannedFor && p.plannedFor < today);
  const oldFired = Object.values(state.fired).some((at) => now - at > 7 * 86_400_000);
  if (!stale && !oldFired) return;
  mutate((s) => {
    for (const t of s.tasks) {
      if (t.status === 'open' && t.plannedFor && t.plannedFor < today) {
        t.plannedFor = undefined;
        t.deferrals += 1;
      }
    }
    for (const p of s.procedures) {
      if (p.plannedFor && p.plannedFor < today) {
        p.plannedFor = undefined;
        p.deferrals = (p.deferrals || 0) + 1;
      }
    }
    for (const [k, at] of Object.entries(s.fired)) if (now - at > 7 * 86_400_000) delete s.fired[k];
  });
}

export async function init() {
  const raw = await loadState();
  state = raw ? migrate(raw) : initialState();
  ready = true;
  rollover();
  emit();
  if (!raw) await flush();
  // one snapshot per day, kept for two weeks
  saveSnapshot(todayKey(), state);

  channel?.addEventListener('message', async (e) => {
    if (e.data?.from === tabId || e.data?.type !== 'changed') return;
    const fresh = await loadState();
    if (fresh) {
      state = migrate(fresh);
      emit();
    }
  });
  const onHide = () => {
    if (saveTimer) flush();
  };
  addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && onHide());
}
