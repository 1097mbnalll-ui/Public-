import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { addDays, atTime } from '../src/lib/dates';
import { planStudy, postponePreview } from '../src/lib/engine/study';
import type { AppState } from '../src/lib/types';

const DAY = '2026-10-25';
const NOW = atTime(DAY, '16:00');
const TOMORROW = addDays(DAY, 1);

// English: 600 min over 6 days (100 a day); Stats: 900 min over 9 days (100 a day)
function build(): AppState {
  const s = initialState();
  s.settings.reviewFactor = 0;
  ([['انجل', 600, 6], ['احص', 900, 9]] as const).forEach(([name, minutes, days], k) => {
    const id = 'c' + k;
    s.courses.push({ id, name, color: '#000', difficulty: 3, sizeLabel: 'دقيقة', paceGuess: 1, notes: '', archived: false, createdAt: 1 });
    s.units.push({ id: 'u' + k, courseId: id, title: name, size: minutes, progress: 0, reviewed: false, spent: 0, order: 0 });
    s.exams.push({ id: 'e' + k, courseId: id, title: 'م', date: addDays(DAY, days), unitIds: ['u' + k], reviewDays: 0, createdAt: 1 });
  });
  return s;
}
const postpone = (s: AppState, day: string, examId: string, minutes: number) => ({ ...s, studyDefer: { ...s.studyDefer, [day]: { ...s.studyDefer[day], [examId]: minutes } } });
const share = (s: AppState, now: number, examId: string, day: string) => planStudy(s, now).byDay[day]?.find((x) => x.examId === examId)?.minutes || 0;

describe('postponing a subject to tomorrow', () => {
  it('says first what tomorrow becomes: the subject doubles, the day grows by the same', () => {
    const pv = postponePreview(build(), 'e0', NOW);
    expect(pv).toMatchObject({ minutes: 100, tomorrow: TOMORROW, subjectBefore: 100, subjectAfter: 200, dayBefore: 200, dayAfter: 300 });
  });

  it('today drops it, tomorrow takes it whole, nothing else moves', () => {
    const s = postpone(build(), DAY, 'e0', 100);
    const p = planStudy(s, NOW);
    const eng = p.exams.find((e) => e.exam.id === 'e0')!;
    expect(eng.todayMinutes).toBe(0);
    expect(eng.postponed).toBe(100);
    expect(share(s, NOW, 'e0', TOMORROW)).toBe(200);
    expect(share(s, NOW, 'e0', addDays(DAY, 2))).toBe(100);
    expect(share(s, NOW, 'e1', DAY)).toBe(100);
    expect(share(s, NOW, 'e1', TOMORROW)).toBe(100);
  });

  it('tomorrow morning the plan still has it: 200 that day', () => {
    const s = postpone(build(), DAY, 'e0', 100);
    expect(planStudy(s, atTime(TOMORROW, '08:00')).exams.find((e) => e.exam.id === 'e0')!.quota).toBe(200);
  });

  it('putting it back restores the plan', () => {
    const s = build();
    const before = planStudy(s, NOW).byDay;
    const back = { ...s, studyDefer: { [DAY]: {} } };
    expect(planStudy(back, NOW).byDay).toEqual(before);
  });

  it("can't be postponed on the last day before the exam", () => {
    const s = build();
    expect(planStudy(s, atTime(addDays(DAY, 5), '08:00')).exams.find((e) => e.exam.id === 'e0')!.canPostpone).toBe(false);
    expect(planStudy(s, NOW).exams.find((e) => e.exam.id === 'e0')!.canPostpone).toBe(true);
  });
});
