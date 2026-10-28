import { describe, expect, it } from 'vitest';
import { initialState, migrate } from '../src/lib/defaults';
import { nextAfter, occurrences, repeatLabel } from '../src/lib/engine/remind';
import { collectDue } from '../src/lib/reminders';
import { mergeStates } from '../src/lib/transfer';
import type { Remind } from '../src/lib/types';

const t = (s: string) => new Date(s).getTime();
const R = (p: Partial<Remind>): Remind => ({ id: 'r', title: 'دواء', at: t('2026-10-28T21:00:00'), repeat: 'none', createdAt: 1, ...p });

describe('next time', () => {
  it('once: nothing after it', () => {
    expect(nextAfter(R({}), t('2026-10-28T21:00:00'))).toBeUndefined();
  });
  it('daily keeps the clock time', () => {
    expect(nextAfter(R({ repeat: 'daily' }), t('2026-10-28T21:00:00'))).toBe(t('2026-10-29T21:00:00'));
    expect(nextAfter(R({ repeat: 'daily' }), t('2026-10-30T08:00:00'))).toBe(t('2026-10-30T21:00:00'));
  });
  it('weekly on chosen days (Wed 28 Oct → Sun, Tue)', () => {
    const r = R({ repeat: 'weekly', days: [0, 2] });
    expect(nextAfter(r, t('2026-10-28T21:00:00'))).toBe(t('2026-11-01T21:00:00'));
    expect(nextAfter(r, t('2026-11-01T21:00:00'))).toBe(t('2026-11-03T21:00:00'));
  });
  it('weekly with no days → the weekday it was set on', () => {
    expect(nextAfter(R({ repeat: 'weekly' }), t('2026-10-28T21:00:00'))).toBe(t('2026-11-04T21:00:00'));
  });
  it('monthly on the 31st falls on the last day of short months', () => {
    const r = R({ repeat: 'monthly', at: t('2026-10-31T09:00:00') });
    expect(nextAfter(r, t('2026-10-31T09:00:00'))).toBe(t('2026-11-30T09:00:00'));
    expect(nextAfter(r, t('2026-11-30T09:00:00'))).toBe(t('2026-12-31T09:00:00'));
  });
  it('yearly', () => {
    expect(nextAfter(R({ repeat: 'yearly' }), t('2026-10-28T21:00:00'))).toBe(t('2027-10-28T21:00:00'));
  });
  it('never earlier than its first time', () => {
    expect(nextAfter(R({ repeat: 'daily', at: t('2026-11-05T07:00:00') }), t('2026-10-28T08:00:00'))).toBe(t('2026-11-05T07:00:00'));
  });
  it('a week of occurrences for the phone', () => {
    expect(occurrences(R({ repeat: 'daily' }), t('2026-10-28T12:00:00'), t('2026-11-04T12:00:00'))).toHaveLength(7);
    expect(occurrences(R({ done: true }), 0, Infinity)).toEqual([]);
  });
  it('labels', () => {
    expect(repeatLabel(R({ repeat: 'weekly', days: [0, 1, 2, 3, 4] }))).toContain('أحد');
    expect(repeatLabel(R({ repeat: 'monthly', at: t('2026-10-05T09:00:00') }))).toContain('5');
  });
});

describe('due', () => {
  it('a reminder alerts once its time comes, whatever the automatic-reminders switch', () => {
    const s = initialState();
    s.settings.nudges = false;
    s.reminds = [R({})];
    expect(collectDue(s, t('2026-10-28T20:59:00'))).toHaveLength(0);
    const due = collectDue(s, t('2026-10-28T21:00:30'));
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ title: 'دواء', rem: 'r', ref: 'reminders' });
    s.reminds[0].done = true;
    expect(collectDue(s, t('2026-10-28T21:01:00'))).toHaveLength(0);
  });
});

describe('data', () => {
  it('old backups load; junk is dropped; merge keeps both', () => {
    const old = initialState() as any;
    delete old.reminds;
    expect(migrate(old).reminds).toEqual([]);
    expect(migrate({ ...initialState(), reminds: [null, { id: 'x', title: 'a', at: 'no' }, { id: 'y', title: 'b', at: 5 }] }).reminds).toEqual([{ id: 'y', title: 'b', at: 5, repeat: 'none' }]);
    const a = initialState(); a.reminds = [R({ id: 'a' })];
    const b = initialState(); b.reminds = [R({ id: 'b' })];
    expect(mergeStates(a, b).reminds.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });
});
