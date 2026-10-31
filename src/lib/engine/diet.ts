// «أكلي»: the numbers behind the meal plan.
//
// Targets: Mifflin–St Jeor × activity, minus a deficit for the pace you picked (0.5–1 % of your
// weight a week), never below a safe floor (1500 kcal men / 1200 women). Protein 2 g per kg
// (of the weight at BMI 27 when BMI ≥ 30). After two weeks of weigh-ins the formula gives way to
// what your body actually did: energy burned ≈ what you ate − the change in your trend weight ×
// 7700 kcal/kg, and the target follows it by at most ±150 kcal a week.
//
// The plan: each meal is a dish scaled to the meal's share of the day; family dishes are portions
// taken from the pot. «اصنع جدولك» uses the same budgets, with a cap per kind of food.

import type { AppState, DietDay, DietItem, DietMeal, DietSetup, FoodKind, MealSlot } from '../types';
import { DISHES, FOOD, FOODS, type Dish } from './foods';
import { addDays, todayKey } from '../dates';
import { L } from '../i18n';

export const KCAL_PER_KG = 7700;
const DAY = 86_400_000;
const round10 = (n: number) => Math.round(n / 10) * 10;
const round5 = (n: number) => Math.round(n / 5) * 5;
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / DAY);

// ---------------- foods ----------------

export interface FoodView {
  id: string;
  name: string;
  /** singular, plural */
  unit: [string, string];
  g: number;
  /** per one unit */
  kcal: number;
  p: number;
  c: number;
  f: number;
  kind: FoodKind;
  step: number;
  tags: string[];
  free?: boolean;
  own?: boolean;
}

export function foodOf(s: AppState, id: string): FoodView | undefined {
  const b = FOOD.get(id);
  if (b) {
    const k = b.g / 100;
    return { id, name: L(...b.t), unit: [L(b.unit[0], b.unit[2]), L(b.unit[1], `${b.unit[2]}s`)], g: b.g, kcal: b.k * k, p: b.p * k, c: b.c * k, f: b.f * k, kind: b.kind, step: b.step ?? 1, tags: b.tags || [], ...(b.free ? { free: true } : {}) };
  }
  const o = s.diet?.foods.find((x) => x.id === id);
  if (!o) return undefined;
  return { id, name: o.name, unit: [o.unit, o.unit], g: o.g, kcal: o.kcal, p: o.protein, c: o.carbs ?? 0, f: o.fat ?? 0, kind: o.kind, step: 0.5, tags: [], own: true };
}

/** every food you can pick: yours first, then the base */
export function allFoods(s: AppState): FoodView[] {
  return [...s.diet.foods.map((f) => foodOf(s, f.id)!), ...FOODS.map((f) => foodOf(s, f.id)!)];
}

const fmtQ = (q: number) => (Number.isInteger(q) ? String(q) : q === 0.5 ? L('نص', '½') : String(Math.round(q * 100) / 100));

/** «5 ملاعق» · «ملعقة» · «نص رغيف» */
export function amountText(f: FoodView, qty: number): string {
  if (qty === 1) return f.unit[0];
  if (qty === 0.5) return L(`نص ${f.unit[0]}`, `½ ${f.unit[0]}`);
  if (qty === 2 && f.unit[0] === f.unit[1]) return `2 ${f.unit[0]}`;
  return `${fmtQ(qty)} ${qty >= 3 && qty <= 10 ? f.unit[1] : qty === 2 ? f.unit[1] : f.unit[0]}`;
}

const liquid = (f: FoodView) => f.kind === 'drink' || (f.kind === 'dairy' && /كوب|cup/.test(f.unit[0]));
export const gramsText = (f: FoodView, qty: number) => `${Math.round(f.g * qty)} ${liquid(f) ? L('مل', 'ml') : L('جم', 'g')}`;

export interface Totals { kcal: number; p: number; c: number; f: number }

export function totals(s: AppState, items: DietItem[]): Totals {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const it of items) {
    const f = foodOf(s, it.food);
    if (!f) continue;
    t.kcal += f.kcal * it.qty;
    t.p += f.p * it.qty;
    t.c += f.c * it.qty;
    t.f += f.f * it.qty;
  }
  return { kcal: Math.round(t.kcal), p: Math.round(t.p), c: Math.round(t.c), f: Math.round(t.f) };
}

