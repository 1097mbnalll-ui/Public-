import { useState } from 'react';
import { Collapse, Empty, Sheet, useNow } from './kit';
import { Icon } from './Icon';
import { PageTop } from './PageTop';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { addDays, atTime, dateKey, fmtClock, fmtDateTime, todayKey } from '../lib/dates';
import { buildIcs, notificationSupport, requestNotifications } from '../lib/reminders';
import { isNative, nativeExact, requestNativeExact } from '../lib/native';
import { nextAfter, repeatLabel, sortReminds } from '../lib/engine/remind';
import { download } from '../lib/backup';
import { L } from '../lib/i18n';
import type { Remind, RemindRepeat } from '../lib/types';
import { closeSheet, openSheet } from './sheets';
import { toast } from './toast';
import { go } from './router';

const pad = (n: number) => String(n).padStart(2, '0');
const clockOf = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const WD = () => L('ح ن ث ر خ ج س', 'S M T W T F S').split(' ');
const REPEATS: { v: RemindRepeat; l: () => string }[] = [
  { v: 'none', l: () => L('مرة وحدة', 'Once') },
  { v: 'daily', l: () => L('كل يوم', 'Daily') },
  { v: 'weekly', l: () => L('أيام معيّنة', 'Some days') },
  { v: 'monthly', l: () => L('كل شهر', 'Monthly') },
  { v: 'yearly', l: () => L('كل سنة', 'Yearly') },
];

/** the next five minutes' mark, an hour from now */
const inAnHour = (now: number) => Math.ceil((now + 3600_000) / 300_000) * 300_000;

/** whether a reminder will actually reach you, and the one button that fixes it when it won't */
export function NotifyStatus({ compact }: { compact?: boolean }) {
  const s = useApp();
  const [perm, setPerm] = useState(notificationSupport());
  const [exact, setExact] = useState(nativeExact());
  const on = perm === 'granted' && s.settings.notifications;
  const enable = async () => {
    const r = await requestNotifications();
    setPerm(r);
    if (r === 'granted') {
      A.updateSettings({ notifications: true });
      toast(L('تمام، التذكيرات بتوصلك إشعار', "Done — reminders will arrive as notifications"));
    } else if (r === 'denied') toast(isNative() ? L('الإذن مرفوض — فعّله من إعدادات الجوال ← التطبيقات ← مدار ← الإشعارات', 'Denied — allow it in phone Settings → Apps → Madar → Notifications') : L('المتصفح رافض — فعّلها من إعدادات الموقع (القفل جنب الرابط)', 'The browser blocked it — allow it in site settings (the lock by the address)'));
  };
  if (perm === 'unsupported') return <div className="rm-note"><Icon name="info" size={16} /><span>{L('هالمتصفح ما يدعم الإشعارات — التذكير يطلع داخل «مدار» وهو مفتوح.', "This browser can't notify — the reminder shows inside Madar while it's open.")}</span></div>;
  if (!on)
    return (
      <div className="rm-note warn">
        <Icon name="bell" size={16} />
        <span>{perm === 'denied' ? L('الإشعارات مرفوضة — التذكير يطلع داخل التطبيق بس.', 'Notifications are blocked — reminders show only inside the app.') : L('الإشعارات مطفية — فعّلها عشان يوصلك التذكير.', 'Notifications are off — turn them on so reminders reach you.')}</span>
        {perm === 'granted' ? <button className="btn sm" onClick={() => A.updateSettings({ notifications: true })}>{L('شغّل', 'Turn on')}</button> : perm !== 'denied' || isNative() ? <button className="btn sm primary" onClick={enable}>{L('فعّل', 'Enable')}</button> : null}
      </div>
    );
  if (isNative())
    return exact === 'granted' ? (compact ? null : <div className="rm-note ok"><Icon name="check" size={16} /><span>{L('يوصلك على الدقيقة حتى لو «مدار» مسكّر.', 'Arrives on the minute, even with Madar closed.')}</span></div>) : (
      <div className="rm-note warn">
        <Icon name="clock" size={16} />
        <span>{L('الجوال يسمح بتنبيه «تقريبي» بس — ممكن يتأخر دقايق. اسمح بـ«المنبهات والتذكيرات» عشان يجي بوقته.', 'Your phone only allows approximate alerts — they may be minutes late. Allow “Alarms & reminders” for exact times.')}</span>
        <button className="btn sm primary" onClick={async () => setExact(await requestNativeExact())}>{L('اسمح', 'Allow')}</button>
      </div>
    );
  return compact ? null : <div className="rm-note"><Icon name="info" size={16} /><span>{L('الموقع ينبهك وهو مفتوح (ولو بالخلفية). للتنبيه المضمون والجوال مقفل: «أضف للتقويم» أو حمّل تطبيق أندرويد.', 'The site alerts while open (even in the background). For a guaranteed alert with the phone locked: “Add to calendar”, or get the Android app.')}</span></div>;
}

