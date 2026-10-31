import { describe, expect, it } from 'vitest';
import { readStudyPack } from '../src/lib/actions';

describe('a study pack from an AI', () => {
  it('reads every course with its lessons and exam; a broken one is left out', () => {
    const list = readStudyPack({
      app: 'masar',
      courses: [
        { name: 'إحصاء 101', sizeLabel: 'دقيقة', paceGuess: 1, difficulty: 4, units: [{ title: '١) المتوسط', size: 40 }, { title: '٢) الانحراف', size: 60, difficulty: 5 }], exam: { title: 'الميد', date: '2026-11-20', time: '10:00', reviewDays: 2 } },
        { name: 'كيمياء', units: [{ title: 'الذرة', size: 30 }] },
        { name: '', units: [{ title: 'x', size: 10 }] },
        { name: 'بدون دروس', units: [] },
      ],
    });
    expect(list.map((p) => p.course!.name)).toEqual(['إحصاء 101', 'كيمياء']);
    expect(list[0].units.length).toBe(2);
    expect(list[0].exam?.date).toBe('2026-11-20');
    expect(list[1].exam).toBeUndefined();
  });
  it('a one-course pack works too, and nothing usable is an error', () => {
    expect(readStudyPack({ app: 'masar', course: { name: 'فيزياء' }, units: [{ title: 'الحركة', size: 50 }] }).length).toBe(1);
    expect(() => readStudyPack({ app: 'masar', courses: [] })).toThrow();
  });
});