/** what a meal counted for: its items, or what you said you ate instead */
export function mealIntake(s: AppState, m: DietMeal): { kcal: number; p: number } {
  if (m.eaten === 'other' && m.other) return { kcal: m.other.kcal, p: m.other.protein };
  const t = totals(s, m.items);
  return { kcal: t.kcal, p: t.p };
}

export function dayIntake(s: AppState, d: DietDay): { kcal: number; p: number } {
  return d.meals.reduce((a, m) => { const x = mealIntake(s, m); return { kcal: a.kcal + x.kcal, p: a.p + x.p }; }, { kcal: 0, p: 0 });
}

// ---------------- weight trend ----------------

/** a smoothed weight (exponential moving average, ~10 % a day), so one salty dinner doesn't count */
export function trend(s: AppState): { day: string; w: number; t: number }[] {
  const list = (s.gym?.body || []).filter((b) => b.weight != null).sort((a, b) => a.day.localeCompare(b.day));
  const out: { day: string; w: number; t: number }[] = [];
  let t = 0;
  let prev = '';
  for (const b of list) {
    const w = b.weight!;
    if (!out.length) t = w;
    else {
      const gap = Math.max(1, daysBetween(prev, b.day));
      const a = 1 - 0.9 ** gap;
      t = t + a * (w - t);
    }
    prev = b.day;
    out.push({ day: b.day, w, t: Math.round(t * 100) / 100 });
  }
  return out;
}

export const trendNow = (s: AppState) => trend(s).at(-1)?.t;

/** the trend on a day (the last value on or before it) */
function trendAt(tr: ReturnType<typeof trend>, day: string): number | undefined {
  let v: number | undefined;
  for (const x of tr) if (x.day <= day) v = x.t;
  return v;
}

// ---------------- targets ----------------

export const floorKcal = (s: AppState) => (s.gym?.info?.sex === 'f' ? 1200 : 1500);

function activity(s: AppState): number {
  const p = s.gym?.profile;
  if (s.settings.sections?.gym && p) return p.days.length >= 5 ? 1.6 : p.days.length >= 3 ? 1.5 : 1.4;
  return s.diet.setup?.activity ?? 1.4;
}

/** calories a day that keep your weight (Mifflin–St Jeor × activity); null without height/age/sex */
export function maintain(s: AppState, kg: number, now = Date.now()): number | null {
  const i = s.gym?.info || {};
  if (!i.height || !i.birthYear || !i.sex) return null;
  const age = new Date(now).getFullYear() - i.birthYear;
  const bmr = 10 * kg + 6.25 * i.height - 5 * age + (i.sex === 'm' ? 5 : -161);
  return round10(bmr * activity(s));
}

/** the daily deficit for a pace: % of weight a week × 7700, at most 30 % of maintenance and 1000 */
export const deficitFor = (pace: number, kg: number, keep: number) => Math.min((pace / 100) * kg * KCAL_PER_KG / 7, keep * 0.3, 1000);

export function proteinTarget(s: AppState, kg: number): number {
  const h = s.gym?.info?.height;
  const ref = h && kg / (h / 100) ** 2 >= 30 ? 27 * (h / 100) ** 2 : kg;
  return round5(ref * 2);
}

export function startTargets(s: AppState, setup: Pick<DietSetup, 'pace'>, kg: number, now = Date.now()): { kcal: number; protein: number; maintain: number } | null {
  const keep = maintain(s, kg, now);
  if (!keep) return null;
  return { kcal: Math.max(floorKcal(s), round10(keep - deficitFor(setup.pace, kg, keep))), protein: proteinTarget(s, kg), maintain: keep };
}

/** carbs and fat for a calorie target: fat 30 %, carbs the rest after protein */
export function macros(kcal: number, protein: number) {
  const fat = Math.round((kcal * 0.3) / 9);
  return { protein, fat, carbs: Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4)) };
}

