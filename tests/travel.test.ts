import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { atTime } from '../src/lib/dates';
import { busyBetween, freeMinutes, outingsOn, skipBusy } from '../src/lib/engine/schedule';
import type { AppState, ClassBlock } from '../src/lib/types';

const SUN = '2026-11-01';
const MON = '2026-11-02';
const blk = (day: number, start: string, end: string, extra: Partial<ClassBlock> = {}): ClassBlock => ({ id: start + day, title: 'x', day, start, end, kind: 'class', createdAt: 0, ...extra });

function st(blocks: ClassBlock[]): AppState {
  const s = initialState();
  s.schedule = blocks;
  return s;
}

describe('travel and rest around lectures', () => {
  it('an in-person morning takes the hour there, the hour back and the rest', () => {
    const s = st([blk(0, '08:00', '09:50'), blk(0, '10:00', '11:50')]);
    const [o] = outingsOn(s, SUN);
    expect(o.leave).toBe(atTime(SUN, '07:00'));
    expect(o.home).toBe(atTime(SUN, '12:50'));
    // 08:00–13:50 counts, less the 10-minute gap between the lectures
    expect(busyBetween(s, SUN, atTime(SUN, '08:00'), atTime(SUN, '23:30'))).toBe(340);
    expect(skipBusy(s, atTime(SUN, '12:00'))).toBe(atTime(SUN, '13:50'));
  });

  it('a short gap keeps you out; a long one sends you home and back', () => {
    const short = st([blk(0, '08:00', '09:00'), blk(0, '11:00', '12:00')]);
    expect(outingsOn(short, SUN)).toHaveLength(1);
    const long = st([blk(0, '08:00', '09:00'), blk(0, '14:00', '15:00')]);
    expect(outingsOn(long, SUN)).toHaveLength(2);
  });

  it('an online lecture has no travel and no rest', () => {
    const s = st([blk(1, '16:00', '18:00', { remote: true })]);
    expect(outingsOn(s, MON)).toHaveLength(0);
    expect(busyBetween(s, MON, atTime(MON, '08:00'), atTime(MON, '23:30'))).toBe(120);
  });

  it('travel and rest can be turned off', () => {
    const s = st([blk(0, '10:00', '12:00')]);
    const before = freeMinutes(s, SUN);
    s.settings.commuteMin = 0;
    s.settings.restMin = 0;
    expect(freeMinutes(s, SUN) - before).toBe(180);
  });
});

describe('skipping a lecture', () => {
  it('gives the day back the lecture, the trip and the rest, and study follows', async () => {
    const { studyCapFor, availableFor } = await import('../src/lib/engine/capacity');
    const s = st([blk(0, '10:00', '12:00')]);
    s.settings.studyCap = [150, 150, 150, 150, 150, 150, 150];
    const cap = studyCapFor(s, SUN);
    const avail = availableFor(s, SUN);
    s.skipClass = { [`${SUN}|${s.schedule[0].id}`]: true };
    // 2 h lecture + 1 h there + 1 h back + 1 h rest
    expect(studyCapFor(s, SUN) - cap).toBe(300);
    expect(availableFor(s, SUN) - avail).toBe(300);
    // only that date — next Sunday is as before
    expect(studyCapFor(s, '2026-11-08')).toBe(cap);
  });

});

describe('a day that ends after midnight', () => {
  it('still has free time around the lectures (it used to read as none)', async () => {
    const { studyCapFor } = await import('../src/lib/engine/capacity');
    const s = st([blk(0, '08:00', '09:50'), blk(0, '13:00', '14:50')]);
    s.settings.dayEnd = '01:00';
    // 08:00 → 01:00 is 17 h; home between the two lectures: busy 08:00–11:50 and 12:00–16:50
    expect(freeMinutes(s, SUN)).toBe(1020 - 230 - 290);
    expect(studyCapFor(s, SUN)).toBe(s.settings.studyCap[0]);
  });
});
