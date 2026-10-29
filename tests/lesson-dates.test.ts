import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { addDays, atTime } from '../src/lib/dates';
import { planStudy, unitSchedule } from '../src/lib/engine/study';
import type { AppState } from '../src/lib/types';

// Opening a course shows, next to each lesson, the day the plan has it. That day must be the day it
// actually shows up in «اليوم» — checked by moving the clock forward and studying as planned.

const DAY = '2026-10-28';
function course(lessons: number, minutes: number, examDate: string, reviewDays = 1): AppState {
  const s = initialState();
  s.courses.push({ id: 'c', name: 'إحصاء', color: '#000', difficulty: 3, sizeLabel: 'دقيقة', paceGuess: 1, notes: '', archived: false, createdAt: 1 });
  for (let i = 0; i < lessons; i++) s.units.push({ id: `u${i}`, courseId: 'c', title: `الدرس ${i + 1}`, size: minutes, progress: 0, reviewed: false, spent: 0, order: i });
  s.exams.push({ id: 'e', courseId: 'c', title: 'الميد', date: examDate, unitIds: Array.from({ length: lessons }, (_, i) => `u${i}`), reviewDays, createdAt: 1 });
  return s;
}

describe('lesson dates on the course page', () => {
  it('every lesson gets a learning day in course order, and a review day after it', () => {
    const s = course(12, 30, '2026-11-08');
    const ep = planStudy(s, atTime(DAY, '09:00')).exams[0];
    const when = unitSchedule(ep, DAY);
    let last = DAY;
    for (let i = 0; i < 12; i++) {
      const w = when.get(`u${i}`)!;
      expect(w.learn).toBeDefined();
      expect(w.learn!.from >= last).toBe(true);
      last = w.learn!.from;
      expect(w.review!.from > w.learn!.to).toBe(true);
      expect(w.review!.to < '2026-11-08').toBe(true);
    }
    // today's lessons are the ones dated today
    const todayIds = ep.portion.filter((p) => !p.review).map((p) => p.unit.id);
    for (const id of todayIds) expect(when.get(id)!.learn!.from).toBe(DAY);
  });

  it('the dated day is the day the lesson shows up, day after day', () => {
    const s = course(10, 40, '2026-11-06');
    const first = unitSchedule(planStudy(s, atTime(DAY, '09:00')).exams[0], DAY);
    for (let d = 0; d < 6; d++) {
      const day = addDays(DAY, d);
      const ep = planStudy(s, atTime(day, '09:00')).exams[0];
      for (const p of ep.portion.filter((x) => !x.review)) {
        const w = first.get(p.unit.id)!.learn!;
        expect(day >= w.from && day <= w.to).toBe(true);
        // study it as planned
        const u = s.units.find((x) => x.id === p.unit.id)!;
        s.sessions.push({ id: `s${d}${u.id}`, courseId: 'c', unitId: u.id, date: day, minutes: p.minutes, amount: p.amount, at: atTime(day, '10:00') });
        u.progress = Math.min(1, u.progress + p.amount / u.size);
      }
    }
  });
});
