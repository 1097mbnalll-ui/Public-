import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { addDays } from '../src/lib/dates';
import { budgets, checkIn, dayIntake, fitDish, floorKcal, limitFor, planDay, proteinTarget, slotsOf, splitOf, startTargets, totals, trend, weeksToGoal, blankDay, fromTemplate } from '../src/lib/engine/diet';
import { DISH, DISHES, FOOD } from '../src/lib/engine/foods';
import type { AppState, DietSetup } from '../src/lib/types';

const T0 = new Date('2026-11-01T09:00:00').getTime();
const setup: DietSetup = { goalKg: 80, pace: 0.75, meals: 3, snack: true, avoid: [], family: 'most', start: '2026-11-01', createdAt: T0 };

function state(kg = 92, extra: Partial<DietSetup> = {}): AppState {
  const s = initialState();
  s.settings.sections = { diet: true };
  s.gym.info = { sex: 'm', birthYear: 2004, height: 178 };
  s.gym.body = [{ id: 'b0', day: '2026-11-01', weight: kg, createdAt: T0 }];
  s.diet.setup = { ...setup, ...extra };
  const t = startTargets(s, s.diet.setup, kg, T0)!;
  s.diet.kcal = t.kcal;
  s.diet.protein = t.protein;
  return s;
}

describe('food base', () => {
  it('every dish uses known foods and fits a sensible lunch', () => {
    for (const d of DISHES) for (const it of d.items) expect(FOOD.has(it.food), `${d.id}:${it.food}`).toBe(true);
    const s = state();
    const f = fitDish(s, DISH.get('kabsa_chicken')!, 620);
    expect(f.off).toBeLessThan(0.12);
  });
});

describe('targets', () => {
  it('a deficit for the pace, protein 2 g/kg of the BMI-27 weight when BMI ≥ 30', () => {
    const s = state();
    const t = startTargets(s, setup, 92, T0)!;
    expect(t.maintain - t.kcal).toBeGreaterThan(400);
    expect(t.maintain - t.kcal).toBeLessThanOrEqual(1000);
    expect(proteinTarget(s, 92)).toBe(185); // BMI 29 → own weight, 2 g/kg
    expect(proteinTarget(s, 110)).toBe(Math.round((27 * 1.78 ** 2 * 2) / 5) * 5);
  });
  it('never below the floor', () => {
    const s = state(55, { pace: 1 });
    s.gym.info = { sex: 'f', birthYear: 1990, height: 155 };
    expect(startTargets(s, s.diet.setup!, 55, T0)!.kcal).toBeGreaterThanOrEqual(floorKcal(s));
    expect(floorKcal(s)).toBe(1200);
  });
  it('weeks to the goal at the pace', () => expect(weeksToGoal(92, 80, 0.75)).toBeGreaterThan(17));
});

describe('meals', () => {
  it('you choose how many meals and the snack; the split follows', () => {
    expect(slotsOf({ meals: 3, snack: true })).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
    expect(slotsOf({ meals: 2, snack: false })).toEqual(['lunch', 'dinner']);
    expect(slotsOf({ meals: 5, snack: false })).toEqual(['breakfast', 'lunch', 'meal', 'meal', 'dinner']);
    expect(Math.round(splitOf({ meals: 3, snack: false }).reduce((a, b) => a + b, 0))).toBe(100);
  });
  it('a ready day lands near the target', () => {
    const s = state();
    for (let i = 0; i < 7; i++) {
      const d = planDay(s, addDays('2026-11-01', i));
      const k = dayIntake(s, d).kcal;
      expect(Math.abs(k - s.diet.kcal!) / s.diet.kcal!, d.day).toBeLessThan(0.12);
      expect(d.meals.length).toBe(4);
    }
  });
  it('what you don\'t eat stays out', () => {
    const s = state(92, { avoid: ['egg', 'dairy', 'fish'] });
    for (let i = 0; i < 7; i++) for (const m of planDay(s, addDays('2026-11-01', i)).meals) for (const it of m.items) expect(FOOD.get(it.food)?.tags || []).not.toContain('egg');
  });
});

