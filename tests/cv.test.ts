import { describe, expect, it } from 'vitest';
import { initialState, migrate } from '../src/lib/defaults';
import { cvText, eta, FIELDS, itemDone, nextStep, progress, starterItems, suggestions, today, week } from '../src/lib/engine/cv';
import { mergeStates } from '../src/lib/transfer';
import type { AppState, CvPlan } from '../src/lib/types';

let n = 0;
const id = () => `i${n++}`;
const at = (d: string, h = 12) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).getTime();
const NOW = at('2026-10-29'); // a Thursday
const plan = (p: Partial<CvPlan> = {}): CvPlan => ({ field: 'eng', branch: 'mech', kind: 'student', target: '2030-06-30', days: [0, 2, 4], minutes: 30, createdAt: 1, ...p });
const S = (p: Partial<CvPlan> = {}): AppState => {
  const s = initialState();
  s.future.cv = plan(p);
  s.future.cvItems = starterItems(s.future.cv, id, 1);
  return s;
};

describe('the starting CV', () => {
  it('every field gets the common items plus its own; nothing repeats', () => {
    for (const f of FIELDS) for (const b of f.branches?.map((x) => x.v) || [undefined]) {
      const items = starterItems(plan({ field: f.v, branch: b }), id, 1);
      expect(items.length).toBeGreaterThanOrEqual(9);
      expect(new Set(items.map((x) => x.key)).size).toBe(items.length);
      for (const x of items) for (const st of x.steps) expect(st.min).toBeGreaterThanOrEqual(15);
    }
  });
  it('the engineering tool follows the branch', () => {
    const t = (b: string) => starterItems(plan({ branch: b }), id, 1).find((x) => x.key === 'eng-tool')!.title;
    expect(t('mech')).toContain('SolidWorks');
    expect(t('civil')).toContain('AutoCAD');
  });
  it('suggestions leave out what you already have', () => {
    const s = S();
    expect(suggestions(s.future.cv!, s.future.cvItems!)).toHaveLength(0);
    expect(suggestions(s.future.cv!, s.future.cvItems!.slice(1)).map((x) => x.key)).toEqual([s.future.cvItems![0].key]);
  });
});

describe('steps and today', () => {
  it('the next step continues what you started', () => {
    const s = S();
    const items = s.future.cvItems!;
    expect(nextStep(items)!.item.id).toBe(items[0].id);
    items[3].steps[0].doneAt = NOW - 1000;
    expect(nextStep(items)).toMatchObject({ item: { id: items[3].id }, step: { id: items[3].steps[1].id } });
  });
  it('shows on your days until you do a step or skip it', () => {
    const s = S();
    expect(today(s, NOW)!.show).toBe(true); // Thursday is one of the days
    expect(today(s, at('2026-10-30'))!.show).toBe(false); // Friday isn't
    s.future.cvItems![0].steps[0].doneAt = NOW;
    expect(today(s, NOW)!.show).toBe(false);
    const s2 = S({ skipped: ['2026-10-29'] });
    expect(today(s2, NOW)!.show).toBe(false);
  });
  it('an item is done when all its steps are, or marked', () => {
    const s = S();
    const x = s.future.cvItems![0];
    expect(itemDone(x)).toBe(false);
    x.steps.forEach((st) => (st.doneAt = NOW));
    expect(itemDone(x)).toBe(true);
    expect(itemDone({ ...s.future.cvItems![1], doneAt: NOW })).toBe(true);
    expect(progress(s.future.cvItems!).done).toBe(1);
    expect(cvText(s)).toContain(x.title);
  });
  it('the week and the honest finish date', () => {
    const s = S();
    s.future.cvItems![0].steps[0].doneAt = at('2026-10-27');
    expect(week(s, NOW)).toMatchObject({ done: 1, planned: 3 });
    const e = eta(s, NOW);
    expect(e.weeks).toBe(Math.ceil(e.left / 3));
    expect(eta(S({ target: '2026-12-01' }), NOW).onTime).toBe(false);
  });
});

describe('data', () => {
  it('old data loads without a CV; junk is cleaned; two devices merge', () => {
    const old = initialState() as any;
    delete old.future.cvItems;
    expect(migrate(old).future.cvItems).toEqual([]);
    expect(migrate({ ...initialState(), future: { cv: 'x', cvItems: [null, { id: 'a', title: 'b' }] } }).future).toMatchObject({ cvItems: [{ id: 'a', title: 'b', sec: 'tools', steps: [] }] });
    const a = S(); const b = S();
    b.future.cvItems = [{ id: 'z', sec: 'proj', title: 'Z', steps: [], createdAt: 2 }];
    expect(mergeStates(a, b).future.cvItems!.some((x) => x.id === 'z')).toBe(true);
  });
});
