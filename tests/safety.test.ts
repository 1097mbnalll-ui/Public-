import { describe, expect, it, vi } from 'vitest';
import { joinFromLink } from '../src/lib/sync';
import { toB64url } from '../src/lib/transfer';
import { migrate } from '../src/lib/defaults';
import { readCoursePack } from '../src/lib/actions';

const link = (o: object) => `https://x.github.io/Public-/#/sync?c=${toB64url(new TextEncoder().encode(JSON.stringify(o)))}`;

describe('pairing link', () => {
  it('never contacts a server that is not a Google Apps Script', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(joinFromLink(link({ u: 'https://evil.example/collect', t: 'T', k: 'K' }))).rejects.toThrow();
    await expect(joinFromLink(link({ u: 'https://script.google.com.evil.example/macros/s/x/exec', t: 'T', k: 'K' }))).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('explains a damaged link instead of throwing a raw parse error', async () => {
    await expect(joinFromLink('#/sync?c=AAAA')).rejects.toThrow(/damaged|تالف/);
  });
});

describe('migrate', () => {
  it('drops damaged entries and repairs settings instead of crashing later', () => {
    const s = migrate({ tasks: [null, 3, { title: 'no id' }, { id: 't1', title: 'ok' }], templates: [{ id: 'x', name: 'n' }], settings: { available: [1, 2] } });
    expect(s.tasks.map((t) => t.id)).toEqual(['t1']);
    expect(s.templates[0].steps).toEqual([]);
    expect(s.settings.available).toHaveLength(7);
  });
});

describe('course pack from an untrusted link', () => {
  it('keeps only well-typed values', () => {
    const p = readCoursePack({
      app: 'masar-course',
      course: { name: '  Physics ', color: 'url(https://tracker.example/x)', difficulty: 9, sizeLabel: { a: 1 } },
      units: [{ title: 'Ch 1', size: 10, difficulty: 2 }, { title: {}, size: 5 }, null],
      exam: { title: 'Final', date: '2026-12-01', time: 'soon', reviewDays: 999 },
    });
    expect(p.course).toEqual({ name: 'Physics' });
    expect(p.units).toHaveLength(1);
    expect(p.exam).toEqual({ title: 'Final', date: '2026-12-01' });
  });

  it('rejects a course whose name is not text', () => {
    expect(() => readCoursePack({ app: 'masar-course', course: { name: { x: 1 } }, units: [] })).toThrow();
  });
});

import { addTask, completeTask, reopenTask } from '../src/lib/actions';
import { getState } from '../src/lib/store';
import { minutesLeftToday } from '../src/lib/engine/capacity';
import { parseExpense } from '../src/lib/engine/money';
import { atTime, todayKey } from '../src/lib/dates';
import { initialState } from '../src/lib/defaults';

describe('recurring tasks', () => {
  it('complete → reopen → complete leaves exactly one next occurrence', () => {
    const id = addTask({ title: 'weekly report', due: todayKey(), recurrence: { every: 1, unit: 'week' } });
    completeTask(id);
    reopenTask(id);
    completeTask(id);
    expect(getState().tasks.filter((t) => t.title === 'weekly report' && t.status === 'open')).toHaveLength(1);
    expect(getState().days[todayKey()].done).toBe(1);
  });

  it('an overdue repeat comes back on a date that is not already late', () => {
    const id = addTask({ title: 'daily pill', due: '2020-01-01', recurrence: { every: 1, unit: 'day' } });
    completeTask(id);
    const next = getState().tasks.find((t) => t.title === 'daily pill' && t.status === 'open')!;
    expect(next.due! >= todayKey()).toBe(true);
  });
});

describe('day end after midnight', () => {
  it('still leaves time in the evening', () => {
    const s = initialState();
    s.settings.dayEnd = '01:00';
    const now = atTime(todayKey(), '22:00');
    expect(minutesLeftToday(s, now)).toBe(180);
  });
});

describe('expense amounts', () => {
  it('reads thousands separators', () => {
    expect(parseExpense('لابتوب 1,500').amount).toBe(1500);
    expect(parseExpense('سيارة 120,000').amount).toBe(120000);
    expect(parseExpense('قهوة 12,50').amount).toBe(12.5);
  });
});
