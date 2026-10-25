// Inside the Android app (Capacitor): reminders are scheduled with the phone itself, so they arrive
// even when the app is closed — something a website can't do. On the web nothing here runs.

import type { AppState } from './types';
import { addDays, atTime, fmtClock, todayKey } from './dates';
import { getState, subscribe } from './store';
import { L } from './i18n';

/** the public site — links made in the app (pairing, sharing) must point here, not inside the app */
export const SITE_URL = 'https://1097mbnalll-ui.github.io/Public-/';

export const isNative = (): boolean => !!(globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

let permission: NotificationPermission | 'unsupported' = 'default';
export const nativePermission = () => permission;

const plugin = () => import('@capacitor/local-notifications').then((m) => m.LocalNotifications);

export async function requestNativeNotifications(): Promise<NotificationPermission> {
  const ln = await plugin();
  const r = await ln.requestPermissions();
  permission = r.display === 'granted' ? 'granted' : 'denied';
  if (permission === 'granted') void reschedule();
  return permission;
}

/** shows now (the settings "test" button) */
export async function nativeNotifyNow(title: string, body: string) {
  const ln = await plugin();
  await ln.schedule({ notifications: [{ id: 1, title, body, schedule: { at: new Date(Date.now() + 1000) } }] });
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

async function reschedule() {
  if (permission !== 'granted' || !getState().settings.notifications) return;
  const ln = await plugin();
  const pending = await ln.getPending();
  if (pending.notifications.length) await ln.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  const list = upcoming(getState(), Date.now());
  if (list.length) await ln.schedule({ notifications: list.map((u) => ({ id: idOf(u.key), title: u.title, body: u.body, schedule: { at: new Date(u.at), allowWhileIdle: true }, extra: { ref: u.ref } })) });
}

/** on start in the app: permission, tapping a notification opens its page, and keep the schedule current */
export async function startNative() {
  if (!isNative()) return;
  try {
    const ln = await plugin();
    const r = await ln.checkPermissions();
    permission = r.display === 'granted' ? 'granted' : r.display === 'denied' ? 'denied' : 'default';
    await ln.addListener('localNotificationActionPerformed', (a) => {
      const ref = a.notification.extra?.ref;
      if (typeof ref === 'string') location.hash = `#/${ref}`;
    });
  } catch {
    permission = 'unsupported';
    return;
  }
  void reschedule();
  subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void reschedule(), 2000);
  });
}
