// «النادي»: a community inside مدار, run by a manager. The club lives in the manager's own Google
// script (see clubServer.ts); this device keeps only its link and its member key (localStorage,
// never in backups or sync) and a copy of the last thing the club showed it.
//
// What leaves this device: your name, which club tasks you ticked, and — only if you allow it —
// how many of your own مدار tasks you finished that day (the number, never the tasks).

import { useSyncExternalStore } from 'react';
import { addDays, dateKey, diffDays, todayKey, weekday } from './dates';
import { getState, subscribe } from './store';
import { validScriptUrl } from './sync';
import { SITE_URL } from './native';
import { L } from './i18n';

// ---------------- what the club sends back ----------------

export type ClubRole = 'admin' | 'sup' | 'member';
export type ClubStatus = 'pending' | 'active' | 'left' | 'rejected';

export interface ClubMember {
  id: string;
  name: string;
  role: ClubRole;
  status: ClubStatus;
  joined: number;
  last: number;
  first?: string;
}
export interface ClubTask {
  id: string;
  title: string;
  kind: 'daily' | 'weekly';
  note?: string;
  by: string;
  at: number;
  archived?: boolean;
}
export interface ClubCheck {
  t: string[];
  n: number;
  at: number;
}
export interface ClubPost {
  id: string;
  by: string;
  text: string;
  at: number;
  parent?: string;
  cheers?: Record<string, string>;
  hidden?: boolean;
}
export interface ClubMsg {
  id: string;
  from: string;
  to: string;
  text: string;
  at: number;
}
export interface ClubView {
  club: { name: string; about: string; auto: boolean; created: number };
  me: { id: string; name: string; role: ClubRole; status: ClubStatus; joined: number };
  members: ClubMember[];
  tasks: ClubTask[];
  checks: Record<string, Record<string, ClubCheck>>;
  posts: ClubPost[];
  msgs: ClubMsg[];
  joinCode?: string;
  now: number;
}

// ---------------- this device's link to the club ----------------

export interface ClubConf {
  url: string;
  key: string;
  /** the manager's: the code people join with */
  code?: string;
  /** share how many of my own tasks I finished each day (the number only) */
  share: boolean;
  /** no toasts from the club */
  muted?: boolean;
}

const LS = 'masar.club';
const LS_VIEW = 'masar.club.view';
const LS_SEEN = 'masar.club.seen';

const read = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked: the club still works this visit */
  }
};

interface ClubStore {
  conf: ClubConf | null;
  view: ClubView | null;
  busy: boolean;
  error?: string;
}

let store: ClubStore = { conf: read<ClubConf | null>(LS, null), view: read<ClubView | null>(LS_VIEW, null), busy: false };
const ls = new Set<() => void>();
const set = (p: Partial<ClubStore>) => {
  store = { ...store, ...p };
  if ('conf' in p) write(LS, store.conf);
  if ('view' in p) write(LS_VIEW, store.view);
  ls.forEach((f) => f());
};

export function useClub(): ClubStore {
  return useSyncExternalStore(
    (f) => {
      ls.add(f);
      return () => ls.delete(f);
    },
    () => store,
  );
}
export const clubState = () => store;

export const randomKey = (n = 24) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');

const ERRORS: Record<string, () => string> = {
  code: () => L('رمز الانضمام غلط — اطلب رابط جديد من مدير النادي.', 'Wrong join code — ask the club manager for a new link.'),
  name: () => L('اكتب اسمك.', 'Type your name.'),
  full: () => L('النادي وصل الحد (٢٠٠٠ عضو).', 'The club is full (2000 members).'),
  who: () => L('النادي ما يعرف هذا الجهاز — يمكن انحذف الربط. انضم من جديد.', "The club doesn't know this device — join again."),
  status: () => L('عضويتك مو مفعّلة الحين.', 'Your membership is not active right now.'),
  role: () => L('هذي للمدير أو المشرف.', 'Only the manager or a supervisor can do this.'),
  admin: () => L('المدير ما يقدر يطلع من ناديه.', "The manager can't leave their own club."),
  empty: () => L('اكتب شي أول.', 'Write something first.'),
};

