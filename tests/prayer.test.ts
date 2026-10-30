import { describe, expect, it } from 'vitest';
import { prayerGaps, prayerTimes } from '../src/lib/engine/prayer';
import type { Settings } from '../src/lib/types';

const hm = (ms: number) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };

describe('prayer times (Umm al-Qura)', () => {
  // Riyadh, 30 Oct 2026, Umm al-Qura: about 04:40 · 11:37 · 14:50 · 17:15 · 18:45
  const t = prayerTimes('2026-10-30', 24.7136, 46.6753);
  it('lands within a few minutes of the published times', () => {
    expect(Math.abs(hm(t.fajr) - (4 * 60 + 40))).toBeLessThanOrEqual(3);
    expect(Math.abs(hm(t.dhuhr) - (11 * 60 + 37))).toBeLessThanOrEqual(3);
    expect(Math.abs(hm(t.asr) - (14 * 60 + 50))).toBeLessThanOrEqual(3);
    expect(Math.abs(hm(t.maghrib) - (17 * 60 + 15))).toBeLessThanOrEqual(3);
  });
  it('isha is 90 minutes after maghrib', () => expect(t.isha - t.maghrib).toBe(90 * 60000));
  it('a session crossing asr gets its gap: adhan → iqama → prayer → back', () => {
    const st = { prayer: { on: true, lat: 24.7136, lng: 46.6753, back: 10 } } as Settings;
    const g = prayerGaps(st, t.dhuhr + 60 * 60000, t.asr + 60 * 60000);
    expect(g.map((x) => x.id)).toEqual(['asr']);
    expect(g[0].to - g[0].from).toBe((20 + 10 + 10) * 60000);
    expect(prayerGaps({ prayer: { on: false } } as Settings, 0, Date.now())).toEqual([]);
  });
});

import { planSession, fitTotal } from '../src/lib/engine/focus';
describe('a session around a prayer', () => {
  const r = { work: 25, brk: 5, longEvery: 0, longBrk: 0 };
  const M = 60000;
  it('splits the focus block at the adhan and carries on after you are back', () => {
    const sp = planSession(0, 50, r, [{ id: 'asr', from: 10 * M, to: 50 * M }]);
    expect(sp.blocks.map((b) => [b.kind, b.min])).toEqual([['work', 10], ['prayer', 40], ['work', 15], ['break', 5], ['work', 25]]);
    expect(sp.end).toBe(95 * M);
    expect(sp.prayerMin).toBe(40);
    expect(sp.blocks.filter((b) => b.kind === 'work').reduce((a, b) => a + b.min, 0)).toBe(50);
  });
  it('fits less focus into a window that holds a prayer', () => {
    expect(fitTotal(0, 120 * M, r)).toBeGreaterThan(fitTotal(0, 120 * M, r, [{ id: 'asr', from: 30 * M, to: 70 * M }]));
  });
});
