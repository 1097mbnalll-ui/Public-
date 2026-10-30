import { useMemo, useState } from 'react';
import { Bar, Collapse, Empty, Ring, Sheet, useNow } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { addDays, daysWord, diffDays, fmtClock, fmtDate, fmtMinutes, relDay, todayKey } from '../lib/dates';
import { planStudy, portionText, postponePreview, unitMinutes, unitSchedule, type ExamPlan, type StudyPlan, type UnitWhen } from '../lib/engine/study';
import { coursePace } from '../lib/engine/learning';
import { closeSheet, openSheet } from '../ui/sheets';
import { go, useRoute } from '../ui/router';
import { LessonRow, parseUnitLines } from '../ui/StudySheets';
import { toast } from '../ui/toast';
import { PageTop } from '../ui/PageTop';
import { L, lang, sz, szn } from '../lib/i18n';
import type { AppState, Course, Unit } from '../lib/types';

// «الدراسة» answers three things, in this order:
//  1. what do I study now, and how do I start? → the «اليوم» panel: one lesson, one button
//  2. what else is on today? → the rest of the day under it, one line per course
//  3. am I ready for my exams? → «موادي»: each course once, with its next exam and where it stands

export function Study() {
  const r = useRoute();
  if (r.id) return <CourseDetail key={r.id} id={r.id} />;
  return <StudyOverview />;
}

// ---------------- shared pieces ----------------

type Tone = 'green' | 'amber' | 'red' | 'violet' | 'muted';

/** a course's standing for its next exam, in two or three words */
export function standing(ep?: ExamPlan): { text: string; tone: Tone } {
  if (!ep) return { text: L('لا اختبار قادم', 'No exam coming up'), tone: 'muted' };
  switch (ep.status) {
    case 'unknown':
      return { text: L('حدد الدروس', 'Pick the lessons'), tone: 'violet' };
    case 'done':
      return { text: L('جاهز ✓', 'Ready ✓'), tone: 'green' };
    case 'past':
      return { text: L('الاختبار اليوم', 'Exam today'), tone: 'violet' };
    case 'ok':
      return { text: ep.inReview ? L('وقت المراجعة', 'Review time') : L('على المسار', 'On track'), tone: 'green' };
    case 'tight':
      return { text: L('بلا هامش', 'No margin'), tone: 'amber' };
    case 'behind':
      return { text: L(`ينقصك ${fmtMinutes(ep.shortfall)}`, `${fmtMinutes(ep.shortfall)} short`), tone: 'red' };
  }
}

export function Pill({ text, tone }: { text: string; tone: Tone }) {
  return <span className={`sx-pill ${tone}`}>{text}</span>;
}

/** «بعد 5 أيام» / «غدًا» / «اليوم» */
function whenText(ep: ExamPlan): string {
  if (ep.daysLeft === 0) return ep.exam.time ? L(`اليوم ${fmtClock(ep.exam.time)}`, `today ${fmtClock(ep.exam.time)}`) : L('اليوم', 'Today');
  if (ep.daysLeft === 1) return L('غدًا', 'Tomorrow');
  return L(`بعد ${daysWord(ep.daysLeft)}`, `in ${daysWord(ep.daysLeft)}`);
}

/** «اليوم» / «غدًا» / «بعد 5 أيام» from a date */
function daysUntil(day: string, today: string): string {
  const n = diffDays(today, day);
  return n <= 0 ? L('اليوم', 'Today') : n === 1 ? L('غدًا', 'Tomorrow') : L(`بعد ${daysWord(n)}`, `in ${daysWord(n)}`);
}

/** the next upcoming exam of a course, if any */
function nextExam(plan: StudyPlan, courseId: string): ExamPlan | undefined {
  return plan.exams.find((ep) => ep.course.id === courseId && ep.status !== 'past') || plan.exams.find((ep) => ep.course.id === courseId);
}

function startStudy(ep: ExamPlan, unit?: Unit) {
  A.startTimer({ kind: 'study', refId: ep.exam.id, courseId: ep.course.id, unitId: unit?.id ?? ep.portion[0]?.unit.id, label: unit ? `${ep.course.name} · ${unit.title}` : L(`مذاكرة ${ep.course.name}`, `Study ${ep.course.name}`) });
}

/** the lessons for today, one short line: "الفصل 3 (الباقي)، الفصل 4: 7 صفحة" */
function lessonsLine(ep: ExamPlan, skip = 0): string {
  const parts = ep.portion.slice(skip).map((x) => portionText(x, ep.course.sizeLabel));
  return parts.length > 2 ? `${parts.slice(0, 2).join(L('، ', ', '))} +${parts.length - 2}` : parts.join(L('، ', ', '));
}

/** why today's number is what it is, in one sentence per exam */
function whyLine(ep: ExamPlan): string {
  const days = (n: number) => (n === 1 ? L('يوم واحد', '1 day') : daysWord(n));
  const head =
    ep.inReview || ep.learnLeft < 5
      ? L(`باقي ~${fmtMinutes(ep.reviewLeft + ep.doneToday)} مراجعة، وعندك ${days(Math.max(1, ep.daysLeft))} قبل الاختبار`, `~${fmtMinutes(ep.reviewLeft + ep.doneToday)} of review left, ${days(Math.max(1, ep.daysLeft))} before the exam`)
      : L(`باقي ~${fmtMinutes(ep.learnLeft + ep.doneToday)} دروس، وعندك ${days(ep.studyDays)} ${ep.exam.reviewDays ? 'قبل أيام المراجعة' : 'قبل الاختبار'}`, `~${fmtMinutes(ep.learnLeft + ep.doneToday)} of lessons left, ${days(ep.studyDays)} ${ep.exam.reviewDays ? 'before the review days' : 'before the exam'}`);
  return `${ep.course.name}: ${head} ← ${fmtMinutes(ep.quota)} ${L('اليوم', 'today')}.`;
}

/** the lesson to pick up when today's share is done: the next one not yet learned, nearest exam first */
function aheadLesson(plan: StudyPlan): { ep: ExamPlan; unit: Unit } | null {
  for (const ep of plan.exams) {
    if (ep.status === 'unknown' || ep.status === 'past') continue;
    const w = ep.work.find((x) => x.learn >= 1) || ep.work.find((x) => x.review >= 1);
    if (w) return { ep, unit: w.unit };
  }
  return null;
}

// ---------------- «اليوم» ----------------

/** one bar for the whole day: a segment per course, sized by its share, filled by what's done */
function DayBar({ rows }: { rows: ExamPlan[] }) {
  const total = rows.reduce((a, ep) => a + ep.quota, 0);
  const done = rows.reduce((a, ep) => a + Math.min(ep.quota, ep.doneToday), 0);
  return (
    <div className="sx-seg" role="img" aria-label={L(`ذاكرت ${fmtMinutes(done)} من ${fmtMinutes(total)}`, `${fmtMinutes(done)} of ${fmtMinutes(total)} studied`)}>
      {rows.map((ep) => (
        <i key={ep.exam.id} style={{ flexGrow: ep.quota, ['--c' as string]: ep.course.color }}>
          <b style={{ width: `${Math.min(100, (ep.doneToday / Math.max(1, ep.quota)) * 100)}%` }} />
        </i>
      ))}
    </div>
  );
}

