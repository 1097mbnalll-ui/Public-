import { useSyncExternalStore } from 'react';
import { popOverlay, pushOverlay } from './router';
import type { GymGoal } from '../lib/types';

export type SheetSpec =
  | { type: 'quick'; text?: string; mode?: 'task' | 'proc' }
  | { type: 'task'; id: string }
  | { type: 'study-log'; courseId?: string; unitId?: string; minutes?: number; fromTimer?: boolean }
  | { type: 'exam'; id?: string; courseId?: string }
  | { type: 'course'; id?: string }
  | { type: 'unit'; id: string }
  | { type: 'palette' }
  | { type: 'shortcuts' }
  | { type: 'replan' }
  | { type: 'step-confirm'; procId: string; stepId: string }
  | { type: 'template'; id?: string; fromProc?: string; fromTask?: string; forTask?: boolean }
  | { type: 'goal'; id: string }
  | { type: 'onboarding' }
  | { type: 'transfer' }
  | { type: 'ai-import' }
  | { type: 'expense'; id?: string; text?: string }
  | { type: 'sms' }
  | { type: 'money-settings' }
  | { type: 'sub'; id?: string }
  | { type: 'sync' }
  | { type: 'block'; id?: string }
  | { type: 'study-subject'; examId: string }
  | { type: 'study-try' }
  | { type: 'gym-setup'; goal?: GymGoal }
  | { type: 'gym-ex'; exId: string; sid?: string; ei?: number }
  | { type: 'gym-pick'; sid: string }
  | { type: 'gym-custom'; sid?: string; name?: string }
  | { type: 'gym-done'; id: string }
  | { type: 'gym-session'; id: string }
  | { type: 'gym-body' }
  | { type: 'gym-info' };

let current: SheetSpec | null = null;
const ls = new Set<() => void>();

const notify = () => ls.forEach((l) => l());

let closing: ReturnType<typeof setTimeout> | null = null;

/** let the sheet slide down before it goes (iOS-style), then remove it */
function closeAnimated() {
  const root = document.documentElement;
  const done = () => {
    closing = null;
    root.classList.remove('sheet-closing');
    current = null;
    notify();
  };
  if (closing) return;
  if (!document.querySelector('.sheet') || matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
  root.classList.add('sheet-closing');
  closing = setTimeout(done, 230);
}

export function openSheet(s: SheetSpec) {
  // opening another sheet while one is sliding away: the new one wins
  if (closing) {
    clearTimeout(closing);
    closing = null;
    document.documentElement.classList.remove('sheet-closing');
  }
  current = s;
  pushOverlay(closeAnimated);
  notify();
}

// navigating to another screen closes any open sheet
addEventListener('hashchange', () => {
  if (!current) return;
  if (closing) clearTimeout(closing);
  closing = null;
  document.documentElement.classList.remove('sheet-closing');
  current = null;
  notify();
});

export function closeSheet() {
  popOverlay();
  closeAnimated();
}

export function useSheet() {
  return useSyncExternalStore(
    (f) => {
      ls.add(f);
      return () => ls.delete(f);
    },
    () => current,
  );
}
