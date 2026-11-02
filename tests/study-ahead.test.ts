import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { atTime } from '../src/lib/dates';
import { planStudy, portionOf } from '../src/lib/engine/study';

const NOW = atTime('2026-10-25', '09:00');

describe('lessons in the days ahead', () => {
  it('each later day lists the lessons its share covers, carrying on from today', () => {
    const s = initialState();
    s.settings.reviewFactor = 0;
    s.settings.studyCap = [720, 720, 720, 720, 720, 720, 720];
    s.settings.available = [720, 720, 720, 720, 720, 720, 720];
    s.courses.push({ id: 'c', name: 'كيم', color: '#000', difficulty: 3, sizeLabel: 'دقيقة', paceGuess: 1, notes: '', archived: false, createdAt: 0 });
    for (let i = 0; i < 6; i++) s.units.push({ id: 'u' + i, courseId: 'c', title: `درس ${i + 1}`, size: 60, progress: 0, reviewed: false, spent: 0, order: i });
    s.exams.push({ id: 'e', courseId: 'c', title: 'الميد', date: '2026-10-29', unitIds: s.units.map((u) => u.id), reviewDays: 0, createdAt: 0 });
    const ep = planStudy(s, NOW).exams[0];
    // today is the same as before
    expect(ep.portion).toEqual(portionOf(ep.work, ep.todayMinutes));
    const days = Object.keys(ep.ahead).sort();
    expect(days.length).toBeGreaterThan(0);
    for (const d of days) {
      const sum = ep.ahead[d].reduce((a, x) => a + x.minutes, 0);
      expect(Math.abs(sum - Math.round(ep.alloc[d] / 5) * 5)).toBeLessThanOrEqual(6);
    }
    // in order, and nothing studied twice: the first lesson of the next day comes after today's
    const order = [...ep.portion, ...days.flatMap((d) => ep.ahead[d])].map((x) => x.unit.order);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
