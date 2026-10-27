import { describe, expect, it } from 'vitest';
import { initialState, migrate } from '../src/lib/defaults';
import { analyzePostings, defaultStages, focusSkill, hoursLeft, localAdviser, progress, QUESTIONS, realism, recommendations, simulate } from '../src/lib/engine/future';
import { mergeStates } from '../src/lib/transfer';
import type { AppState, FutureSkill, FutureVision } from '../src/lib/types';

const at = (day: string, h = 12) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime();
const NOW = at('2026-10-28');
const V = (p: Partial<FutureVision> = {}): FutureVision => ({ kind: 'student', title: 'أتخرج جاهز', why: 'لأني أبي', start: '2026-09-01', target: '2030-06-30', weeklyHours: 5, year: 1, years: 4, createdAt: 1, ...p });
const K = (p: Partial<FutureSkill> & { id: string; name: string }): FutureSkill => ({ cat: 'pro', level: 0, target: 3, priority: 2, prereqs: [], step: 'none', resources: [], log: [], createdAt: 1, ...p });
const S = (f: Partial<AppState['future']> = {}, extra: Partial<AppState> = {}): AppState => {
  const s = initialState();
  s.future = { ...s.future, vision: V(), ...f };
  return { ...s, ...extra };
};

describe('stages', () => {
  it('a first-year student of four gets four years, the last ending at graduation', () => {
    const st = defaultStages(V());
    expect(st).toHaveLength(4);
    expect(st[0].from).toBe('2026-09-01');
    expect(st[3].to).toBe('2030-06-30');
    for (let i = 1; i < st.length; i++) expect(st[i].from > st[i - 1].to).toBe(true);
  });
  it('a third-year plans only the years left; anyone else gets three phases', () => {
    expect(defaultStages(V({ year: 3 }))).toHaveLength(2);
    const p = defaultStages(V({ kind: 'career', start: '2026-10-01', target: '2027-10-01' }));
    expect(p.map((x) => x.title)).toHaveLength(3);
    expect(p[2].to).toBe('2027-10-01');
  });
});

describe('the adviser (local rules)', () => {
  it('without a goal, the only step is to set one', () => {
    const s = initialState();
    expect(recommendations(s, NOW)[0].id).toBe('setup');
  });

  it('a prerequisite comes first, with the reason', () => {
    const s = S({ skills: [K({ id: 'a', name: 'تحليل البيانات', priority: 1, prereqs: ['b'] }), K({ id: 'b', name: 'Excel', priority: 3 })] });
    const f = focusSkill(s, NOW)!;
    expect(f.k.id).toBe('b');
    expect(f.reasons.some((r) => r.kind === 'fact' && r.text.includes('تحليل البيانات'))).toBe(true);
    expect(f.reasons.some((r) => r.kind === 'estimate')).toBe(true);
  });

  it('exam week comes first and growth steps back', () => {
    const s = S({ skills: [K({ id: 'a', name: 'الكتابة' })] }, { exams: [{ id: 'e', courseId: 'c', title: 'ميد', date: '2026-10-30', unitIds: [], reviewDays: 1, createdAt: 1 }] as AppState['exams'] });
    const r = recommendations(s, NOW);
    expect(r[0].id).toBe('exams');
    expect(r.some((x) => x.id.startsWith('skill:'))).toBe(false);
  });

  it('learned and not applied → a project, not another course', () => {
    const s = S({ skills: [K({ id: 'a', name: 'Excel', step: 'practicing', level: 2 })] });
    expect(recommendations(s, NOW).some((x) => x.id === 'apply:a')).toBe(true);
    expect(localAdviser.answer('project', s, NOW).title).toBe('مشروع');
  });

  it('too many skills at once → focus', () => {
    const s = S({ skills: ['a', 'b', 'c', 'd'].map((id) => K({ id, name: id, step: 'learning', level: 1 })) });
    expect(recommendations(s, NOW).some((x) => x.id === 'focus')).toBe(true);
  });

  it('every question answers from the data, even with nothing in it', () => {
    for (const st of [initialState(), S(), S({ skills: [K({ id: 'a', name: 'x' })] })]) for (const q of QUESTIONS) expect(localAdviser.answer(q.q, st, NOW).title.length).toBeGreaterThan(0);
  });
});

