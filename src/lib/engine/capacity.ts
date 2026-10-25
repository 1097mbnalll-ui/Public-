import type { AppState } from '../types';
import { addDays, atTime, todayKey, weekday } from '../dates';
import { blocksOn, busyBetween, freeMinutes, freedMinutes } from './schedule';

/** free minutes you said you have for planned work on a day */
export function availableFor(state: AppState, day: string): number {
  const o = state.dayOverrides[day];
  const base = o != null ? o : state.settings.available[weekday(day)] ?? 0;
  // a raised study time brings the day's time up with it, keeping your usual time for tasks on top
  const raised = state.studyOverrides?.[day];
  const taskTime = Math.max(0, (state.settings.available[weekday(day)] ?? 0) - (state.settings.studyCap[weekday(day)] ?? 0));
  const set = raised != null ? Math.max(base, raised + taskTime) : base;
  // a lecture you skip gives its time (and the trip) back to that day
  const freed = freedMinutes(state, day);
  // lectures / shifts take their share: never plan more than the time left around them
  return blocksOn(state, day, true).length ? Math.min(set + freed, freeMinutes(state, day)) : set;
}

export function studyCapFor(state: AppState, day: string): number {
  const set = state.studyOverrides?.[day] ?? state.settings.studyCap[weekday(day)] ?? 0;
  return Math.min(set + freedMinutes(state, day), availableFor(state, day));
}

/** when your day ends */
export function dayEndAt(state: AppState, now: number): number {
  const end = state.settings.dayEnd || '23:30';
  // a day that ends after midnight (e.g. 01:00) ends tomorrow — unless it's already past midnight
  if (+end.slice(0, 2) < 5 && !isNight(now)) return atTime(addDays(todayKey(now), 1), end);
  return atTime(todayKey(now), end);
}

/** minutes left before your day ends */
export function minutesLeftToday(state: AppState, now: number): number {
  const endAt = dayEndAt(state, now);
  const left = Math.round((endAt - now) / 60000);
  return Math.max(0, left - busyBetween(state, todayKey(now), now, endAt));
}

/** between midnight and 5am: time to sleep, not to plan work until dawn */
export const isNight = (now: number) => new Date(now).getHours() < 5;

export type DayPhase = 'morning' | 'day' | 'evening' | 'night';

/** what the home page is for right now: plan the day, get through it, wrap it up, or sleep */
export function dayPhase(state: AppState, now: number): DayPhase {
  const end = dayEndAt(state, now);
  if (isNight(now) || now >= end) return 'night';
  if (now >= end - 2 * 3600_000) return 'evening';
  return new Date(now).getHours() < 12 ? 'morning' : 'day';
}

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
