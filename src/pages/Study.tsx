import { useMemo, useState } from 'react';
import { Bar, Collapse, Empty, Ring, useNow } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { addDays, daysWord, diffDays, fmtClock, fmtDate, fmtMinutes, relDay, todayKey } from '../lib/dates';
import { planStudy, portionText, unitMinutes, type ExamPlan, type StudyPlan } from '../lib/engine/study';
import { studyCapFor } from '../lib/engine/capacity';
import { coursePace } from '../lib/engine/learning';
import { openSheet } from '../ui/sheets';
import { go, useRoute } from '../ui/router';
import { LessonRow, parseUnitLines } from '../ui/StudySheets';
import { toast } from '../ui/toast';
import { PageTop } from '../ui/PageTop';
import { L, sz, szn } from '../lib/i18n';
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

function QueueRow({ ep, lead }: { ep: ExamPlan; lead?: boolean }) {
  const ok = ep.todayMinutes <= 0;
  return (
    <div className={`sx-q ${ok ? 'done' : ''}`}>
      <span className="sx-dot" style={{ background: ep.course.color }} />
      <button className="sx-q-main" onClick={() => go(`study/${ep.course.id}`)}>
        <b>{ep.course.name}</b>
        <span>{ok ? L('خلصت حصتها اليوم', 'Done for today') : `${ep.inReview ? L('مراجعة: ', 'Review: ') : ''}${lessonsLine(ep)}`}</span>
      </button>
      <span className="sx-q-min num">{ok ? <Icon name="check" size={16} /> : fmtMinutes(ep.todayMinutes)}</span>
      {!ok && !lead && (
        <button className="icon-btn sm" aria-label={L(`ابدأ ${ep.course.name}`, `Start ${ep.course.name}`)} onClick={() => startStudy(ep)}>
          <Icon name="play" size={13} />
        </button>
      )}
    </div>
  );
}

/**
 * «اليوم»: today's total and how far you've got, then the one lesson to start with — a big
 * button, nothing to choose — and the rest of the day under it.
 * `compact` (the Today page) keeps the total and the list, without the big lesson.
 */
