import type { AppState } from '../types';
import { minutesUntil, todayKey, weekday } from '../dates';

/** free minutes you said you have for planned work on a day */
export function availableFor(state: AppState, day: string): number {
  const o = state.dayOverrides[day];
  return o != null ? o : state.settings.available[weekday(day)] ?? 0;
}

export function studyCapFor(state: AppState, day: string): number {
  return Math.min(state.settings.studyCap[weekday(day)] ?? 0, availableFor(state, day));
}

/** minutes left before your day ends */
export function minutesLeftToday(state: AppState, now: number): number {
  return Math.max(0, minutesUntil(state.settings.dayEnd || '23:30', now));
}

export function dayRecord(state: AppState, day: string) {
  return state.days[day] || { done: 0, minutes: 0, study: 0 };
}

/** study capacity still usable today */
export function studyCapToday(state: AppState, now: number): number {
  const today = todayKey(now);
  const left = studyCapFor(state, today) - dayRecord(state, today).study;
  return Math.max(0, Math.min(left, minutesLeftToday(state, now)));
}
