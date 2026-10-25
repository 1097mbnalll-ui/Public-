import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { addDays, atTime } from '../src/lib/dates';
import { planStudy } from '../src/lib/engine/study';
import type { AppState } from '../src/lib/types';

// Sunday 2026-10-25, 09:00 — the example shown to the user
const NOW = atTime('2026-10-25', '09:00');

function example(): AppState {
  const s = initialState();
  s.settings.reviewFactor = 0;
  // plenty of time each day: these check how the work is shared out, not whether it fits
  s.settings.studyCap = [720, 720, 720, 720, 720, 720, 720];
  s.settings.available = [720, 720, 720, 720, 720, 720, 720];
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
    const t = today(example());
    expect(t).toEqual({ عرب: 120, احص: 120, كيم: 180, انجل: 80 });
  });

  it('an exam next week is studied from today, every day — not left to the last days', () => {
    const s = example();
    const p = planStudy(s, NOW);
    const eng = p.exams.find((e) => e.course.name === 'انجل')!;
    for (let d = '2026-10-25'; d <= eng.lastStudyDay; d = addDays(d, 1)) {
      const m = p.byDay[d]?.find((x) => x.examId === eng.exam.id)?.minutes || 0;
      expect(m, d).toBeGreaterThan(0);
    }
  });

  it('a morning exam today leaves nothing to study for it', () => {
    const s = example();
    s.exams[0].time = '08:00';
    expect(today(s)['عرب']).toBe(0);
  });

});
