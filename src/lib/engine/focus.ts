// Pomodoro math on top of the plain timer: work blocks with short breaks in between, and
// optionally a longer break every few rounds. Only work blocks count as worked time, so breaks
// never inflate your logged minutes.

import type { Settings, Timer } from '../types';

export interface PomodoroState {
  phase: 'work' | 'break';
  /** the break is the long one */
  long?: boolean;
  /** ms left in the current phase */
  left: number;
  /** ms length of the current phase */
  length: number;
  /** work blocks fully completed */
  done: number;
  /** ms of actual work (breaks excluded) */
  workMs: number;
}

/** a focus rhythm: focus minutes, break minutes, and a long break every `longEvery` rounds (0 = none) */
export interface Rhythm {
  work: number;
  brk: number;
  longEvery?: number;
  longBrk?: number;
}

/** the timer's own rhythm when it's a planned session, otherwise the one in settings */
export function rhythmOf(t: Timer | undefined, st: Settings): Rhythm {
  if (t?.plan) return { work: t.plan.work, brk: t.plan.brk, longEvery: t.plan.longEvery || 0, longBrk: t.plan.longBrk || 0 };
  return { work: st.pomodoroWork, brk: st.pomodoroBreak, longEvery: st.pomodoroLongEvery || 0, longBrk: st.pomodoroLong || 0 };
}

const breakAfter = (round: number, r: Rhythm) => (r.longEvery && r.longEvery > 0 && round % r.longEvery === 0 ? r.longBrk ?? r.brk : r.brk);

export function pomodoro(elapsedMs: number, workMin = 25, breakMin = 5, longEvery = 0, longMin = 0): PomodoroState {
  const r: Rhythm = { work: workMin, brk: breakMin, longEvery, longBrk: longMin };
  const w = Math.max(1, workMin) * 60000;
  let t = 0;
  let done = 0;
  for (;;) {
    if (elapsedMs < t + w) return { phase: 'work', left: t + w - elapsedMs, length: w, done, workMs: done * w + Math.max(0, elapsedMs - t) };
    t += w;
    done++;
    const b = Math.max(0, breakAfter(done, r)) * 60000;
    if (elapsedMs < t + b) return { phase: 'break', ...(b !== Math.max(0, breakMin) * 60000 ? { long: true } : {}), left: t + b - elapsedMs, length: b, done, workMs: done * w };
    t += b;
  }
}

export interface SessionBlock {
  kind: 'work' | 'break' | 'long';
  from: number;
  to: number;
  min: number;
  /** work: which round */
  round?: number;
}

export interface SessionPlan {
  blocks: SessionBlock[];
  end: number;
  rounds: number;
  workMin: number;
  breakMin: number;
}

/**
 * A study session laid out from `start`: `total` minutes of focus cut into rounds, with the
 * breaks between them (none after the last). The last round is shorter when `total` doesn't
 * divide evenly.
 */
export function planSession(start: number, total: number, r: Rhythm): SessionPlan {
  const blocks: SessionBlock[] = [];
  const work = Math.max(1, r.work);
  let left = Math.max(1, Math.round(total));
  let t = start;
  let round = 0;
  let breakMin = 0;
  while (left > 0 && round < 100) {
    round++;
    const m = Math.min(work, left);
    blocks.push({ kind: 'work', from: t, to: t + m * 60000, min: m, round });
    t += m * 60000;
    left -= m;
    if (left <= 0) break;
    const b = Math.max(0, breakAfter(round, r));
    if (b > 0) {
      const long = b !== r.brk;
      blocks.push({ kind: long ? 'long' : 'break', from: t, to: t + b * 60000, min: b });
      t += b * 60000;
      breakMin += b;
    }
  }
  return { blocks, end: t, rounds: round, workMin: Math.round(total), breakMin };
}

/** time left in a planned session after `elapsedMs` on its timer (pauses don't count) */
export function sessionLeft(elapsedMs: number, total: number, r: Rhythm): number {
  const plan = planSession(0, total, r);
  return Math.max(0, plan.end - elapsedMs);
}

/** the moments a running timer changes phase from now on — the phone alerts at each even if the app sleeps */
export function focusAlerts(t: Timer, st: Settings, now: number): { at: number; kind: 'break' | 'long' | 'work' | 'end'; min: number; round?: number }[] {
  if (!t.running) return [];
  const r = rhythmOf(t, st);
  const elapsed = t.acc + (now - t.startedAt);
  // without a plan, the next few rounds (a timer left running shouldn't ring all night)
  const plan = planSession(0, t.plan ? t.plan.total : Math.ceil((elapsed / 60000 + r.work * 4) / r.work) * r.work, r);
  const out: ReturnType<typeof focusAlerts> = [];
  for (const b of plan.blocks) if (b.from > elapsed && (b.kind !== 'work' || (b.round ?? 0) > 1)) out.push({ at: now + (b.from - elapsed), kind: b.kind, min: b.min, round: b.round });
  if (t.plan && plan.end > elapsed) out.push({ at: now + (plan.end - elapsed), kind: 'end', min: 0 });
  return out.slice(0, 12);
}