/** a day's calories: training days a little more when the Gym is on, the week's average unchanged */
export function dayTarget(s: AppState, day: string): number {
  const base = s.diet.kcal ?? 0;
  const p = s.gym?.profile;
  if (!s.settings.sections?.gym || !p || !p.days.length || p.days.length >= 7) return base;
  const wd = new Date(`${day}T12:00:00`).getDay();
  const n = p.days.length;
  return round10(p.days.includes(wd) ? base + 100 : base - (100 * n) / (7 - n));
}

// ---------------- slots ----------------

/** the meals of a day, in order, from how many you chose and whether there's a snack */
export function slotsOf(setup: Pick<DietSetup, 'meals' | 'snack'>): MealSlot[] {
  const n = Math.max(1, Math.min(6, Math.round(setup.meals)));
  const base: MealSlot[] = n === 1 ? ['lunch'] : n === 2 ? ['lunch', 'dinner'] : ['breakfast', 'lunch', 'dinner'];
  for (let i = 3; i < n; i++) base.splice(i - 1, 0, 'meal');
  return setup.snack ? [...base.slice(0, base.length - 1), 'snack', base[base.length - 1]] : base;
}

const WEIGHT: Record<MealSlot, number> = { breakfast: 25, lunch: 35, dinner: 25, meal: 15, snack: 12 };

/** each slot's share of the day (%), yours if you moved it */
export function splitOf(setup: Pick<DietSetup, 'meals' | 'snack' | 'split'>): number[] {
  const slots = slotsOf(setup);
  if (setup.split && setup.split.length === slots.length && setup.split.every((x) => x > 0)) {
    const sum = setup.split.reduce((a, b) => a + b, 0);
    return setup.split.map((x) => (x / sum) * 100);
  }
  const w = slots.map((x) => WEIGHT[x]);
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (x / sum) * 100);
}

export function slotName(slot: MealSlot, i: number, slots: MealSlot[]): string {
  if (slot === 'meal') return L(`وجبة ${slots.slice(0, i + 1).filter((x) => x !== 'snack').length}`, `Meal ${slots.slice(0, i + 1).filter((x) => x !== 'snack').length}`);
  return ({ breakfast: L('الفطور', 'Breakfast'), lunch: L('الغدا', 'Lunch'), dinner: L('العشا', 'Dinner'), snack: L('سناك', 'Snack') } as Record<string, string>)[slot];
}

export function budgets(s: AppState, day: string): number[] {
  const setup = s.diet.setup;
  if (!setup) return [];
  const t = dayTarget(s, day);
  return splitOf(setup).map((x) => round10((t * x) / 100));
}

// ---------------- the ready plan ----------------

const avoided = (d: Dish, avoid: string[]) => d.items.some((it) => (FOOD.get(it.food)?.tags || []).some((t) => avoid.includes(t)));

/** a dish scaled to a meal's calories: starch and protein grow or shrink, the rest stays */
export function fitDish(s: AppState, dish: Dish, budget: number): { meal: DietMeal; kcal: number; off: number } {
  const items = dish.items.map((i) => ({ ...i }));
  const kc = (it: { food: string; qty: number }) => (foodOf(s, it.food)?.kcal ?? 0) * it.qty;
  const fixed = items.filter((i) => !i.scale).reduce((a, i) => a + kc(i), 0);
  const scal = items.filter((i) => i.scale).reduce((a, i) => a + kc(i), 0);
  const fct = scal > 0 ? Math.max(0.4, Math.min(2.5, (budget - fixed) / scal)) : 1;
  const step = (id: string) => foodOf(s, id)?.step ?? 1;
  for (const i of items) if (i.scale) i.qty = Math.max(step(i.food), Math.round((i.qty * fct) / step(i.food)) * step(i.food));
  let total = items.reduce((a, i) => a + kc(i), 0);
  // nudge the starch a step at a time towards the budget
  const starch = items.find((i) => i.scale === 'starch') || items.find((i) => i.scale);
  for (let n = 0; starch && n < 12; n++) {
    const st = step(starch.food);
    const one = kc({ food: starch.food, qty: st });
    if (total > budget * 1.03 && starch.qty > st) { starch.qty -= st; total -= one; }
    else if (total < budget * 0.97 && total + one <= budget * 1.03) { starch.qty += st; total += one; }
    else break;
  }
  return { meal: { slot: 'lunch', dish: dish.id, items: items.map(({ food, qty }) => ({ food, qty })) }, kcal: Math.round(total), off: Math.abs(total - budget) / Math.max(1, budget) };
}

