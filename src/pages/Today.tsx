import { useMemo, useState } from 'react';
import { Bar, Check, Collapse, Empty, Ring, Seg, useNow } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useApp, useSaveStatus } from '../lib/store';
import * as A from '../lib/actions';
import { addDays, daysWord, fmtClock, fmtDate, fmtMinutes, fmtTime, relDay, timeAgo, todayKey } from '../lib/dates';
import { planDay, suggestDeferrals, weekLoad, type DayPlan, type PlanItem } from '../lib/engine/planner';
import { planStudy, portionText, type StudyPlan } from '../lib/engine/study';
import { buildInsights, type Insight } from '../lib/engine/insights';
import { nextStep, procStage } from '../lib/engine/procedures';
import { openSheet } from '../ui/sheets';
import { toast } from '../ui/toast';
import { go } from '../ui/router';
import { autoReplanUI, completeTaskUI, deferTaskUI, runAction, toggleStepUI } from '../ui/ops';
import { openRef } from '../ui/Shell';
import { PageTop } from '../ui/PageTop';
import { WeekView } from './Week';
import { L, startEdge } from '../lib/i18n';
import { isNight, workStart } from '../lib/engine/capacity';
import { InstallCard } from '../ui/InstallCard';

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
    <div className="tile hero-t">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <span className="k">{running ? L('تعمل عليه الآن', "Working on it now") : isNight(Date.now()) ? L('أول شيء الصبح', 'First thing in the morning') : L('ابدأ بهذا', "Start with this")}</span>
        {it.level === 'urgent' ? (
          <span className="chip"><Icon name="alert" size={12} />{L(" عاجلة", " Urgent")}</span>
        ) : it.level === 'important' ? (
          <span className="chip">{L("مهمة", "Important")}</span>
        ) : it.must ? (
          <span className="chip">{L("لا يتأجل", "Can't be postponed")}</span>
        ) : null}
      </div>
      <div className="t" onClick={() => act.open(it)} style={{ cursor: 'pointer' }}>
        {it.courseColor && <span className="dot" style={{ background: '#fff', marginInlineEnd: 8, verticalAlign: 'middle' }} />}
        {it.title}
      </div>
      <div className="m">{metaLine(it)}</div>
      {it.reasons.length > 0 && <div className="m2">{it.level ? it.reasons[0] : it.reasons.join(' · ')}</div>}
      <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
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

/** «يومك»: how far the day has got, as a ring */
function RingTile({ plan }: { plan: DayPlan }) {
  const done = plan.doneMinutes;
  const left = plan.load;
  const p = done + left ? done / (done + left) : 0;
  return (
    <div className="tile">
      <div className="k2"><Icon name="clock" size={14} /> {L('يومك', 'Your day')}</div>
      <div className="col" style={{ gap: 8, alignItems: 'flex-start' }}>
        <Ring value={p} size={76} stroke={9} />
        <div>
          <div className="tv num">{left ? fmtMinutes(left) : '✓'}</div>
          <div className="faint tiny">{left ? L('باقي عليك', 'left to do') : L('ما بقي شيء', 'nothing left')}{done ? L(` · أنجزت ${fmtMinutes(done)}`, ` · ${fmtMinutes(done)} done`) : ''}</div>
        </div>
      </div>
    </div>
  );
}

/** «عاجل»: what can't wait */
function UrgentTile({ plan }: { plan: DayPlan }) {
  const urgent = plan.items.filter((i) => i.level === 'urgent');
  const important = plan.items.filter((i) => i.level === 'important');
  const list = urgent.length ? urgent : important;
  const cls = urgent.length ? 'urgent' : important.length ? 'amber' : 'calm';
  return (
    <div className={`tile ut ${cls}`}>
      <div className="k2"><Icon name="flag" size={14} /> {urgent.length ? L('عاجل', 'Urgent') : important.length ? L('مهم', 'Important') : L('عاجل', 'Urgent')}</div>
      <div className="tv num">{list.length ? list.length : '✓'}</div>
      <div className="faint tiny" style={{ color: 'inherit', opacity: 0.8 }}>
        {list.length ? (urgent.length ? L('لا تتأجل أبدًا — ', "Never postponed — ") : L('اليوم أو بكرة — ', "Today or tomorrow — ")) + list[0].title : L('لا شيء عاجل اليوم', 'Nothing urgent today')}
      </div>
    </div>
  );
}

