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
import { go } from '../ui/router';
import { completeTaskUI, deferTaskUI, runAction, toggleStepUI } from '../ui/ops';
import { openRef } from '../ui/Shell';
import { PageTop } from '../ui/PageTop';
import { WeekView } from './Week';

function greeting(h: number) {
  if (h < 5) return 'ليلة هادئة';
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'مساء النور';
  return 'مساء الخير';
}

export function SaveDot() {
  const st = useSaveStatus();
  const label = st === 'error' ? 'تعذر الحفظ' : st === 'saving' ? 'يحفظ…' : 'محفوظ';
  return (
    <span className={`save-dot ${st}`} title={st === 'error' ? 'تعذر الحفظ على هذا الجهاز' : 'بياناتك محفوظة على هذا الجهاز'}>
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
      <button className="icon-btn sm" onClick={() => A.snooze(i.id, 20 * 3600_000)} aria-label="إخفاء لليوم" title="إخفاء لليوم">
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
  const reason = it.reasons.find((r) => !/^(عاجلة|مهمة)/.test(r));
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
        <span className="k">{running ? 'تعمل عليه الآن' : 'ابدأ بهذا'}</span>
        {it.level === 'urgent' ? (
          <span className="chip red"><Icon name="alert" size={12} /> عاجلة — ضرورية جدًا</span>
        ) : it.level === 'important' ? (
          <span className="chip amber">مهمة</span>
        ) : it.must ? (
          <span className="chip red">لا يتأجل</span>
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
            <Icon name="play" size={14} /> ابدأ
          </button>
        )}
        <button className="btn" onClick={() => act.check(it)}>
          <Icon name="check" size={16} /> {it.kind === 'study' ? 'سجّل ما ذاكرته' : it.kind === 'procedure' ? 'تمت الخطوة' : 'أنجزتها'}
        </button>
        {it.kind === 'task' && !it.must && (
          <button className="btn ghost" onClick={() => deferTaskUI(it.id)}>غدًا</button>
        )}
      </div>
    </div>
  );
}

