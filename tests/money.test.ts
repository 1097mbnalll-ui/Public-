import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { atTime } from '../src/lib/dates';
import { catLimits, cycle, guessCat, limitNote, moneyToday, noSpend, suggestBudget, parseBankSms, parseExpense, regrets, report, suggestions, weekStrip } from '../src/lib/engine/money';
import type { AppState, Expense } from '../src/lib/types';

// Saturday 2026-10-24, 12:00 local
const NOW = atTime('2026-10-24', '12:00');

function ex(p: Partial<Expense>): Expense {
  return { id: Math.random().toString(36).slice(2), title: 'شي', amount: 10, cat: 'other', day: '2026-10-24', createdAt: NOW, ...p };
}

describe('expense quick entry', () => {
  it('reads amount, day and category', () => {
    expect(parseExpense('قهوة ستاربكس 24', NOW)).toMatchObject({ title: 'قهوة ستاربكس', amount: 24, day: '2026-10-24', cat: 'coffee' });
    expect(parseExpense('بنزين ٦٠ أمس', NOW)).toMatchObject({ title: 'بنزين', amount: 60, day: '2026-10-23', cat: 'transport' });
    expect(parseExpense('غدا البيك 32.5 ريال', NOW)).toMatchObject({ amount: 32.5, cat: 'food', title: 'غدا البيك' });
    expect(guessCat('توصيل ماكدونالدز')).toBe('delivery');
  });
});

describe('budget', () => {
  it('splits what is left of the month over the days left', () => {
    const s: AppState = initialState();
    s.money.budget = 3100; // 100 a day in October
    s.expenses.push(ex({ amount: 2300, day: '2026-10-10' }), ex({ amount: 40 }));
    const m = moneyToday(s, NOW);
    expect(m.daysLeft).toBe(8); // 24..31
    expect(m.allowance).toBeCloseTo((3100 - 2300) / 8, 5);
    expect(m.spentToday).toBe(40);
    expect(m.leftMonth).toBe(760);
    expect(weekStrip(s, NOW).at(-1)).toMatchObject({ day: '2026-10-24', mark: 'ok' });
  });
});

describe('savings', () => {
  it('suggests cutting a coffee habit and an idle subscription', () => {
    const s: AppState = initialState();
    for (let i = 0; i < 10; i++) s.expenses.push(ex({ title: 'ستاربكس', amount: 24, cat: 'coffee', day: `2026-10-${String(10 + i)}` }));
    s.subs.push({ id: 'x', name: 'شاهد', amount: 30, cycle: 'month', next: '2026-10-27', lastUsed: '2026-09-01', createdAt: NOW });
    const sw = suggestions(s, NOW);
    expect(sw[0].id).toBe('coffee');
    expect(sw[0].monthly).toBe(240 - 40);
    expect(sw.find((x) => x.id === 'sub:x')?.options[0]).toMatchObject({ free: true });
  });
});

describe('report', () => {
  it('compares with the previous month by category', () => {
    const s: AppState = initialState();
    s.expenses.push(ex({ cat: 'food', amount: 100, day: '2026-10-05' }), ex({ cat: 'food', amount: 200, day: '2026-09-05' }));
    const r = report(s, 'month', NOW);
    expect(r.total).toBe(100);
    expect(r.change).toBeCloseTo(-0.5);
    expect(r.cats[0]).toMatchObject({ cat: 'food', total: 100, prev: 200 });
    expect(r.daily.length).toBe(31);
  });
});