async function call(url: string, body: Record<string, unknown>): Promise<ClubView> {
  let r: Response;
  try {
    r = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
  } catch {
    throw new Error(L('ما قدرت أوصل للنادي — تأكد من النت.', "Couldn't reach the club — check your connection."));
  }
  if (!r.ok) throw new Error(L(`خطأ من قوقل (${r.status})`, `Google error (${r.status})`));
  let j: any;
  try {
    j = await r.json();
  } catch {
    throw new Error(L('رابط النادي ما رجّع رد صحيح — لازم يكون رابط «تطبيق الويب» والوصول «أي شخص».', "The club link didn't answer properly — it must be the Web app link with access “Anyone”."));
  }
  if (!j?.ok) throw new Error(ERRORS[j?.error]?.() || L('صار خطأ في النادي.', 'Something went wrong in the club.'));
  return j as ClubView;
}

/** ask the club something as this device; the answer replaces what we show */
export async function act(body: Record<string, unknown>): Promise<ClubView | null> {
  const conf = store.conf;
  if (!conf) return null;
  set({ busy: true });
  try {
    const v = await call(conf.url, { ...body, k: conf.key });
    set({ view: v, busy: false, error: undefined });
    notice(v);
    return v;
  } catch (e) {
    set({ busy: false, error: (e as Error).message });
    throw e;
  }
}

export const refresh = () => act({ a: 'state' }).catch(() => null);

// ---------------- starting or joining ----------------

/** the manager's first step: keys for the code they paste into Google */
export function newClubSetup(): { key: string; code: string } {
  const p = read<{ key: string; code: string } | null>('masar.club.setup', null);
  if (p) return p;
  const n = { key: randomKey(32), code: randomKey(10) };
  write('masar.club.setup', n);
  return n;
}

export async function connectAsManager(url: string, name: string) {
  url = url.trim();
  if (!validScriptUrl(url)) throw new Error(L('الرابط لازم يبدأ بـ script.google.com/macros/s/ وينتهي بـ ‎/exec', 'The link must start with script.google.com/macros/s/ and end with /exec'));
  const s = newClubSetup();
  const v = await call(url, { a: 'state', k: s.key, name: name.trim() });
  if (v.me.role !== 'admin') throw new Error(L('هذا الرابط لنادي ثاني — انسخ الكود من جديد.', 'That link is for another club — copy the code again.'));
  write('masar.club.setup', null);
  set({ conf: { url, key: s.key, code: s.code, share: false }, view: v, error: undefined });
}

export function parseJoinLink(q: URLSearchParams): { url: string; code: string } | null {
  const url = q.get('u') || '';
  const code = q.get('c') || '';
  return validScriptUrl(url) && code ? { url, code } : null;
}

export async function join(url: string, code: string, name: string, share: boolean) {
  if (!name.trim()) throw new Error(ERRORS.name());
  const key = store.conf?.url === url ? store.conf.key : randomKey(32);
  const v = await call(url, { a: 'join', k: key, code, name: name.trim() });
  set({ conf: { url, key, share }, view: v, error: undefined });
}

export const joinLink = (conf: ClubConf, view: ClubView) => `${SITE_URL}#/club/join?u=${encodeURIComponent(conf.url)}&c=${encodeURIComponent(view.joinCode || conf.code || '')}`;

export function setClubConf(p: Partial<ClubConf>) {
  if (store.conf) set({ conf: { ...store.conf, ...p } });
}

/** forget the club on this device only — the club keeps your history */
export function disconnect() {
  set({ conf: null, view: null, error: undefined });
  write(LS_SEEN, null);
}

// ---------------- your day in the club ----------------

/** your own مدار tasks finished today — the only thing shared from them, and only if you allow it */
export function myDoneToday(now = Date.now()): number {
  const today = todayKey(now);
  return getState().tasks.filter((t) => t.status === 'done' && t.completedAt && todayKey(t.completedAt) === today).length;
}

export async function toggleClubTask(taskId: string, now = Date.now()) {
  const v = store.view;
  const conf = store.conf;
  if (!v || !conf) return;
  const day = todayKey(now);
  const cur = v.checks[v.me.id]?.[day]?.t || [];
  // a weekly task done earlier this week counts as done; ticking it again un-does it there
  const t = cur.includes(taskId) ? cur.filter((x) => x !== taskId) : [...cur, taskId];
  const n = conf.share ? myDoneToday(now) : 0;
  // show it at once; the club's answer follows
  set({ view: { ...v, checks: { ...v.checks, [v.me.id]: { ...v.checks[v.me.id], [day]: { t, n, at: now } } } } });
  await act({ a: 'check', day, t, n }).catch(() => set({ view: v }));
}

