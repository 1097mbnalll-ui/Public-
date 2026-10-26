import { describe, expect, it } from 'vitest';
import { initialState, migrate } from '../src/lib/defaults';
import { gymWeek, nextWorkout, nutrition, plates, program, records, scheme, sessionSummary, streakWeeks, target, exercise } from '../src/lib/engine/gym';
import { busyOn } from '../src/lib/engine/schedule';
import type { AppState, GymProfile, GymSession } from '../src/lib/types';

const P = (p: Partial<GymProfile> = {}): GymProfile => ({ goal: 'muscle', level: 'mid', place: 'gym', days: [0, 2, 4], minutes: 60, ...p });
const at = (day: string, h = 18) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime();
const ses = (day: string, exId: string, sets: [number | undefined, number][], slot = 'push'): GymSession => ({
  id: `${day}-${exId}-${Math.random()}`, day, start: at(day), end: at(day, 19), slot, name: slot, createdAt: at(day),
  entries: [{ exId, sets: sets.map(([kg, reps]) => ({ kg, reps, done: true })) }],
});
const withGym = (g: Partial<AppState['gym']>): AppState => {
  const s = initialState();
  s.gym = { ...s.gym, ...g };
  return s;
};

describe('the program', () => {
  it('cuts a program to every number of days, goal, level and place, within the time', () => {
    for (const goal of ['muscle', 'strength', 'fat', 'fit', 'endurance'] as const)
      for (const level of ['new', 'mid', 'pro'] as const)
        for (const place of ['gym', 'home'] as const)
          for (let n = 1; n <= 7; n++)
            for (const minutes of [30, 60, 90]) {
              const pr = program(P({ goal, level, place, minutes, days: [0, 1, 2, 3, 4, 5, 6].slice(0, n) }));
              expect(pr.slots.length).toBeGreaterThan(0);
              for (const sl of pr.slots) {
                expect(sl.items.length).toBeGreaterThanOrEqual(3);
                expect(new Set(sl.items.map((i) => i.exId)).size).toBe(sl.items.length);
                if (place === 'home') expect(sl.items.every((i) => ['body', 'cardio'].includes(exercise(i.exId).kind))).toBe(true);
              }
            }
  });

  it('a swap you keep replaces the exercise in the program', () => {
    const pr = program(P({ swaps: { bench: 'chest_press' } }));
    const push = pr.slots.find((s) => s.key === 'push')!;
    expect(push.items.map((i) => i.exId)).toContain('chest_press');
    expect(push.items.map((i) => i.exId)).not.toContain('bench');
  });

  it('missing a day never loses a workout: the next one waits, on your next gym day', () => {
    const s = withGym({ profile: P({ days: [0, 2, 4] }), rot: 4 });
    const n = nextWorkout(s, at('2026-10-27', 9))!; // Tuesday is a gym day; 4 done → the second day of three
    expect(n.index).toBe(1);
    expect(n.day).toBe('2026-10-27');
    // trained already today → the next gym day, Thursday
    s.gym.sessions.push(ses('2026-10-27', 'bench', [[60, 8]]));
    expect(nextWorkout(s, at('2026-10-27', 20))!.day).toBe('2026-10-29');
  });
});

describe('what to lift today', () => {
  const sc = scheme(P(), exercise('bench'));
  it('first time: no weight is guessed', () => {
    const t = target(withGym({}), 'bench', sc);
    expect(t).toMatchObject({ tag: 'first', reps: sc.lo });
    expect(t.kg).toBeUndefined();
  });
  it('top of the range on every set → add 2.5 kg and start at the bottom', () => {
    const s = withGym({ sessions: [ses('2026-10-20', 'bench', [[60, 12], [60, 12], [60, 12]])] });
    expect(target(s, 'bench', sc)).toMatchObject({ tag: 'up', kg: 62.5, reps: sc.lo });
  });
  it('not yet → same weight, one more rep than the weakest set', () => {
    const s = withGym({ sessions: [ses('2026-10-20', 'bench', [[60, 10], [60, 9], [60, 8]])] });
    expect(target(s, 'bench', sc)).toMatchObject({ tag: 'more', kg: 60, reps: 9 });
  });
  it('fell under the range → hold the weight', () => {
    const s = withGym({ sessions: [ses('2026-10-20', 'bench', [[80, 4], [80, 3]])] });
    expect(target(s, 'bench', sc)).toMatchObject({ tag: 'same', kg: 80 });
  });
  it('bodyweight: one more rep', () => {
    const s = withGym({ sessions: [ses('2026-10-20', 'pushup', [[undefined, 15], [undefined, 12]])] });
    expect(target(s, 'pushup', scheme(P(), exercise('pushup')))).toMatchObject({ tag: 'more', reps: 13 });
  });
});

