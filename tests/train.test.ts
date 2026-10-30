import { describe, expect, it } from 'vitest';
import { initialState, migrate } from '../src/lib/defaults';
import { BUILTIN_TASKS } from '../src/lib/engine/drills';
import { benchDue, calibration, curve, nextLevel, readFieldTasks, scoreOf, selfData, SKILLS, taskById, today } from '../src/lib/engine/train';
import { mergeStates } from '../src/lib/transfer';
import type { AppState, DrillAttempt, Mark } from '../src/lib/types';

const DAY = 86_400_000;
const T0 = new Date('2026-11-01T18:00:00').getTime();
let n = 0;
const all = (task: string, m: Mark, s: AppState) => Object.fromEntries(taskById(s, task)!.criteria.map((c) => [c.id, m]));
const attempt = (s: AppState, taskId: string, at: number, self: Mark, extra: Partial<DrillAttempt> = {}): DrillAttempt => {
  const t = taskById(s, taskId)!;
  const a: DrillAttempt = { id: `a${n++}`, taskId, skill: t.skill, level: t.level, at, secs: 600, self: all(taskId, self, s), peers: [], ...(t.benchmark ? { benchmark: true } : {}), ...extra };
  s.train.attempts.push(a);
  return a;
};

describe('the built-in library', () => {
  it('every skill but «field» has 12 practice tasks over levels 1–3 and 3 measurement tasks', () => {
    for (const k of SKILLS.filter((x) => x.id !== 'field')) {
      const list = BUILTIN_TASKS.filter((t) => t.skill === k.id);
      expect(list.filter((t) => !t.benchmark)).toHaveLength(12);
      expect(list.filter((t) => t.benchmark)).toHaveLength(3);
      for (const l of [1, 2, 3]) expect(list.filter((t) => !t.benchmark && t.level === l)).toHaveLength(4);
    }
  });
  it('ids are unique; each task has 4–6 criteria, an exemplar and reasons', () => {
    expect(new Set(BUILTIN_TASKS.map((t) => t.id)).size).toBe(BUILTIN_TASKS.length);
    for (const t of BUILTIN_TASKS) {
      expect(t.criteria.length).toBeGreaterThanOrEqual(4);
      expect(t.criteria.length).toBeLessThanOrEqual(6);
      expect(t.exemplar.length).toBeGreaterThan(80);
      expect(t.why.length).toBeGreaterThan(0);
      expect(t.minutes).toBeLessThanOrEqual(15);
    }
  });
});

describe('scores and levels', () => {
  it('someone else’s score outranks yours; the gap is shown', () => {
    const s = initialState();
    const a = attempt(s, 'w5', T0, 2);
    a.peers.push({ id: 'p', name: 'د. أحمد', scores: all('w5', 1, s), at: T0 });
    const sc = scoreOf(taskById(s, 'w5'), a)!;
    expect(sc).toMatchObject({ self: 100, peer: 50, best: 50, source: 'peer' });
    expect(calibration(s)).toEqual({ gap: 50, n: 1 });
  });
  it('two ≥80% in a row → up; two ≤45% → down; a peer’s ≥80% counts alone', () => {
    const s = initialState();
    attempt(s, 'w5', T0, 2);
    expect(nextLevel(s, 'write')).toBe(2);
    attempt(s, 'w6', T0 + DAY, 2);
    expect(nextLevel(s, 'write')).toBe(3);
    const s2 = initialState();
    attempt(s2, 't5', T0, 0);
    attempt(s2, 't6', T0 + DAY, 0);
    expect(nextLevel(s2, 'think')).toBe(1);
    const s3 = initialState();
    const a = attempt(s3, 'd5', T0, 1);
    a.peers.push({ id: 'p', name: 'x', scores: all('d5', 2, s3), at: T0 });
    expect(nextLevel(s3, 'data')).toBe(3);
  });
});