/** what's in today's share — folded away behind one button, opened on tap */
function TodayLessons({ ep }: { ep: ExamPlan }) {
  const [open, setOpen] = useState(false);
  if (!ep.portion.length || ep.todayMinutes <= 0) return null;
  const what = (x: ExamPlan['portion'][number]) => (x.review ? L('مراجعة', 'Review') : x.whole ? (x.unit.progress > 0 ? L('الباقي', 'The rest') : L('كامل', 'Whole')) : szn(x.amount, ep.course.sizeLabel));
  return (
    <div className="sx-les">
      <button className="sx-les-btn" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        {ep.inReview ? L('مراجعة اليوم', 'Today’s review') : L('دروس اليوم', 'Today’s lessons')} · {ep.portion.length}
        <Icon name="down" size={13} className={open ? 'flip' : ''} />
      </button>
      {open && (
        <ul>
          {ep.portion.map((x) => (
            <li key={x.unit.id + (x.review ? 'r' : '')}>
              <button onClick={() => openSheet({ type: 'unit', id: x.unit.id })}>
                <span className="t">{x.unit.title}</span>
                <small>{what(x)} · {fmtMinutes(x.minutes)}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QueueRow({ ep, lead }: { ep: ExamPlan; lead?: boolean }) {
  const ok = ep.todayMinutes <= 0;
  return (
    <div className={`sx-qw ${ok ? 'done' : ''}`}>
      <div className={`sx-q ${ok ? 'done' : ''}`}>
        <span className="sx-dot" style={{ background: ep.course.color }} />
        <button className="sx-q-main" onClick={() => go(`study/${ep.course.id}`)}>
          <b>{ep.course.name}</b>
          {ok && <span>{L('خلصت حصتها اليوم', 'Done for today')}</span>}
        </button>
        <span className="sx-q-min num">{ok ? <Icon name="check" size={16} /> : fmtMinutes(ep.todayMinutes)}</span>
        {!ok && !lead && (
          <button className="icon-btn sm" aria-label={L(`ابدأ ${ep.course.name}`, `Start ${ep.course.name}`)} onClick={() => startStudy(ep)}>
            <Icon name="play" size={13} />
          </button>
        )}
      </div>
      <TodayLessons ep={ep} />
    </div>
  );
}

/**
 * «اليوم»: today's total and how far you've got, then the one lesson to start with — a big
 * button, nothing to choose — and the rest of the day under it.
 * `compact` (the Today page) keeps the total and the list, without the big lesson.
 */
export function StudyToday({ plan, compact }: { plan: StudyPlan; compact?: boolean }) {
  const rows = plan.exams.filter((ep) => ep.quota > 0);
  const unknown = plan.exams.filter((ep) => ep.status === 'unknown');
  const hasExams = plan.exams.some((ep) => ep.status !== 'past');
  if (compact && !rows.length && !unknown.length) return null;
  const total = rows.reduce((a, ep) => a + ep.quota, 0);
  const left = rows.reduce((a, ep) => a + ep.todayMinutes, 0);
  const done = Math.min(total, rows.reduce((a, ep) => a + ep.doneToday, 0));
  const lead = compact ? undefined : rows.find((ep) => ep.todayMinutes > 0);
  const rest = rows.filter((ep) => ep !== lead);
  const ahead = !lead && !compact ? aheadLesson(plan) : null;
  const first = lead?.portion[0];

  return (
    <section className={`tile sx-today ${compact ? 'compact' : ''}`} aria-label={L('مذاكرة اليوم', "Today's study")}>
      {rows.length > 0 && (
        <>
          <div className="sx-today-head">
            <div>
              <div className="sx-kicker">{L('مذاكرة اليوم', "Today's study")}</div>
              <div className="sx-total num">{left ? fmtMinutes(left) : L('خلصت ✓', 'Done ✓')}</div>
            </div>
            <div className="sx-today-meta">
              {done > 0 ? L(`أنجزت ${Math.min(100, Math.round((done / Math.max(1, total)) * 100))}% من مذاكرة اليوم كلها`, `${Math.min(100, Math.round((done / Math.max(1, total)) * 100))}% of all today's study done`) : rows.length === 1 ? L('مادة واحدة', 'One course') : L(`${rows.length} مواد`, `${rows.length} courses`)}
            </div>
          </div>
          <DayBar rows={rows} />
        </>
      )}

      {lead && first && (
        <div className="sx-lead" style={{ ['--c' as string]: lead.course.color }}>
          <div className="sx-lead-k">
            <span className="sx-dot" style={{ background: lead.course.color }} />
            {lead.course.name} · {lead.exam.title} {whenText(lead)}
          </div>
          <button className="sx-lead-t" onClick={() => openSheet({ type: 'unit', id: first.unit.id })}>{first.unit.title}</button>
          <div className="sx-lead-m">
            {first.review ? L('مراجعة', 'Review') : first.whole ? (first.unit.progress > 0 ? L('الباقي منه', 'The rest of it') : L('كامل', 'The whole lesson')) : szn(first.amount, lead.course.sizeLabel)}
            {lead.portion.length > 1 ? L(`، ثم ${lessonsLine(lead, 1)}`, `, then ${lessonsLine(lead, 1)}`) : ''} · {fmtMinutes(lead.todayMinutes)}
          </div>
          <div className="sx-lead-a">
            <button className="btn primary sx-go" onClick={() => startStudy(lead)}>
              <Icon name="play" size={15} /> {L('ابدأ الجلسة', 'Start session')}
            </button>
            <button className="btn sm" onClick={() => openSheet({ type: 'study-session', examId: lead.exam.id })}>
              <Icon name="clock" size={14} /> {L('خطّط: متى أبدأ ومتى أخلص', 'Plan: start and finish times')}
            </button>
            <button className="btn ghost sm" onClick={() => openSheet({ type: 'study-log', courseId: lead.course.id, unitId: first.unit.id })}>{L('ذاكرت من قبل؟ سجّلها', 'Studied already? Log it')}</button>
          </div>
        </div>
      )}

      {!compact && !lead && rows.length > 0 && (
        <div className="sx-calm">
          <b>{L('خلصت مذاكرة اليوم', "You're done for today")}</b>
          {ahead ? (
            <>
              <span>{L(`تبي تتقدّم؟ الدرس الجاي في ${ahead.ep.course.name}: ${ahead.unit.title}`, `Want to get ahead? Next in ${ahead.ep.course.name}: ${ahead.unit.title}`)}</span>
              <button className="btn sm" onClick={() => startStudy(ahead.ep, ahead.unit)}><Icon name="play" size={13} /> {L('ابدأه', 'Start it')}</button>
            </>
          ) : (
            <span>{L('ارتح — بكرة تكمل.', 'Rest — pick it up tomorrow.')}</span>
          )}
        </div>
      )}

      {!compact && !rows.length && (
        <div className="sx-calm">
          {hasExams ? (
            <>
              <b>{L('ما عليك مذاكرة اليوم', 'Nothing to study today')}</b>
              {ahead ? (
                <>
                  <span>{L(`تقدر تتقدّم في ${ahead.ep.course.name}: ${ahead.unit.title}`, `You could get ahead in ${ahead.ep.course.name}: ${ahead.unit.title}`)}</span>
                  <button className="btn sm" onClick={() => startStudy(ahead.ep, ahead.unit)}><Icon name="play" size={13} /> {L('ابدأ', 'Start')}</button>
                </>
              ) : null}
            </>
          ) : (
            <>
              <b>{L('أضف موعد اختبار', 'Add an exam date')}</b>
              <span>{L('من موعد الاختبار ودروسه أحسب كم تذاكر كل يوم، وأقولك من وين تبدأ.', "From the exam date and its lessons I work out how much to study each day, and where to start.")}</span>
              <button className="btn sm primary" onClick={() => openSheet({ type: 'exam' })}><Icon name="plus" size={14} /> {L('موعد اختبار', 'Exam date')}</button>
            </>
          )}
        </div>
      )}

      {!compact && !lead && (
        <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => openSheet({ type: 'study-session' })}>
          <Icon name="clock" size={14} /> {L('خطّط جلسة مذاكرة: متى أبدأ ومتى أخلص', 'Plan a study session: start and finish times')}
        </button>
      )}

      {(compact ? rows : rest).length > 0 && (
        <div className="sx-queue">
          {!compact && lead && <div className="sx-sub">{L('بعدها', 'Then')}</div>}
          {(compact ? rows : rest).map((ep) => <QueueRow key={ep.exam.id} ep={ep} />)}
        </div>
      )}

      {unknown.map((ep) => (
        <button key={ep.exam.id} className="sx-q sx-ask" onClick={() => openSheet({ type: 'exam', id: ep.exam.id })}>
          <span className="sx-dot" style={{ background: ep.course.color }} />
          <span className="sx-q-main">
            <b>{ep.course.name} · {ep.exam.title}</b>
            <span>{L('اختر دروس الاختبار عشان أحسب كم تذاكر', 'Pick the exam’s lessons so I can work out how much to study')}</span>
          </span>
          <Icon name="chevron" size={14} className="chev-end" />
        </button>
      ))}


      {rows.length > 0 && (
        <details className="sx-why">
          <summary>{L('ليش هالأرقام؟', 'Why these numbers?')}</summary>
          <div>
            {rows.map((ep) => <p key={ep.exam.id}>{whyLine(ep)}</p>)}
            <p>{L('إذا ذاكرت أقل اليوم، الباقي يتوزع بالتساوي على الأيام اللي بعده.', 'Study less today and the rest spreads evenly over the days after.')}</p>
          </div>
        </details>
      )}
    </section>
  );
}

/** move a subject's share to tomorrow: shows what tomorrow becomes first, and can be put back */
function Postpone({ ep }: { ep: ExamPlan }) {
  const s = useApp();
  const [ask, setAsk] = useState(false);
  const pv = useMemo(() => (ask ? postponePreview(s, ep.exam.id) : null), [ask, s, ep.exam.id]);
  if (ep.postponed)
    return (
      <div className="st-pp done">
        <span>{L(`⏭️ أجّلتها لبكرة (${fmtMinutes(ep.postponed)})`, `⏭️ Moved to tomorrow (${fmtMinutes(ep.postponed)})`)}</span>
        <button className="linkish" onClick={() => { A.postponeStudy(ep.exam.id, null); toast(L(`رجعت حصة ${ep.course.name} لليوم`, `${ep.course.name} is back on today`)); }}>{L('ألغِ التأجيل', 'Undo')}</button>
      </div>
    );
  if (!ep.canPostpone || ep.todayMinutes <= 0) return null;
  if (!ask || !pv) return <button className="st-pp-btn" onClick={() => setAsk(true)}>{L('ما أقدر اليوم؟ أجّلها لبكرة', "Can't today? Move it to tomorrow")}</button>;
  return (
    <div className="st-pp">
      <div>{L(`لو أجّلت ${ep.course.name} لبكرة:`, `If you move ${ep.course.name} to tomorrow:`)}</div>
      <ul>
        <li>{L('المادة بكرة: ', 'This subject tomorrow: ')}<b className="num">{fmtMinutes(pv.subjectAfter)}</b> <span className="faint">{L(`بدل ${fmtMinutes(pv.subjectBefore)}`, `instead of ${fmtMinutes(pv.subjectBefore)}`)}</span></li>
        <li>{L('يومك بكرة كامل: ', 'All of tomorrow: ')}<b className="num">{fmtMinutes(pv.dayAfter)}</b> <span className="faint">{L(`بدل ${fmtMinutes(pv.dayBefore)}`, `instead of ${fmtMinutes(pv.dayBefore)}`)}</span></li>
      </ul>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn sm primary" onClick={() => { A.postponeStudy(ep.exam.id, pv.minutes); setAsk(false); toast(L(`تمام — ${ep.course.name} بكرة ${fmtMinutes(pv.subjectAfter)}`, `Done — ${ep.course.name} is ${fmtMinutes(pv.subjectAfter)} tomorrow`), { undoable: true }); }}>{L('أجّلها', 'Move it')}</button>
        <button className="btn sm ghost" onClick={() => setAsk(false)}>{L('لا، خلها', 'No, keep it')}</button>
      </div>
    </div>
  );
}

/** every day until the last exam: each subject's hours that day, and the day's total */
function DaysAhead({ plan }: { plan: StudyPlan }) {
  const today = todayKey();
  const [all, setAll] = useState(false);
  const days = Object.keys(plan.byDay).filter((d) => d > today).sort();
  if (!days.length) return null;
  const shown = all ? days : days.slice(0, 5);
  const ep = (id: string) => plan.exams.find((e) => e.exam.id === id)!;
  return (
    <section>
      <div className="group-title"><span>{L('الأيام الجاية', 'The days ahead')}</span><span className="faint">{L(`لين ${fmtDate(days[days.length - 1], false)}`, `to ${fmtDate(days[days.length - 1], false)}`)}</span></div>
      <div className="st-days">
        {shown.map((d) => {
          const list = plan.byDay[d];
          const total = list.reduce((a, x) => a + x.minutes, 0);
          return (
            <div key={d} className="st-day">
              <b className="dd">{relDay(d, today)}</b>
              <div className="ch">
                {list.map((x) => (
                  <span key={x.examId} style={{ ['--c' as string]: ep(x.examId).course.color }} title={ep(x.examId).course.name}><i />{hrs(x.minutes)}</span>
                ))}
              </div>
              <span className="tt num">{hrs(total)}</span>
            </div>
          );
        })}
      </div>
      {days.length > 7 && <button className="st-pp-btn" onClick={() => setAll(!all)}>{all ? L('أقل', 'Less') : L(`كل الأيام (${days.length})`, `All days (${days.length})`)}</button>}
    </section>
  );
}

// ---------------- «موادي» ----------------

/** a course's readiness: for its next exam if it has one, else how much of it is studied */
function readiness(s: AppState, c: Course, ep?: ExamPlan): number {
  if (ep && ep.status !== 'unknown') return ep.progress;
  const units = s.units.filter((u) => u.courseId === c.id);
  const total = units.reduce((a, u) => a + u.size, 0);
  return total ? units.reduce((a, u) => a + u.size * u.progress, 0) / total : 0;
}

function CourseRow({ c, plan }: { c: Course; plan: StudyPlan }) {
  const s = useApp();
  const ep = nextExam(plan, c.id);
  const units = s.units.filter((u) => u.courseId === c.id);
  const st = standing(ep);
  return (
    <button className="sx-course" onClick={() => go(`study/${c.id}`)}>
      <Ring value={readiness(s, c, ep)} size={44} stroke={4} color={c.color} />
      <span className="sx-course-t">
        <b>{c.name}</b>
        <span>{ep ? `${ep.exam.title} · ${whenText(ep)}` : L(`${units.length} دروس`, `${units.length} lessons`)}</span>
      </span>
      <Pill {...st} />
    </button>
  );
}

/** studied minutes for the last 7 days, and how many days in a row */
function WeekStrip() {
  const s = useApp();
  const today = todayKey();
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const mins = week.map((d) => s.days[d]?.study || 0);
  const max = Math.max(30, ...mins);
  const total = mins.reduce((a, b) => a + b, 0);
  let streak = 0;
  for (let d = mins[6] > 0 ? today : addDays(today, -1); (s.days[d]?.study || 0) > 0; d = addDays(d, -1)) streak++;
  if (!total) return null;
  return (
    <section className="tile sx-week" aria-label={L('آخر 7 أيام', 'Last 7 days')}>
      <div className="sx-week-head">
        <span className="sx-kicker">{L('آخر 7 أيام', 'Last 7 days')}</span>
        <span className="num"><b>{fmtMinutes(total)}</b>{streak > 1 ? L(` · ${streak} أيام ورا بعض`, ` · ${streak} days in a row`) : ''}</span>
      </div>
      <div className="sx-week-bars">
        {week.map((d, i) => (
          <div key={d} className={d === today ? 'on' : ''} title={`${fmtDate(d)}: ${fmtMinutes(mins[i])}`}>
            <i style={{ height: `${Math.max(mins[i] ? 8 : 3, (mins[i] / max) * 100)}%` }} />
            <span>{d === today ? L('اليوم', 'Today') : fmtDate(d).split(' ')[0].replace('ال', '')}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StudyWelcome() {
  return (
    <section className="tile sx-welcome">
      <div className="sx-kicker">{L('ابدأ هنا', 'Start here')}</div>
      <h2>{L('خلّ مذاكرتك تمشي على خطة', 'Let your studying follow a plan')}</h2>
      <ol>
        <li><b>{L('أضف مادة ودروسها', 'Add a course and its lessons')}</b><span>{L('كل درس وحجمه: صفحات، شرائح أو محاضرات.', 'Each lesson and its size: pages, slides or lectures.')}</span></li>
        <li><b>{L('حدد موعد الاختبار', 'Set the exam date')}</b><span>{L('أحسب كم تذاكر كل يوم عشان تخلص قبله.', "I work out how much to study each day to finish in time.")}</span></li>
        <li><b>{L('افتح الصفحة واضغط «ابدأ»', 'Open the page and press Start')}</b><span>{L('كل يوم تلقى الدرس اللي تبدأ فيه جاهز.', 'Every day the lesson to start with is waiting.')}</span></li>
      </ol>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn primary" onClick={() => openSheet({ type: 'course' })}><Icon name="plus" size={16} /> {L('أول مادة', 'First course')}</button>
        <button className="btn" onClick={() => openSheet({ type: 'ai-import' })}>{L('استورد من الذكاء الاصطناعي', 'Import from an AI')}</button>
      </div>
    </section>
  );
}

/** «باقي 16 س 48 د على 7 أيام» — the hours left over the days left, the whole sum behind today's share */
function leftLine(ep: ExamPlan, today: string): string {
  const n = Math.max(1, diffDays(today, ep.lastDay) + 1);
  const left = ep.learnLeft + ep.reviewLeft;
  if (left <= 0.5) return '';
  if (!ep.todayMinutes && !ep.doneToday && !ep.postponed && ep.nextDay) return L(`📅 حصتها الجاية ${relDay(ep.nextDay, today)}`, `📅 Next share ${relDay(ep.nextDay, today)}`);
  const rd = ep.exam.reviewDays || 0;
  return L(`⏳ باقي ${fmtMinutes(left)} على ${n === 1 ? 'يوم واحد' : daysWord(n)}${rd ? ` · آخر ${daysWord(rd)} مراجعة` : ''}`, `⏳ ${fmtMinutes(left)} left over ${daysWord(n)}${rd ? ` · last ${daysWord(rd)} for review` : ''}`);
}

/** study time read as hours: «2:50 ساعة», under an hour «45 د» */
function hrs(m: number): string {
  const r = Math.round(m);
  if (r < 60) return L(`${r} د`, `${r} min`);
  return L(`${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')} ساعة`, `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')} h`);
}

/** «خلّصت الاختبار»: it leaves the plan; the grade is optional */
function finish(ep: ExamPlan) {
  A.finishExam(ep.exam.id);
  toast(L(`بالتوفيق 🤞 — «${ep.course.name} · ${ep.exam.title}» خلص وطلع من خطتك`, `Good luck 🤞 — “${ep.course.name} · ${ep.exam.title}” is done and off your plan`), { undoable: true });
}

/** the hours as a number with a small unit: <b>2:50</b> ساعة, under an hour <b>45</b> د */
function Hours({ m }: { m: number }) {
  const r = Math.round(m);
  return r < 60 ? <span className="hn num"><b>{r}</b><small>{L('د', 'min')}</small></span> : <span className="hn num"><b>{Math.floor(r / 60)}:{String(r % 60).padStart(2, '0')}</b><small>{L('ساعة', 'h')}</small></span>;
}

/** «وش أذاكر اليوم»: today's total, then one row per subject — tap it for everything about it */
function StudyHome({ plan }: { plan: StudyPlan }) {
  const s = useApp();
  const today = todayKey();
  const active = plan.exams.filter((ep) => ep.status !== 'past' && ep.status !== 'unknown' && ep.lastDay >= today);
  const rows = active.filter((ep) => ep.quota > 0 || ep.postponed || ep.todayMinutes > 0);
  const later = active.filter((ep) => !rows.includes(ep) && ep.status !== 'done');
  const total = rows.reduce((a, ep) => a + ep.quota, 0);
  const left = rows.reduce((a, ep) => a + ep.todayMinutes, 0);
  const done = rows.reduce((a, ep) => a + Math.min(ep.quota, ep.doneToday), 0);
  const unknown = plan.exams.filter((ep) => ep.status === 'unknown');
  const upcoming = plan.exams.filter((ep) => ep.status !== 'unknown').sort((a, b) => a.exam.date.localeCompare(b.exam.date) || (a.exam.time || '').localeCompare(b.exam.time || ''));
  const ahead = !left && total > 0 ? aheadLesson(plan) : null;
  // everything studied today (timer, logged sessions), whether or not it was today's share
  const studied = s.sessions.filter((x) => x.date === today && !x.tick).reduce((a, x) => a + x.minutes, 0);
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <>
      <section className="sh-today" aria-label={L('وش أذاكر اليوم', 'What to study today')}>
        <div className="sh-hrow">
          <h2 className="sh-h">{L('وش أذاكر اليوم', 'What to study today')}</h2>
          {active.length > 0 && <button className="sh-try" onClick={() => openSheet({ type: 'study-try' })}>{L('جرّب يومك', 'Try your days')}</button>}
        </div>
        {rows.length ? (
          <>
            <div className="sh-total">
              <Hours m={left || total} />
              <span>{!left ? L('خلّصت مذاكرة اليوم ✓', 'Done for today ✓') : done > 0 ? L(`باقي من ${fmtMinutes(total)}`, `left of ${fmtMinutes(total)}`) : rows.length === 1 ? L('على مادة وحدة', 'on one subject') : L(`على ${rows.length} مواد`, `on ${rows.length} subjects`)}</span>
            </div>
            <div className="sh-prog" aria-label={L(`ذاكرت اليوم ${fmtMinutes(studied)}، ${pct}% من حصة اليوم`, `Studied ${fmtMinutes(studied)} today, ${pct}% of today's share`)}>
              <DayBar rows={rows} />
              <div className="t">
                <span>{L('ذاكرت اليوم', 'Studied today')} <b className="num">{fmtMinutes(studied)}</b></span>
                <span className={pct >= 100 ? 'ok' : ''}>{L('أنجزت', 'Done')} <b className="num">{pct}%</b> {L(`من حصة اليوم`, `of today's share`)}</span>
              </div>
              {studied - done >= 10 && <small className="faint">{L(`الحصة تنحسب باللي غطيته من الدروس (${fmtMinutes(done)})، مو بالوقت — سجّل وش خلصت من كل جلسة عشان تنحسب صح.`, `The share counts the lessons you covered (${fmtMinutes(done)}), not the time — log what you finished each session so it counts.`)}</small>}
            </div>
            <div className="sh-rows">
              {rows.map((ep) => <SubjectRow key={ep.exam.id} ep={ep} />)}
            </div>
            <button className="sh-plan" onClick={() => openSheet({ type: 'study-session' })}>
              <Icon name="clock" size={16} />
              <span>{L('خطّط جلستك: متى تبدأ ومتى تخلص', 'Plan your session: start and finish')}</span>
              <Icon name="chevron" size={14} className="chev-end" />
            </button>
            {ahead && (
              <button className="sh-ahead" onClick={() => startStudy(ahead.ep, ahead.unit)}>
                <Icon name="play" size={13} /> {L(`عندك وقت؟ تقدّم في ${ahead.ep.course.name}: ${ahead.unit.title}`, `Got time? Get ahead in ${ahead.ep.course.name}: ${ahead.unit.title}`)}
              </button>
            )}
          </>
        ) : (
          <div className="sh-empty">
            {studied > 0 && <b>{L(`ذاكرت اليوم ${fmtMinutes(studied)} 👏`, `Studied ${fmtMinutes(studied)} today 👏`)}</b>}
            {active.length ? L('ما عليك مذاكرة اليوم.', 'Nothing to study today.') : L('أضف موعد اختبار ودروسه، وأقولك كل يوم وش تذاكر وكم.', "Add an exam and its lessons, and I'll tell you every day what to study and for how long.")}
            {!active.length && <button className="btn sm primary" onClick={() => openSheet({ type: 'exam' })}><Icon name="plus" size={14} /> {L('موعد اختبار', 'Exam date')}</button>}
            <button className="btn sm ghost" onClick={() => openSheet({ type: 'study-session' })}><Icon name="clock" size={14} /> {L('جلسة مذاكرة بوقت', 'A timed study session')}</button>
          </div>
        )}
        {later.map((ep) => (
          <button key={ep.exam.id} className="sh-later" onClick={() => openSheet({ type: 'study-subject', examId: ep.exam.id })}>
            <span className="sx-dot" style={{ background: ep.course.color }} />
            {ep.course.name} <span className="faint">{ep.nextDay ? L(`· حصتها الجاية ${relDay(ep.nextDay, today)}`, `· next share ${relDay(ep.nextDay, today)}`) : ''}</span>
          </button>
        ))}
      </section>

      {unknown.map((ep) => (
        <button key={ep.exam.id} className="sx-q sx-ask" onClick={() => openSheet({ type: 'study-subject', examId: ep.exam.id })}>
          <span className="sx-dot" style={{ background: ep.course.color }} />
          <span className="sx-q-main">
            <b>{ep.course.name} · {ep.exam.title}</b>
            <span>{L('اختر دروس الاختبار عشان أحسب كم تذاكر', 'Pick the exam’s lessons so I can work out how much to study')}</span>
          </span>
          <Icon name="chevron" size={14} className="chev-end" />
        </button>
      ))}

      {upcoming.some((ep) => ep.status === 'past' || ep.daysLeft === 0) && (
        <section>
          <div className="group-title">
            <span className="sh-h2">{L('اختبار اليوم', 'Exam today')}</span>
          </div>
          <div className="sh-exams">
            {upcoming.filter((ep) => ep.status === 'past' || ep.daysLeft === 0).map((ep) => {
              const d = new Date(`${ep.exam.date}T12:00:00`);
              const soon = ep.daysLeft <= 1;
              return (
                <button key={ep.exam.id} className={`sh-ex ${soon ? 'soon' : ''}`} onClick={() => openSheet({ type: 'study-subject', examId: ep.exam.id })}>
                  <span className="dt"><b className="num">{d.getDate()}</b><span>{d.toLocaleDateString(lang() === 'en' ? 'en' : 'ar-SA-u-ca-gregory-nu-latn', { month: 'long' })}</span></span>
                  <span className="m">
                    <b><span className="sx-dot" style={{ background: ep.course.color }} />{ep.course.name} · {ep.exam.title}</b>
                    <span>{fmtDate(ep.exam.date).split(' ')[0]}{ep.exam.time ? ` ${fmtClock(ep.exam.time)}` : ''}{ep.status === 'done' ? L(' · جاهز ✓', ' · ready ✓') : ep.mid > 0.5 ? L(` · باقي ${hrs(ep.mid)}`, ` · ${hrs(ep.mid)} left`) : ''}</span>
                  </span>
                  {ep.status === 'past' || ep.daysLeft === 0 ? (
                    <span className="left done" role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); finish(ep); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); finish(ep); } }}>{L('خلّصته ✓', 'Done ✓')}</span>
                  ) : (
                    <span className="left">{whenText(ep)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <Collapse title={L('خطة الأيام الجاية وآخر أسبوع', 'The days ahead and last week')}>
        <div className="stack">
          <DaysAhead plan={plan} />
          <WeekStrip />
        </div>
      </Collapse>
    </>
  );
}

/** one subject in «وش أذاكر اليوم»: what to study, how long, and where it stands */
function SubjectRow({ ep }: { ep: ExamPlan }) {
  const done = ep.todayMinutes <= 0 && !ep.postponed;
  const pct = Math.min(100, (ep.doneToday / Math.max(1, ep.quota)) * 100);
  return (
    <div className={`sh-row ${done ? 'done' : ''} ${ep.postponed ? 'moved' : ''}`}>
      <button className="sh-row-main" onClick={() => openSheet({ type: 'study-subject', examId: ep.exam.id })} aria-label={L(`تفاصيل ${ep.course.name}`, `${ep.course.name} details`)}>
        <span className="bar" style={{ background: ep.course.color }} />
        <span className="m">
          <b>{ep.course.name} <small className="cd">{whenText(ep)}</small></b>
          {(ep.postponed || done) && <span>{ep.postponed ? L(`أجّلتها لبكرة (${fmtMinutes(ep.postponed)})`, `Moved to tomorrow (${fmtMinutes(ep.postponed)})`) : L('خلّصت حصتها اليوم ✓', 'Done for today ✓')}</span>}
          {pct > 0 && !done && <i className="p"><i style={{ width: `${pct}%`, background: ep.course.color }} /></i>}
        </span>
        <span className="h">{ep.postponed ? '⏭' : done ? '✓' : <Hours m={ep.todayMinutes} />}</span>
        <Icon name="chevron" size={14} className="chev-end" />
      </button>
      {!ep.postponed && <TodayLessons ep={ep} />}
    </div>
  );
}

const DAY_SHORT = () => (lang() === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']);

/**
 * «جرّب يومك»: pick any day and see only each subject and its hours; mark the days you won't
 * study a subject and watch the other days take it — nothing changes in your plan until you
 * press «اعتمدها».
 */
export function TrySheet() {
  const s = useApp();
  const now = useNow();
  const today = todayKey(now);
  const [off, setOff] = useState<Record<string, string[]>>(() => ({ ...s.studyOff }));
  const [day, setDay] = useState(today);
  const [pick, setPick] = useState<string | null>(null);
  const real = useMemo(() => planStudy(s, now), [s, now]);
  const trial = useMemo(() => planStudy({ ...s, studyOff: off }, now), [s, off, now]);
  const exams = trial.exams.filter((ep) => ep.status !== 'past' && ep.status !== 'unknown' && ep.status !== 'done' && ep.lastDay >= today);
  const last = exams.reduce((m, ep) => (ep.lastDay > m ? ep.lastDay : m), today);
  const days: string[] = [];
  for (let d = today; d <= last; d = addDays(d, 1)) days.push(d);
  const on = (p: StudyPlan, d: string, id: string) => (d === today ? p.exams.find((e) => e.exam.id === id)?.quota || 0 : p.byDay[d]?.find((x) => x.examId === id)?.minutes || 0);
  const total = (p: StudyPlan, d: string) => exams.reduce((a, ep) => a + on(p, d, ep.exam.id), 0);
  const isOff = (id: string, d: string) => !!off[id]?.includes(d);
  const toggle = (id: string, d: string) => setOff((o) => ({ ...o, [id]: isOff(id, d) ? o[id].filter((x) => x !== d) : [...(o[id] || []), d] }));
  const norm = (o: Record<string, string[]>) => JSON.stringify(Object.keys(o).filter((k) => o[k]?.length).sort().map((k) => [k, [...o[k]].sort()]));
  const changed = norm(off) !== norm(s.studyOff || {});
  const short = exams.filter((ep) => ep.unplanned);
  const picked = exams.find((ep) => ep.exam.id === pick);
  const label = (d: string) => (d === today ? L('اليوم', 'Today') : d === addDays(today, 1) ? L('بكرة', 'Tmrw') : DAY_SHORT()[new Date(`${d}T12:00:00`).getDay()]);
  const delta = (a: number, b: number) => (Math.abs(a - b) < 3 ? null : <small className={`tr-d ${a > b ? 'up' : 'down'}`}>{a > b ? '+' : '−'}{hrs(Math.abs(a - b))}</small>);

  return (
    <Sheet
      title={L('جرّب يومك', 'Try your days')}
      onClose={closeSheet}
      footer={
        changed ? (
          <>
            <button className="btn primary grow" onClick={() => { A.setStudyOff(off); closeSheet(); toast(L('اعتمدتها — خطتك تمشي عليها الحين', 'Saved — your plan follows it now'), { undoable: true }); }}>{L('اعتمدها في خطتي', 'Use it in my plan')}</button>
            <button className="btn ghost" onClick={() => setOff({ ...s.studyOff })}>{L('رجّع', 'Reset')}</button>
          </>
        ) : (
          <button className="btn ghost grow" onClick={closeSheet}>{L('تم', 'Done')}</button>
        )
      }
    >
      <div className="tr">
        <div className="tr-days" role="tablist" aria-label={L('اختر اليوم', 'Pick the day')}>
          {days.map((d) => (
            <button key={d} role="tab" aria-selected={d === day} className={d === day ? 'on' : ''} onClick={() => setDay(d)}>
              <span>{label(d)}</span>
              <b className="num">{new Date(`${d}T12:00:00`).getDate()}</b>
              <small className="num">{hrs(total(trial, d))}</small>
            </button>
          ))}
        </div>

        <section className="tr-list">
          <div className="tr-head"><b>{d2(day, today)}</b><span className="num"><Hours m={total(trial, day)} />{delta(total(trial, day), total(real, day))}</span></div>
          {exams.map((ep) => {
            const m = on(trial, day, ep.exam.id);
            const gone = day > ep.lastDay;
            return (
              <div key={ep.exam.id} className={`tr-row ${isOff(ep.exam.id, day) ? 'off' : ''}`}>
                <span className="bar" style={{ background: ep.course.color }} />
                <b>{ep.course.name}</b>
                <span className="v">{gone ? <span className="faint small">{L('خلص اختبارها', 'exam done')}</span> : isOff(ep.exam.id, day) ? <span className="faint small">{L('بدون مذاكرة', 'off')}</span> : m ? <><Hours m={m} />{delta(m, on(real, day, ep.exam.id))}</> : <span className="faint">—</span>}</span>
              </div>
            );
          })}
        </section>

        <section className="tr-play">
          <b>{L('جرّب: الأيام اللي ما راح تذاكر فيها مادة', "Try it: the days you won't study a subject")}</b>
          <div className="tr-chips">
            {exams.map((ep) => (
              <button key={ep.exam.id} className={pick === ep.exam.id ? 'on' : ''} style={{ ['--c' as string]: ep.course.color }} onClick={() => setPick(pick === ep.exam.id ? null : ep.exam.id)}>
                {ep.course.name}{off[ep.exam.id]?.length ? <small className="num"> · {L(`${off[ep.exam.id].length} إجازة`, `${off[ep.exam.id].length} off`)}</small> : null}
              </button>
            ))}
          </div>
          {picked && (
            <>
              <div className="faint tiny">{L(`اضغط اليوم اللي ما راح تذاكر فيه ${picked.course.name} — وشوف كيف تتوزع ساعاتها`, `Tap the days you won't study ${picked.course.name} and see its hours move`)}</div>
              <div className="tr-grid">
                {days.filter((d) => d <= picked.lastDay).map((d) => {
                  const offd = isOff(picked.exam.id, d);
                  const m = on(trial, d, picked.exam.id);
                  return (
                    <button key={d} className={offd ? 'off' : ''} aria-pressed={offd} onClick={() => toggle(picked.exam.id, d)}>
                      <span>{label(d)} <b className="num">{new Date(`${d}T12:00:00`).getDate()}</b></span>
                      <small className="num">{offd ? L('إجازة', 'off') : hrs(m)}</small>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {short.map((ep) => (
            <div key={ep.exam.id} className="sx-note red">{L(`${ep.course.name}: الأيام اللي بقت ما تكفي — ${hrs(ep.unplanned || 0)} بدون يوم. رجّع يوم أو أكثر.`, `${ep.course.name}: the days left aren't enough — ${hrs(ep.unplanned || 0)} has no day. Bring a day back.`)}</div>
          ))}
        </section>
      </div>
    </Sheet>
  );
}

/** «اليوم · الإثنين 26 أكتوبر» */
function d2(d: string, today: string): string {
  return d === today ? L(`اليوم · ${fmtDate(d)}`, `Today · ${fmtDate(d)}`) : fmtDate(d);
}

/** everything about one subject's exam, and all of it editable: the exam, the sum, the lessons */
export function SubjectSheet({ examId }: { examId: string }) {
  const s = useApp();
  const now = useNow();
  const plan = useMemo(() => planStudy(s, now), [s, now]);
  const ep = plan.exams.find((e) => e.exam.id === examId);
  const exam = s.exams.find((e) => e.id === examId);
  const course = exam && s.courses.find((c) => c.id === exam.courseId);
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('');
  if (!exam || !course) return <Sheet title={L('المادة', 'Subject')} onClose={closeSheet}><div className="muted">{L('ما لقيت الاختبار.', "Couldn't find the exam.")}</div></Sheet>;
  const today = todayKey(now);
  const units = s.units.filter((u) => exam.unitIds.includes(u.id)).sort((a, b) => a.order - b.order);
  const inMinutes = /دقيق|دقائق|min/i.test(course.sizeLabel);
  const pace = coursePace(s, course).pace;
  const todays = new Set((ep?.portion || []).map((x) => x.unit.id));
  const save = (patch: Partial<typeof exam>) => A.saveExam({ ...exam, ...patch });
  const daysLeftN = ep ? Math.max(1, diffDays(today, ep.lastDay) + 1) : 0;
  const addLesson = () => {
    const size = Number(minutes.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
    if (!title.trim() || !(size > 0)) return toast(L('اكتب اسم الدرس ومدته', 'Enter the lesson name and length'));
    const ids = A.addUnits(course.id, [{ title: title.trim(), size }]);
    save({ unitIds: [...exam.unitIds, ...ids] });
    setTitle('');
    setMinutes('');
  };
  // one tap: learned · a second: reviewed · a third: back to not done — today's share counts each
  const toggle = (u: Unit) => {
    if (u.progress < 1) A.markLesson(u.id, { progress: 1 });
    else if (!u.reviewed) A.markLesson(u.id, { reviewed: true });
    else A.markLesson(u.id, { progress: 0, reviewed: false });
  };
  return (
    <Sheet title={course.name} onClose={closeSheet} footer={<button className="btn ghost grow" onClick={() => { closeSheet(); go(`study/${course.id}`); }}>{L('صفحة المادة كاملة', 'Full course page')}</button>}>
      <div className="ss">
        <section className="ss-card">
          <div className="ss-lb">{L('موعد الاختبار', 'Exam')}</div>
          <div className="ss-two">
            <input className="input" value={exam.title} aria-label={L('اسم الاختبار', 'Exam name')} onChange={(e) => save({ title: e.target.value })} />
            <input className="input" type="date" value={exam.date} aria-label={L('تاريخ الاختبار', 'Exam date')} onChange={(e) => e.target.value && save({ date: e.target.value })} />
          </div>
          <div className="ss-two">
            <label className="ss-fld"><span>{L('الساعة', 'Time')}</span><input className="input" type="time" value={exam.time || ''} onChange={(e) => save({ time: e.target.value || undefined })} /></label>
            <label className="ss-fld"><span>{L('أيام مراجعة قبله', 'Review days before')}</span>
              <span className="ss-step"><button onClick={() => save({ reviewDays: Math.max(0, (exam.reviewDays || 0) - 1) })} aria-label={L('أقل', 'Fewer')}>−</button><b className="num">{exam.reviewDays || 0}</b><button onClick={() => save({ reviewDays: Math.min(7, (exam.reviewDays || 0) + 1) })} aria-label={L('أكثر', 'More')}>+</button></span>
            </label>
          </div>
        </section>

        {(exam.date <= today || ep?.status === 'past') && !exam.finished && (
          <button className="btn primary" onClick={() => { closeSheet(); if (ep) finish(ep); else A.finishExam(exam.id); }}>{L('خلّصت الاختبار ✓', 'I sat the exam ✓')}</button>
        )}
        {ep && ep.status !== 'unknown' && ep.status !== 'past' && (
          <section className="ss-card">
            <div className="ss-sum num">
              <div><b>{hrs(ep.mid)}</b><span>{L('باقية', 'left')}</span></div>
              <div><b>{daysLeftN}</b><span>{daysLeftN === 1 ? L('يوم', 'day') : daysLeftN === 2 ? L('يومين', 'days') : daysLeftN <= 10 ? L('أيام', 'days') : L('يومًا', 'days')}</span></div>
              <div className="acc"><b>{hrs(ep.quota || ep.requiredDaily)}</b><span>{L('اليوم', 'today')}</span></div>
            </div>
            {leftLine(ep, today) && <div className="ss-why">{leftLine(ep, today)}</div>}
            {ep.finishDay && ep.learnLeft > 0.5 && <div className="ss-why">{L(`📌 لو التزمت، تخلص الدروس ${relDay(ep.finishDay, today)}${ep.exam.reviewDays ? ' وتبقى لك أيام المراجعة' : ''}.`, `📌 Keep to it and the lessons are done ${relDay(ep.finishDay, today)}.`)}</div>}
            {ep.status === 'done' ? <div className="ss-ok">{L('خلّصت كل دروسها ومراجعتها ✓', 'All lessons and review done ✓')}</div> : (
              <>
                {ep.todayMinutes > 0 && <div className="ss-les">📖 {lessonsLine(ep)}</div>}
                <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
                  {ep.todayMinutes > 0 && <button className="btn primary" onClick={() => { closeSheet(); startStudy(ep); }}><Icon name="play" size={14} /> {L('ابدأ حصة اليوم', "Start today's share")}</button>}
                  <button className="btn" onClick={() => openSheet({ type: 'study-log', courseId: course.id, unitId: ep.portion[0]?.unit.id })}>{L('سجّل', 'Log')}</button>
                </div>
                <Postpone ep={ep} />
              </>
            )}
          </section>
        )}

        <section className="ss-card">
          <div className="ss-lb">{L(`الدروس · ${inMinutes ? 'دقائق كل درس' : `بـ${course.sizeLabel}`}`, `Lessons · ${inMinutes ? 'minutes each' : course.sizeLabel}`)}</div>
          {units.map((u) => {
            const finished = u.progress >= 1 && u.reviewed;
            return (
              <div key={u.id} className={`ss-ls ${finished ? 'ok' : ''} ${todays.has(u.id) ? 'td' : ''}`}>
                <button className={`ss-bx ${finished ? 'on' : u.progress > 0 ? 'half' : ''}`} onClick={() => toggle(u)} title={finished ? L('خلّصته وراجعته', 'Learned and reviewed') : u.progress >= 1 ? L('خلّصته — اضغط لما تراجعه', 'Learned — tap when reviewed') : undefined} aria-label={finished ? L(`ارجع ${u.title} غير منتهي`, `Mark ${u.title} not done`) : u.progress >= 1 ? L(`راجعت ${u.title}`, `Reviewed ${u.title}`) : L(`خلّصت ${u.title}`, `Mark ${u.title} done`)}>{finished || u.progress >= 1 ? '✓' : ''}</button>
                <button className="t" onClick={() => openSheet({ type: 'unit', id: u.id })}>
                  <bdi>{u.title}</bdi>
                  {todays.has(u.id) && <em>{L('اليوم', 'today')}</em>}
                  {!finished && u.progress >= 1 ? <small>{L('باقي مراجعته', 'review left')}</small> : !finished && u.progress > 0 && <small className="num">{Math.round(u.progress * 100)}%</small>}
                </button>
                <label className="ss-min">
                  <input className="num" inputMode="numeric" value={u.size} aria-label={L(`مدة ${u.title}`, `${u.title} length`)} onChange={(e) => { const v = Number(e.target.value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))); if (v > 0) A.updateUnit(u.id, { size: v }); }} />
                  <span>{inMinutes ? L('د', 'm') : `~${fmtMinutes(unitMinutes(u, course, pace, 0))}`}</span>
                </label>
              </div>
            );
          })}
          <div className="ss-add">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={L('درس جديد', 'New lesson')} onKeyDown={(e) => e.key === 'Enter' && addLesson()} />
            <input className="input num" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder={inMinutes ? L('دقائق', 'min') : course.sizeLabel} onKeyDown={(e) => e.key === 'Enter' && addLesson()} />
            <button className="btn sm primary" onClick={addLesson}>{L('أضف', 'Add')}</button>
          </div>
        </section>
      </div>
    </Sheet>
  );
}

function StudyOverview() {
  const s = useApp();
  const now = useNow();
  const plan = useMemo(() => planStudy(s, now), [s, now]);
  const today = todayKey(now);
  const courses = s.courses.filter((c) => !c.archived);
  // the nearest exam first, then courses with no exam
  const order = (c: Course) => nextExam(plan, c.id)?.exam.date || '9999';
  const sorted = [...courses].sort((a, b) => order(a).localeCompare(order(b)));
  const ungraded = s.exams.filter((e) => e.date < today && e.score == null && !e.finished && e.unitIds.length).sort((a, b) => b.date.localeCompare(a.date))[0];
  const ungradedCourse = ungraded && s.courses.find((c) => c.id === ungraded.courseId);

  return (
    <div>
      <PageTop
        title={L('الدراسة', 'Study')}
        sub={(() => {
          const m = plan.exams.reduce((a, ep) => a + ep.todayMinutes, 0);
          const started = plan.exams.some((ep) => ep.quota > 0 && ep.doneToday > 0);
          return <>{fmtDate(today)}{m && started ? L(` · باقي ${hrs(m)}`, ` · ${hrs(m)} left`) : ''}</>;
        })()}
        actions={courses.length > 0 && <button className="btn sm" onClick={() => go('schedule')}><Icon name="week" size={15} /> {L('جدولي', 'Timetable')}</button>}
      />
      {!courses.length ? (
        <StudyWelcome />
      ) : (
        <div className="sx-cols">
          <div className="stack" style={{ minWidth: 0 }}>
            <StudyHome plan={plan} />
          </div>
          <div className="stack" style={{ minWidth: 0 }}>
            <section>
              <div className="group-title">
                <span>{L('موادي', 'My courses')}</span>
                <span className="row" style={{ gap: 12 }}>
                  <button onClick={() => openSheet({ type: 'ai-import' })}>{L('استيراد', 'Import')}</button>
                  <button onClick={() => openSheet({ type: 'exam' })}>{L('+ اختبار', '+ Exam')}</button>
                  <button onClick={() => openSheet({ type: 'course' })}>{L('+ مادة', '+ Course')}</button>
                </span>
              </div>
              <div className="sx-courses">
                {sorted.map((c) => <CourseRow key={c.id} c={c} plan={plan} />)}
                {ungraded && ungradedCourse && (
                  <button className="sx-course sx-grade" onClick={() => openSheet({ type: 'exam', id: ungraded.id })}>
                    <span className="sx-grade-ic"><Icon name="flag" size={16} /></span>
                    <span className="sx-course-t">
                      <b>{L(`كيف كان «${ungraded.title}»؟`, `How did “${ungraded.title}” go?`)}</b>
                      <span>{L(`${ungradedCourse.name} · سجّل درجتك`, `${ungradedCourse.name} · add your grade`)}</span>
                    </span>
                    <Icon name="chevron" size={14} className="chev-end" />
                  </button>
                )}
                {ungraded && <button className="sh-later" style={{ justifySelf: 'start', padding: '6px 14px' }} onClick={() => { A.finishExam(ungraded.id); toast(L('تمام — طلع من القائمة', 'Done — off the list'), { undoable: true }); }}>{L('ما أعرف درجتي بعد — خلّصته ✓', "Don't know my grade yet — mark it done ✓")}</button>}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- course page ----------------

/** the course's next exam: when, how ready, and today's share with a start button */
function ExamFocus({ c, ep }: { c: Course; ep?: ExamPlan }) {
  if (!ep)
    return (
      <section className="tile sx-exam">
        <div className="sx-kicker">{L('الاختبار القادم', 'Next exam')}</div>
        <p className="muted small" style={{ margin: 0 }}>{L('أضف موعد الاختبار ودروسه، وأحسب لك كم تذاكر كل يوم.', "Add the exam date and its lessons, and I'll work out how much to study each day.")}</p>
        <div><button className="btn primary sm" onClick={() => openSheet({ type: 'exam', courseId: c.id })}><Icon name="plus" size={14} /> {L('موعد الاختبار', 'Exam date')}</button></div>
      </section>
    );
  const st = standing(ep);
  return (
    <section className="tile sx-exam" style={{ ['--c' as string]: c.color }}>
      <div className="sx-exam-head">
        <div>
          <div className="sx-kicker">{L('الاختبار القادم', 'Next exam')}</div>
          <h2>{ep.exam.title}</h2>
          <div className="faint small">{fmtDate(ep.exam.date)}{ep.exam.time ? ` · ${ep.exam.time}` : ''} · {whenText(ep)}</div>
        </div>
        <Pill {...st} />
      </div>
      {ep.status !== 'unknown' && (
        <div className="sx-ready">
          <div className="row between small"><span className="muted">{L('جاهزيتك', 'Readiness')}</span><b className="num">{Math.round(ep.progress * 100)}%</b></div>
          <Bar value={ep.progress} color={c.color} thick />
        </div>
      )}
      {ep.todayMinutes > 0 ? (
        <div className="sx-exam-today">
          <span><b>{L('اليوم', 'Today')}:</b> {lessonsLine(ep)} · {fmtMinutes(ep.todayMinutes)}</span>
          <button className="btn primary sm" onClick={() => startStudy(ep)}><Icon name="play" size={13} /> {L('ابدأ', 'Start')}</button>
        </div>
      ) : ep.quota > 0 ? (
        <div className="sx-exam-today"><span>{L('خلصت حصة اليوم ✓', "Today's share done ✓")}</span></div>
      ) : null}
      <button className="linkish small" style={{ alignSelf: 'flex-start', textDecoration: 'none' }} onClick={() => openSheet({ type: 'exam', id: ep.exam.id })}>
        {ep.status === 'unknown' ? L('اختر دروس الاختبار ←', 'Pick the exam’s lessons ←') : L('خطة الاختبار كاملة ←', 'The full exam plan ←')}
      </button>
    </section>
  );
}

/** your speed in plain words */
function paceLine(c: Course, pace: ReturnType<typeof coursePace>): string {
  const per = pace.pace >= 10 ? Math.round(pace.pace) : Math.round(pace.pace * 10) / 10;
  const base = L(`تحتاج تقريبًا ${per} دقيقة لكل ${sz(c.sizeLabel)}`, `You take about ${per} minutes per ${sz(c.sizeLabel)}`);
  if (pace.source === 'data') return L(`${base} — من ${pace.n} ${pace.n === 1 ? 'جلسة' : 'جلسات'} سجلتها.`, `${base} — from ${pace.n} session${pace.n === 1 ? '' : 's'} you logged.`);
  if (pace.source === 'guess') return L(`${base} — حسب تقديرك. يدق بعد ما تسجّل جلسات.`, `${base} — your own guess. It sharpens once you log sessions.`);
  if (pace.source === 'global') return L(`${base} — من سرعتك في موادك الثانية.`, `${base} — from your speed in other courses.`);
  return L(`${base} — تقدير مبدئي. سجّل كم أنجزت بعد كل جلسة ويصير دقيق.`, `${base} — a first guess. Log how much you covered after each session and it gets accurate.`);
}

function CourseDetail({ id }: { id: string }) {
  const s = useApp();
  const now = useNow();
  const plan = useMemo(() => planStudy(s, now), [s, now]);
  const c = s.courses.find((x) => x.id === id);
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState('');
  if (!c)
    return (
      <div>
        <PageTop title={L('غير موجودة', 'Not found')} back={{ label: L('الدراسة', 'Study'), to: 'study' }} />
        <div className="card"><Empty icon="study" title={L('المادة غير موجودة', 'Course not found')} /></div>
      </div>
    );
  const units = s.units.filter((u) => u.courseId === id).sort((a, b) => a.order - b.order);
  const pace = coursePace(s, c);
  const remaining = units.reduce((a, u) => a + unitMinutes(u, c, pace.pace, s.settings.reviewFactor), 0);
  const sessions = s.sessions.filter((x) => x.courseId === id && !x.tick).sort((a, b) => b.at - a.at);
  const exams = s.exams.filter((e) => e.courseId === id).sort((a, b) => b.date.localeCompare(a.date));
  const studied = sessions.reduce((a, x) => a + x.minutes, 0);
  const studiedToday = sessions.filter((x) => x.date === todayKey(now)).reduce((a, x) => a + x.minutes, 0);
  const finished = units.filter((u) => u.progress >= 1).length;
  const ep = nextExam(plan, id);
  const today = todayKey(now);
  // each lesson's day in the plan (a course with two exams: the nearer one first)
  const when = new Map<string, UnitWhen>();
  for (const x of plan.exams.filter((y) => y.course.id === id && y.status !== 'past' && y.status !== 'unknown')) for (const [k, v] of unitSchedule(x, today)) if (!when.has(k)) when.set(k, v);

  const addLessons = () => {
    const ids = A.addUnits(id, parseUnitLines(bulk, 10));
    setBulk('');
    setAdding(false);
    const upcoming = s.exams.filter((e) => e.courseId === id && e.date >= today && e.score == null);
    if (upcoming.length)
      toast(L(`أُضيفت ${ids.length} دروس. هل هي ضمن ${upcoming[0].title}؟`, `Added ${ids.length} lessons. Are they part of ${upcoming[0].title}?`), {
        buttons: [{ label: L('نعم', 'Yes'), primary: true, fn: () => A.saveExam({ ...upcoming[0], unitIds: [...upcoming[0].unitIds, ...ids] }) }],
        ms: 10000,
      });
    else toast(L(`أُضيفت ${ids.length} دروس`, `Added ${ids.length} lessons`));
  };

  return (
    <div>
      <PageTop
        back={{ label: L('الدراسة', 'Study'), to: 'study' }}
        title={<span className="sx-title"><span className="sx-dot lg" style={{ background: c.color }} />{c.name}</span>}
        sub={units.length ? L(`${finished} من ${units.length} دروس${remaining > 1 ? ` · باقي ~${fmtMinutes(remaining)}` : ''}${studiedToday ? ` · اليوم ${fmtMinutes(studiedToday)}` : studied ? ` · ذاكرت ${fmtMinutes(studied)}` : ''}`, `${finished} of ${units.length} lessons${remaining > 1 ? ` · ~${fmtMinutes(remaining)} left` : ''}${studiedToday ? ` · ${fmtMinutes(studiedToday)} today` : studied ? ` · ${fmtMinutes(studied)} studied` : ''}`) : undefined}
        actions={<button className="btn sm" onClick={() => openSheet({ type: 'course', id })}><Icon name="edit" size={14} /> {L('تعديل', 'Edit')}</button>}
      />
      <div className="sx-cols">
        <div className="stack" style={{ minWidth: 0 }}>
          <ExamFocus c={c} ep={ep} />

          <section>
            <div className="group-title">
              <span>{L('المنهج', 'Syllabus')}{units.length ? ` · ${finished}/${units.length}` : ''}</span>
              <button onClick={() => setAdding(!adding)}>{adding ? L('إلغاء', 'Cancel') : L('+ دروس', '+ Lessons')}</button>
            </div>
            <div className="rows">
              {units.map((u) => <LessonRow key={u.id} u={u} color={c.color} pace={pace.pace} sizeLabel={c.sizeLabel} when={when.get(u.id)} today={today} />)}
              {!units.length && !adding && (
                <button className="r" onClick={() => setAdding(true)}>
                  <span className="ic"><Icon name="plus" size={16} /></span>
                  <span className="main-t"><div className="lbl">{L('أضف دروس المادة', 'Add the course’s lessons')}</div><div className="sub">{L('كل درس في سطر مع حجمه', 'One lesson per line with its size')}</div></span>
                </button>
              )}
              {adding && (
                <div className="sx-add">
                  <textarea className="textarea" autoFocus value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={L(`درس في كل سطر مع حجمه (${sz(c.sizeLabel)}):\nالفصل 4 - 22\nالفصل 5 - 30`, `One lesson per line with its size (${sz(c.sizeLabel)}):\nChapter 4 - 22\nChapter 5 - 30`)} />
                  <button className="btn sm primary" disabled={!bulk.trim()} onClick={addLessons}><Icon name="plus" size={14} /> {L('أضف', 'Add')}</button>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="stack" style={{ minWidth: 0 }}>
          <section>
            <div className="group-title">
              <span>{L('الاختبارات', 'Exams')}</span>
              <button onClick={() => openSheet({ type: 'exam', courseId: id })}>{L('+ اختبار', '+ Exam')}</button>
            </div>
            <div className="rows">
              {exams.map((e) => {
                const past = e.date < today || e.score != null;
                return (
                  <button key={e.id} className="r" onClick={() => openSheet({ type: 'exam', id: e.id })}>
                    <span className="ic" style={{ color: past ? 'var(--faint)' : c.color }}><Icon name="flag" size={16} /></span>
                    <span className="main-t">
                      <div className="lbl">{e.title}</div>
                      <div className="sub">{fmtDate(e.date)}{!past ? ` · ${daysUntil(e.date, today)}` : ''}</div>
                    </span>
                    <span className="val small">{e.score != null ? `${e.score}%` : past ? L('أدخل الدرجة', 'Add grade') : ''}</span>
                  </button>
                );
              })}
              {!exams.length && <div className="r muted small">{L('لا اختبارات بعد.', 'No exams yet.')}</div>}
            </div>
          </section>

          {units.length > 0 && (
            <section className="tile sx-pace">
              <div className="sx-kicker">{L('سرعتك', 'Your pace')}</div>
              <p>{paceLine(c, pace)}</p>
            </section>
          )}

          {sessions.length > 0 && (
            <Collapse title={L('جلساتك', 'Your sessions')} count={sessions.length}>
              <div className="rows">
                {sessions.slice(0, 60).map((x) => {
                  const u = s.units.find((y) => y.id === x.unitId);
                  return (
                    <div key={x.id} className="r">
                      <span className="main-t">
                        <div className="lbl">{u?.title || L('مذاكرة عامة', 'General study')}</div>
                        <div className="sub">{relDay(x.date, today)}{x.review ? L(' · مراجعة', ' · review') : x.amount ? ` · ${szn(x.amount, c.sizeLabel)}` : ''}</div>
                      </span>
                      <span className="val small num">{fmtMinutes(x.minutes)}</span>
                    </div>
                  );
                })}
              </div>
            </Collapse>
          )}
        </div>
      </div>
    </div>
  );
}
