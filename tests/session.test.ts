import { describe, expect, it } from 'vitest';
import { blockParts, fitTotal, focusAlerts, partAt, planSession, pomodoro, splitWorked } from '../src/lib/engine/focus';
import { DEFAULT_SETTINGS } from '../src/lib/defaults';
import type { Timer } from '../src/lib/types';

const M = 60000;
const start = new Date('2026-10-28T16:00:00').getTime();

describe('planned study session', () => {
  it('2 h at 25/5 ends at 18:15 with three breaks', () => {
    const p = planSession(start, 120, { work: 25, brk: 5 });
    expect(p.rounds).toBe(5);
    expect(p.breakMin).toBe(20);
    expect(p.end).toBe(start + 140 * M);
    expect(p.blocks.at(-1)).toMatchObject({ kind: 'work', min: 20 }); // the last round is the remainder
  });
  it('no break after the last round', () => {
    const p = planSession(start, 50, { work: 25, brk: 5 });
    expect(p.blocks.map((b) => b.kind)).toEqual(['work', 'break', 'work']);
    expect(p.end).toBe(start + 55 * M);
  });
  it('a long break every 4 rounds', () => {
    const p = planSession(start, 200, { work: 25, brk: 5, longEvery: 4, longBrk: 15 });
    expect(p.blocks.filter((b) => b.kind === 'long')).toHaveLength(1);
    expect(p.blocks[7]).toMatchObject({ kind: 'long', min: 15 });
    expect(p.breakMin).toBe(6 * 5 + 15);
  });
  it('no breaks at all', () => {
    expect(planSession(start, 90, { work: 30, brk: 0 }).end).toBe(start + 90 * M);
  });
});

describe('the timer follows the same rhythm', () => {
  it('long break is a break, and work after it counts', () => {
    const p = pomodoro((4 * 30 + 3) * M, 25, 5, 4, 15);
    expect(p).toMatchObject({ phase: 'break', long: true, done: 4 });
    expect(p.workMs).toBe(100 * M);
    expect(pomodoro(26 * M, 25, 5).phase).toBe('break');
  });
  it('the phone gets an alert at each break and at the end', () => {
    const t: Timer = { kind: 'study', refId: 'e', label: 'x', startedAt: start, acc: 0, running: true, plan: { total: 50, work: 25, brk: 5 } };
    const a = focusAlerts(t, DEFAULT_SETTINGS, start + M);
    expect(a.map((x) => x.kind)).toEqual(['break', 'work', 'end']);
    expect(a[2].at).toBe(start + 55 * M);
    expect(focusAlerts({ ...t, running: false }, DEFAULT_SETTINGS, start)).toEqual([]);
  });
});

describe('several subjects in one session', () => {
  const parts = [{ label: 'إحصاء', minutes: 40 }, { label: 'إنجليزي', minutes: 20 }];
  it('which subject you are on', () => {
    expect(partAt(parts, 0)).toEqual({ index: 0, left: 40 });
    expect(partAt(parts, 39)).toEqual({ index: 0, left: 1 });
    expect(partAt(parts, 45)).toEqual({ index: 1, left: 15 });
  });
  it('worked minutes split in order; extra goes to the last', () => {
    expect(splitWorked(parts, 50)).toEqual([40, 10]);
    expect(splitWorked(parts, 30)).toEqual([30, 0]);
    expect(splitWorked(parts, 70)).toEqual([40, 30]);
  });
  it('each focus block says which subject it covers', () => {
    const p = planSession(start, 60, { work: 25, brk: 5 });
    const c = blockParts(p, parts);
    expect(c[0]).toEqual([{ label: 'إحصاء', min: 25, index: 0 }]);
    expect(c[2]).toEqual([{ label: 'إحصاء', min: 15, index: 0 }, { label: 'إنجليزي', min: 10, index: 1 }]);
    expect(c[4]).toEqual([{ label: 'إنجليزي', min: 10, index: 1 }]);
  });
});

describe('from… to…', () => {
  it('fits the most focus between two times, breaks included', () => {
    const t = fitTotal(start, start + 60 * M, { work: 25, brk: 5 });
    expect(planSession(start, t, { work: 25, brk: 5 }).end).toBeLessThanOrEqual(start + 60 * M);
    expect(planSession(start, t + 1, { work: 25, brk: 5 }).end).toBeGreaterThan(start + 60 * M);
    expect(t).toBe(50); // 25 + 5 + 25 = 55; one more minute needs another break
    expect(fitTotal(start, start + 2 * 3600_000, { work: 50, brk: 10 })).toBe(100);
  });
});