const dayNo = (day: string) => Math.round(new Date(`${day}T12:00:00`).getTime() / DAY);

function familyDay(setup: DietSetup, day: string): boolean {
  const k = ((dayNo(day) % 7) + 7) % 7;
  return setup.family === 'most' ? k !== 3 : setup.family === 'some' ? k % 2 === 0 && k !== 6 : k === 5;
}

/** the dishes that can go in a slot on a day */
export function candidates(s: AppState, slot: MealSlot, day: string): Dish[] {
  const setup = s.diet.setup!;
  const ok = DISHES.filter((d) => d.slots.includes(slot) && !avoided(d, setup.avoid));
  if (slot !== 'lunch') return ok.filter((d) => !d.family || slot === 'dinner');
  const fam = familyDay(setup, day);
  const pick = ok.filter((d) => !!d.family === fam);
  return pick.length ? pick : ok;
}

/** a ready day: a dish per meal, sized to the meal, landing on the day's calories and protein */
export function planDay(s: AppState, day: string): DietDay {
  const setup = s.diet.setup;
  if (!setup) return { day, meals: [], updatedAt: 0 };
  const slots = slotsOf(setup);
  const bud = budgets(s, day);
  const n = dayNo(day);
  const meals: DietMeal[] = slots.map((slot, i) => {
    const c = candidates(s, slot, day);
    if (!c.length) return { slot, items: [] };
    let best: ReturnType<typeof fitDish> | null = null;
    for (let k = 0; k < c.length; k++) {
      const d = c[(((n + i * 3 + k) % c.length) + c.length) % c.length];
      const f = fitDish(s, d, bud[i]);
      if (!best || f.off < best.off) best = f;
      if (f.off <= 0.12) { best = f; break; }
    }
    return { ...best!.meal, slot };
  });
  const out: DietDay = { day, meals, updatedAt: 0 };
  // protein: swap the leanest meal for a richer one of the same size when the day falls short
  const target = s.diet.protein ?? 0;
  if (target && dayIntake(s, out).p < target * 0.9) {
    const idx = meals.map((m, i) => ({ i, p: totals(s, m.items).p })).sort((a, b) => a.p - b.p)[0]?.i;
    if (idx != null) {
      const alt = alternatives(s, out, idx)[0];
      if (alt && totals(s, alt.items).p > totals(s, meals[idx].items).p) meals[idx] = alt;
    }
  }
  return out;
}

/** the day as stored, or the ready plan for it */
export const dayOf = (s: AppState, day: string): DietDay => s.diet.days[day] || planDay(s, day);

/** other dishes for a meal, sized to it and ordered by protein: «بدّلها بـ» */
export function alternatives(s: AppState, d: DietDay, idx: number): DietMeal[] {
  const setup = s.diet.setup;
  if (!setup) return [];
  const m = d.meals[idx];
  const budget = budgets(s, d.day)[idx] ?? totals(s, m.items).kcal;
  return DISHES.filter((x) => x.slots.includes(m.slot) && !avoided(x, setup.avoid) && x.id !== m.dish)
    .map((x) => fitDish(s, x, budget))
    .filter((x) => x.off <= 0.12)
    .sort((a, b) => totals(s, b.meal.items).p - totals(s, a.meal.items).p)
    .slice(0, 5)
    .map((x) => ({ ...x.meal, slot: m.slot }));
}

// ---------------- build your own: the limits ----------------

/** the most of a kind of food one meal can hold: starch half of it, fats/sweets/sugary drinks a fifth */
export const capShare = (kind: FoodKind) => (kind === 'starch' || kind === 'mixed' ? 0.5 : kind === 'fat' || kind === 'sweet' || kind === 'drink' ? 0.2 : 1);
const capGroup = (kind: FoodKind) => (kind === 'starch' || kind === 'mixed' ? 'starch' : kind === 'fat' || kind === 'sweet' || kind === 'drink' ? 'extra' : 'free');

