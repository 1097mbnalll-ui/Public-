// Two places share one button in the tab bar: العمل with الدراسة, مصاريفي with النادي. The button
// opens whichever of the two you used last; inside, a switch at the top moves to the other.

import { L } from '../lib/i18n';

export interface PairItem {
  id: string;
  icon: string;
  label: () => string;
}

export const PAIRS: { key: string; items: [PairItem, PairItem] }[] = [
  { key: 'ws', items: [{ id: 'work', icon: 'work', label: () => L('العمل', 'Work') }, { id: 'study', icon: 'study', label: () => L('الدراسة', 'Study') }] },
  { key: 'mg', items: [{ id: 'money', icon: 'wallet', label: () => L('مصاريفي', 'Spending') }, { id: 'gym', icon: 'gym', label: () => L('النادي', 'Gym') }] },
];

export const pairOf = (page: string) => PAIRS.find((p) => p.items.some((i) => i.id === page));

const LS = (key: string) => `masar.pair.${key}`;

/** the one of the pair opened last (the first of the two until then) */
export function lastOf(key: string): PairItem {
  const p = PAIRS.find((x) => x.key === key)!;
  let id: string | null = null;
  try {
    id = localStorage.getItem(LS(key));
  } catch {
    /* storage blocked: the first one */
  }
  return p.items.find((i) => i.id === id) || p.items[0];
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
