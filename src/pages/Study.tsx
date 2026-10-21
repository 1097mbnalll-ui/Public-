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
      <span className="val small">{ep.daysLeft === 0 ? 'اليوم' : ep.daysLeft === 1 ? 'غدًا' : `بعد ${daysWord(ep.daysLeft)}`}</span>
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
        title="الدراسة"
        sub={todayTotal ? `باقي عليك اليوم ${fmtMinutes(todayTotal)} مذاكرة` : courses.length ? 'لا مذاكرة مطلوبة اليوم' : 'موادك واختباراتك وهل أنت جاهز'}
        actions={courses.length > 0 && <button className="btn sm primary" onClick={() => openSheet({ type: 'study-log' })}><Icon name="clock" size={15} /> سجّل</button>}
      />

      {!courses.length ? (
        <div className="card">
          <Empty icon="study" title="أضف موادك واختباراتك">
            أدخل المادة ودروسها وحجم كل درس، ثم موعد الاختبار. سأحسب كم تذاكر يوميًا، ومتى تبدأ، وأنبهك مبكرًا إن لم يكفِ الوقت.
            <div style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={() => openSheet({ type: 'course' })}><Icon name="plus" size={16} /> أول مادة</button>
            </div>
          </Empty>
        </div>
      ) : (
        <div className="stack">
          <TodayQuota plan={plan} />

          {plan.exams.length > 0 ? (
            <Group title="الاختبارات" action={<button onClick={() => openSheet({ type: 'exam' })}>+ اختبار</button>}>
              {plan.exams.map((ep) => <ExamRow key={ep.exam.id} ep={ep} />)}
            </Group>
          ) : (
            <div className="card"><Empty icon="flag" title="لا اختبارات قادمة">أضف موعد اختبار وستظهر حصتك اليومية فورًا.<div style={{ marginTop: 12 }}><button className="btn sm" onClick={() => openSheet({ type: 'exam' })}>أضف اختبار</button></div></Empty></div>
          )}

          <Group title="المواد" action={<button onClick={() => openSheet({ type: 'course' })}>+ مادة</button>}>
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
                      {units.length} دروس · {units.filter((u) => u.progress >= 1).length} منتهية
                      {next ? ` · ${next.exam.title} ${fmtDate(next.exam.date, false)}` : ''}
                    </div>
                  </span>
                  <Icon name="chevron" size={15} className="chev-end" />
                </button>
              );
            })}
          </Group>

          <Group title="آخر 7 أيام" action={<span className="faint" style={{ fontSize: 13 }}>{fmtMinutes(studied.reduce((a, b) => a + b, 0))}</span>}>
            <div style={{ padding: '6px 14px 10px' }}>
              <div className="bars" style={{ height: 90 }}>
                {week.map((d, i) => (
                  <div key={d} className="b" title={`${fmtDate(d)}: ${fmtMinutes(studied[i])}`}>
                    <i style={{ height: `${(studied[i] / maxStudy) * 80}%`, background: d === today ? 'var(--accent)' : 'rgba(138,164,255,.45)' }} />
                    <span>{fmtDate(d).split(' ')[0].replace('ال', '')}</span>
                  </div>
                ))}
              </div>
            </div>
          </Group>

          {past.length > 0 && (
            <Collapse title="اختبارات سابقة" count={past.length}>
              <Group>
                {past.slice(0, 12).map((e) => {
                  const c = s.courses.find((x) => x.id === e.courseId);
                  return (
                    <Row key={e.id} label={`${c?.name || ''} — ${e.title}`} sub={fmtDate(e.date)} value={e.score != null ? `${e.score}%` : 'أدخل الدرجة'} chevron onClick={() => openSheet({ type: 'exam', id: e.id })} />
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
        <PageTop title="غير موجودة" back={{ label: 'الدراسة', to: 'study' }} />
        <div className="card"><Empty icon="study" title="المادة غير موجودة" /></div>
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
        back={{ label: 'الدراسة', to: 'study' }}
        title={c.name}
        sub={`${finished} من ${units.length} دروس · بقي ~${fmtMinutes(remaining)} (±${Math.round(pace.spread * 100)}%)`}
      />
      <div className="stack">
        <div className="exam-hero">
          <div className="row" style={{ gap: 14 }}>
            <Ring value={total ? done / total : 0} size={58} stroke={5} color={c.color} />
            <div className="kpis grow">
              <div className="kpi"><div className="v">{fmtMinutesShort(studied)}</div><div className="k">ذاكرت فعليًا</div></div>
              <div className="kpi"><div className="v">{pace.pace.toFixed(1)} د</div><div className="k">لكل {c.sizeLabel}</div></div>
              <div className="kpi"><div className="v">{sessions.length}</div><div className="k">جلسات</div></div>
            </div>
          </div>
          <div className="faint tiny">
            {pace.source === 'data' ? `سرعتك محسوبة من ${pace.n} جلسات سجلتها.` : 'السرعة تقديرية حتى تسجل جلسات — ابدأ المؤقت عند المذاكرة وسجّل كم أنجزت.'}
          </div>
        </div>

        <Group title="الاختبارات" action={<button onClick={() => openSheet({ type: 'exam', courseId: id })}>+ اختبار</button>}>
          {exams.length ? (
            exams.map((e) => <Row key={e.id} icon="flag" iconColor={c.color} label={e.title} sub={fmtDate(e.date)} value={e.score != null ? `${e.score}%` : undefined} chevron onClick={() => openSheet({ type: 'exam', id: e.id })} />)
          ) : (
            <Row icon="flag" label="أضف موعد الاختبار" sub="لتحصل على خطة يومية وتنبيه مبكر" chevron onClick={() => openSheet({ type: 'exam', courseId: id })} />
          )}
        </Group>

        <Group title={`الدروس (${units.length})`}>
          {units.map((u) => <LessonRow key={u.id} u={u} color={c.color} pace={pace.pace} sizeLabel={c.sizeLabel} />)}
          {!units.length && <div className="r muted small">لا دروس بعد — أضفها بالأسفل.</div>}
        </Group>

        <Collapse title="إضافة دروس">
          <div className="card col" style={{ gap: 10 }}>
            <textarea className="textarea" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={`درس في كل سطر مع حجمه (${c.sizeLabel}):\nالفصل 4 - 22\nالفصل 5 - 30`} />
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={!bulk.trim()} onClick={() => {
              const ids = A.addUnits(id, parseUnitLines(bulk, 10));
              setBulk('');
              const upcoming = s.exams.filter((e) => e.courseId === id && e.date >= todayKey() && e.score == null);
              if (upcoming.length)
                toast(`أُضيفت ${ids.length} دروس. هل هي ضمن ${upcoming[0].title}؟`, {
                  buttons: [{ label: 'نعم', primary: true, fn: () => A.saveExam({ ...upcoming[0], unitIds: [...upcoming[0].unitIds, ...ids] }) }],
                  ms: 10000,
                });
              else toast(`أُضيفت ${ids.length} دروس`);
            }}>
              <Icon name="plus" size={15} /> أضف
            </button>
          </div>
        </Collapse>

        {sessions.length > 0 && (
          <Collapse title="جلسات المذاكرة" count={sessions.length}>
            <Group>
              {sessions.slice(0, 60).map((x) => {
                const u = s.units.find((y) => y.id === x.unitId);
                return (
                  <Row key={x.id} label={u?.title || 'مذاكرة عامة'} sub={`${fmtDate(x.date)}${x.amount ? ` · ${x.amount} ${c.sizeLabel}` : ''}`} value={fmtMinutes(x.minutes)} />
                );
              })}
            </Group>
          </Collapse>
        )}

        <Group>
          <Row icon="edit" label="تعديل المادة" sub="الاسم، الصعوبة، اللون، سرعتك المتوقعة" chevron onClick={() => openSheet({ type: 'course', id })} />
          <Row icon="trash" danger label="حذف المادة" onClick={() => { if (confirm(`حذف ${c.name} مع دروسها واختباراتها وجلساتها؟`)) { A.deleteCourse(id); go('study'); toast('حُذفت المادة', { undoable: true }); } }} />
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
        <span>حصة اليوم</span>
        <span className="faint" style={{ fontWeight: 500 }}>{totalLeft ? `باقي ${fmtMinutes(totalLeft)}` : 'أنجزت حصص اليوم ✓'}</span>
      </div>
      <div className="col" style={{ gap: 10 }}>
        {active.map((ep) => {
          if (ep.status === 'unknown')
            return (
              <button key={ep.exam.id} className="card tap row" style={{ width: '100%', textAlign: 'start' }} onClick={() => openSheet({ type: 'exam', id: ep.exam.id })}>
                <span className="dot" style={{ background: ep.course.color }} />
                <span className="grow">{ep.course.name} — {ep.exam.title}: <span style={{ color: 'var(--violet)' }}>حدد الدروس المطلوبة لأحسب حصتك</span></span>
              </button>
            );
          if (ep.inReview)
            return (
              <div key={ep.exam.id} className="card">
                <div className="row" style={{ gap: 8 }}>
                  <span className="dot" style={{ background: ep.course.color }} />
                  <b>{ep.course.name}</b>
                  <span className="faint small">— {ep.exam.title} {ep.daysLeft === 1 ? 'غدًا' : `بعد ${daysWord(ep.daysLeft)}`}</span>
                </div>
                <div className="small muted" style={{ marginTop: 6 }}>أيام المراجعة: لا مادة جديدة. راجع ملخصاتك وحل أسئلة سابقة.</div>
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
                  <div className="faint tiny">{ep.exam.title} {fmtDate(ep.exam.date, false)} · تنهي المنهج {fmtDate(ep.lastStudyDay, false)} وتبقى {daysWord(ep.exam.reviewDays || 0)} للمراجعة</div>
                </div>
                <div style={{ textAlign: 'end', flexShrink: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: doneAll ? 'var(--green)' : undefined }} className="num">{doneAll ? '✓' : fmtMinutes(ep.todayMinutes)}</div>
                  <div className="faint tiny">{doneAll ? 'أنجزت حصة اليوم' : ep.doneToday ? `من ${fmtMinutes(ep.quota)}` : 'اليوم'}</div>
                </div>
              </div>
              <div style={{ margin: '10px 0 8px' }}><Bar value={ep.quota ? ep.doneToday / ep.quota : 0} color={ep.course.color} /></div>
              {!doneAll && ep.portion.length > 0 && (
                <ul className="small" style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 3 }}>
                  {ep.portion.map((x) => (
                    <li key={x.unit.id}>
                      <bdi>{x.unit.title}</bdi>
                      {x.review ? ' (مراجعة)' : x.whole ? (x.unit.progress > 0 ? ' (الباقي)' : ' (كامل)') : ` — ${x.amount} ${ep.course.sizeLabel}`}
                      <span className="faint"> · ~{fmtMinutes(x.minutes)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {grew && (
                <div className="chip amber" style={{ marginTop: 8, height: 'auto', padding: '4px 10px', whiteSpace: 'normal' }}>
                  زادت {fmtMinutes(ep.quota - y!.quota)} عن حصة أمس لأنك ذاكرت {fmtMinutes(y!.done)} من {fmtMinutes(y!.quota)}
                </div>
              )}
              {y && y.done >= y.quota && !grew && <div className="faint tiny" style={{ marginTop: 8 }}>أمس أنجزت حصتك كاملة ✓</div>}
              {(ep.status === 'behind' || ep.status === 'tight') && (
                <div className="tiny" style={{ marginTop: 8, color: ep.status === 'behind' ? 'var(--red)' : 'var(--amber)' }}>{examSentence(ep).text}</div>
              )}
              {!doneAll && (
                <div className="row" style={{ gap: 8, marginTop: 12 }}>
                  <button className="btn sm primary" onClick={() => A.startTimer({ kind: 'study', refId: ep.exam.id, courseId: ep.course.id, unitId: ep.portion[0]?.unit.id, label: `مذاكرة ${ep.course.name}` })}>
                    <Icon name="play" size={13} /> ابدأ
                  </button>
                  <button className="btn sm" onClick={() => openSheet({ type: 'study-log', courseId: ep.course.id, unitId: ep.portion[0]?.unit.id })}>سجّل ما ذاكرته</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {totalQuota > cap + 10 && (
        <div className="notice amber" style={{ marginTop: 10 }}>
          <Icon name="alert" size={18} />
          <div>مجموع حصص اليوم {fmtMinutes(totalQuota)} أكبر من الوقت المخصص للمذاكرة ({fmtMinutes(cap)}). زد وقت المذاكرة من «أنت»، أو قلّل دروسًا أقل أهمية — وإلا ستكبر حصص الأيام القادمة.</div>
        </div>
      )}
      <p className="faint tiny" style={{ margin: '8px 6px 0' }}>الحصة = المتبقي ÷ الأيام الباقية قبل أيام المراجعة. إذا ذاكرت أقل من حصتك، يتوزع الباقي على الأيام التالية فتكبر حصتها.</p>
    </section>
  );
}
