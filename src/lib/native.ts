// Inside the Android app (Capacitor): reminders are scheduled with the phone itself, so they arrive
// even when the app is closed — something a website can't do. On the web nothing here runs.

import type { AppState } from './types';
import { addDays, atTime, fmtClock, todayKey } from './dates';
import { getState, subscribe } from './store';
import { L } from './i18n';
import { occurrences } from './engine/remind';
import { focusAlerts } from './engine/focus';
import { prayerGaps, prayerName } from './engine/prayer';

/** the public site — links made in the app (pairing, sharing) must point here, not inside the app */
export const SITE_URL = 'https://1097mbnalll-ui.github.io/Public-/';

export const isNative = (): boolean => !!(globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

let permission: NotificationPermission | 'unsupported' = 'default';
export const nativePermission = () => permission;

/** Android 12+ asks separately for alarms that ring on the minute («المنبهات والتذكيرات») */
let exact: 'granted' | 'denied' = 'granted';
export const nativeExact = () => exact;

// our own channel at high importance, so a reminder pops up and makes a sound instead of landing silently
const CHANNEL = 'madar-reminders';
const ICON = 'ic_stat_madar';
const COLOR = '#7E62F0';

const plugin = () => import('@capacitor/local-notifications').then((m) => m.LocalNotifications);

export async function requestNativeNotifications(): Promise<NotificationPermission> {
  const ln = await plugin();
  const r = await ln.requestPermissions();
  permission = r.display === 'granted' ? 'granted' : 'denied';
  if (permission === 'granted') void reschedule(true);
  return permission;
}

async function checkExact() {
  try {
    const ln = await plugin();
    exact = (await ln.checkExactNotificationSetting()).exact_alarm === 'granted' ? 'granted' : 'denied';
  } catch {
    exact = 'granted';
  }
  return exact;
}

/** opens the phone's «المنبهات والتذكيرات» page for this app; back from it, reminds on the minute */
export async function requestNativeExact() {
  const ln = await plugin();
  try {
    exact = (await ln.changeExactNotificationSetting()).exact_alarm === 'granted' ? 'granted' : 'denied';
  } catch {
    await checkExact();
  }
  void reschedule(true);
  return exact;
}

/** how many alerts the phone is holding for us right now (shown in settings) */
export async function nativePendingCount() {
  try {
    return (await (await plugin()).getPending()).notifications.length;
  } catch {
    return 0;
  }
}

/** shows now (the settings "test" button) */
export async function nativeNotifyNow(title: string, body: string) {
  const ln = await plugin();
  await ln.schedule({ notifications: [{ id: 1, title, body, channelId: CHANNEL, smallIcon: ICON, iconColor: COLOR, isExactNotification: exact === 'granted', schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true } }] });
}

interface Upcoming {
  key: string;
  title: string;
  body: string;
  at: number;
  ref: string;
}

/** what should alert in the coming week — the same reminders the site shows, ahead of time */
function upcoming(state: AppState, now: number): Upcoming[] {
  const out: Upcoming[] = [];
  const until = now + 7 * 86400_000;
  const add = (u: Upcoming) => u.at > now && u.at < until && out.push(u);
  for (const t of state.tasks) {
    if (t.status !== 'open') continue;
    if (t.reminder && !t.reminder.fired) add({ key: `task:${t.id}`, title: t.title, body: t.reminder.note || L('تذكير بمهمة', 'Task reminder'), at: t.reminder.at, ref: `task/${t.id}` });
    if (state.settings.nudges && t.due && t.dueTime) add({ key: `due:${t.id}:${t.due}`, title: L(`بعد ساعة: ${t.title}`, `In an hour: ${t.title}`), body: L(`موعدها ${fmtClock(t.dueTime)}`, `Due at ${fmtClock(t.dueTime)}`), at: atTime(t.due, t.dueTime) - 3600_000, ref: `task/${t.id}` });
  }
  for (const p of state.procedures) {
    if (p.archived || p.completedAt || !p.reminder || p.reminder.fired) continue;
    const next = p.steps.find((s) => !s.done);
    add({ key: `proc:${p.id}`, title: p.title, body: p.reminder.note || (next ? L(`الخطوة التالية: ${next.title}`, `Next step: ${next.title}`) : L('تذكير بإجراء', 'Procedure reminder')), at: p.reminder.at, ref: `work/${p.id}` });
  }
  if (state.settings.nudges)
    for (const e of state.exams) {
      if (e.score != null || e.finished) continue;
      const course = state.courses.find((c) => c.id === e.courseId);
      add({ key: `exam:${e.id}`, title: L(`اختبار ${course?.name || ''} غدًا`, `${course?.name || ''} exam tomorrow`), body: L(`${e.title}${e.time ? ` — ${fmtClock(e.time)}` : ''}. نم جيدًا وجهّز أدواتك.`, `${e.title}${e.time ? ` — ${fmtClock(e.time)}` : ''}. Sleep well.`), at: atTime(addDays(e.date, -1), '20:00'), ref: 'study' });
    }
  for (const r of state.reminds || []) for (const at of occurrences(r, now, until)) add({ key: `rem:${r.id}:${at}`, title: r.title, body: r.note || L('تذكير', 'Reminder'), at, ref: r.ref || 'reminders' });
  const adhan = state.timer?.running ? prayerGaps(state.settings, now, now + 86_400_000).find((g) => g.from > now) : undefined;
  if (state.timer && adhan) add({ key: `adhan:${state.timer.startedAt}:${adhan.from}`, title: L(`أذان ${prayerName(adhan.id)} 🕌`, `${prayerName(adhan.id)} adhan 🕌`), body: L('جلستك بتوقف مكانها — بعد الصلاة افتح «مدار» وكمّل.', 'Your session pauses where it is — open Madar after the prayer and carry on.'), at: adhan.from, ref: 'study' });
  if (state.timer)
    for (const f of focusAlerts(state.timer, state.settings, now).filter((f) => !adhan || f.at < adhan.from))
      add({
        key: `focus:${state.timer.startedAt}:${f.at}`,
        title: f.kind === 'end' ? L('خلصت جلستك 🎉', 'Session done 🎉') : f.kind === 'work' ? L(`نرجع للتركيز — الجولة ${f.round}`, `Back to focus — round ${f.round}`) : L(`استراحة ${f.kind === 'long' ? 'طويلة ' : ''}${f.min} د`, `${f.kind === 'long' ? 'Long ' : ''}${f.min} min break`),
        body: f.kind === 'end' ? L('افتح «مدار» وسجّل وش خلصت.', 'Open Madar and log what you covered.') : f.kind === 'work' ? state.timer.label : L('قم، تحرّك، اشرب موية.', 'Get up, move, drink water.'),
        at: f.at,
        ref: 'today',
      });
  const gp = state.gym?.profile;
  if (gp?.time)
    for (let i = 0; i < 7; i++) {
      const day = addDays(todayKey(now), i);
      if (!gp.days.includes(new Date(`${day}T12:00:00`).getDay()) || state.gym.sessions.some((x) => x.day === day)) continue;
      add({ key: `gym:${day}`, title: L('النادي بعد نص ساعة', 'Gym in 30 min'), body: L('جهّز شنطتك وموية 💪', 'Grab your bag and water 💪'), at: atTime(day, gp.time) - 30 * 60000, ref: 'gym' });
    }
  if (state.settings.morningBrief)
    for (let i = 0; i < 7; i++) {
      const day = addDays(todayKey(now), i);
      add({ key: `brief:${day}`, title: L('خطة يومك جاهزة', 'Your day plan is ready'), body: L('افتح «مدار» وشوف وش عندك اليوم.', 'Open Madar to see your day.'), at: atTime(day, state.settings.morningBrief), ref: 'today' });
    }
  return out.sort((a, b) => a.at - b.at).slice(0, 60);
}

