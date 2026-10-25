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
import { L } from '../lib/i18n';

export function TaskRow({ t }: { t: Task }) {
  const today = todayKey();
  const overdue = t.status === 'open' && t.due && t.due < today;
  const cl = t.checklist.length;
  const cd = t.checklist.filter((c) => c.done).length;
  const meta: React.ReactNode[] = [];
  if (t.due) meta.push(<span key="d" style={overdue ? { color: 'var(--red)' } : t.due === today ? { color: 'var(--accent)' } : undefined}>{relDay(t.due)}{t.dueTime ? ` ${fmtClock(t.dueTime)}` : ''}</span>);
  if (t.priority >= 2) meta.push(<span key="p" style={{ color: t.priority === 3 ? 'var(--red)' : 'var(--amber)' }}>{PRIORITY_LABEL[t.priority]}</span>);
  meta.push(<span key="a">{t.label || AREA_LABEL[t.area]}</span>);
  if (t.estimate) meta.push(<span key="e">{fmtMinutes(t.estimate)}</span>);
  if (cl) meta.push(<span key="c">{cd}/{cl}{L(" خطوات", " steps")}</span>);
  if (t.waitingOn) meta.push(<span key="w" style={{ color: 'var(--violet)' }}>{L("بانتظار ", "Waiting on ")}{t.waitingOn}</span>);
  if (t.plannedFor === today && t.due !== today) meta.push(<span key="pl" style={{ color: 'var(--accent)' }}>{L("في خطة اليوم", "In today's plan")}</span>);
  if (t.deferrals >= 2) meta.push(<span key="df">{L("أُجّلت ", "Postponed ")}{t.deferrals}×</span>);
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
      {t.status === 'open' && t.plannedFor !== today && t.due !== today && t.priority < 3 && !(t.due && t.due < today) && (
        <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); A.planToday(t.id); toast(L('أُضيفت لخطة اليوم', "Added to today's plan")); }} title={L("اعمل عليها اليوم", "Work on it today")}>{L("لليوم", "Today")}</button>
      )}
    </div>
  );
}

type View = 'open' | 'waiting' | 'done' | 'goals' | 'templates';

export function Tasks() {
  const s = useApp();
  const route = useRoute();
  const [view, setView] = useState<View>('open');
  const [area, setArea] = useState<Area | 'all'>('all');
  const [lab, setLab] = useState('');
  const labels = useMemo(() => [...new Set(s.tasks.filter((t) => t.status === 'open').map((t) => t.label).filter((x): x is string => !!x))], [s.tasks]);
  const [q, setQ] = useState('');
  const today = todayKey();
  const onlyOverdue = route.query.get('f') === 'overdue';

  const filtered = useMemo(
    () =>
      s.tasks.filter(
        (t) =>
          (area === 'all' || t.area === area) &&
          (!lab || t.label === lab) &&
          (!q || matches(`${t.title} ${t.label || ''} ${t.notes} ${t.waitingOn || ''} ${t.checklist.map((c) => c.title).join(' ')}`, q)),
      ),
    [s.tasks, area, q, lab],
  );

  const groups = useMemo(() => {
    const open = filtered.filter((t) => t.status === 'open' && !t.waitingOn);
    // the most pressing first inside every group: priority, then the plan's score
    const sorted = [...open].sort((a, b) => b.priority - a.priority || scoreItem(b, today, Date.now()).score - scoreItem(a, today, Date.now()).score);
    const g: { k: string; title: string; items: Task[] }[] = [
      { k: 'over', title: L('متأخرة', "Overdue"), items: [] },
      { k: 'today', title: L('اليوم', "Today"), items: [] },
      { k: 'tom', title: L('غدًا', "Tomorrow"), items: [] },
      { k: 'week', title: L('هذا الأسبوع', "This week"), items: [] },
      { k: 'later', title: L('لاحقًا', "Later"), items: [] },
      { k: 'none', title: L('بلا موعد', "No date"), items: [] },
    ];
    for (const t of sorted) {
      const d = t.due ? diffDays(today, t.due) : null;
      const pinnedToday = t.plannedFor === today;
      // urgent belongs to today whatever its date; important with no later date is today-or-tomorrow
      const nowish = t.priority === 3 || (t.priority === 2 && (d == null || d <= 1));
      if (d != null && d < 0) g[0].items.push(t);
      else if (d === 0 || pinnedToday || nowish) g[1].items.push(t);
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
        title={L("المهام", "Tasks")}
        sub={openCount ? L(`${openCount} مفتوحة`, `${openCount} open`) : L('كل ما تريد إنجازه، مرتب حسب الموعد والأهمية', "Everything you want to get done, sorted by date and importance")}
        actions={<>
          <button className="btn sm ghost" onClick={() => openSheet({ type: 'ai-import' })}>{L('استيراد', 'Import')}</button>
          <button className="btn sm primary" onClick={() => openSheet({ type: 'quick' })}><Icon name="plus" size={15} />{L(" مهمة", " Task")}</button>
        </>}
      />

      <div className="col" style={{ gap: 12, marginBottom: 18 }}>
        <Seg
          value={view}
          onChange={setView}
          options={[
            { v: 'open', l: L('المفتوحة', "Open") },
            { v: 'waiting', l: L(`بانتظار${waiting.length ? ` (${waiting.length})` : ''}`, `Waiting${waiting.length ? ` (${waiting.length})` : ''}`) },
            { v: 'done', l: L('المنجزة', "Done") },
            { v: 'goals', l: L('الأهداف', "Goals") },
            { v: 'templates', l: L('القوالب', 'Templates') },
          ]}
        />
        {view !== 'goals' && view !== 'templates' && (
          <div className="row wrap" style={{ gap: 8 }}>
            <div className="row grow" style={{ minWidth: 200, position: 'relative' }}>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("ابحث في المهام…", "Search tasks…")} />
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {(['all', 'study', 'work', 'life'] as const).map((a) => (
                <button key={a} className={`chip btnish ${area === a && !lab ? 'on' : ''}`} onClick={() => { setArea(a); setLab(''); }}>
                  {a === 'all' ? L('الكل', "All") : AREA_LABEL[a]}
                </button>
              ))}
              {labels.map((x) => (
                <button key={x} className={`chip btnish ${lab === x ? 'on' : ''}`} onClick={() => { setLab(lab === x ? '' : x); setArea('all'); }}>{x}</button>
              ))}
            </div>
          </div>
        )}
        {onlyOverdue && view === 'open' && (
          <div className="notice amber row between">
            <span>{L("تعرض المتأخرة فقط", "Showing overdue only")}</span>
            <a href="#/tasks">{L("عرض الكل", "Show all")}</a>
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
          <div className="card"><Empty icon="tasks" title={q ? L('لا نتائج', "No results") : L('لا مهام مفتوحة', "No open tasks")}>{q ? '' : L('أضف مهمة بزر + أو اضغط N.', "Add a task with the + button or press N.")}</Empty></div>
        ))}

      {view === 'waiting' &&
        (waiting.length ? (
          <Group>{waiting.map((t) => <TaskRow key={t.id} t={t} />)}</Group>
        ) : (
          <div className="card"><Empty icon="hourglass" title={L("لا شيء معلق", "Nothing waiting")}>{L("عندما تنتظر ردًا من أحد، اكتب اسمه في «بانتظار أحد؟» داخل المهمة.", "When you're waiting on someone, write their name in “Waiting on someone?” inside the task.")}</Empty></div>
        ))}

      {view === 'done' &&
        (done.length ? (
          <Group>{done.slice(0, 200).map((t) => <TaskRow key={t.id} t={t} />)}</Group>
        ) : (
          <div className="card"><Empty icon="check" title={L("لم تنجز مهام بعد", "No tasks done yet")} /></div>
        ))}

      {view === 'goals' && <Goals />}
      {view === 'templates' && <TaskTemplates />}
    </div>
  );
}

