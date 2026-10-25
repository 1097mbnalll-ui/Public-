import { useMemo, useState } from 'react';
import { Bar, Collapse, Empty, Group, Ring, Row, useNow } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { daysWord, fmtClock, fmtDate, fmtMinutes, fmtMinutesShort, relDay, todayKey } from '../lib/dates';
import { planStudy, portionText, unitMinutes, type ExamPlan, type StudyPlan } from '../lib/engine/study';
import { studyCapFor, studyCapToday } from '../lib/engine/capacity';
import { coursePace } from '../lib/engine/learning';
import { openSheet } from '../ui/sheets';
import { go, useRoute } from '../ui/router';
import { LessonRow, examSentence, parseUnitLines } from '../ui/StudySheets';
import { toast } from '../ui/toast';
import { PageTop } from '../ui/PageTop';
import { L, sz } from '../lib/i18n';

export function Study() {
  const r = useRoute();
  if (r.id) return <CourseDetail key={r.id} id={r.id} />;
  return <StudyOverview />;
}


/** «الميد اليوم ٥ م» · «بكرة» · «بعد ٤ أيام» */
function whenText(ep: ExamPlan) {
  if (ep.daysLeft === 0) return L(`اليوم${ep.exam.time ? ` ${fmtClock(ep.exam.time)}` : ''}`, `today${ep.exam.time ? ` ${fmtClock(ep.exam.time)}` : ''}`);
  if (ep.daysLeft === 1) return L('بكرة', 'tomorrow');
  return L(`بعد ${daysWord(ep.daysLeft)}`, `in ${daysWord(ep.daysLeft)}`);
}

/** big number + unit for the hero: «٢ ساعات» / «٤٥ دقيقة» */
function bigTime(m: number): [string, string] {
  if (m < 60) return [String(Math.round(m)), L('دقيقة اليوم', 'min today')];
  const h = Math.round((m / 60) * 2) / 2;
  return [String(h).replace('.5', '½'), h <= 2 ? L('ساعات اليوم', 'hours today') : L('ساعات اليوم', 'hours today')];
}

