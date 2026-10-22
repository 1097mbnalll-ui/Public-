import type { Reminder } from '../lib/types';
import { addDays, atTime, dateKey, fmtDateTime, todayKey } from '../lib/dates';
import { buildIcs } from '../lib/reminders';
import { download } from '../lib/backup';
import { Icon } from './Icon';
import { L } from '../lib/i18n';

const pad = (n: number) => String(n).padStart(2, '0');
function toLocalInput(ms: number) {
  const d = new Date(ms);
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ReminderField({ value, onChange, title, dueAt }: { value?: Reminder; onChange: (r?: Reminder) => void; title: string; dueAt?: number }) {
  const now = Date.now();
  const today = todayKey();
  const presets: { l: string; at: number }[] = [
    { l: L('بعد ساعة', "In an hour"), at: now + 3600_000 },
    { l: L('الليلة 9م', "Tonight 9pm"), at: atTime(today, '21:00') },
    { l: L('بكرة 8ص', "Tomorrow 8am"), at: atTime(addDays(today, 1), '08:00') },
  ].filter((p) => p.at > now);
  if (dueAt && dueAt - 3600_000 > now) presets.unshift({ l: L('قبل الموعد بساعة', "An hour before"), at: dueAt - 3600_000 });

  const exportIcs = () => {
    if (!value) return;
    download(`${title.slice(0, 40)}.ics`, buildIcs([{ uid: `${value.at}-${title.length}`, title, start: value.at, minutes: 15, alarmMinutes: [0] }]), 'text/calendar');
  };

  return (
    <div className="field">
      <label>{L("تذكير", "Reminder")}</label>
      {value && (
        <div className="row" style={{ marginBottom: 4 }}>
          <span className={`chip ${value.fired ? '' : 'blue'}`}>
            <Icon name="bell" size={13} /> {fmtDateTime(value.at)} {value.fired ? L('· أُرسل', "· sent") : ''}
          </span>
          <button className="btn sm ghost" onClick={exportIcs} title={L("ينزل ملف تقويم بتنبيه مضمون حتى لو كان الموقع مغلقًا", "Downloads a calendar file with a guaranteed alert, even when the site is closed")}>
            <Icon name="calplus" size={15} />{L(" أضف للتقويم", " Add to calendar")}</button>
          <button className="btn sm ghost" onClick={() => onChange(undefined)}>{L("إلغاء", "Cancel")}</button>
        </div>
      )}
      <div className="row wrap" style={{ gap: 6 }}>
        {presets.map((p) => (
          <button key={p.l} className="chip btnish" onClick={() => onChange({ at: p.at })}>
            {p.l}
          </button>
        ))}
        <input
          type="datetime-local"
          className="input"
          style={{ width: 'auto', height: 32, padding: '0 10px' }}
          value={value ? toLocalInput(value.at) : ''}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return onChange(undefined);
            const [d, t] = v.split('T');
            onChange({ at: atTime(d, t) });
          }}
          aria-label={L("وقت التذكير", "Reminder time")}
        />
      </div>
    </div>
  );
}