/** reusable tasks with their steps — pick one in «جديد» → «من قالب» */
function TaskTemplates() {
  const s = useApp();
  const list = s.templates.filter((t) => t.for === 'task').sort((a, b) => b.uses - a.uses);
  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>{L('القالب = مهمة تتكرر بخطواتها الجاهزة. تختاره من «جديد» تحت «من قالب»، أو تحفظ أي مهمة لها خطوات كقالب من تفاصيلها.', 'A template is a recurring task with its steps ready. Pick it in “New” under “From a template”, or save any task with steps as a template from its details.')}</p>
      <Group title={L(`${list.length} قوالب`, `${list.length} templates`)} action={<button onClick={() => openSheet({ type: 'template', forTask: true })}>{L('+ قالب جديد', '+ New template')}</button>}>
        {list.length ? (
          list.map((t) => (
            <div key={t.id} className="r tap" onClick={() => openSheet({ type: 'template', id: t.id })}>
              <span className="ic"><Icon name="layers" size={16} /></span>
              <div className="main-t">
                <div className="lbl">{t.name}</div>
                <div className="sub">{t.steps.length ? t.steps.map((x) => x.title).join(' ← ') : L('بدون خطوات', 'No steps')}</div>
              </div>
              <button className="btn sm" onClick={(e) => { e.stopPropagation(); const id = A.addTaskFromTemplate(t); toast(L(`أُضيفت «${t.name}»`, `Added “${t.name}”`), { buttons: [{ label: L('تفاصيل', 'Details'), fn: () => openSheet({ type: 'task', id }) }] }); }}>
                <Icon name="plus" size={14} /> {L('استخدم', 'Use')}
              </button>
            </div>
          ))
        ) : (
          <div className="r"><span className="faint small">{L('ما عندك قوالب مهام بعد.', 'No task templates yet.')}</span></div>
        )}
      </Group>
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
        <div className="small muted" style={{ marginBottom: 10 }}>{L("الأهداف الكبيرة تُقسّم لخطوات صغيرة، والخطوات تدخل خطتك اليومية تلقائيًا حسب أولويتها.", "Big goals get split into small steps, and the steps enter your daily plan automatically by priority.")}</div>
        <div className="row wrap" style={{ gap: 8 }}>
          <input className="input grow" style={{ minWidth: 200 }} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={L("مثال: رفع معدلي إلى 4.5، إنهاء مشروع التخرج…", "e.g. raise my GPA to 4.5, finish my graduation project…")} />
          <select className="select" style={{ width: 'auto' }} value={area} onChange={(e) => setArea(e.target.value as Area)}>
            {(['study', 'work', 'life'] as Area[]).map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
          </select>
          <button className="btn primary" onClick={add} disabled={!title.trim()}>{L("أضف هدفًا", "Add goal")}</button>
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
                  {ts.length ? L(`${d}/${ts.length} خطوات`, `${d}/${ts.length} steps`) : L('لم تُقسّم بعد — افتحه وأضف خطوات', "Not split yet — open it and add steps")}
                  {next && L(` · التالي: ${next.title}`, ` · next: ${next.title}`)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card"><Empty icon="target" title={L("لا أهداف بعد", "No goals yet")} /></div>
      )}
    </div>
  );
}
