import { useMemo, useState } from 'react';
import { Bar, Check, Collapse, Empty, Seg, useNow } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useApp, useSaveStatus } from '../lib/store';
import * as A from '../lib/actions';
import { addDays, daysWord, fmtClock, fmtDate, fmtMinutes, fmtTime, relDay, timeAgo, todayKey } from '../lib/dates';
import { planDay, type DayPlan, type PlanItem } from '../lib/engine/planner';
import { planStudy, type StudyPlan } from '../lib/engine/study';
import { buildInsights, type Insight } from '../lib/engine/insights';
import { nextStep, procStage } from '../lib/engine/procedures';
import { openSheet } from '../ui/sheets';
import { toast } from '../ui/toast';
import { go } from '../ui/router';
import { autoReplanUI, completeTaskUI, deferTaskUI, runAction, toggleStepUI } from '../ui/ops';
import { openRef } from '../ui/Shell';
import { PageTop } from '../ui/PageTop';
import { WeekView } from './Week';
import { CoachCard } from '../ui/Coach';
import { TodayQuota } from './Study';
import { L, startEdge } from '../lib/i18n';

function greeting(h: number) {
  if (h < 5) return L('ليلة هادئة', "Quiet night");
  if (h < 12) return L('صباح الخير', "Good morning");
  if (h < 17) return L('مساء النور', "Good afternoon");
  return L('مساء الخير', "Good evening");
}

export function SaveDot() {
  const st = useSaveStatus();
  const label = st === 'error' ? L('تعذر الحفظ', "Couldn't save") : st === 'saving' ? L('يحفظ…', "Saving…") : L('محفوظ', "Saved");
  return (
    <span className={`save-dot ${st}`} title={st === 'error' ? L('تعذر الحفظ على هذا الجهاز', "Couldn't save on this device") : L('بياناتك محفوظة على هذا الجهاز', "Your data is saved on this device")}>
      <i /> <span className="hide-mobile">{label}</span>
    </span>
  );
}

const ALERT_ICON: Record<string, string> = { critical: 'alert', warn: 'alert', info: 'info', ask: 'question' };

