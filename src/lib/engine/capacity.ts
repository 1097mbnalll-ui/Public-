import type { AppState } from '../types';
import { atTime, minutesUntil, todayKey, weekday } from '../dates';

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

/** between midnight and 5am: time to sleep, not to plan work until dawn */
export const isNight = (now: number) => new Date(now).getHours() < 5;

/** when today's work can realistically start: now, or 8am if it's the middle of the night */
export function workStart(now: number): number {
  return isNight(now) ? atTime(todayKey(now), '08:00') : now;
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