/** S1: today's subject on top (nearest exam), the rest nearest-first with today's hours, courses last */
function StudyOverview() {
  const s = useApp();
  const now = useNow();
  const plan = useMemo(() => planStudy(s, now), [s, now]);
  const today = todayKey(now);
  const past = s.exams.filter((e) => (e.date < today || e.score != null) && !plan.exams.some((p) => p.exam.id === e.id && p.status !== 'past')).sort((a, b) => b.date.localeCompare(a.date));
  const courses = s.courses.filter((c) => !c.archived);
  const active = plan.exams.filter((e) => e.status !== 'past' && e.status !== 'done');
  // nearest exam with something to do today leads; otherwise the nearest one
  const hero = active.find((e) => e.todayMinutes > 0 || e.reviewToday) || active[0];
  const rest = active.filter((e) => e !== hero);
  const total = plan.exams.reduce((a, e) => a + e.todayMinutes, 0);
  const free = studyCapToday(s, now);
  const [num, unit] = bigTime(hero?.todayMinutes || 0);
  const firstUnit = hero?.portion[0]?.unit;

  return (
    <div>
      <PageTop
        title={L("الدراسة", "Study")}
        sub={total ? L(`مطلوب اليوم: ${fmtMinutes(total)}`, `Needed today: ${fmtMinutes(total)}`) : courses.length ? L('لا مذاكرة مطلوبة اليوم', "No study needed today") : L('موادك واختباراتك', "Your courses and exams")}
        actions={<>
          <button className="icon-btn" onClick={() => go('schedule')} aria-label={L('جدولي', 'Timetable')}><Icon name="week" /></button>
          {courses.length > 0 && <button className="icon-btn" onClick={() => openSheet({ type: 'study-log' })} aria-label={L('سجّل مذاكرة', 'Log study')}><Icon name="clock" /></button>}
        </>}
      />

      {!courses.length ? (
        <div className="card">
          <Empty icon="study" title={L("أضف موادك واختباراتك", "Add your courses and exams")}>{L("أدخل المادة ودروسها، ثم موعد الاختبار — وأحسب لك كم تذاكر كل يوم.", "Enter the course and its lessons, then the exam date — I'll work out how much to study each day.")}<div style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={() => openSheet({ type: 'course' })}><Icon name="plus" size={16} />{L(" أول مادة", " First course")}</button>
              <PasteLink />
            </div>
          </Empty>
        </div>
      ) : (
        <div className="stack">
          {hero ? (
            <div className="st-hero">
              <button className="k" onClick={() => openSheet({ type: 'exam', id: hero.exam.id })}>
                <span>📌 {L('مادة اليوم', "Today's subject")}</span>
                <span>🚩 {hero.exam.title} {whenText(hero)}</span>
              </button>
              <h3>{hero.course.name}</h3>
              {hero.todayMinutes > 0 ? (
                <div className="big"><b>{num}</b><span>{hero.reviewToday ? L('مراجعة اليوم', 'review today') : unit}</span></div>
              ) : (
                <div className="big"><span>{hero.doneToday > 0 ? L('✓ خلّصت حصة اليوم', "✓ Today's share done") : hero.nextDay ? L(`تبدأ ${relDay(hero.nextDay, today)}`, `Starts ${relDay(hero.nextDay, today)}`) : L('ما عليك له شي اليوم', 'Nothing for it today')}</span></div>
              )}
              {hero.doneToday > 0 && hero.quota > 0 && (
                <div className="st-prog"><i style={{ width: `${Math.min(100, (hero.doneToday / hero.quota) * 100)}%` }} /><span>{L(`ذاكرت ${fmtMinutes(hero.doneToday)} من ${fmtMinutes(hero.quota)}`, `${fmtMinutes(hero.doneToday)} of ${fmtMinutes(hero.quota)} done`)}</span></div>
              )}
              {(hero.portion.length > 0 || hero.reviewToday) && (
                <div className="les">{hero.reviewToday ? '🔁 ' + L('يوم مراجعة — بدون دروس جديدة', 'Review day — nothing new') : '📖 ' + hero.portion.map((x) => portionText(x, hero.course.sizeLabel)).join(' · ')}</div>
              )}
              {hero.todayMinutes > 0 && (
                <div className="hb">
                  <button className="p" onClick={() => A.startTimer({ kind: 'study', refId: firstUnit?.id || hero.exam.id, courseId: hero.course.id, unitId: firstUnit?.id, label: `${hero.course.name}${firstUnit ? ` · ${firstUnit.title}` : ''}` })}>▶ {L('ابدأ', 'Start')}</button>
                  <button className="g" onClick={() => openSheet({ type: 'study-log', courseId: hero.course.id, unitId: firstUnit?.id })}>{L('سجّل', 'Log')}</button>
                </div>
              )}
            </div>
          ) : (
            <div className="card"><Empty icon="flag" title={L("لا اختبارات قادمة", "No upcoming exams")}>{L("أضف موعد اختبار وتطلع لك ساعات المذاكرة كل يوم.", "Add an exam date and your daily study hours appear.")}<div style={{ marginTop: 12 }}><button className="btn sm" onClick={() => openSheet({ type: 'exam' })}>{L("أضف اختبار", "Add exam")}</button></div></Empty></div>
          )}

          {rest.length > 0 && (
            <section>
              <div className="group-title"><span>{L('بعدها — الأقرب فالأقرب', 'Then — nearest first')}</span><span className="faint">{rest.length}</span></div>
              <div className="stack" style={{ gap: 9 }}>
                {rest.map((ep) => (
                  <button key={ep.exam.id} className="st-row" onClick={() => go(`study/${ep.course.id}`)}>
                    <span className="dot" style={{ background: ep.course.color }} />
                    <span className="grow">
                      <b>{ep.course.name}</b>
                      <span>🚩 {ep.exam.title} {whenText(ep)}{ep.reviewToday ? L(' · يوم مراجعة', ' · review day') : ep.status === 'unknown' ? L(' · أضف الدروس', ' · add lessons') : !ep.todayMinutes && ep.nextDay ? L(` · تبدأ ${relDay(ep.nextDay, today)}`, ` · starts ${relDay(ep.nextDay, today)}`) : ''}</span>
                    </span>
                    <span className={`hp ${ep.todayMinutes ? '' : 'z'}`}>{ep.todayMinutes ? fmtMinutes(ep.todayMinutes) : ep.doneToday > 0 ? '✓' : '—'}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {total > 0 && total > free + 5 && (
            <div className="notice amber small">{L(`المطلوب اليوم ${fmtMinutes(total)} — أكثر من وقت مذاكرتك المحدد (${fmtMinutes(free)}). الاختبارات أولًا: خفّف المهام اللي تقدر تأجلها.`, `Today needs ${fmtMinutes(total)} — more than your set study time (${fmtMinutes(free)}). Exams first: lighten tasks that can wait.`)}</div>
          )}

          <section>
            <div className="group-title">
              <span>{L('المواد', 'Courses')}</span>
              <span className="row" style={{ gap: 12 }}>
                <button onClick={() => openSheet({ type: 'exam' })}>{L('+ اختبار', '+ Exam')}</button>
                <button onClick={() => openSheet({ type: 'course' })}>{L('+ مادة', '+ Course')}</button>
              </span>
            </div>
            <div className="st-grid">
              {courses.map((c) => {
                const units = s.units.filter((u) => u.courseId === c.id);
                const size = units.reduce((a, u) => a + u.size, 0);
                const done = units.reduce((a, u) => a + u.size * u.progress, 0);
                const next = plan.exams.find((e) => e.course.id === c.id && e.status !== 'past');
                return (
                  <button key={c.id} className="card" onClick={() => go(`study/${c.id}`)}>
                    <b>{c.name}</b>
                    <span>{units.length ? L(`${units.filter((u) => u.progress >= 1).length} من ${units.length} دروس`, `${units.filter((u) => u.progress >= 1).length} of ${units.length} lessons`) : L('بدون دروس', 'No lessons')}{next ? '' : L(' · بدون اختبار', ' · no exam')}</span>
                    <i className="bar"><i style={{ width: `${size ? (done / size) * 100 : 0}%`, background: c.color }} /></i>
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 8 }}><PasteLink /></div>
          </section>

          {past.length > 0 && (
            <Collapse title={L("اختبارات سابقة", "Past exams")} count={past.length}>
              <Group>
                {past.slice(0, 12).map((e) => {
                  const c = s.courses.find((x) => x.id === e.courseId);
                  return (
                    <Row key={e.id} label={`${c?.name || ''} — ${e.title}`} sub={fmtDate(e.date)} value={e.score != null ? `${e.score}%` : L('أدخل الدرجة', "Enter grade")} chevron onClick={() => openSheet({ type: 'exam', id: e.id })} />
                  );
                })}
              </Group>
            </Collapse>
          )}
        </div>
      )}
    </div>
  );
}

function CourseDetail({ id }: { id: string }) {
  const s = useApp();
  const c = s.courses.find((x) => x.id === id);
  const [bulk, setBulk] = useState('');
  if (!c)
    return (
      <div>
        <PageTop title={L("غير موجودة", "Not found")} back={{ label: L('الدراسة', "Study"), to: 'study' }} />
        <div className="card"><Empty icon="study" title={L("المادة غير موجودة", "Course not found")} /></div>
      </div>
    );
  const units = s.units.filter((u) => u.courseId === id).sort((a, b) => a.order - b.order);
  const pace = coursePace(s, c);
  const remaining = units.reduce((a, u) => a + unitMinutes(u, c, pace.pace, s.settings.reviewFactor), 0);
  const total = units.reduce((a, u) => a + u.size, 0);
  const done = units.reduce((a, u) => a + u.size * u.progress, 0);
  const sessions = s.sessions.filter((x) => x.courseId === id).sort((a, b) => b.at - a.at);
  const exams = s.exams.filter((e) => e.courseId === id).sort((a, b) => a.date.localeCompare(b.date));
  const studied = sessions.reduce((a, x) => a + x.minutes, 0);
  const finished = units.filter((u) => u.progress >= 1).length;

  return (
    <div>
      <PageTop
        back={{ label: L('الدراسة', "Study"), to: 'study' }}
        title={c.name}
        sub={L(`${finished} من ${units.length} دروس · بقي ~${fmtMinutes(remaining)} (±${Math.round(pace.spread * 100)}%)`, `${finished} of ${units.length} lessons · ~${fmtMinutes(remaining)} left (±${Math.round(pace.spread * 100)}%)`)}
      />
      <div className="stack">
        <div className="exam-hero">
          <div className="row" style={{ gap: 14 }}>
            <Ring value={total ? done / total : 0} size={58} stroke={5} color={c.color} />
            <div className="kpis grow">
              <div className="kpi"><div className="v">{fmtMinutesShort(studied)}</div><div className="k">{L("ذاكرت فعليًا", "Actually studied")}</div></div>
              <div className="kpi"><div className="v">{pace.pace.toFixed(1)}{L(" د", " min")}</div><div className="k">{L("لكل ", "per ")}{sz(c.sizeLabel)}</div></div>
              <div className="kpi"><div className="v">{sessions.length}</div><div className="k">{L("جلسات", "Sessions")}</div></div>
            </div>
          </div>
          <div className="faint tiny">
            {pace.source === 'data' ? L(`سرعتك محسوبة من ${pace.n} جلسات سجلتها.`, `Your speed is based on ${pace.n} sessions you logged.`) : L('السرعة تقديرية حتى تسجل جلسات — ابدأ المؤقت عند المذاكرة وسجّل كم أنجزت.', "Speed is an estimate until you log sessions — start the timer when you study and log how much you covered.")}
          </div>
        </div>

        <Group title={L("الاختبارات", "Exams")} action={<button onClick={() => openSheet({ type: 'exam', courseId: id })}>{L("+ اختبار", "+ Exam")}</button>}>
          {exams.length ? (
            exams.map((e) => <Row key={e.id} icon="flag" iconColor={c.color} label={e.title} sub={fmtDate(e.date)} value={e.score != null ? `${e.score}%` : undefined} chevron onClick={() => openSheet({ type: 'exam', id: e.id })} />)
          ) : (
            <Row icon="flag" label={L("أضف موعد الاختبار", "Add the exam date")} sub={L("لتحصل على خطة يومية وتنبيه مبكر", "To get a daily plan and early warnings")} chevron onClick={() => openSheet({ type: 'exam', courseId: id })} />
          )}
        </Group>

        <Group title={L(`الدروس (${units.length})`, `Lessons (${units.length})`)}>
          {units.map((u) => <LessonRow key={u.id} u={u} color={c.color} pace={pace.pace} sizeLabel={sz(c.sizeLabel)} />)}
          {!units.length && <div className="r muted small">{L("لا دروس بعد — أضفها بالأسفل.", "No lessons yet — add them below.")}</div>}
        </Group>

        <Collapse title={L("إضافة دروس", "Add lessons")}>
          <div className="card col" style={{ gap: 10 }}>
            <textarea className="textarea" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={L(`درس في كل سطر مع حجمه (${sz(c.sizeLabel)}):\nالفصل 4 - 22\nالفصل 5 - 30`, `One lesson per line with its size (${sz(c.sizeLabel)}):\nChapter 4 - 22\nChapter 5 - 30`)} />
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={!bulk.trim()} onClick={() => {
              const ids = A.addUnits(id, parseUnitLines(bulk, 10));
              setBulk('');
              const upcoming = s.exams.filter((e) => e.courseId === id && e.date >= todayKey() && e.score == null);
              if (upcoming.length)
                toast(L(`أُضيفت ${ids.length} دروس. هل هي ضمن ${upcoming[0].title}؟`, `Added ${ids.length} lessons. Are they part of ${upcoming[0].title}?`), {
                  buttons: [{ label: L('نعم', "Yes"), primary: true, fn: () => A.saveExam({ ...upcoming[0], unitIds: [...upcoming[0].unitIds, ...ids] }) }],
                  ms: 10000,
                });
              else toast(L(`أُضيفت ${ids.length} دروس`, `Added ${ids.length} lessons`));
            }}>
              <Icon name="plus" size={15} />{L(" أضف", " Add")}</button>
          </div>
        </Collapse>

        {sessions.length > 0 && (
          <Collapse title={L("جلسات المذاكرة", "Study sessions")} count={sessions.length}>
            <Group>
              {sessions.slice(0, 60).map((x) => {
                const u = s.units.find((y) => y.id === x.unitId);
                return (
                  <Row key={x.id} label={u?.title || L('مذاكرة عامة', "General study")} sub={`${fmtDate(x.date)}${x.amount ? ` · ${x.amount} ${sz(c.sizeLabel)}` : ''}`} value={fmtMinutes(x.minutes)} />
                );
              })}
            </Group>
          </Collapse>
        )}

        <Group>
          <Row icon="edit" label={L("تعديل المادة", "Edit course")} sub={L("الاسم، الصعوبة، اللون، سرعتك المتوقعة", "Name, difficulty, colour, your expected speed")} chevron onClick={() => openSheet({ type: 'course', id })} />
          <Row icon="trash" danger label={L("حذف المادة", "Delete course")} onClick={() => { if (confirm(L(`حذف ${c.name} مع دروسها واختباراتها وجلساتها؟`, `Delete ${c.name} with its lessons, exams and sessions?`))) { A.deleteCourse(id); go('study'); toast(L('حُذفت المادة', "Course deleted"), { undoable: true }); } }} />
        </Group>
      </div>
    </div>
  );
}

/**
 * «حصة اليوم»: for every upcoming exam, how much to study today (and which lessons) so the
 * material is finished before the review days. Missed minutes roll into the next days' quota.
 */
export function TodayQuota({ plan, title }: { plan: StudyPlan; title?: string }) {
  const s = useApp();
  const today = todayKey();
  const active = plan.exams.filter((ep) => ep.quota > 0 || ep.inReview || ep.status === 'unknown');
  if (!active.length) return null;
  const totalQuota = active.reduce((a, ep) => a + ep.quota, 0);
  const totalLeft = active.reduce((a, ep) => a + ep.todayMinutes, 0);
  const cap = studyCapFor(s, today);

  return (
    <section>
      <div className="group-title">
        <span>{title || L("المذاكرة المطلوبة اليوم", "Study required today")}</span>
        <span className="faint" style={{ fontWeight: 500 }}>{totalLeft ? L(`باقي ${fmtMinutes(totalLeft)}`, `${fmtMinutes(totalLeft)} left`) : L('أنجزت حصص اليوم ✓', "Today's quotas done ✓")}</span>
      </div>
      <div className="col" style={{ gap: 10 }}>
        {active.map((ep) => {
          if (ep.status === 'unknown')
            return (
              <button key={ep.exam.id} className="card tap row" style={{ width: '100%', textAlign: 'start' }} onClick={() => openSheet({ type: 'exam', id: ep.exam.id })}>
                <span className="dot" style={{ background: ep.course.color }} />
                <span className="grow">{ep.course.name} — {ep.exam.title}: <span style={{ color: 'var(--violet)' }}>{L("حدد الدروس المطلوبة لأحسب حصتك", "Set the required lessons so I can work out your quota")}</span></span>
              </button>
            );
          if (ep.inReview)
            return (
              <div key={ep.exam.id} className="card">
                <div className="row" style={{ gap: 8 }}>
                  <span className="dot" style={{ background: ep.course.color }} />
                  <b>{ep.course.name}</b>
                  <span className="faint small">— {ep.exam.title} {ep.daysLeft === 1 ? L('غدًا', "Tomorrow") : L(`بعد ${daysWord(ep.daysLeft)}`, `in ${daysWord(ep.daysLeft)}`)}</span>
                </div>
                <div className="small muted" style={{ marginTop: 6 }}>{L("أيام المراجعة: لا مادة جديدة. راجع ملخصاتك وحل أسئلة سابقة.", "Review days: no new material. Go over your summaries and solve past questions.")}</div>
              </div>
            );
          const doneAll = ep.todayMinutes <= 0;
          const y = ep.yesterday;
          const grew = y && y.done < y.quota && ep.quota > y.quota;
          return (
            <div key={ep.exam.id} className="card" style={{ borderInlineStart: `3px solid ${ep.course.color}` }}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 650 }}>{ep.course.name}</div>
                  <div className="faint tiny">{ep.exam.title} {fmtDate(ep.exam.date, false)}{L(" · تنهي المنهج ", " · finish the syllabus ")}{fmtDate(ep.lastStudyDay, false)}{L(" وتبقى ", " with ")}{daysWord(ep.exam.reviewDays || 0)}{L(" للمراجعة", " left for review")}</div>
                </div>
                <div style={{ textAlign: 'end', flexShrink: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: doneAll ? 'var(--green)' : undefined }} className="num">{doneAll ? '✓' : fmtMinutes(ep.todayMinutes)}</div>
                  <div className="faint tiny">{doneAll ? L('أنجزت حصة اليوم', "Today's quota done") : ep.doneToday ? L(`من ${fmtMinutes(ep.quota)}`, `of ${fmtMinutes(ep.quota)}`) : L('اليوم', "Today")}</div>
                </div>
              </div>
              <div style={{ margin: '10px 0 8px' }}><Bar value={ep.quota ? ep.doneToday / ep.quota : 0} color={ep.course.color} /></div>
              {!doneAll && ep.portion.length > 0 && (
                <ul className="small" style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 3 }}>
                  {ep.portion.map((x) => (
                    <li key={x.unit.id}>
                      <bdi>{x.unit.title}</bdi>
                      {x.review ? L(' (مراجعة)', " (review)") : x.whole ? (x.unit.progress > 0 ? L(' (الباقي)', " (the rest)") : L(' (كامل)', " (whole)")) : ` — ${x.amount} ${sz(ep.course.sizeLabel)}`}
                      <span className="faint"> · ~{fmtMinutes(x.minutes)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {grew && (
                <div className="chip amber" style={{ marginTop: 8, height: 'auto', padding: '4px 10px', whiteSpace: 'normal' }}>{L("زادت ", "Up ")}{fmtMinutes(ep.quota - y!.quota)}{L(" عن حصة أمس لأنك ذاكرت ", " from yesterday's quota because you studied ")}{fmtMinutes(y!.done)}{L(" من ", " of ")}{fmtMinutes(y!.quota)}
                </div>
              )}
              {y && y.done >= y.quota && !grew && <div className="faint tiny" style={{ marginTop: 8 }}>{L("أمس أنجزت حصتك كاملة ✓", "Yesterday you finished your whole quota ✓")}</div>}
              {(ep.status === 'behind' || ep.status === 'tight') && (
                <div className="tiny" style={{ marginTop: 8, color: ep.status === 'behind' ? 'var(--red)' : 'var(--amber)' }}>{examSentence(ep).text}</div>
              )}
              {!doneAll && (
                <div className="row" style={{ gap: 8, marginTop: 12 }}>
                  <button className="btn sm primary" onClick={() => A.startTimer({ kind: 'study', refId: ep.exam.id, courseId: ep.course.id, unitId: ep.portion[0]?.unit.id, label: L(`مذاكرة ${ep.course.name}`, `Study ${ep.course.name}`) })}>
                    <Icon name="play" size={13} />{L(" ابدأ", " Start")}</button>
                  <button className="btn sm" onClick={() => openSheet({ type: 'study-log', courseId: ep.course.id, unitId: ep.portion[0]?.unit.id })}>{L("سجّل ما ذاكرته", "Log what I studied")}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {totalQuota > cap + 10 && (
        <div className="notice amber" style={{ marginTop: 10 }}>
          <Icon name="alert" size={18} />
          <div>{L("مجموع حصص اليوم ", "Today's quotas add up to ")}{fmtMinutes(totalQuota)}{L(" أكبر من الوقت المخصص للمذاكرة (", ", more than your study time (")}{fmtMinutes(cap)}{L("). زد وقت المذاكرة من «أنت»، أو قلّل دروسًا أقل أهمية — وإلا ستكبر حصص الأيام القادمة.", "). Raise study time in “You”, or drop less important lessons — otherwise the coming days' quotas will grow.")}</div>
        </div>
      )}
      <p className="faint tiny" style={{ margin: '8px 6px 0' }}>{L("الحصة = المتبقي ÷ الأيام الباقية قبل أيام المراجعة. إذا ذاكرت أقل من حصتك، يتوزع الباقي على الأيام التالية فتكبر حصتها.", "Quota = what's left ÷ days left before the review days. Study less than your quota and the rest spreads over the following days, making them bigger.")}</p>
    </section>
  );
}

/** import a course or tasks: a Masar link or an AI's reply (iPhone opens tapped links in Safari, with separate data) */
function PasteLink() {
  return <button className="paste-link" onClick={() => openSheet({ type: 'ai-import' })}>{L('استيراد', 'Import')}</button>;
}