describe('records, the week, the streak', () => {
  it('a new best is a record; the first time is not', () => {
    const a = ses('2026-10-20', 'bench', [[60, 8]]);
    const b = ses('2026-10-22', 'bench', [[62.5, 8]]);
    b.start = at('2026-10-22');
    const s = withGym({ sessions: [a, b] });
    expect(sessionSummary(s, a).prs).toHaveLength(0);
    expect(sessionSummary(s, b).prs).toEqual([{ exId: 'bench', kg: 62.5, reps: 8 }]);
    expect(records(s)[0]).toMatchObject({ exId: 'bench', kg: 62.5 });
  });

  it('weeks in a row that hit the target', () => {
    const days = ['2026-10-11', '2026-10-13', '2026-10-18', '2026-10-20', '2026-10-25', '2026-10-27'];
    const s = withGym({ profile: P({ days: [0, 2] }), sessions: days.map((d) => ses(d, 'bench', [[60, 8]])) });
    expect(streakWeeks(s, at('2026-10-28'))).toBe(3);
    expect(gymWeek(s, at('2026-10-28'))).toMatchObject({ done: 2, target: 2 });
    // this week not done yet: the streak still stands on the weeks before
    const s2 = withGym({ profile: P({ days: [0, 2] }), sessions: days.slice(0, 4).map((d) => ses(d, 'bench', [[60, 8]])) });
    expect(streakWeeks(s2, at('2026-10-28'))).toBe(2);
  });

  it('nothing at all: zeros, not errors', () => {
    const s = withGym({});
    expect(streakWeeks(s)).toBe(0);
    expect(records(s)).toEqual([]);
    expect(nextWorkout(s)).toBeNull();
    expect(nutrition(s)).toBeNull();
  });
});

describe('tools and the rest of مدار', () => {
  it('plates per side', () => {
    expect(plates(100)).toEqual({ each: [25, 15], left: 0 });
    expect(plates(62.5)).toEqual({ each: [20, 1.25], left: 0 });
    expect(plates(20).each).toEqual([]);
    expect(plates(21).left).toBeCloseTo(1);
  });

  it('calories and protein follow the goal', () => {
    const s = withGym({ profile: P({ goal: 'fat' }), info: { sex: 'm', birthYear: 2000, height: 180 }, body: [{ id: 'b', day: '2026-10-20', weight: 90, createdAt: 1 }] });
    const n = nutrition(s, at('2026-10-28'))!;
    expect(n.kcal).toBeLessThan(n.maintain);
    expect(n.protein).toBe(198);
  });

  it('gym time is busy time on gym days only', () => {
    const s = withGym({ profile: P({ days: [3], time: '18:00', minutes: 60 }) });
    expect(busyOn(s, '2026-10-28')).toEqual([{ from: at('2026-10-28', 18) - 15 * 60000, to: at('2026-10-28', 18) - 15 * 60000 + 90 * 60000 }]);
    expect(busyOn(s, '2026-10-27')).toEqual([]);
  });

  it('old backups without a gym load fine, and junk in the gym is cleaned', () => {
    const old = initialState() as any;
    delete old.gym;
    expect(migrate(old).gym).toEqual({ rot: 0, sessions: [], body: [], info: {} });
    const bad = migrate({ ...initialState(), gym: { rot: 1, sessions: [null, 5, { id: 'x', day: '2026-10-01', entries: [] }], body: 'oops', info: null } });
    expect(bad.gym.sessions).toHaveLength(1);
    expect(bad.gym.body).toEqual([]);
    expect(bad.gym.info).toEqual({});
  });
});
