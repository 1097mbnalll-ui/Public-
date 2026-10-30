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
  kind: 'work' | 'break' | 'long' | 'prayer';
  /** prayer: which one */
  prayer?: string;
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
  /** time away for prayer inside the session */
  prayerMin: number;
}

/** a stretch the session steps around (a prayer: from the adhan until you're back) */
export interface SessionPause {
  id: string;
  from: number;
  to: number;
}

/**
 * A study session laid out from `start`: `total` minutes of focus cut into rounds, with the
 * breaks between them (none after the last). The last round is shorter when `total` doesn't
 * divide evenly.
 */
export function planSession(start: number, total: number, r: Rhythm, pauses: SessionPause[] = []): SessionPlan {
  const blocks: SessionBlock[] = [];
  const gaps = pauses.filter((g) => g.to > start).sort((x, y) => x.from - y.from);
  const shown = new Set<SessionPause>();
  let t = start;
  let prayerMs = 0;
  // lay a block from t, stepping around any pause: the part before it, the pause, then the rest
  const place = (kind: 'work' | 'break' | 'long', min: number, round?: number) => {
    let need = min * 60000;
    while (need > 0) {
      const inGap = gaps.find((g) => g.from <= t && t < g.to);
      if (inGap) {
        if (!shown.has(inGap)) {
          shown.add(inGap);
          blocks.push({ kind: 'prayer', prayer: inGap.id, from: t, to: inGap.to, min: Math.round((inGap.to - t) / 60000) });
          prayerMs += inGap.to - t;
        }
        t = inGap.to;
        continue;
      }
      const next = gaps.find((g) => g.from > t && g.from < t + need);
      const end = next ? next.from : t + need;
      blocks.push({ kind, from: t, to: end, min: Math.round((end - t) / 60000), ...(round ? { round } : {}) });
      need -= end - t;
      t = end;
    }
  };
  const work = Math.max(1, r.work);
  let left = Math.max(1, Math.round(total));
  let round = 0;
  let breakMin = 0;
  while (left > 0 && round < 100) {
    round++;
    const m = Math.min(work, left);
    place('work', m, round);
    left -= m;
    if (left <= 0) break;
    const b = Math.max(0, breakAfter(round, r));
    if (b > 0) {
      place(b !== r.brk ? 'long' : 'break', b);
      breakMin += b;
    }
  }
  return { blocks, end: t, rounds: round, workMin: Math.round(total), breakMin, prayerMin: Math.round(prayerMs / 60000) };
}

/** time left in a planned session after `elapsedMs` on its timer (pauses don't count) */
/** the clock time after `activeMs` of session time from `from`, stepping around pauses (prayers) */
export function clockAfter(from: number, activeMs: number, pauses: SessionPause[] = []): number {
  let t = from;
  let need = activeMs;
  for (const g of [...pauses].sort((a, b) => a.from - b.from)) {
    if (g.to <= t) continue;
    if (g.from <= t) { t = g.to; continue; }
    if (g.from >= t + need) break;
    need -= g.from - t;
    t = g.to;
  }
  return t + need;
}

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
  for (const b of plan.blocks) if (b.kind !== 'prayer' && b.from > elapsed && (b.kind !== 'work' || (b.round ?? 0) > 1)) out.push({ at: now + (b.from - elapsed), kind: b.kind, min: b.min, round: b.round });
  if (t.plan && plan.end > elapsed) out.push({ at: now + (plan.end - elapsed), kind: 'end', min: 0 });
  return out.slice(0, 12);
}

/** one subject (or lesson) inside a planned session, studied in order */
export interface SessionPart {
  examId?: string;
  courseId?: string;
  unitId?: string;
  label: string;
  /** focus minutes it gets */
  minutes: number;
}

/** which part `workMin` minutes of focus are in, and how much of it is left */
export function partAt(parts: SessionPart[], workMin: number): { index: number; left: number } {
  let acc = 0;
  for (let i = 0; i < parts.length; i++) {
    acc += parts[i].minutes;
    if (workMin < acc - 1e-9) return { index: i, left: acc - workMin };
  }
  return { index: Math.max(0, parts.length - 1), left: 0 };
}

/** focus minutes actually worked, handed to the parts in order (the last one takes any extra) */
export function splitWorked(parts: SessionPart[], minutes: number): number[] {
  let left = minutes;
  return parts.map((p, i) => {
    const m = i === parts.length - 1 ? left : Math.min(p.minutes, left);
    left -= m;
    return Math.max(0, Math.round(m));
  });
}

/** what each focus block covers: «الإحصاء 20 د · إنجليزي 5 د» */
export function blockParts(plan: SessionPlan, parts: SessionPart[]): { label: string; min: number; index: number }[][] {
  let i = 0;
  let used = 0;
  return plan.blocks.map((b) => {
    if (b.kind !== 'work') return [];
    const out: { label: string; min: number; index: number }[] = [];
    let need = b.min;
    while (need > 0 && i < parts.length) {
      const take = Math.min(need, parts[i].minutes - used);
      if (take > 0) out.push({ label: parts[i].label, min: take, index: i });
      need -= take;
      used += take;
      if (used >= parts[i].minutes - 1e-9) { i++; used = 0; }
    }
    return out;
  });
}

/** the most focus that fits between `start` and `end` with this rhythm (breaks included) */
export function fitTotal(start: number, end: number, r: Rhythm, pauses: SessionPause[] = []): number {
  const span = Math.floor((end - start) / 60000);
  let best = 0;
  for (let m = 1; m <= Math.min(span, 1440); m++) if (planSession(start, m, r, pauses).end <= end) best = m;
  return best;
}