describe('the numbers', () => {
  it('hours left: your estimate minus practice; proven is done', () => {
    expect(hoursLeft(K({ id: 'a', name: 'a', level: 1, target: 3 }))).toBe(50);
    expect(hoursLeft(K({ id: 'a', name: 'a', hours: 10, log: [{ day: '2026-10-01', min: 120 }] }))).toBe(8);
    expect(hoursLeft(K({ id: 'a', name: 'a', step: 'proven' }))).toBe(0);
  });

  it('realism compares the hours needed with the hours you have', () => {
    const big = S({ vision: V({ target: '2027-01-01', weeklyHours: 2 }), skills: [K({ id: 'a', name: 'a', hours: 300 })] });
    expect(realism(big, NOW).ratio).toBeGreaterThan(1);
    expect(recommendations(big, NOW).some((x) => x.id === 'realism')).toBe(true);
    const ok = S({ skills: [K({ id: 'a', name: 'a', hours: 20 })] });
    expect(realism(ok, NOW).ratio).toBeLessThan(1);
  });

  it('the scenario does prerequisites first and says what fits', () => {
    const s = S({ vision: V({ target: '2027-03-01' }), skills: [K({ id: 'a', name: 'A', priority: 1, prereqs: ['b'], hours: 30 }), K({ id: 'b', name: 'B', priority: 3, hours: 30 }), K({ id: 'c', name: 'C', priority: 2, hours: 200 })] });
    const r = simulate(s, 5, 'all', NOW);
    expect(r.rows.map((x) => x.k.id)).toEqual(['b', 'a', 'c']);
    expect(r.rows[2].fits).toBe(false);
    expect(simulate(s, 5, 'top', NOW).rows.map((x) => x.k.id)).toEqual(['a']);
  });

  it('progress is from levels, paused skills left out', () => {
    const s = S({ skills: [K({ id: 'a', name: 'a', level: 3, target: 3, step: 'proven' }), K({ id: 'b', name: 'b', level: 0, target: 3 }), K({ id: 'c', name: 'c', level: 0, target: 4, paused: true })] });
    expect(progress(s)).toMatchObject({ pct: 0.5, proven: 1, total: 2 });
  });
});

describe('the market, from pasted ads', () => {
  it('counts what repeats across ads and matches your skills', () => {
    const s = S({
      skills: [K({ id: 'a', name: 'Excel', level: 2 })],
      postings: [
        { id: '1', title: 'محلل بيانات', text: 'يشترط إجادة اللغة الإنجليزية و Excel و SQL ومهارات التواصل', day: '2026-10-01', createdAt: 1 },
        { id: '2', title: 'Data analyst', text: 'Strong English, SQL, Power BI and communication skills', day: '2026-10-02', createdAt: 1 },
      ],
    });
    const m = analyzePostings(s);
    expect(m.total).toBe(2);
    const row = (t: string) => m.rows.find((x) => x.term === t);
    expect(row('English')?.count).toBe(2);
    expect(row('SQL')?.count).toBe(2);
    expect(row('Excel')?.have?.id).toBe('a');
    expect(row('SQL')?.have).toBeUndefined();
  });
  it('no ads → nothing claimed', () => {
    expect(analyzePostings(S())).toEqual({ rows: [], total: 0 });
  });
});

describe('data safety', () => {
  it('old backups without «مستقبلي» load; junk is cleaned; missing fields filled', () => {
    const old = initialState() as any;
    delete old.future;
    expect(migrate(old).future).toEqual({ stages: [], skills: [], projects: [], wins: [], postings: [], reviews: [] });
    const bad = migrate({ ...initialState(), future: { skills: [null, { id: 'x', name: 'y' }], wins: 'oops', projects: [{ id: 'p', title: 't' }] } });
    expect(bad.future.skills[0]).toMatchObject({ id: 'x', level: 0, prereqs: [], log: [], resources: [], step: 'none' });
    expect(bad.future.wins).toEqual([]);
    expect(bad.future.projects[0]).toMatchObject({ steps: [], links: [], skillIds: [] });
  });
  it('two devices merge without losing either side', () => {
    const a = S({ skills: [K({ id: 'a', name: 'A' })] });
    const b = S({ skills: [K({ id: 'b', name: 'B' })], wins: [{ id: 'w', kind: 'cert', title: 'شهادة', day: '2026-10-01', skillIds: [], createdAt: 1 }] });
    const m = mergeStates(a, b);
    expect(m.future.skills.map((k) => k.id).sort()).toEqual(['a', 'b']);
    expect(m.future.wins).toHaveLength(1);
  });
});
