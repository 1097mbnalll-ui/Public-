// Learns from your own history: how far off your estimates are and how fast you study.
// Every number here is derived from data you entered — nothing is invented.

import type { AppState, Area, Course, Task } from '../types';

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export interface EstimateCalibration {
  /** multiply your estimates by this to get realistic time */
  factor: number;
  /** number of finished tasks the factor is based on */
  n: number;
}

/** ratio actual / estimate from recently finished tasks that had both */
export function calibration(state: AppState, area?: Area): EstimateCalibration {
  const ratios = state.tasks
    .filter((t) => t.status === 'done' && t.estimate && t.spent > 0 && (!area || t.area === area))
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
    .slice(0, 25)
    .map((t) => t.spent / (t.estimate as number));
  if (ratios.length < 3) {
    // not enough evidence: fall back to all areas, then to no correction
    if (area) {
      const all = calibration(state);
      return all.n >= 3 ? all : { factor: 1, n: ratios.length };
    }
    return { factor: 1, n: ratios.length };
  }
  return { factor: clamp(median(ratios), 0.5, 3), n: ratios.length };
}

/** typical duration of a task in an area when you didn't estimate it */
export function typicalMinutes(state: AppState, area: Area): { minutes: number; n: number } {
  const spent = state.tasks.filter((t) => t.status === 'done' && t.area === area && t.spent > 0).map((t) => t.spent);
  if (spent.length < 3) return { minutes: 30, n: spent.length };
  return { minutes: clamp(Math.round(median(spent)), 10, 240), n: spent.length };
}

export interface TaskTime {
  /** realistic remaining minutes */
  minutes: number;
  /** true when no estimate exists and a default was used */
  guessed: boolean;
}

export function taskTime(state: AppState, t: Task, cal?: EstimateCalibration): TaskTime {
  if (t.estimate) {
    const c = cal || calibration(state, t.area);
    const total = t.estimate * c.factor;
    return { minutes: Math.max(5, Math.round(total - t.spent)), guessed: false };
  }
  const typ = typicalMinutes(state, t.area);
  return { minutes: Math.max(5, typ.minutes - t.spent), guessed: true };
}

// ---------------- Study pace ----------------

/** difficulty multiplier, difficulty 3 = 1.0 */
export const diffFactor = (d: number) => 0.4 + 0.2 * clamp(d || 3, 1, 5);

export interface Pace {
  /** minutes per size unit at difficulty 3 */
  pace: number;
  /** number of real study sessions behind the number */
  n: number;
  /** relative uncertainty (0.15 = ±15%) */
  spread: number;
  source: 'data' | 'guess' | 'global' | 'default';
}

function observed(state: AppState, course: Course, before?: string): { minutes: number; norm: number; n: number } {
  let minutes = 0;
  let norm = 0;
  let n = 0;
  for (const s of state.sessions) {
    // only sessions on a lesson that covered new material say how fast you learn: review and
    // "general" sessions are faster or unmeasured and would make the plan too optimistic
    if (s.courseId !== course.id || s.review || !s.unitId || s.amount <= 0 || s.minutes <= 0) continue;
    if (before && s.date >= before) continue;
    // ignore physically implausible entries (e.g. a 1-minute timer logged as 20 pages)
    const raw = s.minutes / s.amount;
    if (raw < 0.25 || raw > 60) continue;
    const unit = s.unitId ? state.units.find((u) => u.id === s.unitId) : undefined;
    minutes += s.minutes;
    norm += s.amount * diffFactor(unit?.difficulty || course.difficulty);
    n++;
  }
  return { minutes, norm, n };
}

/** `before`: only sessions before that day count — the study plan uses the pace you had when the
 *  day started, so today's pages don't shift under you; what you show today counts from tomorrow */
export function coursePace(state: AppState, course: Course, before?: string): Pace {
  const obs = observed(state, course, before);
  let prior: number;
  let source: Pace['source'];
  let priorWeight = 2;
  if (course.paceGuess && course.paceGuess > 0) {
    prior = course.paceGuess / diffFactor(course.difficulty);
    source = 'guess';
  } else {
    // pace from your other courses, if you have enough history
    let m = 0;
    let nn = 0;
    let cnt = 0;
    for (const c of state.courses) {
      if (c.id === course.id) continue;
      const o = observed(state, c, before);
      m += o.minutes;
      nn += o.norm;
      cnt += o.n;
    }
    if (cnt >= 3 && nn > 0) {
      prior = m / nn;
      source = 'global';
    } else {
      prior = state.settings.defaultPace;
      source = 'default';
      priorWeight = 1;
    }
  }
  if (obs.n === 0 || obs.norm <= 0) {
    const spread = source === 'default' ? 0.5 : source === 'global' ? 0.35 : 0.4;
    return { pace: prior, n: 0, spread, source };
  }
  const actual = obs.minutes / obs.norm;
  // blend prior and evidence: evidence dominates as sessions accumulate
  const pace = (prior * priorWeight + actual * obs.n) / (priorWeight + obs.n);
  const spread = Math.max(0.1, 0.45 / Math.sqrt(1 + obs.n));
  return { pace, n: obs.n, spread, source: 'data' };
}
