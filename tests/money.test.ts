import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { atTime } from '../src/lib/dates';
import { guessCat, moneyToday, parseBankSms, parseExpense, report, suggestions, weekStrip } from '../src/lib/engine/money';
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
