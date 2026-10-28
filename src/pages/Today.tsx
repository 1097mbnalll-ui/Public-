import { useMemo, useState, type ReactNode } from 'react';
import { Bar, Check, Collapse, Empty, Seg, useNow } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { getState, useApp, useSaveStatus } from '../lib/store';
import * as A from '../lib/actions';
import { addDays, atTime, daysWord, fmtClock, fmtDate, fmtMinutes, fmtTime, relDay, timeAgo, todayKey } from '../lib/dates';
import { planDay, suggestDeferrals, weekLoad, type DayPlan, type PlanItem } from '../lib/engine/planner';
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
import { L, startEdge } from '../lib/i18n';
import { dayPhase, isNight, workStart, type DayPhase } from '../lib/engine/capacity';
import { advance, blockLabel, blocksOn, freedMinutes, isSkipped, nowBlock, outingsOn, skipBusy } from '../lib/engine/schedule';
import { InstallCard } from '../ui/InstallCard';
import { MoneyTile } from './Money';
import { StudyToday } from './Study';
import { GymTodayCard } from './Gym';
import { FutureTodayCard } from './Future';
import { RemindTodayStrip } from '../ui/Remind';
import { fmtNum, moneyToday } from '../lib/engine/money';
import type { AppState } from '../lib/types';

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
        else if (p) {
          // no step left to tick (or none at all): the procedure itself is done
          A.completeProcedure(p.id);
          toast(L(`أنجزت «${p.title}»`, `Completed “${p.title}”`), { undoable: true });
        }
      } else {
        const ex = s.exams.find((e) => e.id === it.id);
        openSheet({ type: 'study-log', courseId: ex?.courseId, minutes: it.minutes });
      }
    },
    /** a procedure with a step to tick (otherwise «done» finishes it) */
    hasStep(it: PlanItem) {
      const p = it.kind === 'procedure' ? s.procedures.find((x) => x.id === it.id) : undefined;
      return !!p && !!nextStep(p);
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

/** open items whose time has passed: due on an earlier day, or today at a time already gone */
function lateLabels(s: AppState, now: number): Map<string, string> {
  const today = todayKey(now);
  const out = new Map<string, string>();
  const label = (due: string, time?: string) =>
    due < today ? L(`فات موعدها ${relDay(due, today)}`, `Was due ${relDay(due, today).toLowerCase()}`) : time && atTime(today, time) < now ? L(`فات موعدها ${fmtClock(time)}`, `Was due ${fmtClock(time)}`) : '';
  for (const t of s.tasks) if (t.status === 'open' && t.due) { const l = label(t.due, t.dueTime); if (l) out.set(t.id, l); }
  for (const p of s.procedures) if (!p.archived && !p.completedAt && p.due) { const l = label(p.due); if (l) out.set(p.id, l); }
  return out;
}

function metaLine(it: PlanItem, late?: string) {
  if (late) return [late, `${it.guessed ? '~' : ''}${fmtMinutes(it.minutes)}`, ...(it.sub ? [it.sub] : [])].join(' · ');
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

function NextUp({ it, study, late }: { it: PlanItem; study: StudyPlan; late?: string }) {
  const s = useApp();
  const act = usePlanActions(study);
  const running = s.timer?.refId === it.id;
  return (
    <div className="tile hero-t">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <span className="k">{running ? L('تعمل عليه الآن', "Working on it now") : isNight(Date.now()) ? L('أول شيء الصبح', 'First thing in the morning') : L('ابدأ بهذا', "Start with this")}</span>
        {late ? (
          <span className="chip"><Icon name="alert" size={12} />{L(' متأخرة', ' Late')}</span>
        ) : it.level === 'urgent' ? (
          <span className="chip"><Icon name="alert" size={12} />{L(" عاجلة", " Urgent")}</span>
        ) : it.level === 'important' ? (
          <span className="chip">{L("مهمة", "Important")}</span>
        ) : it.hard ? (
          <span className="chip">{L("لا يتأجل", "Can't be postponed")}</span>
        ) : null}
      </div>
      <div className="t" onClick={() => act.open(it)} style={{ cursor: 'pointer' }}>
        {it.courseColor && <span className="dot" style={{ background: '#fff', marginInlineEnd: 8, verticalAlign: 'middle' }} />}
        {it.title}
      </div>
      <div className="m">{metaLine(it, late)}</div>
      {/* the reason is already in the meta line unless the line shows lesson details instead */}
      {it.sub && it.reasons.length > 0 && <div className="m2">{it.level ? it.reasons[0] : it.reasons.join(' · ')}</div>}
      <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
        {!running && (
          <button className="btn primary" onClick={() => act.start(it)}>
            <Icon name="play" size={14} />{L(" ابدأ", " Start")}</button>
        )}
        <button className="btn" onClick={() => act.check(it)}>
          <Icon name="check" size={16} /> {it.kind === 'study' ? L('سجّل ما ذاكرته', "Log what I studied") : it.kind === 'procedure' && act.hasStep(it) ? L('تمت الخطوة', "Step done") : it.kind === 'procedure' ? L('أنجزته', 'Done') : L('أنجزتها', "Done it")}
        </button>
        {(it.kind === 'task' || it.kind === 'procedure') && !it.must && it.level !== 'urgent' && (
          <button className="btn ghost" onClick={() => (it.kind === 'task' ? deferTaskUI(it.id) : (A.deferMany([it.id]), toast(L('نُقل إلى الغد', "Moved to tomorrow"), { undoable: true })))}>{L("غدًا", "Tomorrow")}</button>
        )}
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

function PlanRow({ it, start, study, late }: { it: PlanItem; start?: number; study: StudyPlan; late?: string }) {
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
          {late && <span style={{ color: 'var(--red)', fontWeight: 600 }}>{late}{' · '}</span>}
          {!late && it.level === 'urgent' && <span style={{ color: 'var(--red)', fontWeight: 600 }}>{L("عاجلة · ", "Urgent · ")}</span>}
          {!late && it.level === 'important' && <span style={{ color: 'var(--amber)' }}>{it.must ? L('مهمة · لا تؤجلها أكثر · ', "Important · don't postpone again · ") : L('مهمة · اليوم أو بكرة · ', "Important · today or tomorrow · ")}</span>}
          {late ? `${it.guessed ? '~' : ''}${fmtMinutes(it.minutes)}` : metaLine(it)}
          {it.hard && !it.level && <span style={{ color: 'var(--red)' }}>{L(" · لا يتأجل", " · can't be postponed")}</span>}
        </div>
      </div>
      {start != null && <span className="faint tiny num hide-mobile">~{fmtTime(start)}</span>}
      <button className="icon-btn sm" onClick={(e) => { e.stopPropagation(); act.start(it); }} aria-label={L("ابدأ مؤقت", "Start timer")}><Icon name="play" size={13} /></button>
    </div>
  );
}

/** the day in one tile: what's left, how far you've got, and the one sentence that ties them together */
function DaySummary({ plan, phase }: { plan: DayPlan; phase: DayPhase }) {
  const s = useApp();
  const [edit, setEdit] = useState(false);
  const override = s.dayOverrides[plan.today];
  const done = plan.doneMinutes;
  const left = plan.load;
  const movable = useMemo(() => suggestDeferrals(plan, s), [plan, s]);
  const usedUp = plan.capacity - done <= 0;

  // one sentence that explains how the numbers relate
  let status: ReactNode;
  let tone = 'var(--muted)';
  const start = workStart(Date.now());
  // the finish time steps over today's lectures / shifts
  const finish = advance(s, start, left);
  if (!left) status = L('ما بقي عليك شيء اليوم ✓', 'Nothing left for today ✓');
  else if (!plan.overloaded)
    status = L(`يكفيك الوقت: تخلص تقريبًا ${fmtTime(finish)}${plan.remaining - left > 0 ? `، ويبقى لك ${fmtMinutes(plan.remaining - left)} فراغ` : ''}.`, `You have enough time: done around ${fmtTime(finish)}${plan.remaining - left > 0 ? `, with ${fmtMinutes(plan.remaining - left)} to spare` : ''}.`);
  else {
    tone = 'var(--red)';
    status = usedUp
      ? L(`خلّصت وقتك المحدد لليوم (${fmtMinutes(plan.capacity)}) واشتغلت ${fmtMinutes(done)} — الباقي كله فوق وقتك.`, `You've used today's set time (${fmtMinutes(plan.capacity)}) and worked ${fmtMinutes(done)} — everything left is beyond it.`)
      : plan.remaining < plan.capacity - done
        ? L(`ما بقي من يومك إلا ${fmtMinutes(plan.remaining)} تقريبًا، وعليك ${fmtMinutes(left)} — يزيد ${fmtMinutes(plan.overBy)}.`, `Only about ${fmtMinutes(plan.remaining)} of your day is left and you have ${fmtMinutes(left)} — ${fmtMinutes(plan.overBy)} too much.`)
        : L(`باقي من وقتك ${fmtMinutes(plan.remaining)} وعليك ${fmtMinutes(left)} — يزيد ${fmtMinutes(plan.overBy)}.`, `You have ${fmtMinutes(plan.remaining)} left and ${fmtMinutes(left)} to do — ${fmtMinutes(plan.overBy)} too much.`);
  }

  // mornings start with the shape of the day: lectures, shifts and how many things are on it
  let dayLine = '';
  if (phase === 'morning') {
    const parts = blocksOn(s, plan.today)
      .filter((x) => x.to > Date.now())
      .map((x) => `${x.b.kind === 'work' ? L('دوام', 'Shift') : x.b.title} ${fmtClock(x.b.start)}`);
    const out = outingsOn(s, plan.today).find((o) => o.leave > Date.now());
    if (out) parts.unshift(L(`تطلع ${fmtTime(out.leave)}`, `leave ${fmtTime(out.leave)}`));
    const n = plan.items.filter((i) => i.kind !== 'study').length;
    if (n) parts.push(L(n === 1 ? 'مهمة واحدة' : n === 2 ? 'مهمتان' : `${n} مهام`, n === 1 ? '1 task' : `${n} tasks`));
    dayLine = parts.join(' · ');
  }

  return (
    <div className="tile summary-t">
      {dayLine && <div className="day-line">{L('اليوم: ', 'Today: ')}{dayLine}</div>}
      <div className="row between" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div>
          <div className="tv num">{left ? fmtMinutes(left) : '✓'}</div>
          <div className="faint tiny">{left ? L('باقي عليك', 'left to do') : L('ما بقي شيء', 'nothing left')}</div>
        </div>
        {done > 0 && <div className="faint small">{L(`أنجزت ${fmtMinutes(done)}`, `${fmtMinutes(done)} done`)}</div>}
      </div>
      <Bar value={done + left ? done / (done + left) : 0} />
      <div className="small" style={{ color: tone }}>{status}</div>
      <div className="row wrap" style={{ gap: 8 }}>
        {plan.overloaded &&
          (movable.length ? (
            <button className="btn sm primary" onClick={autoReplanUI}>
              <Icon name="layers" size={14} /> {L(`أجّل اللي يتأجل لبكرة (${movable.length})`, `Move what can wait to tomorrow (${movable.length})`)}
            </button>
          ) : (
            <span className="faint tiny">{L('كل الباقي عاجل أو مطلوب — زد وقتك اليوم لو تقدر.', 'Everything left is urgent or required — add time today if you can.')}</span>
          ))}
        <button className="btn sm ghost" onClick={() => setEdit(!edit)} style={{ paddingInline: 6 }}>
          <Icon name="clock" size={13} /> {L(`وقتك اليوم: ${fmtMinutes(plan.capacity)}`, `Your time today: ${fmtMinutes(plan.capacity)}`)}{override != null ? L(' (معدّل)', ' (changed)') : ''} <Icon name="edit" size={13} />
        </button>
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

/** tasks and procedures still open today that are allowed to slip to tomorrow */
const canMove = (it: PlanItem) => (it.kind === 'task' || it.kind === 'procedure') && !it.must && it.level !== 'urgent';

function moveLeftUI(items: PlanItem[]) {
  A.deferMany(items.map((i) => i.id));
  toast(L(items.length === 1 ? `نقلت «${items[0].title}» لبكرة` : `نقلت ${items.length} لبكرة`, items.length === 1 ? `Moved “${items[0].title}” to tomorrow` : `Moved ${items.length} to tomorrow`), { undoable: true });
}

/** the evening: what got done, what's left, and one tap to carry it over */
function WrapUp({ plan, now }: { plan: DayPlan; now: number }) {
  const s = useApp();
  const today = todayKey(now);
  const done = s.tasks.filter((t) => t.status === 'done' && t.completedAt && todayKey(t.completedAt) === today);
  const open = plan.items.filter((i) => i.kind !== 'study');
  const movable = open.filter(canMove);
  const stuck = open.filter((i) => !canMove(i));
  const m = moneyToday(s, now);
  return (
    <div className="tile wrap-t">
      <div className="k2"><Icon name="check" size={14} /> {L('ختام اليوم', 'Wrapping up the day')}</div>
      <div className="small">
        {done.length || plan.doneMinutes
          ? L(`أنجزت ${done.length ? (done.length === 1 ? 'مهمة' : `${done.length} مهام`) : ''}${done.length && plan.doneMinutes ? ' · ' : ''}${plan.doneMinutes ? fmtMinutes(plan.doneMinutes) : ''} ✓`, `Done: ${done.length ? `${done.length} task${done.length > 1 ? 's' : ''}` : ''}${done.length && plan.doneMinutes ? ' · ' : ''}${plan.doneMinutes ? fmtMinutes(plan.doneMinutes) : ''} ✓`)
          : L('ما سجّلت إنجاز اليوم — عادي، بكرة يوم جديد.', "Nothing logged today — that's fine, tomorrow's a new day.")}
      </div>
      {done.length > 0 && <div className="faint tiny">{done.slice(0, 4).map((t) => t.title).join(L('، ', ', '))}{done.length > 4 ? L(` و${done.length - 4} غيرها`, ` and ${done.length - 4} more`) : ''}</div>}
      {stuck.length > 0 && (
        <div className="small" style={{ color: 'var(--red)' }}>
          {L('باقي اليوم ولا يتأجل: ', "Still due today and can't wait: ")}{stuck.map((i) => `«${i.title}»`).join(L('، ', ', '))}
        </div>
      )}
      {movable.length > 0 && (
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn sm primary" onClick={() => moveLeftUI(movable)}>
            <Icon name="layers" size={14} /> {L(`انقل الباقي لبكرة (${movable.length})`, `Move what's left to tomorrow (${movable.length})`)}
          </button>
        </div>
      )}
      {(m.spentToday > 0 || m.allowance !== undefined) && (
        <button className="linkish small" style={{ alignSelf: 'flex-start', textDecoration: 'none' }} onClick={() => go('money')}>
          {L(`صرفت اليوم ${fmtNum(m.spentToday)} ر.س`, `Spent today: ${fmtNum(m.spentToday)} SAR`)}
          {m.allowance !== undefined ? L(` من ${fmtNum(m.allowance)}`, ` of ${fmtNum(m.allowance)}`) : ''}
        </button>
      )}
    </div>
  );
}

/** a lecture / shift in today's list — tap «ما راح أحضر» and its time (and the trip) goes to study and tasks */
function ClassRow({ x, day }: { x: ReturnType<typeof blocksOn>[number]; day: string }) {
  const s = useApp();
  const off = isSkipped(s, day, x.b.id);
  const toggle = () => {
    A.skipClass(day, x.b.id, !off);
    if (!off) {
      const freed = freedMinutes(getState(), day);
      toast(L(`تمام — رجع لك ${fmtMinutes(freed)}، وزدت مذاكرة اليوم.`, `Done — ${fmtMinutes(freed)} back, today's study went up.`), { undoable: true });
    }
  };
  return (
    <div className={`r class-r ${off ? 'off' : ''}`}>
      <span className="class-ic">{x.b.kind === 'work' ? '💼' : x.b.remote ? '💻' : '🎓'}</span>
      <div className="main-t">
        <div className="lbl">{x.b.title}</div>
        <div className="sub">{off ? L('ملغية اليوم — وقتها راح للمذاكرة', 'Skipped today — its time went to study') : <>{blockLabel(x.b)} · {fmtClock(x.b.start)}–{fmtClock(x.b.end)}{x.b.place ? ` · ${x.b.place}` : ''}</>}</div>
      </div>
      <button className="chip btnish" onClick={toggle}>{off ? L('رجّعها', 'Undo') : L('ما راح أحضر', "Won't go")}</button>
    </div>
  );
}

/** tomorrow's first appointment and first thing to do */
function Tomorrow({ now, plan }: { now: number; plan: DayPlan }) {
  const s = useApp();
  // after midnight "tomorrow" is already today, and today's plan starts at 8
  const day = isNight(now) ? todayKey(now) : addDays(todayKey(now), 1);
  const tplan = useMemo(() => (isNight(now) ? plan : planDay(s, atTime(day, '08:00'))), [s, now, plan, day]);
  const first = blocksOn(s, day)[0];
  const it = tplan.items[0];
  if (!first && !it) return null;
  return (
    <div className="tile">
      <div className="k2"><Icon name="cal" size={14} /> {isNight(now) ? L('الصبح', 'In the morning') : L('بكرة', 'Tomorrow')}</div>
      <div className="col" style={{ gap: 6 }}>
        {first && <div className="small row between" style={{ gap: 8 }}><span>{first.b.kind === 'work' ? '💼' : first.b.remote ? '💻' : '🎓'} {first.b.title} <span className="faint">· {fmtClock(first.b.start)}{first.b.place ? ` · ${first.b.place}` : ''}</span></span><button className="chip btnish" onClick={() => { A.skipClass(day, first.b.id, true); toast(L('ألغيتها — ووقتها راح لمذاكرة بكرة', 'Skipped — its time goes to tomorrow’s study'), { undoable: true }); }}>{L('ما راح أحضر', "Won't go")}</button></div>}
        {it && <div className="small">▶︎ {L('أول شيء: ', 'First: ')}<b>{it.title}</b> <span className="faint">· {fmtMinutes(it.minutes)}</span></div>}
        {tplan.items.length > 1 && <div className="faint tiny">{L(`وبعدها ${tplan.items.length - 1} — بترتيبها لك الصبح`, `then ${tplan.items.length - 1} more — laid out for you in the morning`)}</div>}
      </div>
    </div>
  );
}

/** after your day ends: rest, with tomorrow in one glance */
function NightTile({ plan, now }: { plan: DayPlan; now: number }) {
  // before midnight what's still open is today's; after it, today's plan is the morning's
  const movable = isNight(now) ? [] : plan.items.filter(canMove);
  // something urgent due before midnight is the one thing worth saying at this hour
  const tonight = isNight(now) ? [] : plan.items.filter((i) => i.level === 'urgent' && i.dueTime && atTime(todayKey(now), i.dueTime) > now);
  return (
    <div className="tile hero-t night-t">
      <span className="k">{isNight(now) ? L('ليلة هادئة 🌙', 'Quiet night 🌙') : L('خلص يومك 🌙', 'Your day is over 🌙')}</span>
      <div className="t">{L('نم الحين', 'Time to sleep')}</div>
      <div className="m">{plan.doneMinutes ? L(`اشتغلت اليوم ${fmtMinutes(plan.doneMinutes)} — يكفي.`, `You worked ${fmtMinutes(plan.doneMinutes)} today — that's enough.`) : L('الباقي ينتظرك الصبح، مرتّب.', "What's left waits for the morning, in order.")}</div>
      {tonight.map((i) => (
        <div key={i.id} className="m2">{L(`قبل لا تنام: «${i.title}» موعده ${fmtClock(i.dueTime as string)} الليلة`, `Before you sleep: “${i.title}” is due ${fmtClock(i.dueTime as string)} tonight`)}</div>
      ))}
      <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
        {movable.length > 0 && (
          <button className="btn primary" onClick={() => moveLeftUI(movable)}>
            <Icon name="layers" size={14} /> {L(`انقل الباقي لبكرة (${movable.length})`, `Move what's left to tomorrow (${movable.length})`)}
          </button>
        )}
        <button className="btn" onClick={() => openSheet({ type: 'quick' })}>
          <Icon name="plus" size={14} /> {L('شي في بالك؟ سجّله', 'On your mind? Note it')}
        </button>
      </div>
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
            <button className="btn sm" onClick={() => { const id = A.addTask({ title: t.text }); A.removeThought(t.id); toast(L('صارت مهمة', "Turned into a task"), { buttons: [{ label: L('تفاصيل', "Details"), fn: () => openSheet({ type: 'task', id }) }] }); }}>{L("حوّلها لمهمة", "Make it a task")}</button>
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
  const shown = all ? list : list.slice(0, 1);
  return (
    <section>
      <div className="group-title">
        <span>{L("يحتاج قرارك", "Needs your decision")}</span>
        {list.length > 1 && <button onClick={() => setAll(!all)}>{all ? L('أقل', "Less") : L(`الكل (${list.length})`, `All (${list.length})`)}</button>}
      </div>
      <div className="rows">{shown.map((i) => <AlertRow key={i.id} i={i} />)}</div>
    </section>
  );
}

/** missed reminders and focus-session thoughts: things that came in and need sorting */
function MissedReminders({ now }: { now: number }) {
  const s = useApp();
  if (!s.missed.length) return null;
  return (
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
  );
}

function ProceduresLink() {
  const s = useApp();
  const open = s.procedures.filter((p) => !p.archived && !p.completedAt);
  if (!open.length) return null;
  const waiting = open.filter((p) => procStage(p) === 'waiting').length;
  return (
    <section>
      <div className="rows">
        <button className="r" onClick={() => go('work')}>
          <span className="ic" style={{ color: 'var(--work)' }}><Icon name="work" size={16} /></span>
          <span className="main-t">
            <div className="lbl">{L("إجراءات العمل", "Work procedures")}</div>
            <div className="sub">
              {open.length}{L(" مفتوحة", " open")}{waiting ? L(` · ${waiting} بانتظار رد`, ` · ${waiting} waiting for a reply`) : ''}
            </div>
          </span>
          <Icon name="chevron" size={16} className="chev-end" />
        </button>
      </div>
    </section>
  );
}

function DoneToday({ now }: { now: number }) {
  const s = useApp();
  const today = todayKey(now);
  const done = s.tasks.filter((t) => t.status === 'done' && t.completedAt && todayKey(t.completedAt) === today);
  if (!done.length) return null;
  return (
    <Collapse title={L("أنجزت اليوم", "Done today")} count={done.length}>
      <div className="rows">
        {done.map((t) => (
          <div key={t.id} className="r done tap" onClick={() => openSheet({ type: 'task', id: t.id })}>
            <Check on onClick={() => A.reopenTask(t.id)} />
            <span className="main-t"><div className="lbl">{t.title}</div></span>
            {t.spent > 0 && <span className="faint tiny">{fmtMinutes(t.spent)}</span>}
          </div>
        ))}
      </div>
    </Collapse>
  );
}

/** everything that isn't for right now, one tap away */
function More({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <details className="more-t">
      <summary className="collapse-head">
        <Icon name="chevron" size={16} className="chev" />
        {title || L('المزيد', 'More')}
      </summary>
      <div className="stack" style={{ marginTop: 10 }}>{children}</div>
    </details>
  );
}

export function Today({ view }: { view: 'day' | 'week' }) {
  const s = useApp();
  const now = useNow();
  const study = useMemo(() => planStudy(s, now), [s, now]);
  const plan = useMemo(() => planDay(s, now, study), [s, now, study]);
  const phase = dayPhase(s, now);
  const insights = useMemo(() => {
    const planned = new Set(plan.items.map((i) => i.id));
    // urgent items already sit in the hero / list, and an overloaded day is told once, in the summary tile
    return buildInsights(s, plan, study, now).filter((i) => {
      if (i.id.startsWith('week-heavy') || i.id.startsWith('urgent:') || i.id.startsWith('overload:')) return false;
      if (i.id.startsWith('urgent-proc:')) return !planned.has(i.id.split(':')[1]);
      // an exam short of time is already said on «ذاكر اليوم»
      if (i.id.startsWith('exam-behind:') || i.id.startsWith('exam-tight:')) return !study.exams.some((ep) => ep.exam.id === i.id.split(':')[1] && ep.quota > 0);
      return true;
    });
  }, [s, plan, study, now]);
  const late = useMemo(() => lateLabels(s, now), [s, now]);
  const today = todayKey(now);
  const h = new Date(now).getHours();
  const [first, ...afterFirst] = plan.items;
  const empty = !s.tasks.length && !s.procedures.length && !s.courses.length;

  // start times count study blocks too and step over lectures, so the clock stays honest
  let t = advance(s, workStart(now), first ? first.minutes : 0);
  const startOf = new Map<PlanItem, number>();
  for (const i of afterFirst) {
    const at = skipBusy(s, t);
    startOf.set(i, at);
    t = advance(s, at, i.minutes);
  }
  // study is listed in full under «ذاكر اليوم», and late items get their own list — neither is repeated here
  const lateRest = afterFirst.filter((i) => i.kind !== 'study' && late.has(i.id));
  const rest = afterFirst.filter((i) => i.kind !== 'study' && !late.has(i.id));
  // today's remaining lectures / shifts, shown in place among the planned items
  const classes = blocksOn(s, today, true).filter((x) => x.to > workStart(now));
  const inClass = nowBlock(s, now);
  const timeline: ({ kind: 'item'; it: PlanItem; at: number } | { kind: 'class'; x: (typeof classes)[number] })[] = [
    ...rest.map((it) => ({ kind: 'item' as const, it, at: startOf.get(it) ?? 0 })),
    ...classes.filter((x) => x.b.id !== inClass?.b.id).map((x) => ({ kind: 'class' as const, x })),
  ].sort((a, b) => (a.kind === 'item' ? a.at : a.x.from) - (b.kind === 'item' ? b.at : b.x.from));

  const hero = (
    <div>
      {inClass && (
        <div className="class-now">
          🎓 {L(`الحين: ${inClass.b.title} — حتى ${fmtClock(inClass.b.end)}`, `Now: ${inClass.b.title} — until ${fmtClock(inClass.b.end)}`)}
          {first ? <span className="faint">{L(` · بعدها: ${first.title}`, ` · then: ${first.title}`)}</span> : null}
        </div>
      )}
      {first ? <NextUp it={first} study={study} late={late.get(first.id)} /> : (
        <div className="tile hero-t"><div className="t">{L("لا شيء ملح اليوم", "Nothing pressing today")}</div><div className="m">{L("تقدر تتقدم في شيء من «لو بقي وقت» أو ترتاح.", "Make progress on something under “If there's time”, or rest.")}</div></div>
      )}
    </div>
  );
  const lateList = lateRest.length > 0 && (
    <section>
      <div className="group-title"><span style={{ color: 'var(--red)' }}>{L('فاتك', 'Overdue')}</span><span className="faint">{lateRest.length}</span></div>
      <div className="rows">{lateRest.map((it) => <PlanRow key={it.kind + it.id} it={it} study={study} late={late.get(it.id)} />)}</div>
    </section>
  );
  const timelineTile = timeline.length > 0 && (
    <div className="tile">
      <div className="k2 row between"><span>{phase === 'evening' ? L('الباقي اليوم', 'Left today') : L('بعدها', 'After that')}</span><span className="faint">{rest.length}</span></div>
      <div className="rows flat">
        {timeline.map((r) =>
          r.kind === 'item' ? (
            <PlanRow key={r.it.kind + r.it.id} it={r.it} start={r.at} study={study} />
          ) : (
            <ClassRow key={r.x.b.id} x={r.x} day={today} />
          ),
        )}
      </div>
    </div>
  );
  const laterList = plan.later.length > 0 && (
    <Collapse title={L("لو بقي وقت", "If there's time")} count={plan.later.length}>
      <div className="rows">{plan.later.slice(0, 12).map((it) => <PlanRow key={it.kind + it.id} it={it} study={study} />)}</div>
    </Collapse>
  );
  const alerts = insights.length > 0 && <Alerts list={insights} />;

  let main: ReactNode;
  let side: ReactNode;
  if (phase === 'night') {
    // the night is when you look back: what's still open stays one tap from «✓»
    const openTonight = plan.items.filter((i) => i.kind !== 'study');
    main = (
      <>
        <NightTile plan={plan} now={now} />
        {openTonight.length > 0 && (
          <div className="tile">
            <div className="k2 row between">
              <span>{isNight(now) ? L('مهام اليوم — خلّصت شي منها؟', "Today's tasks — done any?") : L('باقي اليوم — خلّصت شي منها؟', 'Left today — done any?')}</span>
              <span className="faint">{openTonight.length}</span>
            </div>
            <div className="rows flat">{openTonight.map((it) => <PlanRow key={it.kind + it.id} it={it} study={study} late={late.get(it.id)} />)}</div>
          </div>
        )}
        <Tomorrow now={now} plan={plan} />
      </>
    );
    side = (
      <More title={L('خطة اليوم كاملة', "Today's full plan")}>
        {hero}
        {lateList}
        {timelineTile}
        {alerts}
        <MissedReminders now={now} />
        <Thoughts />
        <Upcoming study={study} />
        <ProceduresLink />
      </More>
    );
  } else if (phase === 'evening') {
    main = (
      <>
        <WrapUp plan={plan} now={now} />
        {hero}
        <RemindTodayStrip />
        <StudyToday plan={study} compact />
        <GymTodayCard />
        <FutureTodayCard />
        {lateList}
        {timelineTile}
      </>
    );
    side = (
      <>
        <Tomorrow now={now} plan={plan} />
        <MissedReminders now={now} />
        <Thoughts />
        {alerts}
        <More>
          {laterList}
          <Upcoming study={study} />
          <WeekTile study={study} />
          <ProceduresLink />
        </More>
      </>
    );
  } else {
    // morning: lay out the day · daytime: get through it, and sort what came in
    main = (
      <>
        {hero}
        <RemindTodayStrip />
        <StudyToday plan={study} compact />
        <GymTodayCard />
        <FutureTodayCard />
        {lateList}
        <DaySummary plan={plan} phase={phase} />
        {timelineTile}
      </>
    );
    side = (
      <>
        <MissedReminders now={now} />
        {phase === 'day' && <Thoughts />}
        {alerts}
        <More>
          {laterList}
          <DoneToday now={now} />
          <Upcoming study={study} />
          <MoneyTile now={now} />
          <WeekTile study={study} />
          {phase === 'morning' && <Thoughts />}
          <ProceduresLink />
        </More>
      </>
    );
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
        <div className="stack">
        <InstallCard />
        <RemindTodayStrip />
        <GymTodayCard />
        <FutureTodayCard />
        <MoneyTile now={now} />
        <div className="card">
          <Empty icon="today" title={L("ابدأ بإضافة ما يشغلك", "Start by adding what's on your mind")}>{L("أضف مهمة، أو إجراء عمل بخطواته، أو مادة واختبارها — وسأرتب لك يومك حسب وقتك المتاح.", "Add a task, a work procedure with its steps, or a course and its exam — and I'll arrange your day around your available time.")}<div className="row" style={{ justifyContent: 'center', marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary sm" onClick={() => openSheet({ type: 'quick' })}><Icon name="plus" size={15} />{L(" مهمة", " Task")}</button>
              <button className="btn sm" onClick={() => openSheet({ type: 'quick', text: '' , mode: 'proc' })}>{L("إجراء عمل", "Work procedure")}</button>
              <button className="btn sm" onClick={() => openSheet({ type: 'course' })}>{L("مادة دراسية", "Course")}</button>
              <button className="btn sm" onClick={() => openSheet({ type: 'remind' })}><Icon name="bell" size={15} />{L(" تذكير", " Reminder")}</button>
            </div>
          </Empty>
        </div>
        </div>
      ) : (
        <div className="stack">
          <InstallCard />
          {/* the main column is what this time of day is for; the side holds the rest */}
          <div className="two-col today-cols">
            <div className="stack" style={{ minWidth: 0 }}>{main}</div>
            <div className="stack" style={{ minWidth: 0 }}>{side}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export { daysWord };