export interface Limit {
  /** the largest amount that fits (0 = none) */
  max: number;
  /** what stops it */
  by: 'meal' | 'kind' | 'day' | null;
  room: number;
}

/**
 * How much of a food a meal can still take: within the meal's budget, the cap for its kind, and
 * the day's target (+5 %). `except` leaves one item out (when you're changing its amount).
 */
export function limitFor(s: AppState, d: DietDay, idx: number, foodId: string, except?: number): Limit {
  const f = foodOf(s, foodId);
  if (!f) return { max: 0, by: 'meal', room: 0 };
  const budget = budgets(s, d.day)[idx] ?? 0;
  const m = d.meals[idx];
  const others = m.items.filter((_, i) => i !== except);
  const used = totals(s, others).kcal;
  const roomMeal = budget - used;
  const g = capGroup(f.kind);
  const usedKind = others.filter((it) => { const x = foodOf(s, it.food); return x && capGroup(x.kind) === g; }).reduce((a, it) => a + (foodOf(s, it.food)!.kcal * it.qty), 0);
  const roomKind = g === 'free' ? Infinity : budget * capShare(f.kind) - usedKind;
  const dayUsed = d.meals.reduce((a, mm, i) => a + (i === idx ? used : totals(s, mm.items).kcal), 0);
  const roomDay = dayTarget(s, d.day) * 1.05 - dayUsed;
  const room = Math.min(roomMeal, roomKind, roomDay);
  const by: Limit['by'] = room === roomDay && roomDay < roomMeal ? 'day' : room === roomKind ? 'kind' : 'meal';
  if (f.kcal <= 0) return { max: 99, by: null, room };
  const max = Math.max(0, Math.floor(room / f.kcal / f.step + 1e-9) * f.step);
  return { max, by, room: Math.max(0, Math.round(room)) };
}

/** the day's protein falls short: by how much (0 when it's fine) */
export function proteinShort(s: AppState, d: DietDay): number {
  const t = s.diet.protein ?? 0;
  const p = dayIntake(s, d).p;
  return t && p < t * 0.9 ? Math.round(t - p) : 0;
}

/** a blank day with your meals, for building it yourself */
export function blankDay(s: AppState, day: string): DietDay {
  return { day, built: true, meals: slotsOf(s.diet.setup!).map((slot) => ({ slot, items: [] })), updatedAt: Date.now() };
}

/** a saved day fitted to today's budgets: amounts scaled to the new target, then cut back to the caps */
export function fromTemplate(s: AppState, meals: DietMeal[], day: string): DietDay {
  const bud = budgets(s, day);
  const out: DietDay = { day, built: true, meals: [], updatedAt: Date.now() };
  slotsOf(s.diet.setup!).forEach((slot, i) => {
    const src = meals[i] || { slot, items: [] };
    const had = totals(s, src.items).kcal;
    const k = had > 0 && bud[i] ? bud[i] / had : 1;
    const items = src.items.map((it) => { const st = foodOf(s, it.food)?.step ?? 1; return { food: it.food, qty: Math.max(st, Math.round((it.qty * k) / st) * st) }; });
    out.meals.push({ slot, items: [] });
    for (const it of items) {
      const lim = limitFor(s, out, i, it.food);
      const q = Math.min(it.qty, lim.max);
      if (q > 0) out.meals[i].items.push({ food: it.food, qty: q });
    }
  });
  return out;
}

// ---------------- shopping ----------------

/** what you cook in the next seven days, summed: family dishes come from the pot */
export function shopping(s: AppState, from = todayKey()): { food: FoodView; qty: number }[] {
  const sum = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = dayOf(s, addDays(from, i));
    for (const m of d.meals) {
      const dish = m.dish ? DISHES.find((x) => x.id === m.dish) : undefined;
      if (dish?.family) continue;
      for (const it of m.items) sum.set(it.food, (sum.get(it.food) || 0) + it.qty);
    }
  }
  const order: FoodKind[] = ['protein', 'dairy', 'starch', 'mixed', 'veg', 'fruit', 'fat', 'sweet', 'drink'];
  return [...sum.entries()]
    .map(([id, qty]) => ({ food: foodOf(s, id)!, qty: Math.round(qty * 2) / 2 }))
    .filter((x) => x.food)
    .sort((a, b) => order.indexOf(a.food.kind) - order.indexOf(b.food.kind) || a.food.name.localeCompare(b.food.name));
}