const RRULE: Record<RemindRepeat, string | undefined> = { none: undefined, daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' };
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function exportIcs(r: Pick<Remind, 'title' | 'note' | 'at' | 'repeat' | 'days'>) {
  const rule = RRULE[r.repeat] && (r.repeat === 'weekly' ? `${RRULE.weekly};BYDAY=${(r.days?.length ? r.days : [new Date(r.at).getDay()]).map((d) => BYDAY[d]).join(',')}` : RRULE[r.repeat]);
  download(`${r.title.slice(0, 40) || 'reminder'}.ics`, buildIcs([{ uid: `${r.at}-${r.title.length}`, title: r.title, start: r.at, minutes: 15, alarmMinutes: [0], description: r.note, rrule: rule }]), 'text/calendar');
}

/** «ذكّرني»: what, when, how often */
export function RemindSheet({ id, title, refTo, at }: { id?: string; title?: string; refTo?: string; at?: number }) {
  const s = useApp();
  const was = s.reminds.find((r) => r.id === id);
  const now = Date.now();
  const today = todayKey(now);
  const start = was?.at ?? at ?? inAnHour(now);
  const [name, setName] = useState(was?.title ?? title ?? '');
  const [note, setNote] = useState(was?.note ?? '');
  const [day, setDay] = useState(dateKey(new Date(start)));
  const [time, setTime] = useState(clockOf(start));
  const [repeat, setRepeat] = useState<RemindRepeat>(was?.repeat ?? 'none');
  const [days, setDays] = useState<number[]>(was?.days ?? [new Date(start).getDay()]);
  const when = atTime(day, time);
  const draft = { at: when, repeat, days };
  const first = repeat !== 'none' && when <= now ? nextAfter(draft, now) : when;
  const past = repeat === 'none' && when <= now;
  const ok = !!name.trim() && !past && (repeat !== 'weekly' || days.length > 0);

  const quick = [
    { l: L('بعد ١٠ د', 'In 10 min'), at: Math.ceil((now + 600_000) / 60_000) * 60_000 },
    { l: L('بعد ساعة', 'In an hour'), at: inAnHour(now) },
    { l: L('الليلة ٩م', 'Tonight 9pm'), at: atTime(today, '21:00') },
    { l: L('بكرة ٨ص', 'Tomorrow 8am'), at: atTime(addDays(today, 1), '08:00') },
  ].filter((q) => q.at > now);

  const save = () => {
    const rid = A.saveRemind({ id: was?.id, title: name.trim(), note: note.trim() || undefined, at: when, repeat, days: repeat === 'weekly' ? days : undefined, ref: was?.ref ?? refTo });
    closeSheet();
    toast(L(`🔔 بذكّرك ${fmtDateTime(first ?? when)}`, `🔔 I'll remind you ${fmtDateTime(first ?? when)}`), { buttons: [{ label: L('تذكيراتي', 'My reminders'), fn: () => go('reminders') }], undoable: true });
    return rid;
  };

  return (
    <Sheet title={was ? L('تذكير', 'Reminder') : L('ذكّرني', 'Remind me')} onClose={closeSheet} footer={
      <>
        <button className="btn primary grow" disabled={!ok} onClick={save}>{was ? L('احفظ', 'Save') : L('ذكّرني', 'Remind me')}</button>
        {was && <button className="btn ghost" aria-label={L('احذف', 'Delete')} onClick={() => { A.deleteRemind(was.id); closeSheet(); toast(L('انحذف التذكير', 'Reminder deleted'), { undoable: true }); }}><Icon name="trash" size={15} /></button>}
      </>
    }>
      <div className="rm-form">
        <div className="field">
          <label htmlFor="rm-title">{L('بوش أذكّرك؟', 'Remind you of what?')}</label>
          <input id="rm-title" className="input" autoFocus={!was && !title} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder={L('مثلاً: أدفع الإيجار، أشرب موية، أتصل بأمي', 'e.g. pay rent, drink water, call mum')} />
        </div>
        <div className="field">
          <label>{L('متى؟', 'When?')}</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {quick.map((q) => {
              const on = q.at === when;
              return <button key={q.l} className={`chip btnish ${on ? 'on' : ''}`} onClick={() => { setDay(dateKey(new Date(q.at))); setTime(clockOf(q.at)); }}>{q.l}</button>;
            })}
          </div>
          <div className="rm-when">
            <input type="date" className="input" aria-label={L('اليوم', 'Day')} min={repeat === 'none' ? today : undefined} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
            <input type="time" className="input" aria-label={L('الساعة', 'Time')} value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
          </div>
          {past && <small className="rm-err">{L('هالوقت راح — اختر وقت جاي.', 'That time has passed — pick a later one.')}</small>}
        </div>
        <div className="field">
          <label>{L('يتكرر؟', 'Repeat?')}</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {REPEATS.map((r) => <button key={r.v} className={`chip btnish ${repeat === r.v ? 'on' : ''}`} onClick={() => setRepeat(r.v)}>{r.l()}</button>)}
          </div>
          {repeat === 'weekly' && (
            <div className="rm-days" role="group" aria-label={L('الأيام', 'Days')}>
              {WD().map((d, i) => {
                const on = days.includes(i);
                return <button key={i} className={on ? 'on' : ''} aria-pressed={on} onClick={() => setDays(on ? days.filter((x) => x !== i) : [...days, i].sort())}>{d}</button>;
              })}
            </div>
          )}
          {ok && <small className="faint">{repeat === 'none' ? L(`بذكّرك ${fmtDateTime(when)}`, `Reminding you ${fmtDateTime(when)}`) : L(`${repeatLabel(draft)} الساعة ${time} · أول مرة ${fmtDateTime(first ?? when)}`, `${repeatLabel(draft)} at ${time} · first ${fmtDateTime(first ?? when)}`)}</small>}
        </div>
        <div className="field">
          <label htmlFor="rm-note">{L('ملاحظة (اختياري)', 'Note (optional)')}</label>
          <input id="rm-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={L('تطلع تحت العنوان في الإشعار', 'Shows under the title in the notification')} />
        </div>
        <NotifyStatus compact />
        {!isNative() && ok && (
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => exportIcs({ title: name.trim(), note: note.trim(), at: first ?? when, repeat, days })}>
            <Icon name="calplus" size={15} />{L(' أضف للتقويم (تنبيه مضمون)', ' Add to calendar (guaranteed alert)')}</button>
        )}
      </div>
    </Sheet>
  );
}

