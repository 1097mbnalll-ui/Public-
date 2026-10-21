import { useMemo, useState } from 'react';
import { Bar, Check, Empty, Group, Seg } from '../ui/kit';
import { PageTop } from '../ui/PageTop';
import { Icon } from '../ui/Icon';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { diffDays, fmtClock, fmtDate, fmtMinutes, relDay, todayKey } from '../lib/dates';
import { AREA_LABEL, PRIORITY_LABEL, scoreItem } from '../lib/engine/planner';
import { matches } from '../lib/text';
import type { Area, Task } from '../lib/types';
import { openSheet } from '../ui/sheets';
import { useRoute } from '../ui/router';
import { completeTaskUI } from '../ui/ops';
import { toast } from '../ui/toast';

export function TaskRow({ t }: { t: Task }) {
  const today = todayKey();
  const overdue = t.status === 'open' && t.due && t.due < today;
  const cl = t.checklist.length;
  const cd = t.checklist.filter((c) => c.done).length;
  const meta: React.ReactNode[] = [];
  if (t.due) meta.push(<span key="d" style={overdue ? { color: 'var(--red)' } : t.due === today ? { color: 'var(--accent)' } : undefined}>{relDay(t.due)}{t.dueTime ? ` ${fmtClock(t.dueTime)}` : ''}</span>);
  if (t.priority >= 2) meta.push(<span key="p" style={{ color: t.priority === 3 ? 'var(--red)' : 'var(--amber)' }}>{PRIORITY_LABEL[t.priority]}</span>);
  meta.push(<span key="a">{AREA_LABEL[t.area]}</span>);
  if (t.estimate) meta.push(<span key="e">{fmtMinutes(t.estimate)}</span>);
  if (cl) meta.push(<span key="c">{cd}/{cl} خطوات</span>);
  if (t.waitingOn) meta.push(<span key="w" style={{ color: 'var(--violet)' }}>بانتظار {t.waitingOn}</span>);
  if (t.plannedFor === today && t.due !== today) meta.push(<span key="pl" style={{ color: 'var(--accent)' }}>في خطة اليوم</span>);
  if (t.deferrals >= 2) meta.push(<span key="df">أُجّلت {t.deferrals}×</span>);
  return (
    <div className={`r tap ${t.status !== 'open' ? 'done' : ''}`} onClick={() => openSheet({ type: 'task', id: t.id })}>
      <Check on={t.status === 'done'} onClick={() => (t.status === 'open' ? completeTaskUI(t.id) : A.reopenTask(t.id))} />
      <div className="main-t">
        <div className="lbl">{t.title}</div>
        <div className="sub">
          {meta.flatMap((m, n) => (n ? [' · ', m] : [m]))}
          {t.recurrence && <> · <Icon name="repeat" size={11} /></>}
          {t.reminder && !t.reminder.fired && <> · <Icon name="bell" size={11} /></>}
        </div>
      </div>
      {t.status === 'open' && t.plannedFor !== today && t.due !== today && (
        <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); A.planToday(t.id); toast('أُضيفت لخطة اليوم'); }} title="اعمل عليها اليوم">
          لليوم
        </button>
      )}
    </div>
  );
}

type View = 'open' | 'waiting' | 'done' | 'goals';