describe('bank SMS', () => {
  it('understands the date however the phone formatted it', () => {
    const msg = 'شراء بمبلغ 10 ريال لدى تجربة';
    const cases: [string, string, string][] = [
      ['السبت، ٢٤ أكتوبر ٢٠٢٦ في ٥:٢٦ م', '2026-10-24', '17:26'],
      ['23 Oct 2026 at 9:05 AM', '2026-10-23', '09:05'],
      ['October 22, 2026 at 12:10 PM', '2026-10-22', '12:10'],
      ['21/10/2026, 18:40', '2026-10-21', '18:40'],
    ];
    const file = cases.map(([d]) => `${d}\n${msg}`).join('\n');
    const out = parseBankSms(file, NOW);
    expect(out.map((o) => [o.day, o.time])).toEqual(cases.map(([, d, t]) => [d, t]));
    expect(out.every((o) => o.amount === 10 && o.title === 'تجربة')).toBe(true);
  });

  it('reads the Shortcuts file (date line + message + ---) with stable fingerprints', () => {
    const file = `2026-10-22 13:05
شراء انترنت
بمبلغ 45.50 ريال
من NOON
---
2026-10-23 08:00
Purchase SAR 18 at DUNKIN
---
`;
    const out = parseBankSms(file, NOW);
    expect(out.map((o) => [o.day, o.time, o.amount, o.title, o.cat])).toEqual([
      ['2026-10-22', '13:05', 45.5, 'NOON', 'shopping'],
      ['2026-10-23', '08:00', 18, 'DUNKIN', 'coffee'],
    ]);
    expect(parseBankSms(file + '2026-10-24 10:00\nPurchase SAR 5 at X\n---', NOW)[0].key).toBe(out[0].key);
    // the same file without the «---» lines
    const bare = parseBankSms(file.replace(/---\n/g, ''), NOW);
    expect(bare.map((o) => [o.day, o.amount])).toEqual([['2026-10-22', 45.5], ['2026-10-23', 18]]);
  });

  it('reads purchases and skips income', () => {
    const sms = `شراء عبر نقاط البيع
بطاقة: 1234*
مبلغ: SAR 24.00
لدى: STARBUCKS
في: 24/10/26 09:10

إيداع راتب
مبلغ: SAR 8000

Purchase
Amount: SAR 60.50
At: ALDREES
On: 2026-10-23 07:30`;
    const out = parseBankSms(sms, NOW);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ amount: 24, title: 'STARBUCKS', day: '2026-10-24', time: '09:10', cat: 'coffee' });
    expect(out[1]).toMatchObject({ amount: 60.5, title: 'ALDREES', day: '2026-10-23', cat: 'transport' });
  });
});

describe('budget month, limits and habits', () => {
  it('runs payday to payday', () => {
    const s: AppState = initialState();
    s.money.payday = 27;
    expect(cycle(s, '2026-10-24')).toMatchObject({ from: '2026-09-27', to: '2026-10-26', days: 30 });
    expect(cycle(s, '2026-10-27')).toMatchObject({ from: '2026-10-27', to: '2026-11-26' });
    s.money.payday = 31; // short months use their last day
    expect(cycle(s, '2026-10-24')).toMatchObject({ from: '2026-09-30', to: '2026-10-30' });
    s.money.budget = 3000;
    s.money.payday = 27;
    const m = moneyToday(s, NOW);
    expect(m.daysLeft).toBe(3); // 24, 25, 26
    expect(m.dailyLine).toBe(100);
  });

  it('warns when a category limit is near or crossed', () => {
    const s: AppState = initialState();
    s.money.limits = { coffee: 100 };
    s.expenses.push(ex({ cat: 'coffee', amount: 70 }));
    expect(limitNote(s, 'coffee', 70, NOW)).toBeUndefined();
    s.expenses.push(ex({ cat: 'coffee', amount: 15 }));
    expect(limitNote(s, 'coffee', 15, NOW)).toContain('قربت');
    s.expenses.push(ex({ cat: 'coffee', amount: 20 }));
    expect(limitNote(s, 'coffee', 20, NOW)).toContain('تجاوزت');
    expect(catLimits(s, NOW)[0]).toMatchObject({ cat: 'coffee', used: 105, limit: 100 });
  });

  it('counts days without spending and the current run', () => {
    const s: AppState = initialState();
    s.expenses.push(ex({ day: '2026-10-18' }), ex({ day: '2026-10-21' }));
    // 19, 20, 22, 23 had nothing; the run is 22–23
    expect(noSpend(s, NOW)).toEqual({ days: 4, streak: 2 });
  });

  it('suggests a budget from the last months', () => {
    const s: AppState = initialState();
    s.expenses.push(ex({ amount: 4000, day: '2026-09-10' }), ex({ amount: 3600, day: '2026-08-01' }), ex({ amount: 500, day: '2026-07-20' }));
    // July was only half logged, so it doesn't count
    expect(suggestBudget(s, NOW)).toEqual({ avg: 3800, suggest: 3500 });
  });
});

