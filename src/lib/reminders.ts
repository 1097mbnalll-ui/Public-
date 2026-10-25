// Reminders. Honest about limits: a website can only notify while it is open (or kept in a
// background tab / installed app that the OS hasn't suspended). Anything that fires while the
// app is closed shows up in "فاتتك" on next open. For guaranteed alerts, export to calendar (.ics).

import type { AppState } from './types';
import { addDays, atTime, fmtClock, todayKey } from './dates';
import { mutate } from './store';
import { planDay } from './engine/planner';
import { L } from './i18n';
import { isNative, nativeNotifyNow, nativePermission, requestNativeNotifications } from './native';

export interface DueReminder {
  id: string;
  title: string;
  body: string;
  at: number;
  ref?: string; // route to open
  kind: 'manual' | 'auto';
  task?: string;
  proc?: string;
}

export function collectDue(state: AppState, now = Date.now()): DueReminder[] {
  const out: DueReminder[] = [];
  for (const t of state.tasks) {
    if (t.status !== 'open' || !t.reminder || t.reminder.fired || t.reminder.at > now) continue;
    out.push({ id: `task:${t.id}`, title: t.title, body: t.reminder.note || L('تذكير بمهمة', "Task reminder"), at: t.reminder.at, ref: `task/${t.id}`, kind: 'manual', task: t.id });
  }
  for (const p of state.procedures) {
    if (p.archived || p.completedAt || !p.reminder || p.reminder.fired || p.reminder.at > now) continue;
    const next = p.steps.find((s) => !s.done);
    out.push({ id: `proc:${p.id}`, title: p.title, body: p.reminder.note || (next ? L(`الخطوة التالية: ${next.title}`, `Next step: ${next.title}`) : L('تذكير بإجراء', "Procedure reminder")), at: p.reminder.at, ref: `work/${p.id}`, kind: 'manual', proc: p.id });
  }
  if (!state.settings.nudges) return out;

  const today = todayKey(now);
  for (const t of state.tasks) {
    if (t.status !== 'open' || !t.due || !t.dueTime || t.due !== today) continue;
    const at = atTime(t.due, t.dueTime) - 60 * 60000;
    const id = `due:${t.id}:${t.due}`;
    if (at <= now && !state.fired[id])
      out.push({ id, title: L(`بعد ساعة: ${t.title}`, `In an hour: ${t.title}`), body: L(`موعدها ${fmtClock(t.dueTime)}`, `Due at ${fmtClock(t.dueTime)}`), at, ref: `task/${t.id}`, kind: 'auto' });
  }
  // عاجلة: one nudge a day until it's done
  for (const t of state.tasks) {
    if (t.status !== 'open' || t.priority !== 3 || t.waitingOn) continue;
    const id = `urgent:${t.id}:${today}`;
    const at = Math.max(t.createdAt + 60_000, atTime(today, state.settings.morningBrief || '08:00'));
    if (at <= now && !state.fired[id])
      out.push({ id, title: L(`عاجلة: ${t.title}`, `Urgent: ${t.title}`), body: L('ضرورية جدًا — خلّصها اليوم.', "Very important — finish it today."), at, ref: `task/${t.id}`, kind: 'auto' });
  }
  for (const p of state.procedures) {
    if (p.archived || p.completedAt || p.priority !== 3) continue;
    const id = `urgent-proc:${p.id}:${today}`;
    const at = Math.max(p.createdAt + 60_000, atTime(today, state.settings.morningBrief || '08:00'));
    const next = p.steps.find((x) => !x.done);
    if (at <= now && !state.fired[id])
      out.push({ id, title: L(`عاجل: ${p.title}`, `Urgent: ${p.title}`), body: next ? L(`الخطوة التالية: ${next.title}`, `Next step: ${next.title}`) : L('ضروري اليوم.', "Needed today."), at, ref: `work/${p.id}`, kind: 'auto' });
  }
  for (const e of state.exams) {
    if (e.score != null || e.finished) continue;
    const at = atTime(addDays(e.date, -1), '20:00');
    const id = `exam:${e.id}`;
    const course = state.courses.find((c) => c.id === e.courseId);
    if (at <= now && now < atTime(e.date, '23:59') && !state.fired[id])
      out.push({ id, title: L(`اختبار ${course?.name || ''} غدًا`, `${course?.name || ''} exam tomorrow`), body: L(`${e.title}${e.time ? ` — ${fmtClock(e.time)}` : ''}. نم جيدًا وجهّز أدواتك.`, `${e.title}${e.time ? ` — ${fmtClock(e.time)}` : ''}. Sleep well and get your things ready.`), at, ref: 'study', kind: 'auto' });
  }
  if (state.settings.morningBrief) {
    const at = atTime(today, state.settings.morningBrief);
    const id = `brief:${today}`;
    if (at <= now && !state.fired[id]) {
      const plan = planDay(state, now);
      const n = plan.items.length;
      const must = plan.items.filter((i) => i.must).length;
      out.push({
        id,
        title: L('خطة يومك جاهزة', "Your day plan is ready"),
        body: n ? L(`${n} عناصر${must ? `، منها ${must} لا تحتمل التأجيل` : ''}.${plan.overloaded ? ' اليوم محمّل أكثر من وقتك.' : ''}`, `${n} items${must ? `, ${must} of them can't be postponed` : ''}.${plan.overloaded ? ' Today holds more than your time.' : ''}`) : L('لا شيء ملح اليوم.', "Nothing pressing today."),
        at,
        ref: 'today',
        kind: 'auto',
      });
    }
  }
  return out;
}

let swReg: ServiceWorkerRegistration | null = null;
export function setServiceWorker(reg: ServiceWorkerRegistration | null) {
  swReg = reg;
}

export function notificationSupport(): 'unsupported' | NotificationPermission {
  if (isNative()) return nativePermission();
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (isNative()) return requestNativeNotifications().catch(() => 'unsupported' as const);
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function showSystemNotification(title: string, body: string, tag: string, url = '#/today') {
  if (notificationSupport() !== 'granted') return false;
  if (isNative()) {
    // in the app the phone already has every reminder scheduled; only the test and focus alerts show from here
    if (tag !== 'test' && tag !== 'focus-phase') return true;
    return nativeNotifyNow(title, body).then(() => true, () => false);
  }
  try {
    const reg = swReg || (await navigator.serviceWorker?.getRegistration());
    if (reg) {
      await reg.showNotification(title, { body, tag, data: { url }, icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'ar' } as NotificationOptions);
    } else {
      new Notification(title, { body, tag, dir: 'rtl', lang: 'ar' });
    }
    return true;
  } catch {
    return false;
  }
}

const LATE_MS = 15 * 60000;

/**
 * Called every ~30s while the app is open. Returns reminders to show in-app now.
 */
export function tick(state: AppState, now = Date.now()): DueReminder[] {
  const due = collectDue(state, now);
  if (!due.length) return [];
  const live: DueReminder[] = [];
  const missed: DueReminder[] = [];
  for (const r of due) {
    if (now - r.at > LATE_MS) {
      if (!r.id.startsWith('brief:')) missed.push(r);
    } else live.push(r);
  }
  mutate((s) => {
    for (const r of due) {
      if (r.task) {
        const t = s.tasks.find((x) => x.id === r.task);
        if (t?.reminder) t.reminder.fired = true;
      } else if (r.proc) {
        const p = s.procedures.find((x) => x.id === r.proc);
        if (p?.reminder) p.reminder.fired = true;
      } else s.fired[r.id] = now;
    }
    for (const r of missed) s.missed.push({ id: r.id, title: r.title, at: r.at, ref: r.ref });
    if (s.missed.length > 30) s.missed = s.missed.slice(-30);
  });
  if (state.settings.notifications)
    for (const r of live) showSystemNotification(r.title, r.body, r.id, `#/${r.ref || 'today'}`);
  return live;
}

// ---------------- Calendar export (.ics) ----------------

export interface CalEvent {
  uid: string;
  title: string;
  start: number;
  minutes?: number;
  allDay?: boolean;
  description?: string;
  alarmMinutes?: number[];
}

const icsEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
const icsDate = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsDay = (ms: number) => {
  const k = todayKey(ms).replace(/-/g, '');
  return k;
};

export function buildIcs(events: CalEvent[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Madar//AR', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@masar`, `DTSTAMP:${icsDate(Date.now())}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDay(e.start)}`, `DTEND;VALUE=DATE:${icsDay(e.start + 86_400_000)}`);
    } else {
      lines.push(`DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(e.start + (e.minutes || 30) * 60000)}`);
    }
    lines.push(`SUMMARY:${icsEsc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEsc(e.description)}`);
    for (const m of e.alarmMinutes || [0])
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.title)}`, `TRIGGER:-PT${Math.max(0, m)}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
