import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { atTime } from '../src/lib/dates';
import { planStudy } from '../src/lib/engine/study';
import type { AppState } from '../src/lib/types';

const DAY = '2026-10-25';
function build(courses: [string, number, number, string, number][]): AppState {
  const s = initialState();
  courses.forEach(([name, n, pages, date, reviewDays], k) => {
    const id = 'c' + k;
    s.courses.push({ id, name, color: '#000', difficulty: 3, sizeLabel: 'صفحة', notes: '', archived: false, createdAt: 1 });
    for (let i = 0; i < n; i++) s.units.push({ id: id + 'u' + i, courseId: id, title: `U${i + 1}`, size: pages, progress: 0, reviewed: false, spent: 0, order: i });
    s.exams.push({ id: 'e' + k, courseId: id, title: 'م', date, unitIds: Array.from({ length: n }, (_, i) => id + 'u' + i), reviewDays, createdAt: 1 });
  });
  return s;
}
/** what «سجّل» records (actions.logStudy) */
function log(s: AppState, courseId: string, unitId: string, minutes: number, amount: number) {
  const u = s.units.find((x) => x.id === unitId)!;
  const review = u.size * (1 - u.progress) <= 0.01;
  const learned = review ? 0 : Math.min(amount, u.size * (1 - u.progress));
  s.sessions.push({ id: Math.random() + '', courseId, unitId, date: DAY, minutes, amount: learned, ...(review ? { review: true } : {}), at: atTime(DAY, '17:00') });
  if (review) u.reviewed = true;
  else u.progress = Math.min(1, u.progress + learned / u.size);
  const d = (s.days[DAY] ||= { done: 0, minutes: 0, study: 0 });
  d.study += minutes;
}
const studyToday = (s: AppState, speed: number, only?: string) => {
  for (const e of planStudy(s, atTime(DAY, '16:00')).exams) {
    if (only && e.course.id !== only) continue;
    for (const x of e.portion) log(s, e.course.id, x.unit.id, Math.max(1, Math.round(x.minutes * speed)), x.amount);
  }
};

describe('after you study today’s share', () => {
  for (const [label, speed] of [['faster than estimated', 0.5], ['slower than estimated', 1.5]] as const) {
    it(`it reads as done when you were ${label}`, () => {
      const s = build([['انجل', 8, 12, '2026-11-01', 1], ['احص', 6, 15, '2026-11-10', 1]]);
      studyToday(s, speed);
      for (const e of planStudy(s, atTime(DAY, '20:00')).exams) {
        expect(e.todayMinutes, e.course.name).toBe(0);
        expect(e.doneToday, e.course.name).toBeLessThanOrEqual(e.quota + 5);
      }
    });
  }

  it('finishing a subject today doesn’t hand its time to the others', () => {
    // English: one lesson left, exam tomorrow; Stats: plenty, exam later
    const s = build([['انجل', 1, 12, '2026-10-26', 0], ['احص', 6, 15, '2026-11-10', 1]]);
    s.settings.studyCap = [90, 90, 90, 90, 90, 90, 90];
    const before = planStudy(s, atTime(DAY, '16:00')).exams.find((e) => e.course.name === 'احص')!.quota;
    studyToday(s, 1, 'c0');
    const after = planStudy(s, atTime(DAY, '20:00')).exams;
    expect(after.find((e) => e.course.name === 'انجل')!.status).toBe('done');
    expect(after.find((e) => e.course.name === 'احص')!.quota).toBe(before);
  });

  it('the pages asked for today hold still while you study (your new pace counts from tomorrow)', () => {
    const s = build([['انجل', 8, 12, '2026-11-01', 1]]);
    const start = planStudy(s, atTime(DAY, '16:00')).exams[0];
    const pages = start.portion.reduce((a, x) => a + x.amount, 0);
    // 6 pages in 25 minutes — faster than the 5 min a page it assumed
    log(s, 'c0', 'c0u0', 25, 6);
    const now = planStudy(s, atTime(DAY, '18:00')).exams[0];
    expect(now.portion.reduce((a, x) => a + x.amount, 0)).toBe(pages - 6);
    // tomorrow is planned at the pace you showed
    expect(planStudy(s, atTime('2026-10-26', '08:00')).exams[0].pace.pace).toBeLessThan(start.pace.pace);
  });
});