const idOf = (key: string) => {
  let h = 7;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h % 2_000_000_000) + 10;
};

let timer: ReturnType<typeof setTimeout> | null = null;
let lastSig = '';
let running: Promise<void> = Promise.resolve();

/**
 * Hands the phone the coming week's alerts. Only when the list changed — every edit in the app
 * triggers this, and redoing it each time is wasted work. Never lets the plugin open the
 * exact-alarm settings page by itself: without that permission alerts are scheduled as
 * «تقريبي» (may come a few minutes late), and settings offers the switch.
 */
function reschedule(force = false) {
  running = running.then(async () => {
    const off = permission !== 'granted' || !getState().settings.notifications;
    const list = off ? [] : upcoming(getState(), Date.now());
    const sig = off ? 'off' : `${exact}|${list.map((u) => `${u.key}@${u.at}:${u.title}:${u.body}`).join('|')}`;
    if (!force && sig === lastSig) return;
    lastSig = sig;
    const ln = await plugin();
    const pending = await ln.getPending();
    const mine = pending.notifications.filter((n) => n.id !== 1);
    if (mine.length) await ln.cancel({ notifications: mine.map((n) => ({ id: n.id })) });
    if (list.length)
      await ln.schedule({
        notifications: list.map((u) => ({ id: idOf(u.key), title: u.title, body: u.body, channelId: CHANNEL, smallIcon: ICON, iconColor: COLOR, isExactNotification: exact === 'granted', schedule: { at: new Date(u.at), allowWhileIdle: true }, extra: { ref: u.ref } })),
      });
  }).catch(() => {
    lastSig = '';
  });
  return running;
}

async function refreshNative() {
  try {
    const ln = await plugin();
    const r = await ln.checkPermissions();
    permission = r.display === 'granted' ? 'granted' : r.display === 'denied' ? 'denied' : 'default';
    await checkExact();
  } catch {
    return;
  }
  void reschedule();
}

/** on start in the app: permission, tapping a notification opens its page, and keep the schedule current */
export async function startNative() {
  if (!isNative()) return;
  try {
    const ln = await plugin();
    const r = await ln.checkPermissions();
    permission = r.display === 'granted' ? 'granted' : r.display === 'denied' ? 'denied' : 'default';
    await checkExact();
    await ln.createChannel({ id: CHANNEL, name: L('تذكيرات مدار', 'Madar reminders'), description: L('التذكيرات ومواعيد المهام والاختبارات', 'Reminders, task times and exams'), importance: 5, visibility: 1, vibration: true, lights: true, lightColor: COLOR }).catch(() => {});
    await ln.addListener('localNotificationActionPerformed', (a) => {
      const ref = a.notification.extra?.ref;
      if (typeof ref === 'string') location.hash = `#/${ref}`;
    });
  } catch {
    permission = 'unsupported';
    return;
  }
  void reschedule(true);
  // back to the app (maybe after changing a permission in the phone's settings): check again
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    void refreshNative();
  });
  subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void reschedule(), 2000);
  });
}
