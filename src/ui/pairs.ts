// Two places share one button in the tab bar: المهام with صقل, العمل with الدراسة, مصاريفي with صحتي (when it's on). The button
// opens whichever of the two you used last; inside, a switch at the top moves to the other.

import { L } from '../lib/i18n';
import type { AppState } from '../lib/types';

export interface PairItem {
  id: string;
  icon: string;
  label: () => string;
  /** shown only when this is true (an optional section) */
  when?: (s: AppState) => boolean;
}

export const PAIRS: { key: string; items: [PairItem, PairItem] }[] = [
  { key: 'tf', items: [{ id: 'tasks', icon: 'tasks', label: () => L('المهام', 'Tasks') }, { id: 'future', icon: 'target', label: () => L('صقل', 'Sharpen') }] },
  { key: 'ws', items: [{ id: 'work', icon: 'work', label: () => L('العمل', 'Work') }, { id: 'study', icon: 'study', label: () => L('الدراسة', 'Study') }] },
  { key: 'mg', items: [{ id: 'money', icon: 'wallet', label: () => L('مصاريفي', 'Spending') }, { id: 'health', icon: 'heart', label: () => L('صحتي', 'Health'), when: (s) => !!(s.settings.sections?.diet || s.settings.sections?.gym) }] },
];

export const pairOf = (page: string) => PAIRS.find((p) => p.items.some((i) => i.id === page));

/** the items of a pair you can see now */
export const shown = (items: PairItem[], s: AppState) => items.filter((i) => !i.when || i.when(s));

const LS = (key: string) => `masar.pair.${key}`;

/** the one of the pair opened last (the first of the two until then) */
export function lastOf(key: string, s?: AppState): PairItem {
  const p = PAIRS.find((x) => x.key === key)!;
  const items = s ? shown(p.items, s) : p.items;
  let id: string | null = null;
  try {
    id = localStorage.getItem(LS(key));
  } catch {
    /* storage blocked: the first one */
  }
  return items.find((i) => i.id === id) || items[0];
}

export function remember(page: string) {
  const p = pairOf(page);
  if (!p) return;
  try {
    localStorage.setItem(LS(p.key), page);
  } catch {
    /* ignore */
  }
}