describe('today', () => {
  it('a skill never tried comes first, at your level, and once done it stays done for the day', () => {
    const s = initialState();
    const t = today(s, T0)!;
    expect(t.task.level).toBe(2);
    expect(t.bench).toBe(false);
    attempt(s, t.task.id, T0 + 1000, 2);
    const t2 = today(s, T0 + 2000)!;
    expect(t2.done).toBeDefined();
    expect(t2.skill).toBe(t.skill);
    // next day: another skill
    expect(today(s, T0 + DAY)!.skill).not.toBe(t.skill);
  });
  it('28 days after starting a skill, its measurement is due and comes first', () => {
    const s = initialState();
    attempt(s, 'w5', T0, 1);
    expect(benchDue(s, 'write', T0 + 27 * DAY)).toBe(false);
    expect(benchDue(s, 'write', T0 + 28 * DAY)).toBe(true);
    const t = today(s, T0 + 28 * DAY)!;
    expect(t).toMatchObject({ skill: 'write', bench: true });
    expect(t.task.benchmark).toBe(true);
  });
  it('the 3-minute redo is the criterion you missed last time', () => {
    const s = initialState();
    const a = attempt(s, 'w5', T0 - 7 * DAY, 2);
    a.self.c3 = 0;
    // make «write» the skill of the day: every other skill trained more recently
    for (const [i, id] of ['t1', 'd1', 'k1', 'e1', 's1'].entries()) attempt(s, id, T0 - (6 - i) * DAY, 2);
    const t = today(s, T0)!;
    expect(t.skill).toBe('write');
    expect(t.redo?.criterion.id).toBe('c3');
  });
  it('the curve is drawn from measurements only; practice are dots', () => {
    const s = initialState();
    attempt(s, 'w5', T0, 2);
    attempt(s, 'wb1', T0 + DAY, 1);
    const c = curve(s, 'write');
    expect(c.bench.map((p) => p.pct)).toEqual([50]);
    expect(c.practice).toHaveLength(1);
  });
});

describe('self-management from the app’s own data', () => {
  it('training days kept and tasks done on time', () => {
    const s = initialState();
    s.train.setup = { days: [0, 1, 2, 3, 4, 5, 6], createdAt: T0 - 10 * DAY };
    for (let i = 1; i <= 5; i++) attempt(s, BUILTIN_TASKS[i].id, T0 - i * DAY, 2);
    s.tasks.push({ id: 'x', title: 'a', due: '2026-10-25', status: 'done', completedAt: new Date('2026-10-25T10:00:00').getTime() } as any, { id: 'y', title: 'b', due: '2026-10-26', status: 'done', completedAt: new Date('2026-10-28T10:00:00').getTime() } as any);
    const d = selfData(s, T0);
    expect(d.kept).toBe(5);
    expect(d.planned).toBe(11);
    expect(d.onTime).toBe(50);
  });
});

describe('field tasks from an AI', () => {
  it('reads a well-formed reply and drops incomplete tasks', () => {
    const reply = 'تفضل:\n```json\n{"app":"masar-drills","tasks":[{"title":"حساب جرعة","level":2,"situation":"مريض وزنه ٧٠ كجم…","ask":"احسب الجرعة","minutes":10,"criteria":["الوحدة","الخطوات","التحقق"],"exemplar":"٧٠ × ٥ = ٣٥٠ ملغ","why":["خطوات واضحة"]},{"title":"ناقص"}]}\n```';
    const out = readFieldTasks(reply, () => String(n++));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ skill: 'field', source: 'ai', level: 2 });
    expect(out[0].criteria.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(() => readFieldTasks('no json', () => '1')).toThrow();
  });
});

describe('data', () => {
  it('old backups load; two devices merge attempts', () => {
    const old = initialState() as any;
    delete old.train;
    expect(migrate(old).train).toEqual({ levels: {}, attempts: [], custom: [] });
    const a = initialState();
    attempt(a, 'w5', T0, 2);
    const b = initialState();
    attempt(b, 't5', T0, 1);
    expect(mergeStates(a, b).train.attempts).toHaveLength(2);
  });
});
