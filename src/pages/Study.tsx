import { useMemo, useState } from 'react';
import { Bar, Collapse, Empty, Group, Ring, Row, useNow } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { addDays, daysWord, fmtDate, fmtMinutes, fmtMinutesShort, todayKey } from '../lib/dates';
import { planStudy, unitMinutes, type ExamPlan, type StudyPlan } from '../lib/engine/study';
import { studyCapFor } from '../lib/engine/capacity';
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

const TONE: Record<string, string> = { green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', violet: 'var(--violet)', blue: 'var(--accent)' };

function ExamRow({ ep }: { ep: ExamPlan }) {
  const sent = examSentence(ep);
  return (
    <button className="r" onClick={() => openSheet({ type: 'exam', id: ep.exam.id })}>
      <span className="mini-ring"><Ring value={ep.progress} size={38} stroke={4} color={ep.course.color} /></span>
      <span className="main-t">
        <div className="lbl">{ep.course.name} — {ep.exam.title}</div>
        <div className="sub" style={{ color: TONE[sent.tone] }}>{sent.text}</div>
      </span>
      <span className="val small">{ep.daysLeft === 0 ? L('اليوم', "Today") : ep.daysLeft === 1 ? L('غدًا', "Tomorrow") : L(`بعد ${daysWord(ep.daysLeft)}`, `in ${daysWord(ep.daysLeft)}`)}</span>
    </button>
  );
}

function StudyOverview() {
  const s = useApp();
  const now = useNow();
  const plan = useMemo(() => planStudy(s, now), [s, now]);
  const today = todayKey(now);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const studied = week.map((d) => s.days[d]?.study || 0);
  const maxStudy = Math.max(60, ...studied);
  const past = s.exams.filter((e) => e.date < today || e.score != null).sort((a, b) => b.date.localeCompare(a.date));
  const todayTotal = plan.exams.reduce((a, e) => a + e.todayMinutes, 0);
  const courses = s.courses.filter((c) => !c.archived);

  return (
    <div>
      <PageTop
        title={L("الدراسة", "Study")}
        sub={todayTotal ? L(`باقي عليك اليوم ${fmtMinutes(todayTotal)} مذاكرة`, `${fmtMinutes(todayTotal)} of study left today`) : courses.length ? L('لا مذاكرة مطلوبة اليوم', "No study needed today") : L('موادك واختباراتك وهل أنت جاهز', "Your courses, exams, and whether you're ready")}
        actions={courses.length > 0 && <button className="btn sm primary" onClick={() => openSheet({ type: 'study-log' })}><Icon name="clock" size={15} />{L(" سجّل", " Log")}</button>}
      />

      {!courses.length ? (
        <div className="card">
          <Empty icon="study" title={L("أضف موادك واختباراتك", "Add your courses and exams")}>{L("أدخل المادة ودروسها وحجم كل درس، ثم موعد الاختبار. سأحسب كم تذاكر يوميًا، ومتى تبدأ، وأنبهك مبكرًا إن لم يكفِ الوقت.", "Enter the course, its lessons and their size, then the exam date. I'll work out how much to study each day, when to start, and warn you early if time runs short.")}<div style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={() => openSheet({ type: 'course' })}><Icon name="plus" size={16} />{L(" أول مادة", " First course")}</button>
            </div>
          </Empty>
        </div>
      ) : (
        <div className="stack">
          <TodayQuota plan={plan} />

          {plan.exams.length > 0 ? (
            <Group title={L("الاختبارات", "Exams")} action={<button onClick={() => openSheet({ type: 'exam' })}>{L("+ اختبار", "+ Exam")}</button>}>
              {plan.exams.map((ep) => <ExamRow key={ep.exam.id} ep={ep} />)}
            </Group>
          ) : (
            <div className="card"><Empty icon="flag" title={L("لا اختبارات قادمة", "No upcoming exams")}>{L("أضف موعد اختبار وستظهر حصتك اليومية فورًا.", "Add an exam date and your daily quota appears right away.")}<div style={{ marginTop: 12 }}><button className="btn sm" onClick={() => openSheet({ type: 'exam' })}>{L("أضف اختبار", "Add exam")}</button></div></Empty></div>
          )}

          <Group title={L("المواد", "Courses")} action={<button onClick={() => openSheet({ type: 'course' })}>{L("+ مادة", "+ Course")}</button>}>
            {courses.map((c) => {
              const units = s.units.filter((u) => u.courseId === c.id);
              const total = units.reduce((a, u) => a + u.size, 0);
              const done = units.reduce((a, u) => a + u.size * u.progress, 0);
              const next = plan.exams.find((e) => e.course.id === c.id);
              return (
                <button key={c.id} className="r" onClick={() => go(`study/${c.id}`)}>
                  <span className="mini-ring"><Ring value={total ? done / total : 0} size={38} stroke={4} color={c.color} /></span>
                  <span className="main-t">
                    <div className="lbl">{c.name}</div>
                    <div className="sub">
                      {units.length}{L(" دروس · ", " lessons · ")}{units.filter((u) => u.progress >= 1).length}{L(" منتهية", " done")}{next ? ` · ${next.exam.title} ${fmtDate(next.exam.date, false)}` : ''}
                    </div>
                  </span>
                  <Icon name="chevron" size={15} className="chev-end" />
                </button>
              );
            })}
          </Group>

          <Group title={L("آخر 7 أيام", "Last 7 days")} action={<span className="faint" style={{ fontSize: 13 }}>{fmtMinutes(studied.reduce((a, b) => a + b, 0))}</span>}>
            <div style={{ padding: '6px 14px 10px' }}>
              <div className="bars" style={{ height: 90 }}>
                {week.map((d, i) => (
                  <div key={d} className="b" title={`${fmtDate(d)}: ${fmtMinutes(studied[i])}`}>
                    <i style={{ height: `${(studied[i] / maxStudy) * 80}%`, background: d === today ? 'var(--accent)' : 'var(--accent-dim)' }} />
                    <span>{fmtDate(d).split(' ')[0].replace('ال', '')}</span>
                  </div>
                ))}
              </div>
            </div>
          </Group>

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
function TodayQuota({ plan }: { plan: StudyPlan }) {
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
        <span>{L("حصة اليوم", "Today's quota")}</span>
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