export function Tasks() {
  const s = useApp();
  const route = useRoute();
  const [view, setView] = useState<View>('open');
  const [area, setArea] = useState<Area | 'all'>('all');
  const [q, setQ] = useState('');
  const today = todayKey();
  const onlyOverdue = route.query.get('f') === 'overdue';

  const filtered = useMemo(
    () =>
      s.tasks.filter(
        (t) =>
          (area === 'all' || t.area === area) &&
          (!q || matches(`${t.title} ${t.notes} ${t.waitingOn || ''} ${t.checklist.map((c) => c.title).join(' ')}`, q)),
      ),
    [s.tasks, area, q],
  );

  const groups = useMemo(() => {
    const open = filtered.filter((t) => t.status === 'open' && !t.waitingOn);
    const sorted = [...open].sort((a, b) => scoreItem(b, today, Date.now()).score - scoreItem(a, today, Date.now()).score);
    const g: { k: string; title: string; items: Task[] }[] = [
      { k: 'over', title: 'متأخرة', items: [] },
      { k: 'today', title: 'اليوم', items: [] },
      { k: 'tom', title: 'غدًا', items: [] },
      { k: 'week', title: 'هذا الأسبوع', items: [] },
      { k: 'later', title: 'لاحقًا', items: [] },
      { k: 'none', title: 'بلا موعد', items: [] },
    ];
    for (const t of sorted) {
      const d = t.due ? diffDays(today, t.due) : null;
      const pinnedToday = t.plannedFor === today;
      if (d != null && d < 0) g[0].items.push(t);
      else if (d === 0 || pinnedToday) g[1].items.push(t);
      else if (d === 1) g[2].items.push(t);
      else if (d != null && d <= 7) g[3].items.push(t);
      else if (d != null) g[4].items.push(t);
      else g[5].items.push(t);
    }
    return onlyOverdue ? g.slice(0, 1) : g.filter((x) => x.items.length);
  }, [filtered, today, onlyOverdue]);

  const waiting = filtered.filter((t) => t.status === 'open' && t.waitingOn);
  const done = filtered.filter((t) => t.status !== 'open').sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  const openCount = s.tasks.filter((t) => t.status === 'open').length;

  return (
    <div>
      <PageTop
        title="المهام"
        sub={openCount ? `${openCount} مفتوحة` : 'كل ما تريد إنجازه، مرتب حسب الموعد والأهمية'}
        actions={<button className="btn sm primary" onClick={() => openSheet({ type: 'quick' })}><Icon name="plus" size={15} /> مهمة</button>}
      />

      <div className="col" style={{ gap: 12, marginBottom: 18 }}>
        <Seg
          value={view}
          onChange={setView}
          options={[
            { v: 'open', l: 'المفتوحة' },
            { v: 'waiting', l: `بانتظار${waiting.length ? ` (${waiting.length})` : ''}` },
            { v: 'done', l: 'المنجزة' },
            { v: 'goals', l: 'الأهداف' },
          ]}
        />
        {view !== 'goals' && (
          <div className="row wrap" style={{ gap: 8 }}>
            <div className="row grow" style={{ minWidth: 200, position: 'relative' }}>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في المهام…" />
            </div>
            <div className="row" style={{ gap: 6 }}>
              {(['all', 'study', 'work', 'life'] as const).map((a) => (
                <button key={a} className={`chip btnish ${area === a ? 'on' : ''}`} onClick={() => setArea(a)}>
                  {a === 'all' ? 'الكل' : AREA_LABEL[a]}
                </button>
              ))}
            </div>
          </div>
        )}
        {onlyOverdue && view === 'open' && (
          <div className="notice amber row between">
            <span>تعرض المتأخرة فقط</span>
            <a href="#/tasks">عرض الكل</a>
          </div>
        )}
      </div>

      {view === 'open' &&
        (groups.length && groups.some((g) => g.items.length) ? (
          groups.map((g) => (
            <div key={g.k} style={{ marginBottom: 22 }}>
              <Group title={<span style={{ color: g.k === 'over' ? 'var(--red)' : undefined }}>{g.title} ({g.items.length})</span>}>
                {g.items.map((t) => <TaskRow key={t.id} t={t} />)}
              </Group>
            </div>
          ))
        ) : (
          <div className="card"><Empty icon="tasks" title={q ? 'لا نتائج' : 'لا مهام مفتوحة'}>{q ? '' : 'أضف مهمة بزر + أو اضغط N.'}</Empty></div>
        ))}

      {view === 'waiting' &&
        (waiting.length ? (
          <Group>{waiting.map((t) => <TaskRow key={t.id} t={t} />)}</Group>
        ) : (
          <div className="card"><Empty icon="hourglass" title="لا شيء معلق">عندما تنتظر ردًا من أحد، اكتب اسمه في «بانتظار أحد؟» داخل المهمة.</Empty></div>
        ))}

      {view === 'done' &&
        (done.length ? (
          <Group>{done.slice(0, 200).map((t) => <TaskRow key={t.id} t={t} />)}</Group>
        ) : (
          <div className="card"><Empty icon="check" title="لم تنجز مهام بعد" /></div>
        ))}

      {view === 'goals' && <Goals />}
    </div>
  );
}

function Goals() {
  const s = useApp();
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<Area>('study');
  const add = () => {
    if (!title.trim()) return;
    const id = A.addGoal(title.trim(), area);
    setTitle('');
    openSheet({ type: 'goal', id });
  };
  const goals = [...s.goals].sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt));
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card">
        <div className="small muted" style={{ marginBottom: 10 }}>الأهداف الكبيرة تُقسّم لخطوات صغيرة، والخطوات تدخل خطتك اليومية تلقائيًا حسب أولويتها.</div>
        <div className="row wrap" style={{ gap: 8 }}>
          <input className="input grow" style={{ minWidth: 200 }} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="مثال: رفع معدلي إلى 4.5، إنهاء مشروع التخرج…" />
          <select className="select" style={{ width: 'auto' }} value={area} onChange={(e) => setArea(e.target.value as Area)}>
            {(['study', 'work', 'life'] as Area[]).map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
          </select>
          <button className="btn primary" onClick={add} disabled={!title.trim()}>أضف هدفًا</button>
        </div>
      </div>
      {goals.length ? (
        <div className="cards">
          {goals.map((g) => {
            const ts = s.tasks.filter((t) => t.goalId === g.id && t.status !== 'dropped');
            const d = ts.filter((t) => t.status === 'done').length;
            const next = ts.filter((t) => t.status === 'open').sort((a, b) => a.createdAt - b.createdAt)[0];
            return (
              <div key={g.id} className="card tap" onClick={() => openSheet({ type: 'goal', id: g.id })} style={{ opacity: g.doneAt ? 0.6 : 1 }}>
                <div className="row between">
                  <span className={`chip ${g.area}`}>{AREA_LABEL[g.area]}</span>
                  {g.target && <span className="faint tiny">{fmtDate(g.target, false)}</span>}
                </div>
                <h3 style={{ margin: '10px 0 8px' }}>{g.doneAt ? '✓ ' : ''}{g.title}</h3>
                <Bar value={ts.length ? d / ts.length : 0} color={`var(--${g.area})`} />
                <div className="faint tiny" style={{ marginTop: 8 }}>
                  {ts.length ? `${d}/${ts.length} خطوات` : 'لم تُقسّم بعد — افتحه وأضف خطوات'}
                  {next && ` · التالي: ${next.title}`}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card"><Empty icon="target" title="لا أهداف بعد" /></div>
      )}
    </div>
  );
}