let shareTimer: ReturnType<typeof setTimeout> | null = null;
let lastShared = -1;
/** when sharing is on, tell the club how many of your tasks you finished today (after a quiet moment) */
function shareProgress() {
  const { conf, view } = store;
  if (!conf?.share || view?.me.status !== 'active') return;
  const n = myDoneToday();
  const day = todayKey();
  const c = view.checks[view.me.id]?.[day];
  if (n === lastShared && (c?.n || 0) === n) return;
  if (shareTimer) clearTimeout(shareTimer);
  shareTimer = setTimeout(() => {
    lastShared = n;
    void act({ a: 'check', day, t: store.view?.checks[view.me.id]?.[day]?.t || [], n }).catch(() => null);
  }, 5000);
}

// ---------------- the numbers ----------------

export const isActiveDay = (c?: ClubCheck) => !!c && (c.t.length > 0 || c.n > 0);
export const weekStartOf = (day: string) => addDays(day, -weekday(day));
const dayOf = (ms: number) => dateKey(new Date(ms));

/** days in a row with something done, up to today (or yesterday, while today is still open) */
export function streak(checks: Record<string, ClubCheck> = {}, today: string): number {
  let d = isActiveDay(checks[today]) ? today : addDays(today, -1);
  let n = 0;
  while (isActiveDay(checks[d])) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function bestStreak(checks: Record<string, ClubCheck> = {}): number {
  const days = Object.keys(checks).filter((d) => isActiveDay(checks[d])).sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const d of days) {
    run = prev && diffDays(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function lastActive(checks: Record<string, ClubCheck> = {}): string | null {
  const days = Object.keys(checks).filter((d) => isActiveDay(checks[d])).sort();
  return days.length ? days[days.length - 1] : null;
}

const liveTasks = (v: ClubView, kind: ClubTask['kind'], day: string) => v.tasks.filter((t) => t.kind === kind && !t.archived && dayOf(t.at) <= day);

/** was a weekly task ticked any day of that week */
export function weeklyDone(v: ClubView, memberId: string, taskId: string, day: string): boolean {
  const w = weekStartOf(day);
  const c = v.checks[memberId] || {};
  for (let i = 0; i < 7; i++) if (c[addDays(w, i)]?.t.includes(taskId)) return true;
  return false;
}

/**
 * how much of what the club asked a member did, over the last `days` days (0..1). Today and this
 * week never count against anyone while they're still open; before joining doesn't count either.
 * With no club tasks it's the share of days with anything done. null: nothing to measure yet.
 */
export function rate(v: ClubView, memberId: string, today: string, days = 7): number | null {
  const m = v.members.find((x) => x.id === memberId);
  if (!m) return null;
  const c = v.checks[memberId] || {};
  const from = [addDays(today, -(days - 1)), dayOf(m.joined)].sort()[1];
  let expected = 0;
  let done = 0;
  let open = 0;
  let active = 0;
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const daily = liveTasks(v, 'daily', d);
    const did = daily.filter((t) => c[d]?.t.includes(t.id)).length;
    done += did;
    expected += d === today ? did : daily.length;
    if (isActiveDay(c[d])) active++;
    if (d !== today) open++;
  }
  const thisWeek = weekStartOf(today);
  for (let w = weekStartOf(from); w <= thisWeek; w = addDays(w, 7)) {
    for (const t of liveTasks(v, 'weekly', addDays(w, 6))) {
      if (dayOf(t.at) > addDays(w, 6)) continue;
      const did = weeklyDone(v, memberId, t.id, w);
      done += did ? 1 : 0;
      expected += w === thisWeek ? (did ? 1 : 0) : 1;
    }
  }
  if (expected > 0) return Math.min(1, done / expected);
  const span = open + (isActiveDay(c[today]) ? 1 : 0);
  return span ? Math.min(1, active / span) : null;
}

export function clubRate(v: ClubView, today: string, days = 7): number | null {
  const list = v.members.filter((m) => m.status === 'active').map((m) => rate(v, m.id, today, days)).filter((x): x is number => x != null);
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

/** days with something done in the week that holds `day` */
export function activeDaysInWeek(v: ClubView, memberId: string, day: string): number {
  const w = weekStartOf(day);
  const c = v.checks[memberId] || {};
  let n = 0;
  for (let i = 0; i < 7; i++) if (isActiveDay(c[addDays(w, i)])) n++;
  return n;
}

export interface Badge {
  id: string;
  icon: string;
  title: string;
  why: string;
}

/** only badges earned — nobody sees a list of what they're missing */
export function badges(v: ClubView, memberId: string, today: string): Badge[] {
  const c = v.checks[memberId] || {};
  const out: Badge[] = [];
  const best = bestStreak(c);
  const m = v.members.find((x) => x.id === memberId);
  if (m?.first || lastActive(c)) out.push({ id: 'first', icon: '🌱', title: L('أول خطوة', 'First step'), why: L('أول يوم إنجاز في النادي', 'First day done in the club') });
  if (best >= 3) out.push({ id: 's3', icon: '🔥', title: L('٣ أيام ورا بعض', '3 days in a row'), why: L('تسلسل ٣ أيام', 'A 3-day streak') });
  if (best >= 7) out.push({ id: 's7', icon: '⭐', title: L('أسبوع كامل', 'A full week'), why: L('تسلسل ٧ أيام', 'A 7-day streak') });
  if (best >= 21) out.push({ id: 's21', icon: '🏆', title: L('عادة ثابتة', 'A habit'), why: L('تسلسل ٢١ يوم', 'A 21-day streak') });
  const weekly = v.tasks.filter((t) => t.kind === 'weekly');
  for (let w = weekStartOf(addDays(today, -7)); w >= weekStartOf(addDays(today, -35)); w = addDays(w, -7)) {
    const due = weekly.filter((t) => dayOf(t.at) <= addDays(w, 6));
    if (due.length && due.every((t) => weeklyDone(v, memberId, t.id, w))) {
      out.push({ id: 'week', icon: '🎯', title: L('تحدي الأسبوع', 'Weekly challenge'), why: L('خلّص كل تحديات أسبوع', 'Finished every challenge of a week') });
      break;
    }
  }
  const last = lastActive(c);
  if (last && diffDays(last, today) <= 1) {
    const before = Object.keys(c).filter((d) => d < last && isActiveDay(c[d])).sort().pop();
    if (before && diffDays(before, last) >= 4) out.push({ id: 'back', icon: '💪', title: L('رجعة قوية', 'Strong comeback'), why: L('رجع بعد انقطاع', 'Came back after a break') });
  }
  const cheers = v.posts.reduce((a, p) => a + (p.cheers?.[memberId] ? 1 : 0), 0);
  if (cheers >= 10) out.push({ id: 'cheer', icon: '👏', title: L('المشجّع', 'Cheerleader'), why: L('شجّع غيره ١٠ مرات', 'Cheered others 10 times') });
  if (v.posts.filter((p) => p.by === memberId && !p.hidden).length >= 5) out.push({ id: 'voice', icon: '💬', title: L('صوت النادي', 'Club voice'), why: L('٥ مشاركات في النقاش', '5 posts in the discussion') });
  return out;
}

/** the week's stars: up to three, by days with something done — nobody is ever shown at the bottom */
export function stars(v: ClubView, today: string): { m: ClubMember; days: number }[] {
  return v.members
    .filter((m) => m.status === 'active')
    .map((m) => ({ m, days: activeDaysInWeek(v, m.id, today) }))
    .filter((x) => x.days > 0)
    .sort((a, b) => b.days - a.days || a.m.name.localeCompare(b.m.name))
    .slice(0, 3);
}

/** members who stopped: nothing done for `gap` days or more (counting from joining if never) */
export function stopped(v: ClubView, today: string, gap = 3): { m: ClubMember; days: number }[] {
  return v.members
    .filter((m) => m.status === 'active')
    .map((m) => {
      const last = lastActive(v.checks[m.id]) || dayOf(m.joined);
      return { m, days: diffDays(last, today) };
    })
    .filter((x) => x.days >= gap)
    .sort((a, b) => b.days - a.days);
}

export interface WeekReport {
  from: string;
  to: string;
  members: number;
  activeMembers: number;
  avgRate: number | null;
  tasks: { t: ClubTask; done: number }[];
  posts: number;
}

/** the week that holds `day`: how many showed up, how much got done, each task's count */
export function weekReport(v: ClubView, day: string): WeekReport {
  const from = weekStartOf(day);
  const to = addDays(from, 6);
  const act = v.members.filter((m) => m.status === 'active');
  const activeMembers = act.filter((m) => activeDaysInWeek(v, m.id, day) > 0).length;
  const rates = act.map((m) => rate(v, m.id, to > day ? day : to, 7)).filter((x): x is number => x != null);
  const tasks = v.tasks
    .filter((t) => !t.archived)
    .map((t) => ({
      t,
      done: act.filter((m) => {
        const c = v.checks[m.id] || {};
        for (let i = 0; i < 7; i++) if (c[addDays(from, i)]?.t.includes(t.id)) return true;
        return false;
      }).length,
    }));
  const posts = v.posts.filter((p) => dayOf(p.at) >= from && dayOf(p.at) <= to).length;
  return { from, to, members: act.length, activeMembers, avgRate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null, tasks, posts };
}

export const memberName = (v: ClubView, id: string) => v.members.find((m) => m.id === id)?.name || L('عضو', 'A member');
export const isStaff = (v: ClubView | null) => v?.me.role === 'admin' || v?.me.role === 'sup';
export const roleName = (r: ClubRole) => (r === 'admin' ? L('المدير', 'Manager') : r === 'sup' ? L('مشرف', 'Supervisor') : L('عضو', 'Member'));

// ---------------- gentle notices ----------------

type Toast = (text: string, ref?: string) => void;
let toaster: Toast | null = null;

/**
 * what's new since you last looked, as at most one short note per check: a message for you,
 * replies to you, your membership approved; staff also hear once a day about join requests and
 * members who stopped. Nothing during the first load, and nothing at all when muted.
 */
function notice(v: ClubView) {
  const conf = store.conf;
  const seen = read<{ ids: string[]; status?: string; day?: string; nudge?: string } | null>(LS_SEEN, null);
  const mine = new Set(v.posts.filter((p) => p.by === v.me.id).map((p) => p.id));
  const fresh = [...v.msgs.filter((x) => x.from !== v.me.id && (x.to === v.me.id || x.to === 'all')), ...v.posts.filter((p) => p.parent && mine.has(p.parent) && p.by !== v.me.id)];
  const ids = fresh.map((x) => x.id);
  const next = { ...(seen || {}), ids: [...new Set([...(seen?.ids || []), ...ids])].slice(-500), status: v.me.status };
  write(LS_SEEN, next);
  if (!seen || conf?.muted || !toaster) return;
  const today = todayKey();
  const notes: string[] = [];
  if (seen.status === 'pending' && v.me.status === 'active') notes.push(L(`تم قبولك في «${v.club.name}» 🎉`, `You're in “${v.club.name}” 🎉`));
  const newOnes = fresh.filter((x) => !seen.ids.includes(x.id));
  if (newOnes.length) notes.push(newOnes.length === 1 ? L(`جديد في النادي: ${'text' in newOnes[0] ? newOnes[0].text.slice(0, 60) : ''}`, `New in the club: ${newOnes[0].text.slice(0, 60)}`) : L(`${newOnes.length} رسائل وردود جديدة في النادي`, `${newOnes.length} new messages and replies in the club`));
  if (isStaff(v) && seen.day !== today) {
    next.day = today;
    const req = v.members.filter((m) => m.status === 'pending').length;
    const st = stopped(v, today).length;
    if (req || st) notes.push([req ? L(`${req} طلب انضمام`, `${req} join requests`) : '', st ? L(`${st} متوقفين عن الإنجاز`, `${st} have stopped`) : ''].filter(Boolean).join(L(' · ', ' · ')));
    write(LS_SEEN, next);
  }
  if (notes.length) toaster(notes.join(L(' — ', ' — ')), 'club');
}

/** one evening nudge if today's club tasks are still open — once a day, never more */
function evening() {
  const { view: v, conf } = store;
  if (!v || !conf || conf.muted || v.me.status !== 'active' || !toaster) return;
  const now = new Date();
  if (now.getHours() < 20) return;
  const today = todayKey();
  const seen = read<{ ids: string[]; nudge?: string } | null>(LS_SEEN, null);
  if (!seen || seen.nudge === today) return;
  const open = liveTasks(v, 'daily', today).filter((t) => !v.checks[v.me.id]?.[today]?.t.includes(t.id)).length;
  write(LS_SEEN, { ...seen, nudge: today });
  if (open) toaster(L(`باقي ${open === 1 ? 'مهمة وحدة' : `${open} مهام`} للنادي اليوم — تقدر عليها 💪`, `${open} club task${open === 1 ? '' : 's'} left today — you've got this 💪`), 'club');
}

let started = false;
/** while the app is open: check the club every few minutes, share progress when tasks change */
export function startClub(t: Toast) {
  toaster = t;
  if (started) return;
  started = true;
  const tick = () => {
    if (!store.conf || document.visibilityState !== 'visible') return;
    void refresh().then(evening);
  };
  setTimeout(tick, 2500);
  setInterval(tick, 3 * 60_000);
  document.addEventListener('visibilitychange', tick);
  subscribe(shareProgress);
}
