import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { atTime } from '../src/lib/dates';
import { advance, freeMinutes, readSchedule, skipBusy } from '../src/lib/engine/schedule';
import { availableFor, minutesLeftToday } from '../src/lib/engine/capacity';
import type { AppState } from '../src/lib/types';

function withClasses(): AppState {
  const s = initialState();
  const b = (title: string, day: number, start: string, end: string) => ({ id: title + start, title, day, start, end, kind: 'class' as const, createdAt: 1 });
  // Sunday 2026-10-25
  s.schedule = [b('عرب 100', 0, '08:00', '09:50'), b('كيم 101', 0, '10:00', '11:50'), b('انجل 106', 0, '13:00', '14:50')];
  return s;
}

describe('timetable', () => {
  it('reads an AI reply in Arabic or numbers', () => {
    const got = readSchedule({ schedule: [{ title: 'كيم 101', day: 'الثلاثاء', start: '8.00', end: '9:50' }, { title: 'x', day: 1, start: '10:00', end: '09:00' }, { title: 'دوام', day: 4, start: '09:00', end: '13:00', kind: 'work' }] });
    expect(got).toEqual([
      { title: 'كيم 101', day: 2, start: '08:00', end: '09:50', kind: 'class' },
      { title: 'دوام', day: 4, start: '09:00', end: '13:00', kind: 'work' },
    ]);
  });

  it('steps over lectures when placing work', () => {
    const s = withClasses();
    const at = (t: string) => atTime('2026-10-25', t);
    expect(skipBusy(s, at('10:30'))).toBe(at('11:50'));
    // 60 min starting 11:50 → 10 min before 12:00… then 50 more, done 12:50 (no lecture in between)
    expect(advance(s, at('11:50'), 60)).toBe(at('12:50'));
    // 90 min from 12:00 → 60 until 13:00, lecture till 14:50, 30 more → 15:20
    expect(advance(s, at('12:00'), 90)).toBe(at('15:20'));
  });

  it('free time and today’s remaining minutes leave lectures out', () => {
    const s = withClasses();
    s.settings.dayEnd = '23:00';
    s.settings.available = [900, 900, 900, 900, 900, 900, 900];
    // 08:00–23:00 = 900 min, minus 110 + 110 + 110
    expect(freeMinutes(s, '2026-10-25')).toBe(570);
    expect(availableFor(s, '2026-10-25')).toBe(570);
    expect(minutesLeftToday(s, atTime('2026-10-25', '12:00'))).toBe(660 - 110);
  });
});