/** a «ذكّرني» chip for any page: opens the sheet with its title and a way back to the page */
export function RemindButton({ title, refTo, className = 'btn sm' }: { title: string; refTo?: string; className?: string }) {
  return (
    <button className={className} onClick={() => openSheet({ type: 'remind', title, ref: refTo })}>
      <Icon name="bell" size={15} /> {L('ذكّرني', 'Remind me')}
    </button>
  );
}

function RemindRow({ r, now }: { r: Remind; now: number }) {
  const soon = !r.done && r.at - now < 3600_000;
  return (
    <div className={`rm-row ${r.done ? 'done' : ''}`}>
      <button className="rm-main" onClick={() => openSheet({ type: 'remind', id: r.id })}>
        <span className={`rm-ic ${soon ? 'soon' : ''}`}><Icon name="bell" size={17} /></span>
        <span className="rm-t">
          <b>{r.title}</b>
          <small>{r.done ? L(`انتهى · ${fmtDateTime(r.lastAt ?? r.at)}`, `Done · ${fmtDateTime(r.lastAt ?? r.at)}`) : fmtDateTime(r.at)}{r.repeat !== 'none' && ` · ${repeatLabel(r)}`}</small>
          {r.note && <small className="faint">{r.note}</small>}
        </span>
      </button>
      {r.done ? (
        <button className="btn sm ghost" onClick={() => A.snoozeRemind(r.id, 60, now)}>{L('ذكّرني بعد ساعة', 'Again in 1h')}</button>
      ) : r.ref && r.ref !== 'reminders' ? (
        <button className="icon-btn" aria-label={L('افتح', 'Open')} onClick={() => go(r.ref!)}><Icon name="chevron" size={16} /></button>
      ) : null}
    </div>
  );
}