import { fmtMoney as fm2, fmtNum as fn2, parseBankSms as pbs2, parseMoney } from '../src/lib/engine/money';
describe('halalas', () => {
  it('a separator before one or two digits is halalas, before three is thousands', () => {
    expect(parseMoney('12.75')).toBe(12.75);
    expect(parseMoney('12,75')).toBe(12.75);
    expect(parseMoney('12٫5')).toBe(12.5);
    expect(parseMoney('١٢٫٥٠')).toBe(12.5);
    expect(parseMoney('12،25')).toBe(12.25);
    expect(parseMoney('1,500')).toBe(1500);
    expect(parseMoney('1,234.50')).toBe(1234.5);
    expect(parseMoney('12.')).toBe(12);
    expect(parseMoney('')).toBeUndefined();
    expect(parseMoney('abc')).toBeUndefined();
  });
  it('shows halalas when there are any', () => {
    expect(fn2(12)).toBe('12');
    expect(fn2(12.5)).toBe('12.50');
    expect(fn2(1234.75)).toBe('1,234.75');
    expect(fn2(0.1 + 0.2)).toBe('0.30');
    expect(fm2(9.99)).toContain('9.99');
  });
  it('bank messages keep the halalas', () => {
    expect(pbs2('شراء عبر نقاط البيع\nبمبلغ: 23.75 SAR\nلدى: STARBUCKS', Date.now())[0]?.amount).toBe(23.75);
    expect(pbs2('Purchase SAR 1,250.50 at JARIR', Date.now())[0]?.amount).toBe(1250.5);
  });
});

describe('reports and savings follow the category you picked, not the name', () => {
  const mk = (title: string, cat: string, amount: number, day = '2026-10-20', worth?: 'no') => ({ id: Math.random().toString(36).slice(2), title, cat, amount, day, createdAt: 1, ...(worth ? { worth } : {}) }) as any;
  it('a purchase named «قهوة» but put under «أكل» counts as food; «ما يستحق» groups by category', () => {
    const s = initialState();
    s.expenses = [mk('قهوة', 'food', 40, '2026-10-20', 'no'), mk('برجر', 'food', 30, '2026-10-21', 'no'), mk('سماعة', 'shopping', 90, '2026-10-22', 'no')];
    const r = regrets(s, new Date('2026-10-28T12:00:00').getTime());
    expect(r.items.map((x) => x.cat)).toEqual(['shopping', 'food']);
    expect(r.items[1]).toMatchObject({ n: 2, sum: 70 });
  });
  it('transport is the whole category; your own categories get a suggestion too', () => {
    const s = initialState();
    s.money.cats = [{ id: 'c_grocery', label: 'بقالة', emoji: '🛒', createdAt: 1 } as any];
    s.expenses = [mk('أي شي', 'transport', 80, '2026-10-20'), mk('بنزين', 'transport', 90, '2026-10-21'), mk('السوق', 'c_grocery', 200, '2026-10-22')];
    const ids = suggestions(s, new Date('2026-10-28T12:00:00').getTime()).map((x) => x.id);
    expect(ids).toContain('rides');
    expect(ids).toContain('cat:c_grocery');
  });
});

