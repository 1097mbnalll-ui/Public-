import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { atTime } from '../src/lib/dates';
import { planStudy } from '../src/lib/engine/study';
import type { AppState } from '../src/lib/types';

// Sunday 2026-10-25, 09:00 — the example shown to the user
const NOW = atTime('2026-10-25', '09:00');

function example(mode: 'smart' | 'even'): AppState {
  const s = initialState();
  s.settings.studyMode = mode;
  s.settings.reviewFactor = 0;
  let n = 0;
  const course = (name: string, minutes: number, exam: string, time?: string) => {
    const cid = 'c' + n++;
    s.courses.push({ id: cid, name, color: '#000', difficulty: 3, sizeLabel: 'دقيقة', paceGuess: 1, notes: '', archived: false, createdAt: 0 });
    s.units.push({ id: 'u' + cid, courseId: cid, title: name, size: minutes, progress: 0, reviewed: false, spent: 0, order: 0 });
    s.exams.push({ id: 'e' + cid, courseId: cid, title: 'الميد', date: exam, time, unitIds: ['u' + cid], reviewDays: 0, createdAt: 0 });
  };
  course('عرب', 120, '2026-10-25', '17:00'); // today, afternoon
  course('احص', 240, '2026-10-27'); // Tuesday
  course('كيم', 720, '2026-10-29'); // Thursday
  course('انجل', 900, '2026-11-05');
  return s;
}

const today = (s: AppState) => Object.fromEntries(planStudy(s, NOW).exams.map((e) => [e.course.name, e.todayMinutes]));

describe('study modes', () => {
  it('even: what is left ÷ days left, whatever your free time', () => {
    const t = today(example('even'));
    expect(t).toEqual({ عرب: 120, احص: 120, كيم: 180, انجل: 85 });
  });

  it('smart: a safety day before each exam and a lighter far exam on a heavy day', () => {
    const s = example('smart');
    const t = today(s);
    expect(t['عرب']).toBe(120); // the exam this afternoon still gets its study this morning
    expect(t['احص']).toBe(120);
    expect(t['انجل']).toBeLessThan(85); // waits while this week is heavy
    expect(planStudy(s, NOW).exams.find((e) => e.course.name === 'انجل')!.nextDay).toBe('2026-10-28');
    const p = planStudy(s, NOW);
    const chem = p.exams.find((e) => e.course.name === 'كيم')!;
    expect(chem.learnEnd).toBe('2026-10-27'); // new material done Tuesday, Wednesday = review
    // every minute is still planned before each exam
    for (const e of p.exams) {
      const sum = Object.values(p.byDay).flat().filter((x) => x.examId === e.exam.id).reduce((a, x) => a + x.minutes, 0);
      expect(Math.abs(sum - e.mid)).toBeLessThanOrEqual(30); // days are rounded to 5 minutes
    }
  });

  it('a morning exam today leaves nothing to study for it', () => {
    const s = example('smart');
    s.exams[0].time = '08:00';
    expect(today(s)['عرب']).toBe(0);
  });
});
