import { useMemo, useState } from 'react';
import { Bar, useNow } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useApp } from '../lib/store';
import { fmtDate, fmtMinutes, relDay, todayKey } from '../lib/dates';
import { weekLoad } from '../lib/engine/planner';
import { planStudy } from '../lib/engine/study';
import * as A from '../lib/actions';

/** seven days at a glance: load vs. free time, so heavy days are visible before they arrive */
export function WeekView() {
  const s = useApp();
  const now = useNow();
  const study = useMemo(() => planStudy(s, now), [s, now]);
  const days = useMemo(() => weekLoad(s, now, 7, study), [s, now, study]);
  const today = todayKey(now);
  const [open, setOpen] = useState<string | null>(today);
  const heavy = days.filter((d) => d.overloaded).length;

  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        {heavy ? `${heavy === 1 ? 'يوم واحد' : `${heavy} أيام`} أحمل من وقتك المتاح — انقل منها لأيام أخف من الآن.` : 'لا يوجد يوم محمّل فوق طاقتك هذا الأسبوع.'}
        {' '}يشمل المذاكرة المحسوبة لاختباراتك والمهام ذات المواعيد.
      </p>
      <div className="rows week-list">
        {days.map((d) => {
          const load = d.study + d.tasks;
          const ratio = d.capacity ? load / d.capacity : load ? 2 : 0;
          const isOpen = open === d.day;
          return (
            <div key={d.day} className="r tap" onClick={() => setOpen(isOpen ? null : d.day)} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div className="row" style={{ gap: 12 }}>
                <div style={{ width: 74, flexShrink: 0 }}>
                  <div style={{ fontWeight: 650, color: d.day === today ? 'var(--accent)' : undefined }}>{relDay(d.day, today) === 'اليوم' ? 'اليوم' : fmtDate(d.day).split(' ')[0]}</div>
                  <div className="faint tiny">{fmtDate(d.day, false)}</div>
                </div>
                <div className="grow">
                  <Bar value={Math.min(1, ratio)} color={d.overloaded ? 'var(--red)' : ratio > 0.85 ? 'var(--amber)' : 'var(--green)'} />
                  <div className="row between tiny" style={{ marginTop: 6 }}>
                    <span className={d.overloaded ? '' : 'faint'} style={d.overloaded ? { color: 'var(--red)' } : undefined}>
                      {fmtMinutes(load)} من {fmtMinutes(d.capacity)}
                    </span>
                    {d.exams.length > 0 && <span style={{ color: 'var(--red)' }}><Icon name="flag" size={11} /> اختبار</span>}
                  </div>
                </div>
                <Icon name="chevron" size={15} className="chev-end" style={{ transform: isOpen ? 'rotate(-90deg)' : undefined, transition: 'transform .2s' }} />
              </div>
              {isOpen && (
                <div className="day-items" onClick={(e) => e.stopPropagation()}>
                  {d.exams.map((e) => (
                    <div key={e} className="mini-item" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>
                      <span className="ellipsis"><Icon name="flag" size={12} /> {e}</span>
                    </div>
                  ))}
                  {d.items.map((it, i) => (
                    <div key={i} className="mini-item">
                      <span className="ellipsis" style={{ color: it.kind === 'study' ? 'var(--study)' : it.kind === 'procedure' ? 'var(--work)' : undefined }}>{it.title}</span>
                      <span className="faint num">{fmtMinutes(it.minutes)}</span>
                    </div>
                  ))}
                  {!d.items.length && !d.exams.length && <div className="faint tiny">لا شيء مجدول</div>}
                  <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
                    <span className="faint tiny">وقتك هذا اليوم:</span>
                    {[0, 120, 240, 360, 480].map((m) => (
                      <button key={m} className={`chip btnish ${s.dayOverrides[d.day] === m ? 'on' : ''}`} style={{ height: 26, padding: '0 8px', fontSize: 11 }} onClick={() => A.setDayOverride(d.day, m)}>
                        {m ? fmtMinutes(m) : 'مشغول'}
                      </button>
                    ))}
                    {s.dayOverrides[d.day] != null && (
                      <button className="chip btnish" style={{ height: 26, padding: '0 8px', fontSize: 11 }} onClick={() => A.setDayOverride(d.day, null)}>كالمعتاد</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
