// «ذكّرني»: reminders for anything — once, or repeating (daily, some weekdays, monthly, yearly).
// A repeating reminder keeps one `at` (the next alert) and moves it forward each time it fires.

import type { Remind } from '../types';
import { L } from '../i18n';

/** the alert after `after` (strictly later), at the same clock time as `r.at`; undefined when it doesn't repeat */
export function nextAfter(r: Pick<Remind, 'at' | 'repeat' | 'days'>, after: number): number | undefined {
  if (r.repeat === 'none') return undefined;
  const base = new Date(r.at);
  const h = base.getHours(), m = base.getMinutes();
  const at = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
  if (r.repeat === 'monthly' || r.repeat === 'yearly') {
    const dom = base.getDate();
    const a = new Date(after);
    for (let i = 0; i < 30; i++) {
      // walk month by month (or year by year) from the month of `after`; a short month gets its last day
      const y = r.repeat === 'yearly' ? a.getFullYear() + i : a.getFullYear();
      const mo = r.repeat === 'yearly' ? base.getMonth() : a.getMonth() + i;
      const last = new Date(y, mo + 1, 0).getDate();
      const t = at(new Date(y, mo, Math.min(dom, last)));
      if (t > after && t >= r.at) return t;
    }
    return undefined;
  }
  const days = r.repeat === 'weekly' ? (r.days?.length ? r.days : [base.getDay()]) : [0, 1, 2, 3, 4, 5, 6];
  const d = new Date(Math.max(after, r.at - 1));
  for (let i = 0; i < 8; i++) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    const t = at(day);
    if (t > after && t >= r.at && days.includes(day.getDay())) return t;
  }
  return undefined;
}

/** every alert between `from` and `until` — what the phone schedules ahead */
export function occurrences(r: Remind, from: number, until: number): number[] {
  if (r.done) return [];
  const out: number[] = [];
  let t: number | undefined = r.at;
  while (t != null && t < until && out.length < 40) {
    if (t > from) out.push(t);
    t = nextAfter(r, t);
  }
  return out;
}

const WD = () => L('أحد إثنين ثلاثاء أربعاء خميس جمعة سبت', 'Sun Mon Tue Wed Thu Fri Sat').split(' ');

/** «كل يوم» · «كل أحد وثلاثاء» · «كل شهر يوم 5» … */
export function repeatLabel(r: Pick<Remind, 'at' | 'repeat' | 'days'>): string {
  const d = new Date(r.at);
  switch (r.repeat) {
    case 'daily':
      return L('كل يوم', 'Every day');
    case 'weekly': {
      const days = (r.days?.length ? r.days : [d.getDay()]).slice().sort();
      if (days.length === 7) return L('كل يوم', 'Every day');
      if (days.join() === '0,1,2,3,4') return L('أيام الدوام (أحد – خميس)', 'Weekdays (Sun – Thu)');
      return L(`كل ${days.map((x) => WD()[x]).join(' و')}`, `Every ${days.map((x) => WD()[x]).join(', ')}`);
    }
    case 'monthly':
      return L(`كل شهر يوم ${d.getDate()}`, `Monthly on day ${d.getDate()}`);
    case 'yearly':
      return L('كل سنة', 'Every year');
    default:
      return L('مرة وحدة', 'Once');
  }
}

/** coming up first, then the finished ones (most recent first) */
export function sortReminds(list: Remind[]): { next: Remind[]; done: Remind[] } {
  return {
    next: list.filter((r) => !r.done).sort((a, b) => a.at - b.at),
    done: list.filter((r) => r.done).sort((a, b) => (b.lastAt ?? b.at) - (a.lastAt ?? a.at)),
  };
}
