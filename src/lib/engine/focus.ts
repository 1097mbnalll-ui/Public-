// Pomodoro math on top of the plain timer: work blocks with short breaks in between.
// Only work blocks count as worked time, so breaks never inflate your logged minutes.

export interface PomodoroState {
  phase: 'work' | 'break';
  /** ms left in the current phase */
  left: number;
  /** ms length of the current phase */
  length: number;
  /** work blocks fully completed */
  done: number;
  /** ms of actual work (breaks excluded) */
  workMs: number;
}

export function pomodoro(elapsedMs: number, workMin = 25, breakMin = 5): PomodoroState {
  const w = Math.max(1, workMin) * 60000;
  const b = Math.max(0, breakMin) * 60000;
  const cycle = w + b;
  const cycles = Math.floor(elapsedMs / cycle);
  const pos = elapsedMs - cycles * cycle;
  const inWork = pos < w;
  return {
    phase: inWork ? 'work' : 'break',
    left: inWork ? w - pos : cycle - pos,
    length: inWork ? w : b,
    done: cycles + (inWork ? 0 : 1),
    workMs: cycles * w + Math.min(pos, w),
  };
}