export function AlertRow({ i }: { i: Insight }) {
  return (
    <div className={`alert-row ${i.level}`}>
      <div className="ic"><Icon name={ALERT_ICON[i.level]} size={15} /></div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="t">{i.title}</div>
        {i.detail && <div className="d">{i.detail}</div>}
        {i.actions.length > 0 && (
          <div className="acts">
            {i.actions.map((a, n) => (
              <button key={a.label + n} className={`btn sm ${n === 0 && i.level !== 'ask' ? 'primary' : ''}`} onClick={() => runAction(a)}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="icon-btn sm" onClick={() => A.snooze(i.id, 20 * 3600_000)} aria-label={L("إخفاء لليوم", "Hide for today")} title={L("إخفاء لليوم", "Hide for today")}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

/** what tapping / ticking a plan item does, by kind */
function usePlanActions(study: StudyPlan) {
  const s = useApp();
  return {
    open(it: PlanItem) {
      if (it.kind === 'task') openSheet({ type: 'task', id: it.id });
      else if (it.kind === 'procedure') go(`work/${it.id}`);
      else openSheet({ type: 'exam', id: it.id });
    },
    check(it: PlanItem) {
      if (it.kind === 'task') completeTaskUI(it.id);
      else if (it.kind === 'procedure') {
        const p = s.procedures.find((x) => x.id === it.id);
        const n = p && nextStep(p);
        if (n) toggleStepUI(it.id, n.id);
      } else {
        const ex = s.exams.find((e) => e.id === it.id);
        openSheet({ type: 'study-log', courseId: ex?.courseId, minutes: it.minutes });
      }
    },
    start(it: PlanItem) {
      if (it.kind === 'study') {
        const ex = s.exams.find((e) => e.id === it.id);
        const ep = study.exams.find((p) => p.exam.id === it.id);
        A.startTimer({ kind: 'study', refId: it.id, courseId: ex?.courseId, unitId: ep?.todayUnits[0]?.unit.id, label: it.title });
      } else A.startTimer({ kind: it.kind, refId: it.id, label: it.title });
    },
  };
}

function metaLine(it: PlanItem) {
  const parts: string[] = [];
  if (it.dueTime) parts.push(fmtClock(it.dueTime));
  parts.push(`${it.guessed ? '~' : ''}${fmtMinutes(it.minutes)}`);
  // the priority level already shows as a badge/prefix — don't repeat it here
  const levels = [L('عاجلة', 'Urgent'), L('مهمة', 'Important')];
  const reason = it.reasons.find((r) => !levels.includes(r));
  if (it.sub) parts.push(it.sub);
  else if (reason) parts.push(reason);
  return parts.join(' · ');
}

function NextUp({ it, study }: { it: PlanItem; study: StudyPlan }) {
  const s = useApp();
  const act = usePlanActions(study);
  const running = s.timer?.refId === it.id;
  return (
    <div className="next">
      <div className="row between">
        <span className="k">{running ? L('تعمل عليه الآن', "Working on it now") : L('ابدأ بهذا', "Start with this")}</span>
        {it.level === 'urgent' ? (
          <span className="chip red"><Icon name="alert" size={12} />{L(" عاجلة — ضرورية جدًا", " Urgent — very important")}</span>
        ) : it.level === 'important' ? (
          <span className="chip amber">{L("مهمة", "Important")}</span>
        ) : it.must ? (
          <span className="chip red">{L("لا يتأجل", "Can't be postponed")}</span>
        ) : null}
      </div>
      <div className="t" onClick={() => act.open(it)} style={{ cursor: 'pointer' }}>
        {it.courseColor && <span className="dot" style={{ background: it.courseColor, marginInlineEnd: 8, verticalAlign: 'middle' }} />}
        {it.title}
      </div>
      <div className="muted small">{metaLine(it)}</div>
      {it.level === 'important' && <div className="tiny" style={{ marginTop: 2, color: 'var(--amber)' }}>{it.reasons[0]}</div>}
      {it.reasons.length > 0 && it.sub && <div className="faint tiny" style={{ marginTop: 2 }}>{it.reasons.join(' · ')}</div>}
      <div className="row" style={{ marginTop: 14, gap: 8 }}>
        {!running && (
          <button className="btn primary" onClick={() => act.start(it)}>
            <Icon name="play" size={14} />{L(" ابدأ", " Start")}</button>
        )}
        <button className="btn" onClick={() => act.check(it)}>
          <Icon name="check" size={16} /> {it.kind === 'study' ? L('سجّل ما ذاكرته', "Log what I studied") : it.kind === 'procedure' ? L('تمت الخطوة', "Step done") : L('أنجزتها', "Done it")}
        </button>
        {(it.kind === 'task' || it.kind === 'procedure') && !it.must && it.level !== 'urgent' && (
          <button className="btn ghost" onClick={() => (it.kind === 'task' ? deferTaskUI(it.id) : (A.deferMany([it.id]), toast(L('نُقل إلى الغد', "Moved to tomorrow"), { undoable: true })))}>{L("غدًا", "Tomorrow")}</button>
        )}
      </div>
    </div>
  );
}

function PlanRow({ it, start, study }: { it: PlanItem; start?: number; study: StudyPlan }) {
  const act = usePlanActions(study);
  return (
    <div className="r tap" onClick={() => act.open(it)} style={it.level === 'urgent' ? { boxShadow: startEdge('var(--red)') } : undefined}>
      <Check on={false} onClick={() => act.check(it)} label={it.kind === 'study' ? L('سجّل المذاكرة', "Log study") : L('إنجاز', "Complete")} />
      <div className="main-t">
        <div className="lbl">
          {it.courseColor && <span className="dot" style={{ background: it.courseColor, marginInlineEnd: 6 }} />}
          {it.kind === 'procedure' && <Icon name="work" size={14} className="faint" style={{ marginInlineEnd: 6, verticalAlign: '-2px' }} />}
          {it.title}
        </div>
        <div className="sub">
          {it.level === 'urgent' && <span style={{ color: 'var(--red)', fontWeight: 600 }}>{L("عاجلة · ", "Urgent · ")}</span>}
          {it.level === 'important' && <span style={{ color: 'var(--amber)' }}>{it.must ? L('مهمة · لا تؤجلها أكثر · ', "Important · don't postpone again · ") : L('مهمة · اليوم أو بكرة · ', "Important · today or tomorrow · ")}</span>}
          {metaLine(it)}
          {it.must && !it.level && <span style={{ color: 'var(--red)' }}>{L(" · لا يتأجل", " · can't be postponed")}</span>}
        </div>
      </div>
      {start != null && <span className="faint tiny num hide-mobile">~{fmtTime(start)}</span>}
      <button className="icon-btn sm" onClick={(e) => { e.stopPropagation(); act.start(it); }} aria-label={L("ابدأ مؤقت", "Start timer")}><Icon name="play" size={13} /></button>
    </div>
  );
}

function DaySummary({ plan }: { plan: DayPlan }) {
  const s = useApp();
  const [edit, setEdit] = useState(false);
  const override = s.dayOverrides[plan.today];
  const free = Math.max(0, plan.remaining - plan.load);
  return (
    <div className="summary">
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <div className="big num">{fmtMinutes(plan.load)} <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>{L("من عمل مخطط", "of planned work")}</span></div>
        <button className="btn sm ghost" onClick={() => setEdit(!edit)} style={{ paddingInline: 6 }}>
          {override != null ? L(`متاح ${fmtMinutes(override)}`, `${fmtMinutes(override)} available`) : L('وقتي اليوم', "My time today")} <Icon name="edit" size={13} />
        </button>
      </div>
      <Bar value={plan.remaining ? plan.load / plan.remaining : plan.load ? 1 : 0} color={plan.overloaded ? 'var(--red)' : plan.load / Math.max(1, plan.remaining) > 0.85 ? 'var(--amber)' : 'var(--green)'} />
      <div className="row between small">
        <span className="muted">
          {plan.overloaded ? (
            <span style={{ color: 'var(--red)' }}>{L("أكثر من وقتك المتبقي بـ ", "Over your remaining time by ")}{fmtMinutes(plan.overBy)}</span>
          ) : plan.load ? (
            <>{L("يتبقى لك ", "You have ")}{fmtMinutes(free)}{L(" فراغ · تنتهي ~", " free · done by ~")}{fmtTime(Date.now() + plan.load * 60000)}</>
          ) : (
            <>{L("وقتك المتاح ", "Your available time ")}{fmtMinutes(plan.remaining)}</>
          )}
        </span>
        {plan.doneMinutes > 0 && <span className="faint">{L("أنجزت ", "Done ")}{fmtMinutes(plan.doneMinutes)}</span>}
      </div>
      {plan.overloaded && (
        <button className="btn sm" style={{ justifySelf: 'start' }} onClick={autoReplanUI}>
          <Icon name="layers" size={14} />{L(" أعد الجدولة تلقائيًا", " Reschedule automatically")}</button>
      )}
      {edit && (
        <div className="col" style={{ gap: 8, paddingTop: 4 }}>
          <div className="small muted">{L("كم وقتًا حرًا عندك اليوم للمذاكرة والمهام؟", "How much free time do you have today for study and tasks?")}</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {[0, 60, 120, 180, 240, 300, 360, 480].map((m) => (
              <button key={m} className={`chip btnish ${override === m ? 'on' : ''}`} onClick={() => { A.setDayOverride(plan.today, m); setEdit(false); }}>
                {m === 0 ? L('مشغول', "Busy") : fmtMinutes(m)}
              </button>
            ))}
            {override != null && <button className="chip btnish" onClick={() => { A.setDayOverride(plan.today, null); setEdit(false); }}>{L("كالمعتاد", "As usual")}</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** next 7 days: exams, deadlines, procedures due — one compact list */
function Upcoming({ study }: { study: StudyPlan }) {
  const s = useApp();
  const today = todayKey();
  const end = addDays(today, 7);
  const items: { day: string; title: string; sub: string; icon: string; color?: string; open: () => void }[] = [];
  for (const ep of study.exams)
    if (ep.exam.date > today && ep.exam.date <= addDays(today, 21))
      items.push({
        day: ep.exam.date,
        title: L(`اختبار ${ep.course.name} — ${ep.exam.title}`, `${ep.course.name} exam — ${ep.exam.title}`),
        sub: ep.status === 'behind' ? L('الوقت لا يكفي — افتح الخطة', "Not enough time — open the plan") : ep.status === 'tight' ? L('الخطة ضيقة', "Tight plan") : ep.status === 'unknown' ? L('حدد الدروس المطلوبة', "Set the required lessons") : L(`جاهزيتك ${Math.round(ep.progress * 100)}%`, `Readiness ${Math.round(ep.progress * 100)}%`),
        icon: 'flag',
        color: ep.status === 'behind' ? 'var(--red)' : ep.status === 'tight' ? 'var(--amber)' : ep.course.color,
        open: () => openSheet({ type: 'exam', id: ep.exam.id }),
      });
  for (const t of s.tasks)
    if (t.status === 'open' && t.due && t.due > today && t.due <= end)
      items.push({ day: t.due, title: t.title, sub: t.dueTime ? fmtClock(t.dueTime) : L('موعد نهائي', "Deadline"), icon: 'tasks', open: () => openSheet({ type: 'task', id: t.id }) });
  for (const p of s.procedures)
    if (!p.archived && !p.completedAt && p.due && p.due > today && p.due <= end)
      items.push({ day: p.due, title: p.title, sub: L('إجراء عمل', "Work procedure"), icon: 'work', open: () => go(`work/${p.id}`) });
  items.sort((a, b) => a.day.localeCompare(b.day));
  if (!items.length) return null;
  return (
    <section>
      <div className="group-title">
        <span>{L("القادم", "Coming up")}</span>
        <button onClick={() => go('week')}>{L("الأسبوع كاملًا", "Whole week")}</button>
      </div>
      <div className="rows">
        {items.slice(0, 6).map((i, n) => (
          <button key={n} className="r" onClick={i.open}>
            <span className="ic" style={i.color ? { color: i.color } : undefined}><Icon name={i.icon} size={16} /></span>
            <span className="main-t">
              <div className="lbl">{i.title}</div>
              <div className="sub">{i.sub}</div>
            </span>
            <span className="val small">{relDay(i.day, today)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** brain-dump from focus sessions: turn into a task or let it go */
function Thoughts() {
  const s = useApp();
  if (!s.thoughts.length) return null;
  return (
    <section>
      <div className="group-title"><span>{L("أفكار من جلسات التركيز (", "Thoughts from focus sessions (")}{s.thoughts.length})</span></div>
      <div className="rows">
        {[...s.thoughts].reverse().map((t) => (
          <div key={t.id} className="r">
            <span className="ic"><Icon name="note" size={15} /></span>
            <span className="main-t">
              <div className="lbl">{t.text}</div>
              <div className="sub">{t.during ? L(`أثناء «${t.during}» · `, `During “${t.during}” · `) : ''}{timeAgo(t.at)}</div>
            </span>
            <button className="btn sm" onClick={() => { const id = A.addTask({ title: t.text }); A.removeThought(t.id); toast(L('صارت مهمة', "Turned into a task"), { buttons: [{ label: L('تفاصيل', "Details"), fn: () => openSheet({ type: 'task', id }) }] }); }}>{L("مهمة", "Important")}</button>
            <button className="icon-btn sm" onClick={() => { A.removeThought(t.id); toast(L('حُذفت', "Deleted"), { undoable: true }); }} aria-label={L("حذف", "Delete")}><Icon name="x" size={14} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Alerts({ list }: { list: Insight[] }) {
  const [all, setAll] = useState(false);
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 3);
  return (
    <section>
      <div className="group-title">
        <span>{L("يحتاج قرارك", "Needs your decision")}</span>
        {list.length > 3 && <button onClick={() => setAll(!all)}>{all ? L('أقل', "Less") : L(`الكل (${list.length})`, `All (${list.length})`)}</button>}
      </div>
      <div className="rows">{shown.map((i) => <AlertRow key={i.id} i={i} />)}</div>
    </section>
  );
}

export function Today({ view }: { view: 'day' | 'week' }) {
  const s = useApp();
  const now = useNow();
  const study = useMemo(() => planStudy(s, now), [s, now]);
  const plan = useMemo(() => planDay(s, now, study), [s, now, study]);
  const insights = useMemo(() => buildInsights(s, plan, study, now).filter((i) => !i.id.startsWith('week-heavy')), [s, plan, study, now]);
  const today = todayKey(now);
  const h = new Date(now).getHours();
  const doneToday = s.tasks.filter((t) => t.status === 'done' && t.completedAt && todayKey(t.completedAt) === today);
  const waiting = s.procedures.filter((p) => !p.archived && !p.completedAt && procStage(p) === 'waiting').length;
  const [first, ...afterFirst] = plan.items;
  // study is listed in full under «مطلوب منك اليوم — المذاكرة», so it isn't repeated here
  const rest = afterFirst.filter((i) => i.kind !== 'study');
  const empty = !s.tasks.length && !s.procedures.length && !s.courses.length;

  let t = now + (first ? first.minutes * 60000 : 0);
  // start times count study blocks too, so the clock stays honest
  const startOf = new Map<PlanItem, number>();
  for (const i of afterFirst) {
    startOf.set(i, t);
    t += i.minutes * 60000;
  }

  return (
    <div>
      <PageTop
        title={view === 'week' ? L('الأسبوع', "Week") : L(`${greeting(h)}${s.settings.name ? `، ${s.settings.name}` : ''}`, `${greeting(h)}${s.settings.name ? `, ${s.settings.name}` : ''}`)}
        sub={
          <span className="row" style={{ gap: 10 }}>
            {fmtDate(today)} <SaveDot />
          </span>
        }
      />
      <div style={{ marginBottom: 18 }}>
        <Seg value={view} onChange={(v) => go(v === 'week' ? 'week' : 'today')} options={[{ v: 'day', l: L('اليوم', "Today") }, { v: 'week', l: L('الأيام السبعة', "Next 7 days") }]} />
      </div>

      {view === 'week' ? (
        <WeekView />
      ) : empty ? (
        <div className="card">
          <Empty icon="today" title={L("ابدأ بإضافة ما يشغلك", "Start by adding what's on your mind")}>{L("أضف مهمة، أو إجراء عمل بخطواته، أو مادة واختبارها — وسأرتب لك يومك حسب وقتك المتاح.", "Add a task, a work procedure with its steps, or a course and its exam — and I'll arrange your day around your available time.")}<div className="row" style={{ justifyContent: 'center', marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary sm" onClick={() => openSheet({ type: 'quick' })}><Icon name="plus" size={15} />{L(" مهمة", " Task")}</button>
              <button className="btn sm" onClick={() => openSheet({ type: 'quick', text: '' , mode: 'proc' })}>{L("إجراء عمل", "Work procedure")}</button>
              <button className="btn sm" onClick={() => openSheet({ type: 'course' })}>{L("مادة دراسية", "Course")}</button>
            </div>
          </Empty>
        </div>
      ) : (
        <div className="two-col">
          <div className="stack" style={{ minWidth: 0 }}>
            {s.settings.coach.enabled && <CoachCard plan={plan} now={now} />}
            {first ? <NextUp it={first} study={study} /> : (
              <div className="card"><Empty icon="check" title={L("لا شيء ملح اليوم", "Nothing pressing today")}>{L("تقدر تتقدم في شيء من «لو بقي وقت» أو ترتاح.", "Make progress on something under “If there's time”, or rest.")}</Empty></div>
            )}
            <DaySummary plan={plan} />
            <TodayQuota plan={study} title={L('مطلوب منك اليوم — المذاكرة', 'Required today — study')} />
            {rest.length > 0 && (
              <section>
                <div className="group-title"><span>{L("بعده", "After that")}</span><span className="faint" style={{ fontWeight: 500 }}>{rest.length}</span></div>
                <div className="rows">{rest.map((it) => <PlanRow key={it.kind + it.id} it={it} start={startOf.get(it)} study={study} />)}</div>
              </section>
            )}
            {plan.later.length > 0 && (
              <Collapse title={L("لو بقي وقت", "If there's time")} count={plan.later.length}>
                <div className="rows">{plan.later.slice(0, 12).map((it) => <PlanRow key={it.kind + it.id} it={it} study={study} />)}</div>
              </Collapse>
            )}
            {doneToday.length > 0 && (
              <Collapse title={L("أنجزت اليوم", "Done today")} count={doneToday.length}>
                <div className="rows">
                  {doneToday.map((t) => (
                    <div key={t.id} className="r done tap" onClick={() => openSheet({ type: 'task', id: t.id })}>
                      <Check on onClick={() => A.reopenTask(t.id)} />
                      <span className="main-t"><div className="lbl">{t.title}</div></span>
                      {t.spent > 0 && <span className="faint tiny">{fmtMinutes(t.spent)}</span>}
                    </div>
                  ))}
                </div>
              </Collapse>
            )}
          </div>

          <div className="stack" style={{ minWidth: 0 }}>
            {s.missed.length > 0 && (
              <section>
                <div className="group-title">
                  <span>{L("تذكيرات فاتتك", "Missed reminders")}</span>
                  <button onClick={A.clearMissed}>{L("مسح", "Clear")}</button>
                </div>
                <div className="rows">
                  {s.missed.slice(-4).reverse().map((m) => (
                    <button key={m.id + m.at} className="r" onClick={() => m.ref && openRef(m.ref)}>
                      <span className="ic"><Icon name="bell" size={15} /></span>
                      <span className="main-t"><div className="lbl">{m.title}</div></span>
                      <span className="val tiny">{timeAgo(m.at, now)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            <Alerts list={insights} />
            <Thoughts />
            <Upcoming study={study} />
            {s.procedures.some((p) => !p.archived && !p.completedAt) && (
              <section>
                <div className="rows">
                  <button className="r" onClick={() => go('work')}>
                    <span className="ic" style={{ color: 'var(--work)' }}><Icon name="work" size={16} /></span>
                    <span className="main-t">
                      <div className="lbl">{L("إجراءات العمل", "Work procedures")}</div>
                      <div className="sub">
                        {s.procedures.filter((p) => !p.archived && !p.completedAt).length}{L(" مفتوحة", " open")}{waiting ? L(` · ${waiting} بانتظار رد`, ` · ${waiting} waiting for a reply`) : ''}
                      </div>
                    </span>
                    <Icon name="chevron" size={16} className="chev-end" />
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { daysWord };
