// Date helpers built on local "YYYY-MM-DD" keys to avoid timezone drift.
import { L, lang } from './i18n';

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

const DAY_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const dayNames = () => (lang() === 'en' ? DAY_EN : DAY_AR);
export const monthNames = () => (lang() === 'en' ? MONTHS_EN : MONTHS_AR);

export function fmtDate(k: string, withDay = true): string {
  const d = parseKey(k);
  const base = lang() === 'en' ? `${monthNames()[d.getMonth()]} ${d.getDate()}` : `${d.getDate()} ${MONTHS_AR[d.getMonth()]}`;
  return withDay ? `${dayNames()[d.getDay()]} ${base}` : base;
}

/** count of days — Arabic gets correct dual / plural forms */
export function daysWord(n: number): string {
  const a = Math.abs(n);
  if (lang() === 'en') return a === 1 ? '1 day' : `${a} days`;
  if (a === 0) return '0 يوم';
  if (a === 1) return 'يوم';
  if (a === 2) return 'يومين';
  if (a <= 10) return `${a} أيام`;
  return `${a} يومًا`;
}

export function relDay(k: string, today = todayKey()): string {
  const n = diffDays(today, k);
  if (n === 0) return L('اليوم', 'Today');
  if (n === 1) return L('غدًا', 'Tomorrow');
  if (n === 2) return L('بعد غد', 'In 2 days');
  if (n === -1) return L('أمس', 'Yesterday');
  if (n > 0 && n < 7) return dayNames()[weekday(k)];
  if (n > 0) return L(`بعد ${daysWord(n)}`, `in ${daysWord(n)}`);
  return L(`قبل ${daysWord(n)}`, `${daysWord(n)} ago`);
}

export function fmtMinutes(m: number): string {
  m = Math.max(0, Math.round(m));
  const [H, M] = lang() === 'en' ? ['h', 'm'] : [' س', ' د'];
  if (m < 60) return `${m}${M}`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}${H} ${r}${M}` : `${h}${H}`;
}

export function fmtTime(ms: number): string {
  const d = new Date(ms);
  return fmtClock(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
}

/** "17:30" → "5:30 م" */
export function fmtClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? L('ص', 'am') : L('م', 'pm');
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

export function timeAgo(ms: number, now = Date.now()): string {
  const min = Math.round((now - ms) / 60000);
  if (min < 1) return L('الآن', 'just now');
  if (min < 60) return L(`قبل ${min} د`, `${min}m ago`);
  const h = Math.round(min / 60);
  if (h < 24) return L(`قبل ${h} س`, `${h}h ago`);
  return L(`قبل ${daysWord(Math.round(h / 24))}`, `${daysWord(Math.round(h / 24))} ago`);
}

/** short form for tight spaces: "27 س" for long durations */
export function fmtMinutesShort(m: number): string {
  return m >= 600 ? L(`${Math.round(m / 60)} س`, `${Math.round(m / 60)}h`) : fmtMinutes(m);
}