// ---------------- the weekly check-in ----------------

export interface CheckIn {
  kcal: number;
  protein: number;
  expenditure?: number;
  from?: number;
  to?: number;
  /** kg a week (negative = losing) */
  rate?: number;
  /** % of weight a week lost */
  pct?: number;
  adherence?: number;
  weighIns: number;
  /** provisional: too few weigh-ins yet, the formula still leads */
  status: 'provisional' | 'ontrack' | 'slow' | 'fast' | 'offplan';
}

/** the weekly check-in is due: seven days since the last (or since you started) */
export function checkInDue(s: AppState, now = Date.now()): boolean {
  const setup = s.diet.setup;
  if (!setup) return false;
  const last = s.diet.weeks.at(-1)?.day ?? setup.start;
  return daysBetween(last, todayKey(now)) >= 7;
}

export function checkIn(s: AppState, now = Date.now()): CheckIn | null {
  const setup = s.diet.setup;
  if (!setup) return null;
  const today = todayKey(now);
  const start = addDays(today, -Math.min(14, Math.max(1, daysBetween(setup.start, today))));
  const n = Math.max(1, daysBetween(start, today));
  const tr = trend(s);
  const kg = tr.at(-1)?.t;
  if (kg == null) return null;
  // what you ate: each day as stored, or as planned if you didn't touch it
  let eaten = 0;
  let planned = 0;
  let kept = 0;
  for (let i = 0; i < n; i++) {
    const day = addDays(start, i);
    const d = dayOf(s, day);
    eaten += dayIntake(s, d).kcal;
    // how well you kept to it: only meals you marked one way or the other
    for (const m of s.diet.days[day]?.meals || []) if (m.eaten) { planned++; if (m.eaten !== 'other') kept++; }
  }
  const intake = eaten / n;
  const weighIns = tr.filter((x) => x.day >= start && x.day <= today).length;
  const from = trendAt(tr, start) ?? tr.find((x) => x.day >= start)?.t;
  const to = kg;
  const reliable = weighIns >= 10 && daysBetween(setup.start, today) >= 14 && from != null;
  const base = s.diet.kcal ?? startTargets(s, setup, kg, now)?.kcal ?? floorKcal(s);
  const clamp = (x: number) => Math.max(floorKcal(s), round10(Math.min(base + 150, Math.max(base - 150, x))));
  let kcal: number;
  let expenditure: number | undefined;
  let rate: number | undefined;
  let pct: number | undefined;
  if (reliable) {
    const change = to - from!;
    rate = Math.round((change / n) * 7 * 100) / 100;
    pct = Math.round((-rate / to) * 1000) / 10;
    expenditure = round10(intake - (change * KCAL_PER_KG) / n);
    kcal = clamp(expenditure - deficitFor(setup.pace, to, expenditure));
  } else {
    const t = startTargets(s, setup, kg, now);
    kcal = clamp(t?.kcal ?? base);
  }
  const adherence = planned ? kept / planned : undefined;
  const status: CheckIn['status'] = !reliable ? 'provisional' : pct! < setup.pace * 0.5 ? (adherence != null && adherence < 0.7 ? 'offplan' : 'slow') : pct! > setup.pace * 1.5 + 0.25 ? 'fast' : 'ontrack';
  return { kcal, protein: proteinTarget(s, to), ...(expenditure != null ? { expenditure } : {}), ...(from != null ? { from: Math.round(from * 10) / 10 } : {}), to: Math.round(to * 10) / 10, ...(rate != null ? { rate } : {}), ...(pct != null ? { pct } : {}), ...(adherence != null ? { adherence } : {}), weighIns, status };
}

/** weeks to the goal at the chosen pace (shrinking as you lose) */
export function weeksToGoal(kg: number, goal: number, pace: number): number {
  let w = kg;
  let n = 0;
  while (w > goal && n < 520) { w -= (w * pace) / 100; n++; }
  return n;
}
