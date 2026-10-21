// Date helpers built on local "YYYY-MM-DD" keys to avoid timezone drift.

export const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(k: string, n: number): string {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** whole days from a to b (b - a) */
export function diffDays(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / DAY_MS);
}

export function weekday(k: string): number {
  return parseKey(k).getDay();
}

export function todayKey(now = Date.now()): string {
  return dateKey(new Date(now));
}

export function addMonths(k: string, n: number): string {
  const d = parseKey(k);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return dateKey(d);
}

export const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export function fmtDate(k: string, withDay = true): string {
  const d = parseKey(k);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withDay ? `${DAY_NAMES[d.getDay()]} ${base}` : base;
}

/** Arabic count of days with correct dual / plural forms */
export function daysWord(n: number): string {
  const a = Math.abs(n);
  if (a === 0) return '0 يوم';
  if (a === 1) return 'يوم';
  if (a === 2) return 'يومين';
  if (a <= 10) return `${a} أيام`;
  return `${a} يومًا`;
}

export function relDay(k: string, today = todayKey()): string {
  const n = diffDays(today, k);
  if (n === 0) return 'اليوم';
  if (n === 1) return 'غدًا';
  if (n === 2) return 'بعد غد';
  if (n === -1) return 'أمس';
  if (n > 0 && n < 7) return DAY_NAMES[weekday(k)];
  if (n > 0) return `بعد ${daysWord(n)}`;
  return `قبل ${daysWord(n)}`;
}

export function fmtMinutes(m: number): string {
  m = Math.max(0, Math.round(m));
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} س ${r} د` : `${h} س`;
}

export function fmtTime(ms: number): string {
  const d = new Date(ms);
  return fmtClock(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
}

/** "17:30" → "5:30 م" */
export function fmtClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'ص' : 'م';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

export function fmtDateTime(ms: number, today = todayKey()): string {
  const k = dateKey(new Date(ms));
  return `${relDay(k, today)} ${fmtTime(ms)}`;
}

export function atTime(k: string, hhmm: string): number {
  const d = parseKey(k);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export function minutesUntil(hhmm: string, now = Date.now()): number {
  return Math.round((atTime(todayKey(now), hhmm) - now) / 60000);
}

export function timeAgo(ms: number, now = Date.now()): string {
  const min = Math.round((now - ms) / 60000);
  if (min < 1) return 'الآن';
  if (min < 60) return `قبل ${min} د`;
  const h = Math.round(min / 60);
  if (h < 24) return `قبل ${h} س`;
  return `قبل ${daysWord(Math.round(h / 24))}`;
}

/** short form for tight spaces: "27 س" for long durations */
export function fmtMinutesShort(m: number): string {
  return m >= 600 ? `${Math.round(m / 60)} س` : fmtMinutes(m);
}