function PlanRow({ it, start, study }: { it: PlanItem; start?: number; study: StudyPlan }) {
  const act = usePlanActions(study);
  return (
    <div className="r tap" onClick={() => act.open(it)} style={it.level === 'urgent' ? { boxShadow: 'inset -3px 0 0 var(--red)' } : undefined}>
      <Check on={false} onClick={() => act.check(it)} label={it.kind === 'study' ? 'سجّل المذاكرة' : 'إنجاز'} />
      <div className="main-t">
        <div className="lbl">
          {it.courseColor && <span className="dot" style={{ background: it.courseColor, marginInlineEnd: 6 }} />}
          {it.kind === 'procedure' && <Icon name="work" size={14} className="faint" style={{ marginInlineEnd: 6, verticalAlign: '-2px' }} />}
          {it.title}
        </div>
        <div className="sub">
          {it.level === 'urgent' && <span style={{ color: 'var(--red)', fontWeight: 600 }}>عاجلة · </span>}
          {it.level === 'important' && <span style={{ color: 'var(--amber)' }}>{it.must ? 'مهمة · لا تؤجلها أكثر · ' : 'مهمة · اليوم أو بكرة · '}</span>}
          {metaLine(it)}
          {it.must && !it.level && <span style={{ color: 'var(--red)' }}> · لا يتأجل</span>}
        </div>
      </div>
      {start != null && <span className="faint tiny num hide-mobile">~{fmtTime(start)}</span>}
      <button className="icon-btn sm" onClick={(e) => { e.stopPropagation(); act.start(it); }} aria-label="ابدأ مؤقت"><Icon name="play" size={13} /></button>
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
        <div className="big num">{fmtMinutes(plan.load)} <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>من عمل مخطط</span></div>
        <button className="btn sm ghost" onClick={() => setEdit(!edit)} style={{ paddingInline: 6 }}>
          {override != null ? `متاح ${fmtMinutes(override)}` : 'وقتي اليوم'} <Icon name="edit" size={13} />
        </button>
      </div>
      <Bar value={plan.remaining ? plan.load / plan.remaining : plan.load ? 1 : 0} color={plan.overloaded ? 'var(--red)' : plan.load / Math.max(1, plan.remaining) > 0.85 ? 'var(--amber)' : 'var(--green)'} />
      <div className="row between small">
        <span className="muted">
          {plan.overloaded ? (
            <span style={{ color: 'var(--red)' }}>أكثر من وقتك المتبقي بـ {fmtMinutes(plan.overBy)}</span>
          ) : plan.load ? (
            <>يتبقى لك {fmtMinutes(free)} فراغ · تنتهي ~{fmtTime(Date.now() + plan.load * 60000)}</>
          ) : (
            <>وقتك المتاح {fmtMinutes(plan.remaining)}</>
          )}
        </span>
        {plan.doneMinutes > 0 && <span className="faint">أنجزت {fmtMinutes(plan.doneMinutes)}</span>}
      </div>
      {plan.overloaded && (
        <button className="btn sm" style={{ justifySelf: 'start' }} onClick={() => openSheet({ type: 'replan' })}>
          <Icon name="layers" size={14} /> رتّب يومي — اختر ما يتأجل
        </button>
      )}
      {edit && (
        <div className="col" style={{ gap: 8, paddingTop: 4 }}>
          <div className="small muted">كم وقتًا حرًا عندك اليوم للمذاكرة والمهام؟</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {[0, 60, 120, 180, 240, 300, 360, 480].map((m) => (
              <button key={m} className={`chip btnish ${override === m ? 'on' : ''}`} onClick={() => { A.setDayOverride(plan.today, m); setEdit(false); }}>
                {m === 0 ? 'مشغول' : fmtMinutes(m)}
              </button>
            ))}
            {override != null && <button className="chip btnish" onClick={() => { A.setDayOverride(plan.today, null); setEdit(false); }}>كالمعتاد</button>}
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
        title: `اختبار ${ep.course.name} — ${ep.exam.title}`,
        sub: ep.status === 'behind' ? 'الوقت لا يكفي — افتح الخطة' : ep.status === 'tight' ? 'الخطة ضيقة' : ep.status === 'unknown' ? 'حدد الدروس المطلوبة' : `جاهزيتك ${Math.round(ep.progress * 100)}%`,
        icon: 'flag',
        color: ep.status === 'behind' ? 'var(--red)' : ep.status === 'tight' ? 'var(--amber)' : ep.course.color,
        open: () => openSheet({ type: 'exam', id: ep.exam.id }),
      });
  for (const t of s.tasks)
    if (t.status === 'open' && t.due && t.due > today && t.due <= end)
      items.push({ day: t.due, title: t.title, sub: t.dueTime ? fmtClock(t.dueTime) : 'موعد نهائي', icon: 'tasks', open: () => openSheet({ type: 'task', id: t.id }) });
  for (const p of s.procedures)
    if (!p.archived && !p.completedAt && p.due && p.due > today && p.due <= end)
      items.push({ day: p.due, title: p.title, sub: 'إجراء عمل', icon: 'work', open: () => go(`work/${p.id}`) });
  items.sort((a, b) => a.day.localeCompare(b.day));
  if (!items.length) return null;
  return (
    <section>
      <div className="group-title">
        <span>القادم</span>
        <button onClick={() => go('week')}>الأسبوع كاملًا</button>
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

function Alerts({ list }: { list: Insight[] }) {
  const [all, setAll] = useState(false);
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 3);
  return (
    <section>
      <div className="group-title">
        <span>يحتاج قرارك</span>
        {list.length > 3 && <button onClick={() => setAll(!all)}>{all ? 'أقل' : `الكل (${list.length})`}</button>}
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
  const [first, ...rest] = plan.items;
  const empty = !s.tasks.length && !s.procedures.length && !s.courses.length;

  let t = now + (first ? first.minutes * 60000 : 0);
  const starts = rest.map((i) => {
    const st = t;
    t += i.minutes * 60000;
    return st;
  });

  return (
    <div>
      <PageTop
        title={view === 'week' ? 'الأسبوع' : `${greeting(h)}${s.settings.name ? `، ${s.settings.name}` : ''}`}
        sub={
          <span className="row" style={{ gap: 10 }}>
            {fmtDate(today)} <SaveDot />
          </span>
        }
      />
      <div style={{ marginBottom: 18 }}>
        <Seg value={view} onChange={(v) => go(v === 'week' ? 'week' : 'today')} options={[{ v: 'day', l: 'اليوم' }, { v: 'week', l: 'الأيام السبعة' }]} />
      </div>

      {view === 'week' ? (
        <WeekView />
      ) : empty ? (
        <div className="card">
          <Empty icon="today" title="ابدأ بإضافة ما يشغلك">
            أضف مهمة، أو إجراء عمل بخطواته، أو مادة واختبارها — وسأرتب لك يومك حسب وقتك المتاح.
            <div className="row" style={{ justifyContent: 'center', marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary sm" onClick={() => openSheet({ type: 'quick' })}><Icon name="plus" size={15} /> مهمة</button>
              <button className="btn sm" onClick={() => openSheet({ type: 'quick', text: '' , mode: 'proc' })}>إجراء عمل</button>
              <button className="btn sm" onClick={() => openSheet({ type: 'course' })}>مادة دراسية</button>
            </div>
          </Empty>
        </div>
      ) : (
        <div className="two-col">
          <div className="stack" style={{ minWidth: 0 }}>
            {first ? <NextUp it={first} study={study} /> : (
              <div className="card"><Empty icon="check" title="لا شيء ملح اليوم">تقدر تتقدم في شيء من «لو بقي وقت» أو ترتاح.</Empty></div>
            )}
            <DaySummary plan={plan} />
            {rest.length > 0 && (
              <section>
                <div className="group-title"><span>بعده</span><span className="faint" style={{ fontWeight: 500 }}>{rest.length}</span></div>
                <div className="rows">{rest.map((it, n) => <PlanRow key={it.kind + it.id} it={it} start={starts[n]} study={study} />)}</div>
              </section>
            )}
            {plan.later.length > 0 && (
              <Collapse title="لو بقي وقت" count={plan.later.length}>
                <div className="rows">{plan.later.slice(0, 12).map((it) => <PlanRow key={it.kind + it.id} it={it} study={study} />)}</div>
              </Collapse>
            )}
            {doneToday.length > 0 && (
              <Collapse title="أنجزت اليوم" count={doneToday.length}>
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
                  <span>تذكيرات فاتتك</span>
                  <button onClick={A.clearMissed}>مسح</button>
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
            <Upcoming study={study} />
            {s.procedures.some((p) => !p.archived && !p.completedAt) && (
              <section>
                <div className="rows">
                  <button className="r" onClick={() => go('work')}>
                    <span className="ic" style={{ color: 'var(--work)' }}><Icon name="work" size={16} /></span>
                    <span className="main-t">
                      <div className="lbl">إجراءات العمل</div>
                      <div className="sub">
                        {s.procedures.filter((p) => !p.archived && !p.completedAt).length} مفتوحة{waiting ? ` · ${waiting} بانتظار رد` : ''}
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