describe('savings goal: add, withdraw, percent', () => {
  it('withdrawing more than saved takes only what is there; deleting an entry undoes it', async () => {
    const { replaceState, getState } = await import('../src/lib/store');
    const A = await import('../src/lib/actions');
    await replaceState({ ...initialState(), money: { swaps: {}, goal: { name: 'السفر', target: 5000, saved: 0 } } });
    A.moveGoal(1200);
    A.moveGoal(300.5, 'هدية');
    A.moveGoal(-2000);
    let g = getState().money.goal!;
    expect(g.saved).toBe(0);
    expect(g.log!.map((x) => x.amount)).toEqual([1200, 300.5, -1500.5]);
    A.deleteGoalEntry(g.log![2].id);
    g = getState().money.goal!;
    expect(g.saved).toBe(1500.5);
    expect(Math.round((g.saved / g.target) * 100)).toBe(30);
  });
});

import { addBankTexts } from '../src/lib/sync';
import { replaceState, getState } from '../src/lib/store';
describe('bank texts from the phone', () => {
  it('each purchase is added once, even when the same text comes twice', () => {
    replaceState(initialState(), '', false);
    const at = new Date('2026-10-22T13:05:00').getTime();
    const text = 'Purchase SAR 24 at DUNKIN';
    expect(addBankTexts([{ id: 'a', at, text }, { id: 'b', at, text }])).toBe(1);
    expect(addBankTexts([{ id: 'c', at, text }])).toBe(0);
    expect(getState().expenses.length).toBe(1);
  });
});

import { merchantKey, repeatMerchants } from '../src/lib/engine/money';
import * as Act from '../src/lib/actions';
describe('merchants from bank texts', () => {
  it('lists repeats, remembers the category, applies it to old and new purchases', () => {
    replaceState(initialState(), '', false);
    const at = new Date('2026-10-22T13:05:00').getTime();
    addBankTexts([
      { id: 'a', at, text: 'Purchase SAR 24 at ZXQ MARKET 112' },
      { id: 'b', at: at + 3600_000, text: 'Purchase SAR 31 at Zxq Market 305' },
      { id: 'c', at: at + 7200_000, text: 'Purchase SAR 9 at ONCE ONLY' },
    ]);
    expect(merchantKey('ZXQ MARKET 112')).toBe(merchantKey('Zxq Market 305'));
    const r = repeatMerchants(getState());
    expect(r.length).toBe(1);
    expect(r[0]).toMatchObject({ n: 2, set: false });
    Act.setMerchantCat(r[0].key, 'fun');
    expect(getState().expenses.filter((e) => /zxq/i.test(e.title)).every((e) => e.cat === 'fun')).toBe(true);
    addBankTexts([{ id: 'd', at: at + 9000_000, text: 'Purchase SAR 12 at ZXQ MARKET 777' }]);
    expect(getState().expenses.find((e) => e.amount === 12)?.cat).toBe('fun');
    expect(repeatMerchants(getState())[0]).toMatchObject({ n: 3, set: true, cat: 'fun' });
  });
});

import { importCoursePack, readCoursePack } from '../src/lib/actions';
describe('importing expenses', () => {
  it('keeps the time, makes your own categories by name, skips what is already logged', () => {
    replaceState(initialState(), '', false);
    Act.addExpense({ title: 'مشتريات', amount: 35, cat: 'shopping', day: '2026-10-25', source: 'sms' });
    const p = readCoursePack({ app: 'masar', cats: { 'بنزين': '⛽' }, expenses: [
      { title: 'الدريس', amount: 20, date: '2026-10-25', time: '19:16', cat: 'بنزين' },
      { title: 'عهد للمواد الغذائية', amount: 35, date: '2026-10-26', cat: 'food' },
      { title: 'كودو', amount: 50, date: '2026-10-01', cat: 'food' },
    ] });
    importCoursePack(p);
    const s = getState();
    expect(s.expenses.length).toBe(3);
    const fuel = s.money.cats!.find((c) => c.name === 'بنزين')!;
    expect(fuel.emoji).toBe('⛽');
    expect(s.expenses.find((e) => e.title === 'الدريس')).toMatchObject({ cat: fuel.id, time: '19:16' });
  });
});