export function StudyToday({ plan, compact }: { plan: StudyPlan; compact?: boolean }) {
  const s = useApp();
  const rows = plan.exams.filter((ep) => ep.quota > 0);
  const unknown = plan.exams.filter((ep) => ep.status === 'unknown');
  const hasExams = plan.exams.some((ep) => ep.status !== 'past');
  if (compact && !rows.length && !unknown.length) return null;
  const total = rows.reduce((a, ep) => a + ep.quota, 0);
  const left = rows.reduce((a, ep) => a + ep.todayMinutes, 0);
  const done = Math.min(total, rows.reduce((a, ep) => a + ep.doneToday, 0));
  const cap = studyCapFor(s, todayKey());
  const behind = rows.filter((ep) => ep.status === 'behind');
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
              {done > 0 ? L(`ذاكرت ${fmtMinutes(done)} من ${fmtMinutes(total)}`, `${fmtMinutes(done)} of ${fmtMinutes(total)} done`) : rows.length === 1 ? L('مادة واحدة', 'One course') : L(`${rows.length} مواد`, `${rows.length} courses`)}
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

      {rows.length > 0 && (behind.length > 0 || (total > cap + 5 && left > 0)) && (
        <div className={`sx-note ${behind.length ? 'red' : 'amber'}`}>
          {behind.length
            ? behind.map((ep) => L(`${ep.course.name}: حتى مع الالتزام ينقصك ~${fmtMinutes(ep.shortfall)} قبل الاختبار.`, `${ep.course.name}: even keeping to it you're ~${fmtMinutes(ep.shortfall)} short before the exam.`)).join(' ')
            : L(`أكثر من وقت مذاكرتك (${fmtMinutes(cap)}) — اللي ما تخلصه يتوزع على الأيام الجاية.`, `More than your study time (${fmtMinutes(cap)}) — what you don't finish spreads over the coming days.`)}
        </div>
      )}

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

/** big number + unit for the hero: «2» «ساعات اليوم» / «45» «دقيقة اليوم» */
function bigTime(m: number): [string, string] {
  if (m < 60) return [String(Math.round(m)), L('دقيقة اليوم', 'min today')];
  const h = Math.round((m / 60) * 2) / 2;
  return [String(h).replace('.5', '½'), h === 1 ? L('ساعة اليوم', 'hour today') : L('ساعات اليوم', 'hours today')];
}

/**
 * S1: «مادة اليوم» — the nearest exam that needs study today, its hours in large type, its
 * lessons and Start — then the other exams nearest first, each with today's share.
 */
function StudyS1({ plan }: { plan: StudyPlan }) {
  const s = useApp();
  const today = todayKey();
  const active = plan.exams.filter((ep) => ep.status !== 'past' && ep.status !== 'done' && ep.status !== 'unknown');
  const hero = active.find((ep) => ep.todayMinutes > 0) || active[0];
  const rest = active.filter((ep) => ep !== hero);
  const unknown = plan.exams.filter((ep) => ep.status === 'unknown');
  const rows = plan.exams.filter((ep) => ep.quota > 0);
  const total = rows.reduce((a, ep) => a + ep.quota, 0);
  const left = rows.reduce((a, ep) => a + ep.todayMinutes, 0);
  const cap = studyCapFor(s, today);
  const behind = rows.filter((ep) => ep.status === 'behind');
  const ahead = hero && !hero.todayMinutes ? aheadLesson(plan) : null;

  if (!hero && !unknown.length)
    return (
      <section className="tile sx-today">
        <div className="sx-calm">
          <b>{L('أضف موعد اختبار', 'Add an exam date')}</b>
          <span>{L('من موعد الاختبار ودروسه أحسب كم تذاكر كل يوم، وأقولك من وين تبدأ.', "From the exam date and its lessons I work out how much to study each day, and where to start.")}</span>
          <button className="btn sm primary" onClick={() => openSheet({ type: 'exam' })}><Icon name="plus" size={14} /> {L('موعد اختبار', 'Exam date')}</button>
        </div>
      </section>
    );

  const [num, unit] = bigTime(hero?.todayMinutes || 0);
  return (
    <>
      {hero && (
        <section className="st-hero" aria-label={L('مادة اليوم', "Today's subject")}>
          <button className="k" onClick={() => openSheet({ type: 'exam', id: hero.exam.id })}>
            <span>📌 {L('مادة اليوم', "Today's subject")}</span>
            <span>🚩 {hero.exam.title} {whenText(hero)}</span>
          </button>
          <button className="t" onClick={() => go(`study/${hero.course.id}`)}>{hero.course.name}</button>
          {hero.todayMinutes > 0 ? (
            <div className="big"><b className="num">{num}</b><span>{hero.inReview ? L('مراجعة اليوم', 'review today') : unit}</span></div>
          ) : (
            <div className="big"><span>{hero.doneToday > 0 ? L('✓ خلّصت حصتها اليوم', "✓ Today's share done") : hero.nextDay ? L(`تبدأ ${relDay(hero.nextDay, today)}`, `Starts ${relDay(hero.nextDay, today)}`) : L('ما عليك لها شي اليوم', 'Nothing for it today')}</span></div>
          )}
          {hero.doneToday > 0 && hero.quota > 0 && (
            <div className="st-prog"><i style={{ width: `${Math.min(100, (hero.doneToday / hero.quota) * 100)}%` }} /><span>{L(`ذاكرت ${fmtMinutes(hero.doneToday)} من ${fmtMinutes(hero.quota)}`, `${fmtMinutes(hero.doneToday)} of ${fmtMinutes(hero.quota)} done`)}</span></div>
          )}
          {hero.todayMinutes > 0 && hero.portion.length > 0 && <div className="les">{hero.inReview ? '🔁 ' : '📖 '}{lessonsLine(hero)}</div>}
          {hero.todayMinutes > 0 ? (
            <div className="hb">
              <button className="p" onClick={() => startStudy(hero)}>▶ {L('ابدأ', 'Start')}</button>
              <button className="g" onClick={() => openSheet({ type: 'study-log', courseId: hero.course.id, unitId: hero.portion[0]?.unit.id })}>{L('سجّل', 'Log')}</button>
            </div>
          ) : ahead ? (
            <div className="hb"><button className="p" onClick={() => startStudy(ahead.ep, ahead.unit)}>▶ {L(`تقدّم: ${ahead.unit.title}`, `Get ahead: ${ahead.unit.title}`)}</button></div>
          ) : null}
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <div className="group-title"><span>{L('بعدها — الأقرب فالأقرب', 'Then — nearest first')}</span><span className="faint">{rest.length}</span></div>
          <div className="stack" style={{ gap: 9 }}>
            {rest.map((ep) => (
              <div key={ep.exam.id} className="st-row">
                <span className="dot" style={{ background: ep.course.color }} />
                <button className="grow" onClick={() => go(`study/${ep.course.id}`)}>
                  <b>{ep.course.name}</b>
                  <span>🚩 {ep.exam.title} {whenText(ep)}{ep.inReview ? L(' · مراجعة', ' · review') : !ep.todayMinutes && ep.doneToday > 0 ? L(' · خلّصت حصتها', ' · done for today') : !ep.todayMinutes && ep.nextDay ? L(` · تبدأ ${relDay(ep.nextDay, today)}`, ` · starts ${relDay(ep.nextDay, today)}`) : ''}</span>
                </button>
                <span className={`hp num ${ep.todayMinutes ? '' : 'z'}`}>{ep.todayMinutes ? fmtMinutes(ep.todayMinutes) : ep.doneToday > 0 ? '✓' : '—'}</span>
                {ep.todayMinutes > 0 && (
                  <button className="icon-btn sm" aria-label={L(`ابدأ ${ep.course.name}`, `Start ${ep.course.name}`)} onClick={() => startStudy(ep)}><Icon name="play" size={13} /></button>
                )}
              </div>
            ))}
          </div>
        </section>
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

      {rows.length > 0 && (behind.length > 0 || (total > cap + 5 && left > 0)) && (
        <div className={`sx-note ${behind.length ? 'red' : 'amber'}`}>
          {behind.length
            ? behind.map((ep) => L(`${ep.course.name}: حتى مع الالتزام ينقصك ~${fmtMinutes(ep.shortfall)} قبل الاختبار.`, `${ep.course.name}: even keeping to it you're ~${fmtMinutes(ep.shortfall)} short before the exam.`)).join(' ')
            : L(`المطلوب اليوم ${fmtMinutes(total)} — أكثر من وقت مذاكرتك (${fmtMinutes(cap)}). الاختبارات أولًا: خفّف اللي يتأجل.`, `Today needs ${fmtMinutes(total)} — more than your study time (${fmtMinutes(cap)}). Exams first: lighten what can wait.`)}
        </div>
      )}

      {rows.length > 0 && (
        <details className="sx-why">
          <summary>{L('ليش هالأرقام؟', 'Why these numbers?')}</summary>
          <div>
            {rows.map((ep) => <p key={ep.exam.id}>{whyLine(ep)}</p>)}
            <p>{(s.settings.studyMode || 'smart') === 'smart'
              ? L('النظام الذكي: الدروس تخلص قبل الاختبار بيوم، ولما يزدحم الأسبوع المواد اللي اختبارها بعيد تنتظر لين يخف. تقدر تغيّره من الإعدادات.', 'Smart: lessons finish a day before the exam, and in a crowded week far-off exams wait until it eases. You can change this in settings.')
              : L('التوزيع المتساوي: الباقي ÷ الأيام الباقية. إذا ذاكرت أقل اليوم، الباقي يتوزع على الأيام اللي بعده.', 'Even split: what’s left ÷ days left. Study less today and the rest spreads over the days after.')}</p>
          </div>
        </details>
      )}
    </>
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
  const ungraded = s.exams.filter((e) => e.date < today && e.score == null && e.unitIds.length).sort((a, b) => b.date.localeCompare(a.date))[0];
  const ungradedCourse = ungraded && s.courses.find((c) => c.id === ungraded.courseId);

  return (
    <div>
      <PageTop
        title={L('الدراسة', 'Study')}
        sub={(() => { const m = plan.exams.reduce((a, ep) => a + ep.todayMinutes, 0); return m ? L(`مطلوب اليوم: ${fmtMinutes(m)}`, `Needed today: ${fmtMinutes(m)}`) : fmtDate(today); })()}
        actions={courses.length > 0 && <button className="btn sm" onClick={() => go('schedule')}><Icon name="week" size={15} /> {L('جدولي', 'Timetable')}</button>}
      />
      {!courses.length ? (
        <StudyWelcome />
      ) : (
        <div className="sx-cols">
          <div className="stack" style={{ minWidth: 0 }}>
            <StudyS1 plan={plan} />
          </div>
          <div className="stack" style={{ minWidth: 0 }}>
            <section>
              <div className="group-title">
                <span>{L('موادي', 'My courses')}</span>
                <span className="row" style={{ gap: 12 }}>
                  <button onClick={() => openSheet({ type: 'ai-import' })}>{L('استيراد', 'Import')}</button>
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
              </div>
            </section>
            <WeekStrip />
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
  const sessions = s.sessions.filter((x) => x.courseId === id).sort((a, b) => b.at - a.at);
  const exams = s.exams.filter((e) => e.courseId === id).sort((a, b) => b.date.localeCompare(a.date));
  const studied = sessions.reduce((a, x) => a + x.minutes, 0);
  const finished = units.filter((u) => u.progress >= 1).length;
  const ep = nextExam(plan, id);
  const todayIds = new Set(plan.exams.filter((x) => x.course.id === id).flatMap((x) => x.portion.map((p) => p.unit.id)));
  const today = todayKey(now);

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
        sub={units.length ? L(`${finished} من ${units.length} دروس${remaining > 1 ? ` · باقي ~${fmtMinutes(remaining)}` : ''}${studied ? ` · ذاكرت ${fmtMinutes(studied)}` : ''}`, `${finished} of ${units.length} lessons${remaining > 1 ? ` · ~${fmtMinutes(remaining)} left` : ''}${studied ? ` · ${fmtMinutes(studied)} studied` : ''}`) : undefined}
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
              {units.map((u) => <LessonRow key={u.id} u={u} color={c.color} pace={pace.pace} sizeLabel={c.sizeLabel} today={todayIds.has(u.id)} />)}
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