/** study required today, exam by exam, with the actual lessons */
function StudyTile({ study }: { study: StudyPlan }) {
  const rows = study.exams.filter((ep) => ep.status === 'unknown' || ep.inReview || ep.quota > 0);
  if (!rows.length) return null;
  const left = rows.reduce((a, ep) => a + (ep.inReview ? 0 : ep.todayMinutes), 0);
  return (
    <div className="tile">
      <div className="k2 row between">
        <span><Icon name="study" size={14} /> {L('المذاكرة المطلوبة اليوم', 'Study required today')}</span>
        <span className="faint">{left ? L(`باقي ${fmtMinutes(left)}`, `${fmtMinutes(left)} left`) : L('أنجزت حصص اليوم ✓', "Today's quotas done ✓")}</span>
      </div>
      <div className="col" style={{ gap: 14 }}>
        {rows.map((ep) => {
          if (ep.status === 'unknown')
            return (
              <button key={ep.exam.id} className="r tap" style={{ padding: 0, minHeight: 0 }} onClick={() => openSheet({ type: 'exam', id: ep.exam.id })}>
                <span className="dot" style={{ background: ep.course.color }} />
                <span className="grow">{ep.course.name}: <span style={{ color: 'var(--violet)' }}>{L('حدد الدروس المطلوبة لأحسب حصتك', 'Set the required lessons so I can work out your quota')}</span></span>
              </button>
            );
          if (ep.inReview)
            return (
              <div key={ep.exam.id}>
                <div className="row" style={{ gap: 8 }}><span className="dot" style={{ background: ep.course.color }} /><b>{ep.course.name}</b></div>
                <div className="faint small">{L('أيام المراجعة: لا مادة جديدة — راجع ملخصاتك وحل أسئلة سابقة.', 'Review days: no new material — go over your summaries and past questions.')}</div>
              </div>
            );
          const doneAll = ep.todayMinutes <= 0;
          return (
            <div key={ep.exam.id}>
              <div className="row between">
                <span className="row" style={{ gap: 8, minWidth: 0 }}><span className="dot" style={{ background: ep.course.color }} /><b className="ellipsis">{ep.course.name}</b></span>
                <span className="row" style={{ gap: 6 }}>
                  <span className="num" style={{ fontWeight: 700, color: doneAll ? 'var(--green)' : undefined }}>{doneAll ? '✓' : fmtMinutes(ep.todayMinutes)}</span>
                  {!doneAll && (
                    <button className="icon-btn sm" aria-label={L('ابدأ', 'Start')} onClick={() => A.startTimer({ kind: 'study', refId: ep.exam.id, courseId: ep.course.id, unitId: ep.portion[0]?.unit.id, label: L(`مذاكرة ${ep.course.name}`, `Study ${ep.course.name}`) })}>
                      <Icon name="play" size={13} />
                    </button>
                  )}
                </span>
              </div>
              <div style={{ margin: '6px 0' }}><Bar value={ep.quota ? ep.doneToday / ep.quota : 0} color={ep.course.color} /></div>
              {!doneAll && ep.portion.length > 0 && <div className="faint tiny" style={{ lineHeight: 1.7 }}>{ep.portion.map((x) => portionText(x, ep.course.sizeLabel)).join(L('، ', ', '))}</div>}
              {ep.status === 'behind' || ep.status === 'tight' ? <div className="tiny" style={{ marginTop: 4, color: ep.status === 'behind' ? 'var(--red)' : 'var(--amber)' }}>{L('الحصة أكبر لأن الوقت ضيق — ', 'The quota is bigger because time is tight — ')}<button className="linkish" onClick={() => go('study')}>{L('افتح الخطة', 'open the plan')}</button></div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekTile({ study }: { study: StudyPlan }) {
  const s = useApp();
  const now = useNow();
  const days = useMemo(() => weekLoad(s, now, 7, study), [s, now, study]);
  const today = todayKey(now);
  if (!days.some((d) => d.day !== today && d.study + d.tasks > 0)) return null;
  return (
    <div className="tile tap" role="button" tabIndex={0} onClick={() => go('week')} onKeyDown={(e) => e.key === 'Enter' && go('week')}>
      <div className="k2 row between"><span><Icon name="cal" size={14} /> {L('أسبوعك', 'Your week')}</span><span className="faint">{L('افتح الأيام السبعة', 'Open next 7 days')}</span></div>
      <div className="wbars">
        {days.map((d) => {
          const ratio = d.capacity ? (d.study + d.tasks) / d.capacity : d.study + d.tasks ? 1.4 : 0;
          return (
            <div key={d.day} className={d.day === today ? 'on' : ''}>
              <i style={{ height: `${Math.max(6, Math.min(1, ratio) * 64)}px`, ...(d.overloaded ? { background: 'var(--red)' } : null) }} />
              <span>{d.day === today ? L('اليوم', 'Today') : fmtDate(d.day).split(' ')[0]}</span>
            </div>
          );
        })}
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
  const done = plan.doneMinutes;
  const left = plan.load;
  const movable = useMemo(() => suggestDeferrals(plan, s), [plan, s]);
  const usedUp = plan.capacity - done <= 0;

  // one sentence that explains how the numbers relate
  let status: React.ReactNode;
  let tone = 'var(--muted)';
  const start = workStart(Date.now());
  if (!left) status = L('ما بقي عليك شيء اليوم ✓', 'Nothing left for today ✓');
  else if (isNight(Date.now()))
    status = L(`الوقت متأخر — نام الحين. خطتك (${fmtMinutes(left)}) تبدأ الصبح، وتخلص تقريبًا ${fmtTime(start + left * 60000)}.`, `It's late — go to sleep. Your plan (${fmtMinutes(left)}) starts in the morning and ends around ${fmtTime(start + left * 60000)}.`);
  else if (!plan.overloaded)
    status = L(`يكفيك الوقت: تخلص تقريبًا ${fmtTime(Date.now() + left * 60000)}${plan.remaining - left > 0 ? `، ويبقى لك ${fmtMinutes(plan.remaining - left)} فراغ` : ''}.`, `You have enough time: done around ${fmtTime(Date.now() + left * 60000)}${plan.remaining - left > 0 ? `, with ${fmtMinutes(plan.remaining - left)} to spare` : ''}.`);
  else {
    tone = 'var(--red)';
    status = usedUp
      ? L(`خلّصت وقتك المحدد لليوم (${fmtMinutes(plan.capacity)}) واشتغلت ${fmtMinutes(done)} — الباقي كله فوق وقتك.`, `You've used today's set time (${fmtMinutes(plan.capacity)}) and worked ${fmtMinutes(done)} — everything left is beyond it.`)
      : plan.remaining < plan.capacity - done
        ? L(`ما بقي من يومك إلا ${fmtMinutes(plan.remaining)} تقريبًا، وعليك ${fmtMinutes(left)} — يزيد ${fmtMinutes(plan.overBy)}.`, `Only about ${fmtMinutes(plan.remaining)} of your day is left and you have ${fmtMinutes(left)} — ${fmtMinutes(plan.overBy)} too much.`)
        : L(`باقي من وقتك ${fmtMinutes(plan.remaining)} وعليك ${fmtMinutes(left)} — يزيد ${fmtMinutes(plan.overBy)}.`, `You have ${fmtMinutes(plan.remaining)} left and ${fmtMinutes(left)} to do — ${fmtMinutes(plan.overBy)} too much.`);
  }

  return (
    <div className="tile summary-t">
      <div className="small" style={{ color: tone }}>{status}</div>
      <div className="row between wrap" style={{ gap: 8 }}>
        <button className="btn sm ghost" onClick={() => setEdit(!edit)} style={{ paddingInline: 6 }}>
          <Icon name="clock" size={13} /> {L(`وقتك اليوم: ${fmtMinutes(plan.capacity)}`, `Your time today: ${fmtMinutes(plan.capacity)}`)}{override != null ? L(' (معدّل)', ' (changed)') : ''} <Icon name="edit" size={13} />
        </button>
        {plan.overloaded &&
          (movable.length ? (
            <button className="btn sm" onClick={autoReplanUI}>
              <Icon name="layers" size={14} /> {L(`أجّل اللي يتأجل لبكرة (${movable.length})`, `Move what can wait to tomorrow (${movable.length})`)}
            </button>
          ) : (
            <span className="faint tiny">{L('كل الباقي عاجل أو مطلوب — زد وقتك اليوم لو تقدر.', 'Everything left is urgent or required — add time today if you can.')}</span>
          ))}
      </div>
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
  const insights = useMemo(() => {
    const planned = new Set(plan.items.map((i) => i.id));
    // urgent items already sit in the hero / «عاجل» tile / list — don't repeat them as alerts
    return buildInsights(s, plan, study, now).filter((i) => {
      if (i.id.startsWith('week-heavy') || i.id.startsWith('urgent:')) return false;
      if (i.id.startsWith('urgent-proc:')) return !planned.has(i.id.split(':')[1]);
      return true;
    });
  }, [s, plan, study, now]);
  const today = todayKey(now);
  const h = new Date(now).getHours();
  const doneToday = s.tasks.filter((t) => t.status === 'done' && t.completedAt && todayKey(t.completedAt) === today);
  const waiting = s.procedures.filter((p) => !p.archived && !p.completedAt && procStage(p) === 'waiting').length;
  const [first, ...afterFirst] = plan.items;
  // study is listed in full under «المذاكرة المطلوبة اليوم», so it isn't repeated here
  const rest = afterFirst.filter((i) => i.kind !== 'study');
  const empty = !s.tasks.length && !s.procedures.length && !s.courses.length;

  let t = workStart(now) + (first ? first.minutes * 60000 : 0);
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
        <div className="stack">
          <InstallCard />
          {/* two independent columns on laptops (no gaps between uneven tiles); one flowing grid on phones, ordered by `o-*` */}
          <div className="bento">
            <div className="bcol">
              <div className="o1 bwide">
                {first ? <NextUp it={first} study={study} /> : (
                  <div className="tile hero-t"><div className="t">{L("لا شيء ملح اليوم", "Nothing pressing today")}</div><div className="m">{L("تقدر تتقدم في شيء من «لو بقي وقت» أو ترتاح.", "Make progress on something under “If there's time”, or rest.")}</div></div>
                )}
              </div>
              <div className="o5 bwide"><DaySummary plan={plan} /></div>
              <div className="o6 bwide"><StudyTile study={study} /></div>
              {rest.length > 0 && (
                <div className="o7 bwide tile">
                  <div className="k2 row between"><span>{L("بعدها", "After that")}</span><span className="faint">{rest.length}</span></div>
                  <div className="rows flat">{rest.map((it) => <PlanRow key={it.kind + it.id} it={it} start={startOf.get(it)} study={study} />)}</div>
                </div>
              )}
            </div>
            <div className="bcol">
              <div className="bpair">
                <div className="o2"><RingTile plan={plan} /></div>
                <div className="o3"><UrgentTile plan={plan} /></div>
              </div>
              {insights.length > 0 && <div className="o4 bwide"><Alerts list={insights} /></div>}
              <div className="o8 bwide"><WeekTile study={study} /></div>
            </div>
          </div>

          <div className="two-col">
          <div className="stack" style={{ minWidth: 0 }}>
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
        </div>
      )}
    </div>
  );
}

export { daysWord };
