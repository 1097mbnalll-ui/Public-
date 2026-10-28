import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { atTime } from '../src/lib/dates';
import { markLessonIn, planStudy } from '../src/lib/engine/study';
import { coursePace } from '../src/lib/engine/learning';
import type { AppState } from '../src/lib/types';

// You open «وش أذاكر اليوم», it says 2 hours = 4 lessons, and you tick each lesson's box as you
// finish it. The day must shrink lesson by lesson and end — not pull the next lesson every time.

const DAY = '2026-10-28';
const at = (h: string) => atTime(DAY, h);

function course(lessons: number, minutes: number, examDate: string, reviewDays = 0): AppState {
  const s = initialState();
  s.courses.push({ id: 'c', name: 'إحصاء', color: '#000', difficulty: 3, sizeLabel: 'دقيقة', paceGuess: 1, notes: '', archived: false, createdAt: 1 });
  for (let i = 0; i < lessons; i++) s.units.push({ id: `u${i}`, courseId: 'c', title: `الدرس ${i + 1}`, size: minutes, progress: 0, reviewed: false, spent: 0, order: i });
  s.exams.push({ id: 'e', courseId: 'c', title: 'الميد', date: examDate, unitIds: Array.from({ length: lessons }, (_, i) => `u${i}`), reviewDays, createdAt: 1 });
  return s;
}

const today = (s: AppState, h = '16:00') => planStudy(s, at(h)).exams[0];

describe('ticking lessons done, one by one', () => {
  it('the day shrinks with each lesson and then ends — no next lesson pulled in', () => {
    // 16 lessons × 30 min, exam in 4 days → ~2 hours a day
    const s = course(16, 30, '2026-11-01');
    const start = today(s);
    const planned = start.portion.map((x) => x.unit.id);
    expect(start.todayMinutes).toBeGreaterThanOrEqual(90);
    expect(planned.length).toBeGreaterThanOrEqual(3);

    let left = start.todayMinutes;
    for (const [i, id] of planned.entries()) {
      markLessonIn(s, id, { progress: 1 }, DAY, at('16:30'));
      const now = today(s);
      // only lessons from this morning's list, never the next one in the course
      for (const x of now.portion) expect(planned).toContain(x.unit.id);
      expect(now.todayMinutes).toBeLessThan(left);
      left = now.todayMinutes;
      if (i === planned.length - 1) {
        expect(now.todayMinutes).toBe(0);
        expect(now.portion).toEqual([]);
      }
    }
  });

  it('tomorrow’s share is unchanged by ticking today’s lessons (they were today’s)', () => {
    const s = course(16, 30, '2026-11-01');
    const before = planStudy(s, at('16:00')).byDay;
    for (const x of today(s).portion) markLessonIn(s, x.unit.id, { progress: 1 }, DAY, at('16:30'));
    const after = planStudy(s, at('17:00')).byDay;
    const tomorrow = '2026-10-29';
    expect(after[tomorrow]?.[0].minutes).toBe(before[tomorrow]?.[0].minutes);
  });

  it('unticking gives the lesson back to today', () => {
    const s = course(16, 30, '2026-11-01');
    const start = today(s);
    const first = start.portion[0].unit.id;
    markLessonIn(s, first, { progress: 1 }, DAY, at('16:30'));
    markLessonIn(s, first, { progress: 0 }, DAY, at('16:40'));
    const back = today(s);
    expect(back.todayMinutes).toBe(start.todayMinutes);
    expect(back.portion.map((x) => x.unit.id)).toEqual(start.portion.map((x) => x.unit.id));
    expect(s.sessions).toHaveLength(0);
  });

  it('a tick doesn’t teach a fake pace (no minutes were timed)', () => {
    const s = course(16, 30, '2026-11-01');
    const pace0 = coursePace(s, s.courses[0]).pace;
    for (const x of today(s).portion) markLessonIn(s, x.unit.id, { progress: 1 }, DAY, at('16:30'));
    expect(coursePace(s, s.courses[0]).pace).toBe(pace0);
  });

  it('half a lesson counts half; reviewing in the review days counts as review', () => {
    const s = course(6, 30, '2026-10-31', 1);
    const start = today(s);
    const first = start.portion[0].unit.id;
    markLessonIn(s, first, { progress: 0.5 }, DAY, at('16:30'));
    expect(today(s).todayMinutes).toBe(start.todayMinutes - 15);
    markLessonIn(s, first, { progress: 1 }, DAY, at('16:40'));
    expect(today(s).todayMinutes).toBe(start.todayMinutes - 30);
    expect(s.sessions.filter((x) => x.unitId === first)).toHaveLength(1); // one tick, not two
    markLessonIn(s, first, { reviewed: true }, DAY, at('16:50'));
    expect(s.units.find((u) => u.id === first)!.reviewed).toBe(true);
  });

  it('the last lessons of the course: the day ends at the end of the course', () => {
    const s = course(3, 30, '2026-10-29');
    const start = today(s);
    for (const x of start.portion) if (!x.review) markLessonIn(s, x.unit.id, { progress: 1 }, DAY, at('16:30'));
    for (const x of today(s).portion) expect(x.review).toBe(true);
  });
});
