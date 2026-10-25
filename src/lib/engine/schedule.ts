// The weekly timetable (lectures, work shifts). Planning treats these blocks as busy:
// free time shrinks by them, and planned items are placed in the gaps around them.
import type { AppState, ClassBlock } from '../types';
import { atTime, todayKey, weekday } from '../dates';
import { L, lang } from '../i18n';
import { toWestern } from '../text';

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

export const isSkipped = (state: AppState, day: string, id: string) => !!state.skipClass?.[`${day}|${id}`];

/** the day's blocks as [start, end] in epoch ms, sorted — without the ones you said you'll miss, unless `all` */
export function blocksOn(state: AppState, day: string, all = false): { b: ClassBlock; from: number; to: number }[] {
  const wd = weekday(day);
  return (state.schedule || [])
    .filter((b) => b.day === wd && toMin(b.end) > toMin(b.start) && (all || !isSkipped(state, day, b.id)))
    .map((b) => ({ b, from: atTime(day, b.start), to: atTime(day, b.end) }))
    .sort((a, b) => a.from - b.from);
}

export const blockMinutes = (b: ClassBlock) => Math.max(0, toMin(b.end) - toMin(b.start));

/** a stretch out of the house: in-person lectures / shifts close enough that you don't go home between them */
export function outingsOn(state: AppState, day: string, all = false): { leave: number; first: number; last: number; home: number }[] {
  const c = (state.settings.commuteMin ?? 60) * 60000;
  const r = (state.settings.restMin ?? 60) * 60000;
  const out: { leave: number; first: number; last: number; home: number }[] = [];
  for (const x of blocksOn(state, day, all)) {
    if (x.b.remote) continue;
    const o = out[out.length - 1];
    // going home and back would eat the whole gap — you stay out
    if (o && x.from - o.last < 2 * c + r) o.last = Math.max(o.last, x.to);
    else out.push({ leave: x.from - c, first: x.from, last: x.to, home: 0 });
  }
  for (const o of out) o.home = o.last + c;
  return out;
}

/** everything that isn't yours on that day: the blocks, the way there and back, and the rest after, merged */
export function busyOn(state: AppState, day: string, all = false): { from: number; to: number }[] {
  const r = (state.settings.restMin ?? 60) * 60000;
  const raw = [
    ...blocksOn(state, day, all).map((x) => ({ from: x.from, to: x.to })),
    ...outingsOn(state, day, all).flatMap((o) => [{ from: o.leave, to: o.first }, { from: o.last, to: o.home + r }]),
  ].sort((a, b) => a.from - b.from);
  const out: { from: number; to: number }[] = [];
  for (const x of raw) {
    const o = out[out.length - 1];
    if (o && x.from <= o.to) o.to = Math.max(o.to, x.to);
    else out.push({ ...x });
  }
  return out;
}

/** busy minutes between `from` and `to` on that day */
export function busyBetween(state: AppState, day: string, from: number, to: number, all = false): number {
  let m = 0;
  for (const x of busyOn(state, day, all)) m += Math.max(0, Math.min(x.to, to) - Math.max(x.from, from)) / 60000;
  return Math.round(m);
}

/** free minutes in a day between 08:00 and the end of the day, outside the timetable */
export function freeMinutes(state: AppState, day: string, all = false): number {
  const from = atTime(day, '08:00');
  const to = atTime(day, state.settings.dayEnd || '23:30');
  return Math.max(0, Math.round((to - from) / 60000) - busyBetween(state, day, from, to, all));
}

/** minutes a skipped lecture gives back that day: the lecture, the way there and back, the rest */
export function freedMinutes(state: AppState, day: string): number {
  if (!blocksOn(state, day, true).some((x) => isSkipped(state, day, x.b.id))) return 0;
  return Math.max(0, freeMinutes(state, day) - freeMinutes(state, day, true));
}

/** when work of `minutes` that may start at `t` really ends, stepping over lectures */
export function advance(state: AppState, t: number, minutes: number): number {
  let left = minutes * 60000;
  let cur = skipBusy(state, t);
  const day = todayKey(t);
  for (const x of busyOn(state, day)) {
    if (x.to <= cur) continue;
    if (cur + left <= x.from) break;
    left -= Math.max(0, x.from - cur);
    cur = x.to;
  }
  return cur + left;
}

/** if `t` falls inside a block, the moment that block (and any right after it) ends */
export function skipBusy(state: AppState, t: number): number {
  let cur = t;
  for (const x of busyOn(state, todayKey(t))) if (cur >= x.from && cur < x.to) cur = x.to;
  return cur;
}

export function nowBlock(state: AppState, now: number) {
  return blocksOn(state, todayKey(now)).find((x) => now >= x.from && now < x.to);
}

export const DAY_NAMES = () => (lang() === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']);

/** «الأسبوع فيه 21 ساعة محاضرات…» */
export function weekSummary(state: AppState) {
  const cls = state.schedule.filter((b) => b.kind === 'class').reduce((a, b) => a + blockMinutes(b), 0);
  const work = state.schedule.filter((b) => b.kind === 'work').reduce((a, b) => a + blockMinutes(b), 0);
  const busyDays = new Set(state.schedule.map((b) => b.day));
  const freeDays = [0, 1, 2, 3, 4].filter((d) => !busyDays.has(d)).map((d) => DAY_NAMES()[d]);
  const latest = state.schedule.reduce((m, b) => (b.end > m ? b.end : m), '00:00');
  return { cls, work, freeDays, latest };
}

/** read lectures out of an AI's JSON ({ schedule: [...] } or a bare list) */
export function readSchedule(raw: unknown): Omit<ClassBlock, 'id' | 'createdAt'>[] {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.schedule) ? (raw as any).schedule : [];
  const days: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, 'الأحد': 0, 'الاحد': 0, 'الإثنين': 1, 'الاثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3, 'الاربعاء': 3, 'الخميس': 4, 'الجمعة': 5, 'السبت': 6 };
  const time = (v: unknown) => {
    const m = toWestern(String(v ?? '')).match(/^(\d{1,2})[:.](\d{2})$/);
    return m && Number(m[1]) < 24 ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined;
  };
  const out: Omit<ClassBlock, 'id' | 'createdAt'>[] = [];
  for (const x of list.slice(0, 80)) {
    if (!x || typeof x.title !== 'string' || !x.title.trim()) continue;
    const d = typeof x.day === 'number' ? x.day : days[String(x.day ?? '').trim().toLowerCase().slice(0, 3)] ?? days[String(x.day ?? '').trim()];
    const start = time(x.start);
    const end = time(x.end);
    if (d === undefined || d < 0 || d > 6 || !start || !end || end <= start) continue;
    const place = typeof x.place === 'string' ? x.place.trim().slice(0, 40) : '';
    const remote = x.remote === true || /عن ?بعد|online|remote/i.test(place);
    out.push({ title: x.title.trim().slice(0, 60), day: d, start, end, kind: x.kind === 'work' ? 'work' : 'class', ...(place ? { place } : {}), ...(remote ? { remote: true } : {}) });
  }
  return out;
}

export const blockLabel = (b: ClassBlock) => (b.kind === 'work' ? L('دوام', 'Work') : L('محاضرة', 'Lecture'));