describe('build your own: limits', () => {
  it('stops at the meal budget and at the starch cap', () => {
    const s = state();
    const d = blankDay(s, '2026-11-02');
    const lunch = d.meals.findIndex((m) => m.slot === 'lunch');
    const b = budgets(s, d.day)[lunch];
    const rice = limitFor(s, d, lunch, 'rice_kabsa');
    expect(rice.by).toBe('kind');
    expect(totals(s, [{ food: 'rice_kabsa', qty: rice.max }]).kcal).toBeLessThanOrEqual(b * 0.5 + 1);
    d.meals[lunch].items.push({ food: 'chicken_kabsa', qty: 2 });
    const more = limitFor(s, d, lunch, 'chicken_kabsa');
    expect(totals(s, [...d.meals[lunch].items, { food: 'chicken_kabsa', qty: more.max }]).kcal).toBeLessThanOrEqual(b + 1);
  });
  it('a saved day is fitted to the new target and the caps', () => {
    const s = state();
    const d = fromTemplate(s, [{ slot: 'breakfast', items: [{ food: 'oats', qty: 40 }] }], '2026-11-03');
    expect(totals(s, d.meals[0].items).kcal).toBeLessThanOrEqual(budgets(s, d.day)[0] * 0.5 + 1);
  });
});

describe('weekly check-in', () => {
  it('provisional before two weeks of weigh-ins', () => {
    const s = state();
    expect(checkIn(s, T0 + 7 * 864e5)!.status).toBe('provisional');
  });
  it('estimates expenditure from the trend and moves the target at most 150', () => {
    const s = state();
    // 15 days of weigh-ins losing 0.1 kg a day, eating the plan
    s.gym.body = Array.from({ length: 15 }, (_, i) => ({ id: `b${i}`, day: addDays('2026-11-01', i), weight: 92 - i * 0.1, createdAt: T0 }));
    const c = checkIn(s, new Date('2026-11-15T09:00:00').getTime())!;
    expect(c.status).not.toBe('provisional');
    expect(c.expenditure).toBeGreaterThan(s.diet.kcal!);
    expect(Math.abs(c.kcal - s.diet.kcal!)).toBeLessThanOrEqual(150);
    expect(trend(s).at(-1)!.t).toBeLessThan(92);
  });
});

import { paceFor, paceToReach, earliestSafe } from '../src/lib/engine/diet';
describe('a date of your own', () => {
  it('the pace follows from the date, never above 1 % a week', () => {
    expect(paceToReach(92, 80, 19)).toBeCloseTo(0.73, 1);
    expect(paceFor({ pace: 0.75, by: '2026-12-01', goalKg: 80 }, 92, T0)).toBe(1);
    expect(paceFor({ pace: 0.75, by: '2027-06-01', goalKg: 80 }, 92, T0)).toBeLessThan(0.75);
    expect(earliestSafe(92, 80, '2026-11-01') > '2027-02-01').toBe(true);
  });
});

import { migrate } from '../src/lib/defaults';
describe('hand portions', () => {
  it('a day saved in spoons keeps its grams in hands', () => {
    const raw = initialState() as any;
    raw.diet = { weeks: [], foods: [], templates: [], days: { '2026-11-01': { day: '2026-11-01', updatedAt: 1, meals: [{ slot: 'lunch', items: [{ food: 'rice_kabsa', qty: 6 }, { food: 'olive_oil', qty: 1 }] }] } } };
    const s = migrate(raw);
    expect(s.diet.days['2026-11-01'].meals[0].items).toEqual([{ food: 'rice_kabsa', qty: 2 }, { food: 'olive_oil', qty: 0.5 }]);
    expect(migrate(s).diet.days['2026-11-01'].meals[0].items[0].qty).toBe(2);
  });
});