/** تذكيراتي: everything you asked to be reminded of */
export function RemindersPage() {
  const s = useApp();
  const now = useNow(30_000);
  const { next, done } = sortReminds(s.reminds);
  const today = todayKey(now);
  const groups: { l: string; list: Remind[] }[] = [
    { l: L('اليوم', 'Today'), list: next.filter((r) => dateKey(new Date(r.at)) === today) },
    { l: L('بكرة', 'Tomorrow'), list: next.filter((r) => dateKey(new Date(r.at)) === addDays(today, 1)) },
    { l: L('بعدين', 'Later'), list: next.filter((r) => dateKey(new Date(r.at)) > addDays(today, 1)) },
  ].filter((g) => g.list.length);
  return (
    <div className="rm-page">
      <PageTop title={L('تذكيراتي', 'My reminders')} sub={next.length ? L(`${next.length} جاية`, `${next.length} coming`) : undefined} back={{ label: L('حسابي', 'Me'), to: 'me' }} actions={<button className="btn primary sm" onClick={() => openSheet({ type: 'remind' })}><Icon name="plus" size={15} /> {L('تذكير', 'Reminder')}</button>} />
      <NotifyStatus />
      {!next.length && !done.length ? (
        <Empty icon="bell" title={L('ولا تذكير', 'No reminders')}>
          {L('ذكّر نفسك بأي شي: دواء، فاتورة، اتصال، موعد. مرة وحدة أو يتكرر.', 'Remind yourself of anything: medicine, a bill, a call, an appointment. Once or repeating.')}
          <button className="btn primary" style={{ marginTop: 12 }} onClick={() => openSheet({ type: 'remind' })}><Icon name="bell" size={15} /> {L('ذكّرني', 'Remind me')}</button>
        </Empty>
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.l} className="rm-group">
              <h3>{g.l}</h3>
              <div className="card rm-list">{g.list.map((r) => <RemindRow key={r.id} r={r} now={now} />)}</div>
            </section>
          ))}
          {done.length > 0 && (
            <Collapse title={L('اللي راحت', 'Past')} count={done.length}>
              <div className="card rm-list">{done.slice(0, 30).map((r) => <RemindRow key={r.id} r={r} now={now} />)}</div>
            </Collapse>
          )}
        </>
      )}
    </div>
  );
}

/** on «اليوم»: the reminders still to come today, one line each */
export function RemindTodayStrip() {
  const s = useApp();
  const now = useNow(30_000);
  const today = todayKey(now);
  const list = sortReminds(s.reminds).next.filter((r) => dateKey(new Date(r.at)) === today);
  if (!list.length) return null;
  return (
    <button className="rm-strip" onClick={() => go('reminders')}>
      <Icon name="bell" size={16} />
      <span>{list.slice(0, 2).map((r) => `${fmtClock(clockOf(r.at))} ${r.title}`).join(' · ')}{list.length > 2 ? L(` +${list.length - 2}`, ` +${list.length - 2}`) : ''}</span>
      <Icon name="chevron" size={14} />
    </button>
  );
}
