import { useSyncExternalStore } from 'react';
import { popOverlay, pushOverlay } from './router';

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
  | { type: 'block'; id?: string };

let current: SheetSpec | null = null;
const ls = new Set<() => void>();

const notify = () => ls.forEach((l) => l());

export function openSheet(s: SheetSpec) {
  current = s;
  pushOverlay(() => {
    current = null;
    notify();
  });
  notify();
}

// navigating to another screen closes any open sheet
addEventListener('hashchange', () => {
  if (!current) return;
  current = null;
  notify();
});

export function closeSheet() {
  current = null;
  popOverlay();
  notify();
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
