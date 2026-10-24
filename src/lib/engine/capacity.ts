import type { AppState } from '../types';
import { addDays, atTime, todayKey, weekday } from '../dates';
import { blocksOn, busyBetween, freeMinutes } from './schedule';

/** free minutes you said you have for planned work on a day */
export function availableFor(state: AppState, day: string): number {
  const o = state.dayOverrides[day];
  const set = o != null ? o : state.settings.available[weekday(day)] ?? 0;
  // lectures / shifts take their share: never plan more than the time left around them
  return blocksOn(state, day).length ? Math.min(set, freeMinutes(state, day)) : set;
}

export function studyCapFor(state: AppState, day: string): number {
  return Math.min(state.settings.studyCap[weekday(day)] ?? 0, availableFor(state, day));
}

/** minutes left before your day ends */
export function minutesLeftToday(state: AppState, now: number): number {
  const end = state.settings.dayEnd || '23:30';
  let endAt = atTime(todayKey(now), end);
  // a day that ends after midnight (e.g. 01:00) ends tomorrow — unless it's already past midnight
  if (+end.slice(0, 2) < 5 && !isNight(now)) endAt = atTime(addDays(todayKey(now), 1), end);
  const left = Math.round((endAt - now) / 60000);
  return Math.max(0, left - busyBetween(state, todayKey(now), now, endAt));
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
