import { useMemo, useState } from 'react';
import { Collapse, Group, NumInput, Ring, Sheet, Seg, Switch } from './kit';
import { Icon } from './Icon';
import { getState, useApp } from '../lib/store';
import * as A from '../lib/actions';
import { addDays, atTime, dayNames, daysWord, fmtDate, fmtMinutes, todayKey } from '../lib/dates';
import { planStudy, unitMinutes, unitSchedule, type ExamPlan, type UnitWhen } from '../lib/engine/study';
import type { Unit } from '../lib/types';
import { coursePace } from '../lib/engine/learning';
import { buildIcs } from '../lib/reminders';
import { download } from '../lib/backup';
import { closeSheet, openSheet } from './sheets';
import { go } from './router';
import { toast } from './toast';
import { L, sz, szn } from '../lib/i18n';
import { startTimerUI } from './Shell';

/** "الفصل 3 - 24" / "Chapter 2: 30" → title + size */
export function parseUnitLines(text: string, defSize: number) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const w = l.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
      const m = w.match(/^(.*?)[\s\-–:،,]+(\d+(?:\.\d+)?)\s*(?:صفحة|صفحه|ص|شريحة|شريحه|محاضرة)?$/);
      return m && m[1].trim() ? { title: m[1].trim(), size: +m[2] } : { title: l, size: defSize };
    });
}

export function StudyLog({ courseId, unitId, minutes, fromTimer, queue }: { courseId?: string; unitId?: string; minutes?: number; fromTimer?: boolean; queue?: { courseId?: string; unitId?: string; minutes: number }[] }) {
  const s = useApp();
  const courses = s.courses.filter((c) => !c.archived);
  const [cid, setCid] = useState(courseId || courses[0]?.id || '');
  const units = s.units.filter((u) => u.courseId === cid).sort((a, b) => a.order - b.order);
  const [uid, setUid] = useState(unitId || units.find((u) => u.progress < 1)?.id || '');
  const [mins, setMins] = useState<number | undefined>(minutes || 45);
  const [amount, setAmount] = useState<number | undefined>(undefined);
  // after a timer the course, lesson and minutes are known: only "how far did you get?" is asked
  const [changing, setChanging] = useState(!fromTimer || !courseId);
  const course = s.courses.find((c) => c.id === cid);
  const unit = s.units.find((u) => u.id === uid);
  const left = unit ? Math.round(unit.size * (1 - unit.progress) * 10) / 10 : 0;
  const unitLabel = sz(course?.sizeLabel);

  if (!courses.length)
    return (
      <Sheet title={L("تسجيل مذاكرة", "Log study")} onClose={closeSheet}>
        <p className="muted">{L("أضف مادة أولًا من صفحة الدراسة.", "Add a course first from the Study page.")}</p>
        <button className="btn primary" onClick={() => openSheet({ type: 'course' })}>{L("أضف مادة", "Add course")}</button>
      </Sheet>
    );

  const save = () => {
    if (!cid || !mins) return;
    A.logStudy(cid, uid || undefined, mins, amount || 0);
    closeSheet();
    // a session over several subjects: log the next one
    if (queue?.length) {
      const [next, ...rest] = queue;
      openSheet({ type: 'study-log', courseId: next.courseId, unitId: next.unitId, minutes: next.minutes, fromTimer: true, queue: rest });
    }
    const after = getState();
    const pace = course && amount ? coursePace(after, course) : null;
    const u = uid ? after.units.find((x) => x.id === uid) : undefined;
    toast(
      u && u.progress >= 1 && unit && unit.progress < 1
        ? L(`خلصت «${u.title}» ✓`, `Finished “${u.title}” ✓`)
        : pace && course
          ? L(`سُجلت ${fmtMinutes(mins)} — سرعتك في ${course.name} ~${pace.pace >= 10 ? Math.round(pace.pace) : pace.pace.toFixed(1)} د لكل ${sz(course.sizeLabel)}`, `Logged ${fmtMinutes(mins)} — about ${pace.pace >= 10 ? Math.round(pace.pace) : pace.pace.toFixed(1)} min per ${sz(course.sizeLabel)} in ${course.name}`)
          : L(`سُجلت ${fmtMinutes(mins)} مذاكرة`, `Logged ${fmtMinutes(mins)} of study`),
      { undoable: true },
    );
  };

  const half = left > 1 ? Math.round(left / 2) : 0;
  return (
    <Sheet
      title={fromTimer ? (queue ? L(`خلصت الجلسة · ${queue.length ? `باقي ${queue.length === 1 ? 'مادة' : `${queue.length} مواد`}` : 'آخر مادة'}`, `Session done · ${queue.length ? `${queue.length} more` : 'last subject'}`) : L('خلصت الجلسة', 'Session done')) : L('سجّل جلسة مذاكرة', 'Log a study session')}
      onClose={closeSheet}
      footer={<button className="btn primary grow" onClick={save} disabled={!mins}>{L("حفظ", "Save")}</button>}
    >
      <div className="fields">
        {!changing ? (
          <div className="sx-logsum">
            <span className="sx-dot" style={{ background: course?.color }} />
            <span className="grow">
              <b>{fmtMinutes(mins || 0)}</b> · {course?.name}{unit ? ` · ${unit.title}` : ''}
            </span>
            <button className="linkish small" style={{ textDecoration: 'none' }} onClick={() => setChanging(true)}>{L('تغيير', 'Change')}</button>
          </div>
        ) : (
          <>
            <div className="fields two">
              <div className="field">
                <label>{L("المادة", "Course")}</label>
                <select className="select" value={cid} onChange={(e) => { setCid(e.target.value); setUid(''); setAmount(undefined); }}>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>{L("الدرس", "Lesson")}</label>
                <select className="select" value={uid} onChange={(e) => { setUid(e.target.value); setAmount(undefined); }}>
                  <option value="">{L("عام / مراجعة", "General / review")}</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.title}{u.progress >= 1 ? ' ✓' : ''}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>{L("المدة", "Duration")}</label>
              <div className="row wrap" style={{ gap: 6 }}>
                {[25, 45, 60, 90, 120].map((m) => (
                  <button key={m} className={`chip btnish ${mins === m ? 'on' : ''}`} onClick={() => setMins(m)}>{fmtMinutes(m)}</button>
                ))}
                <div style={{ width: 110 }}><NumInput value={mins} onChange={setMins} suffix={L("د", "min")} /></div>
              </div>
            </div>
          </>
        )}
        {unit && left <= 0 ? (
          <div className="faint small">{L("هذا الدرس منتهي — الجلسة تنحسب مراجعة له، وتنشال مراجعته من خطتك.", "This lesson is finished — the session counts as its review and comes off your plan.")}</div>
        ) : unit ? (
          <div className="field">
            <label>{L('وين وصلت؟', 'How far did you get?')}</label>
            <div className="row wrap" style={{ gap: 6 }}>
              <button className={`chip btnish ${amount === left ? 'on' : ''}`} onClick={() => setAmount(left)}>{L('خلصت الدرس', 'Finished the lesson')}</button>
              {half > 0 && <button className={`chip btnish ${amount === half ? 'on' : ''}`} onClick={() => setAmount(half)}>{L(`نصّه (${szn(half, course?.sizeLabel)})`, `Half (${szn(half, course?.sizeLabel)})`)}</button>}
              <div style={{ width: 130 }}><NumInput value={amount} onChange={setAmount} placeholder={L(`كم ${unitLabel}؟`, `How many ${unitLabel}?`)} /></div>
            </div>
            <div className="faint tiny">{L(`باقي في الدرس ${szn(left, course?.sizeLabel)}. اللي تكتبه هنا يخلي خطتك على سرعتك الحقيقية.`, `${szn(left, course?.sizeLabel)} left in the lesson. What you enter keeps your plan at your real speed.`)}</div>
          </div>
        ) : (
          <div className="faint small">{L('بدون درس محدد: تنحسب الدقائق، ولا تأثر على سرعتك. في أيام المراجعة تنخصم من المراجعة.', 'Without a lesson the minutes count, but not towards your speed. During review days they come off the review.')}</div>
        )}
      </div>
    </Sheet>
  );
}

/** one plain sentence: where you stand for this exam */
export function examSentence(ep: ExamPlan): { text: string; tone: 'green' | 'amber' | 'red' | 'violet' | 'blue' } {
  switch (ep.status) {
    case 'unknown':
      return { text: L('حدد الدروس المطلوبة لأحسب لك الخطة', "Set the required lessons so I can build your plan"), tone: 'violet' };
    case 'done':
      return { text: L('أنهيت كل الدروس — وقت المراجعة وحل الأسئلة', "All lessons done — time to review and practise questions"), tone: 'green' };
    case 'past':
      return { text: L('الاختبار اليوم — بالتوفيق', "The exam is today — good luck"), tone: 'blue' };
    case 'ok':
      return { text: L(`على المسار — ~${fmtMinutes(ep.requiredDaily || ep.quota)} يوميًا تكفي، وتنهي ${fmtDate(ep.finishDay || ep.lastStudyDay, false)}`, `On track — ~${fmtMinutes(ep.requiredDaily || ep.quota)} a day is enough, finishing ${fmtDate(ep.finishDay || ep.lastStudyDay, false)}`), tone: 'green' };
    case 'tight':
      return { text: L(`ممكن لكن بلا هامش — التزم بـ ~${fmtMinutes(ep.requiredDaily || ep.quota)} يوميًا`, `Possible but no margin — keep to ~${fmtMinutes(ep.requiredDaily || ep.quota)} a day`), tone: 'amber' };
    case 'behind':
      return { text: L(`الوقت لا يكفي بوتيرتك الحالية — ينقصك ~${fmtMinutes(ep.shortfall)}`, `Not enough time at your current pace — ~${fmtMinutes(ep.shortfall)} short`), tone: 'red' };
  }
}

const TONE: Record<string, string> = { green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', violet: 'var(--violet)', blue: 'var(--accent)' };

export function ExamPlanView({ ep }: { ep: ExamPlan }) {
  const sent = examSentence(ep);
  const paceNote =
    ep.pace.source === 'data'
      ? L(`من ${ep.pace.n} ${ep.pace.n === 1 ? 'جلسة' : 'جلسات'} سجلتها`, `From ${ep.pace.n} ${ep.pace.n === 1 ? 'session' : 'sessions'} you logged`)
      : ep.pace.source === 'guess'
        ? L('من سرعتك المتوقعة', 'From your expected speed')
        : ep.pace.source === 'global'
          ? L('من سرعتك في موادك الثانية', 'From your speed in other courses')
          : L('تقدير مبدئي — يدق بعد ما تسجّل جلسات', 'A first guess — sharpens once you log sessions');
  const active = ep.status !== 'unknown' && ep.status !== 'done' && ep.status !== 'past';
  const facts: [string, string][] = [];
  if (active) {
    facts.push([L('اليوم', 'Today'), ep.todayMinutes > 0 ? `${fmtMinutes(ep.todayMinutes)}${ep.portion.length ? ` · ${ep.portion.map((x) => x.unit.title).filter((t, i, a) => a.indexOf(t) === i).join(L('، ', ', '))}` : ''}` : ep.quota > 0 ? L('خلصت حصة اليوم ✓', "Today's share done ✓") : L('ما فيه حصة اليوم', 'Nothing today')]);
    facts.push([L('الباقي', 'Left'), L(`دروس ~${fmtMinutes(ep.learnLeft)} · مراجعة ~${fmtMinutes(ep.reviewLeft)}`, `Lessons ~${fmtMinutes(ep.learnLeft)} · review ~${fmtMinutes(ep.reviewLeft)}`)]);
    if (ep.learnLeft > 1) facts.push([L('تخلص الدروس', 'Lessons done'), ep.finishDay ? fmtDate(ep.finishDay) : L('ما تلحق بوقتك الحالي', "Not at your current time")]);
    facts.push([L('أيام المراجعة', 'Review days'), ep.exam.reviewDays ? `${daysWord(ep.exam.reviewDays)}${ep.inReview ? L(' — أنت فيها الحين', ' — you are in them') : ''}` : L('بدون', 'None')]);
    facts.push([L('دقة التقدير', 'Estimate'), `±${Math.round(ep.pace.spread * 100)}% · ${paceNote}`]);
  }
  return (
    <div className="sx-plan">
      <div className="row" style={{ gap: 14 }}>
        <Ring value={ep.progress} size={58} stroke={5} color={ep.course.color} label={`${Math.round(ep.progress * 100)}%`} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="faint small">{ep.daysLeft === 0 ? L('اليوم', "Today") : ep.daysLeft === 1 ? L('غدًا', "Tomorrow") : L(`بعد ${daysWord(ep.daysLeft)}`, `in ${daysWord(ep.daysLeft)}`)} · {fmtDate(ep.exam.date)}</div>
          <div style={{ marginTop: 4, color: TONE[sent.tone], fontWeight: 650 }}>{sent.text}</div>
        </div>
      </div>
      {facts.length > 0 && (
        <dl className="sx-facts">
          {facts.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      )}
      {ep.reviewCompressed && <div className="notice amber">{L("الدروس ما خلصت قبل أيام المراجعة — الخطة تكمّلها فيها، وبعدها تراجع.", "The lessons weren't done before the review days — the plan finishes them there, then reviews.")}</div>}
      {ep.suggestions.length > 0 && ep.status !== 'unknown' && (
        <div className={`notice ${ep.status === 'behind' ? 'red' : 'amber'}`}>
          <Icon name={ep.status === 'behind' ? 'alert' : 'info'} size={18} />
          <ul style={{ margin: 0, paddingInlineStart: 16 }}>
            {ep.suggestions.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/** a lesson's state as one glyph: empty, partly studied, studied, studied and reviewed */
function LessonGlyph({ u, color }: { u: Unit; color: string }) {
  if (u.progress >= 1)
    return (
      <span className={`sx-glyph ${u.reviewed ? 'reviewed' : 'studied'}`} style={{ ['--c' as string]: color }} aria-hidden>
        <Icon name="check" size={13} stroke={2.6} />
      </span>
    );
  return <span className="mini-ring" aria-hidden><Ring value={u.progress} size={26} stroke={3} color={color} label="" /></span>;
}

/** lesson row: state · title · what's left. Tap for the lesson. */
/** «اليوم» · «بكرة» · «الأحد» (this week) · «3 نوفمبر» */
function dayWord(d: string, today: string) {
  if (d === today) return L('اليوم', 'Today');
  if (d === addDays(today, 1)) return L('بكرة', 'Tomorrow');
  if (d < addDays(today, 7)) return dayNames()[new Date(`${d}T12:00:00`).getDay()];
  return fmtDate(d, false);
}
const span = (r: { from: string; to: string }, today: string) => (r.from === r.to ? dayWord(r.from, today) : `${dayWord(r.from, today)} – ${dayWord(r.to, today)}`);

export function LessonRow({ u, color, pace, sizeLabel, when, today: todayK = todayKey() }: { u: Unit; color: string; pace: number; sizeLabel: string; when?: UnitWhen; today?: string }) {
  const s = useApp();
  const c = s.courses.find((x) => x.id === u.courseId);
  const left = c ? unitMinutes(u, c, pace, s.settings.reviewFactor) : 0;
  const done = u.progress >= 1;
  const sub = done
    ? u.reviewed
      ? L('ذاكرته وراجعته', 'Studied and reviewed')
      : L(`ذاكرته · باقي مراجعة ~${fmtMinutes(left)}`, `Studied · ~${fmtMinutes(left)} of review left`)
    : u.progress > 0
      ? L(`${Math.round(u.progress * 100)}% · باقي ~${fmtMinutes(left)}`, `${Math.round(u.progress * 100)}% · ~${fmtMinutes(left)} left`)
      : `${szn(u.size, sizeLabel)} · ~${fmtMinutes(left)}`;
  return (
    <button className={`r sx-lesson ${done && u.reviewed ? 'done' : ''}`} onClick={() => openSheet({ type: 'unit', id: u.id })}>
      <LessonGlyph u={u} color={color} />
      <span className="main-t">
        <div className="lbl">{u.title}{u.notes ? <Icon name="note" size={13} className="faint" style={{ marginInlineStart: 6, verticalAlign: '-2px' }} /> : null}</div>
        <div className="sub">{sub}</div>
      </span>
      {when && (when.learn || when.review || when.unplanned) && (() => {
        // the next thing the plan has for this lesson: learning it, otherwise its review
        const r = when.learn || when.review;
        const isToday = !!r && r.from === todayK;
        return (
          <span className={`sx-when ${isToday ? 'today' : ''} ${!r ? 'late' : ''}`}>
            {r ? <>{!when.learn ? <small>{L('مراجعة', 'Review')}</small> : null}{span(r, todayK)}</> : L('ما يمدي قبل الاختبار', 'No room before the exam')}
          </span>
        );
      })()}
    </button>
  );
}

/** the lesson's summary: "## " headings, "- " bullets, plain lines as paragraphs */
function LessonNotes({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div className="lesson-notes">
      {lines.map((l, i) =>
        l.startsWith('## ') ? <h4 key={i}>{l.slice(3)}</h4>
        : l.startsWith('- ') ? <div key={i} className="ln-b">{l.slice(2)}</div>
        : <p key={i}>{l}</p>,
      )}
    </div>
  );
}

export function LessonSheet({ id }: { id: string }) {
  const s = useApp();
  const u = s.units.find((x) => x.id === id);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState(u?.notes || '');
  if (!u) return null;
  const c = s.courses.find((x) => x.id === u.courseId);
  const sessions = s.sessions.filter((x) => x.unitId === id && !x.tick);
  const up = (patch: Partial<Unit>) => A.updateUnit(id, patch);
  const saveNotes = () => {
    const v = draft.trim();
    if (v !== (u.notes || '')) up({ notes: v || undefined });
    setWriting(false);
  };
  return (
    <Sheet
      title={u.title}
      onClose={() => { if (writing) saveNotes(); closeSheet(); }}
      footer={
        <>
          <button className="btn primary grow" onClick={() => { if (writing) saveNotes(); closeSheet(); startTimerUI({ kind: 'study', refId: id, courseId: u.courseId, unitId: id, label: `${c?.name || ''} · ${u.title}` }); }}>
            <Icon name="play" size={14} />{u.progress >= 1 ? L(' راجعه الآن', ' Review it now') : L(' ذاكر الآن', ' Study now')}</button>
          <button className="btn" onClick={() => { if (writing) saveNotes(); closeSheet(); openSheet({ type: 'study-log', courseId: u.courseId, unitId: id }); }}>{L("سجّل جلسة", "Log session")}</button>
        </>
      }
    >
      <div className="fields">
        <div className="faint small row" style={{ gap: 8 }}>
          <span className="sx-dot" style={{ background: c?.color }} />
          {c?.name} · {szn(u.size, c?.sizeLabel)}{u.spent > 0 ? L(` · ذاكرت فيه ${fmtMinutes(u.spent)} في ${sessions.length} ${sessions.length === 1 ? 'جلسة' : 'جلسات'}`, ` · ${fmtMinutes(u.spent)} over ${sessions.length} session${sessions.length === 1 ? '' : 's'}`) : ''}
        </div>

        <div className="field">
          <label>{L("وين وصلت؟", "How far are you?")}</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <button key={v} className={`chip btnish ${Math.abs(u.progress - v) < 0.13 ? 'on' : ''}`} onClick={() => A.markLesson(id, { progress: v })}>
                {v === 0 ? L('ما بدأت', "Not started") : v === 1 ? L('خلصته ✓', "Finished ✓") : `${v * 100}%`}
              </button>
            ))}
          </div>
        </div>
        {u.progress >= 1 && (
          <div className="row between">
            <div>
              <div style={{ fontWeight: 600 }}>{L("راجعته", "Reviewed")}</div>
              <div className="faint tiny">{L("بعد المراجعة ما أحسب له وقت مراجعة.", "Once reviewed, no review time is counted for it.")}</div>
            </div>
            <Switch on={u.reviewed} onChange={(v) => A.markLesson(id, { reviewed: v })} label={L("راجعته", "Reviewed")} />
          </div>
        )}

        <div className="field">
          <div className="row between">
            <label style={{ margin: 0 }}>{L('ملخصك', 'Your summary')}</label>
            {!writing && <button className="linkish small" style={{ textDecoration: 'none' }} onClick={() => { setDraft(u.notes || ''); setWriting(true); }}>{u.notes ? L('تعديل', 'Edit') : L('اكتب ملخص', 'Write one')}</button>}
          </div>
          {writing ? (
            <>
              <textarea className="textarea sx-notes-edit" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={saveNotes} placeholder={L('## عنوان\n- نقطة\nسطر عادي', '## Heading\n- point\nplain line')} />
              <div className="faint tiny">{L('«## » عنوان، «- » نقطة. ينحفظ تلقائيًا.', '"## " for a heading, "- " for a point. Saves by itself.')}</div>
            </>
          ) : u.notes ? (
            <LessonNotes text={u.notes} />
          ) : (
            <div className="faint small">{L('اكتب أهم النقاط بكلماتك وأنت تذاكر — ترجع لها في المراجعة.', 'Write the key points in your own words as you study — they are what you review from.')}</div>
          )}
        </div>

        <Collapse title={L('تعديل الدرس', 'Edit lesson')}>
          <div className="fields">
            <div className="field">
              <label>{L("الاسم", "Name")}</label>
              <input className="input" value={u.title} onChange={(e) => up({ title: e.target.value })} />
            </div>
            <div className="fields two">
              <div className="field">
                <label>{L("الحجم (", "Size (")}{sz(c?.sizeLabel)})</label>
                <NumInput value={u.size} min={0.5} onChange={(v) => v && up({ size: v })} />
              </div>
              <div className="field">
                <label>{L("صعوبته", "Difficulty")}</label>
                <select className="select" value={u.difficulty || ''} onChange={(e) => up({ difficulty: e.target.value ? +e.target.value : undefined })}>
                  <option value="">{L("مثل المادة", "Same as course")}</option>
                  {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{[L('سهل جدًا', "Very easy"), L('سهل', "Easy"), L('متوسط', "Medium"), L('صعب', "Hard"), L('صعب جدًا', "Very hard")][d - 1]}</option>)}
                </select>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm" onClick={() => A.moveUnit(id, -1)}><Icon name="up" size={14} />{L(" قدّمه", " Earlier")}</button>
              <button className="btn sm" onClick={() => A.moveUnit(id, 1)}><Icon name="down" size={14} />{L(" أخّره", " Later")}</button>
              <span className="grow" />
              <button className="btn sm danger" onClick={() => { A.deleteUnit(id); closeSheet(); toast(L('حُذف الدرس', "Lesson deleted"), { undoable: true }); }}><Icon name="trash" size={14} />{L(" حذف", " Delete")}</button>
            </div>
          </div>
        </Collapse>
      </div>
    </Sheet>
  );
}

export function ExamEditor({ id, courseId }: { id?: string; courseId?: string }) {
  const s = useApp();
  const existing = id ? s.exams.find((e) => e.id === id) : undefined;
  const courses = s.courses.filter((c) => !c.archived);
  const [cid, setCid] = useState(existing?.courseId || courseId || courses[0]?.id || '');
  const [title, setTitle] = useState(existing?.title || L('اختبار', "Exam"));
  const [date, setDate] = useState(existing?.date || addDays(todayKey(), 7));
  const [time, setTime] = useState(existing?.time || '');
  const [reviewDays, setReviewDays] = useState(existing?.reviewDays ?? 1);
  const [weight, setWeight] = useState<number | undefined>(existing?.weight);
  const [score, setScore] = useState<number | undefined>(existing?.score);
  const courseUnits = s.units.filter((u) => u.courseId === cid).sort((a, b) => a.order - b.order);
  const [unitIds, setUnitIds] = useState<string[]>(existing?.unitIds || courseUnits.map((u) => u.id));
  const [bulk, setBulk] = useState('');
  const [tab, setTab] = useState<'plan' | 'edit'>(existing && existing.unitIds.length ? 'plan' : 'edit');
  const plan = useMemo(() => planStudy(s), [s]);
  const ep = existing ? plan.exams.find((p) => p.exam.id === existing.id) : undefined;
  const course = s.courses.find((c) => c.id === cid);

  if (!courses.length)
    return (
      <Sheet title={L("اختبار جديد", "New exam")} onClose={closeSheet}>
        <p className="muted">{L("أضف المادة أولًا، ثم أضف اختبارها.", "Add the course first, then its exam.")}</p>
        <button className="btn primary" onClick={() => openSheet({ type: 'course' })}>{L("أضف مادة", "Add course")}</button>
      </Sheet>
    );

  const save = () => {
    let ids = unitIds;
    if (bulk.trim()) {
      const added = A.addUnits(cid, parseUnitLines(bulk, 10));
      ids = [...ids, ...added];
    }
    const eid = A.saveExam({ id, courseId: cid, title: title.trim() || L('اختبار', "Exam"), date, time: time || undefined, reviewDays, weight, score, unitIds: ids });
    closeSheet();
    toast(quotaMessage(eid) || (id ? L('حُفظ الاختبار', "Exam saved") : L('أُضيف الاختبار', "Exam added")), { ms: 8000 });
  };

  const exportCal = () => {
    const start = time ? atTime(date, time) : atTime(date, '08:00');
    download(`${course?.name || 'exam'}.ics`, buildIcs([{ uid: `exam-${id || date}`, title: L(`اختبار ${course?.name || ''} — ${title}`, `${course?.name || ''} exam — ${title}`), start, minutes: 90, allDay: !time, alarmMinutes: [24 * 60, 120] }]), 'text/calendar');
  };

  return (
    <Sheet
      wide
      title={existing ? `${course?.name || ''} — ${existing.title}` : L('اختبار جديد', "New exam")}
      onClose={closeSheet}
      headExtra={existing && <Seg value={tab} onChange={setTab} options={[{ v: 'plan', l: L('الخطة', "Plan") }, { v: 'edit', l: L('تعديل', "Edit") }]} />}
      footer={
        tab === 'edit' ? (
          <>
            <button className="btn primary grow" onClick={save}>{L("حفظ", "Save")}</button>
            {existing && (
              <button className="icon-btn" onClick={() => { A.deleteExam(existing.id); closeSheet(); toast(L('حُذف الاختبار', "Exam deleted"), { undoable: true }); }} aria-label={L("حذف", "Delete")}>
                <Icon name="trash" size={18} />
              </button>
            )}
          </>
        ) : (
          <>
            <button className="btn primary" onClick={() => { closeSheet(); openSheet({ type: 'study-log', courseId: cid }); }}>{L("سجّل مذاكرة", "Log study")}</button>
            <button className="btn" onClick={() => { startTimerUI({ kind: 'study', refId: existing!.id, courseId: cid, unitId: ep?.todayUnits[0]?.unit.id, label: L(`مذاكرة ${course?.name}`, `Study ${course?.name}`) }); closeSheet(); }}>
              <Icon name="play" size={15} />{L(" ابدأ مؤقت", " Start timer")}</button>
            <span className="grow" />
            <button className="icon-btn" aria-label={L('ذكّرني', 'Remind me')} onClick={() => openSheet({ type: 'remind', title: L(`اختبار ${course?.name || ''}: ${existing!.title}`, `${course?.name || ''} exam: ${existing!.title}`), ref: 'study', at: Math.max(Date.now() + 3600_000, atTime(addDays(existing!.date, -2), '20:00')) })}><Icon name="bell" size={18} /></button>
            <button className="btn ghost" onClick={exportCal}><Icon name="calplus" size={16} />{L(" للتقويم", " Calendar")}</button>
          </>
        )
      }
    >
      {tab === 'plan' && ep ? (
        <div className="col" style={{ gap: 16 }}>
          <ExamPlanView ep={ep} />
          <Group title={L(`الدروس المطلوبة (${existing!.unitIds.length})`, `Required lessons (${existing!.unitIds.length})`)}>
            {(() => {
              const when = unitSchedule(ep, todayKey());
              return s.units.filter((u) => existing!.unitIds.includes(u.id)).sort((a, b) => a.order - b.order).map((u) => (
                <LessonRow key={u.id} u={u} color={course?.color || 'var(--accent)'} pace={ep.pace.pace} sizeLabel={course?.sizeLabel || ''} when={when.get(u.id)} />
              ));
            })()}
          </Group>
        </div>
      ) : (
        <div className="fields">
          <div className="fields two">
            <div className="field">
              <label>{L("المادة", "Course")}</label>
              <select className="select" value={cid} onChange={(e) => { setCid(e.target.value); setUnitIds(s.units.filter((u) => u.courseId === e.target.value).map((u) => u.id)); }}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>{L("اسم الاختبار", "Exam name")}</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={L("ميد 1، كويز، نهائي…", "Midterm 1, quiz, final…")} />
            </div>
            <div className="field">
              <label>{L("التاريخ", "Date")}</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label>{L("الوقت", "Time")}</label>
              <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>{L("أيام المراجعة قبل الاختبار", "Review days before the exam")}</label>
            <Seg value={reviewDays} onChange={setReviewDays} options={[0, 1, 2, 3].map((n) => ({ v: n, l: n === 0 ? L('بدون', "None") : daysWord(n) }))} />
            <div className="faint tiny">{L("أنهي المنهج قبلها، وأتركها للمراجعة وحل الأسئلة.", "Finish the syllabus before them and keep them for review and practice questions.")}</div>
          </div>
          <div className="field">
            <label>{L("الدروس المطلوبة (", "Required lessons (")}{unitIds.length})</label>
            {courseUnits.length > 0 && (
              <div className="list" style={{ maxHeight: 220, overflowY: 'auto' }}>
                {courseUnits.map((u) => {
                  const on = unitIds.includes(u.id);
                  return (
                    <label className="item tap" key={u.id} style={{ padding: '9px 12px', alignItems: 'center' }}>
                      <input type="checkbox" checked={on} onChange={() => setUnitIds(on ? unitIds.filter((x) => x !== u.id) : [...unitIds, u.id])} />
                      <span className="grow">{u.title}</span>
                      <span className="faint tiny">{szn(u.size, course?.sizeLabel)}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <textarea
              className="textarea"
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={L(`أضف دروسًا جديدة، كل درس في سطر مع حجمه (${sz(course?.sizeLabel)}):\nالدرس 1 - 24\nالدرس 2 - 18`, `Add new lessons, one per line with its size (${course?.sizeLabel || 'pages'}):\nLesson 1 - 24\nLesson 2 - 18`)}
            />
          </div>
          <div className="fields two">
            <div className="field">
              <label>{L("الوزن من الدرجة (%)", "Weight of the grade (%)")}</label>
              <NumInput value={weight} onChange={setWeight} placeholder={L("اختياري", "Optional")} />
            </div>
            <div className="field">
              <label>{L("درجتك (بعد الاختبار %)", "Your grade (after the exam %)")}</label>
              <NumInput value={score} onChange={setScore} placeholder="—" />
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

const PALETTE = ['#5e9cff', '#ff8a5c', '#5fd4a0', '#c58cff', '#ffcb47', '#ff6b9a', '#4fd1e0', '#a3d65c'];

export function CourseEditor({ id }: { id?: string }) {
  const s = useApp();
  const c = id ? s.courses.find((x) => x.id === id) : undefined;
  const [name, setName] = useState(c?.name || '');
  const [difficulty, setDifficulty] = useState(c?.difficulty || 3);
  const [sizeLabel, setSizeLabel] = useState(sz(c?.sizeLabel));
  const [pace, setPace] = useState<number | undefined>(c?.paceGuess);
  const [color, setColor] = useState(c?.color || PALETTE[s.courses.length % PALETTE.length]);
  const [units, setUnits] = useState('');

  const save = () => {
    if (!name.trim()) return;
    if (c) {
      A.updateCourse(c.id, { name: name.trim(), difficulty, sizeLabel, paceGuess: pace, color });
      if (units.trim()) A.addUnits(c.id, parseUnitLines(units, 10));
      closeSheet();
    } else {
      const cid = A.addCourse({ name: name.trim(), difficulty, sizeLabel, paceGuess: pace, color });
      if (units.trim()) A.addUnits(cid, parseUnitLines(units, 10));
      closeSheet();
      toast(L(`أُضيفت ${name.trim()}`, `Added ${name.trim()}`), { buttons: [{ label: L('أضف اختبارها', "Add its exam"), fn: () => openSheet({ type: 'exam', courseId: cid }), primary: true }] });
    }
  };

  return (
    <Sheet
      title={c ? L('تعديل المادة', "Edit course") : L('مادة جديدة', "New course")}
      onClose={closeSheet}
      footer={
        <>
          <button className="btn primary grow" onClick={save} disabled={!name.trim()}>{L("حفظ", "Save")}</button>
          {c && (
            <button className="icon-btn" aria-label={L('حذف المادة', 'Delete course')} onClick={() => {
              if (!confirm(L(`حذف ${c.name} مع دروسها واختباراتها وجلساتها؟`, `Delete ${c.name} with its lessons, exams and sessions?`))) return;
              A.deleteCourse(c.id);
              closeSheet();
              go('study');
              toast(L('حُذفت المادة', "Course deleted"), { undoable: true });
            }}><Icon name="trash" size={18} /></button>
          )}
        </>
      }
    >
      <div className="fields">
        <div className="field">
          <label>{L("اسم المادة", "Course name")}</label>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={L("مثال: مبادئ الإحصاء", "e.g. Principles of Statistics")} />
        </div>
        <div className="field">
          <label>{L("الصعوبة بالنسبة لك", "Difficulty for you")}</label>
          <Seg value={difficulty} onChange={setDifficulty} options={[1, 2, 3, 4, 5].map((d) => ({ v: d, l: [L('سهلة جدًا', "Very easy"), L('سهلة', "Easy"), L('متوسطة', "Medium"), L('صعبة', "Hard"), L('صعبة جدًا', "Very hard")][d - 1] }))} />
        </div>
        <div className="fields two">
          <div className="field">
            <label>{L("وحدة قياس المنهج", "Unit of the syllabus")}</label>
            <select className="select" value={sizeLabel} onChange={(e) => setSizeLabel(e.target.value)}>
              {['صفحة', 'شريحة', 'محاضرة', 'درس', 'مسألة'].map((x) => <option key={x} value={x}>{sz(x)}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{L("كم دقيقة تحتاج لكل ", "How many minutes do you need per ")}{sz(sizeLabel)}{L("؟", "?")}</label>
            <NumInput value={pace} onChange={setPace} placeholder={L("لا أعرف", "Don't know")} suffix={L("د", "min")} />
          </div>
        </div>
        <div className="field">
          <label>{L("اللون", "Colour")}</label>
          <div className="row" style={{ gap: 8 }}>
            {PALETTE.map((p) => <button key={p} className={`color-swatch ${color === p ? 'on' : ''}`} style={{ background: p }} onClick={() => setColor(p)} aria-label={p} />)}
          </div>
        </div>
        <div className="field">
          <label>{L("الدروس / الفصول (اختياري)", "Lessons / chapters (optional)")}</label>
          <textarea className="textarea" value={units} onChange={(e) => setUnits(e.target.value)} placeholder={L(`كل درس في سطر مع حجمه:\nالفصل 1 - 24\nالفصل 2 - 18\nالفصل 3 - 30`, `One lesson per line with its size:\nChapter 1 - 24\nChapter 2 - 18\nChapter 3 - 30`)} />
          <div className="faint tiny">{L("الحجم يساعدني على تقدير الوقت. إن لم تكتبه أفترض 10.", "The size helps me estimate time. If you leave it out I assume 10.")}</div>
        </div>
      </div>
    </Sheet>
  );
}

/** "حصتك من إحصاء: 55 د يوميًا حتى 7 نوفمبر" — shown right after an exam is added or changed */
export function quotaMessage(examId: string): string | null {
  const ep = planStudy(getState()).exams.find((e) => e.exam.id === examId);
  if (!ep) return null;
  if (ep.status === 'unknown') return L('حُفظ الاختبار — حدد دروسه لأحسب حصتك اليومية', "Exam saved — set its lessons so I can work out your daily quota");
  if (ep.inReview) return L(`حُفظ الاختبار — أنت في أيام المراجعة، حصتك اليوم ~${fmtMinutes(ep.quota)}`, `Exam saved — you're in the review days, ~${fmtMinutes(ep.quota)} today`);
  if (ep.quota <= 0) return null;
  return L(`حصتك من ${ep.course.name} اليوم: ~${fmtMinutes(ep.quota)} (معدلها ~${fmtMinutes(ep.requiredDaily)} يوميًا حتى ${fmtDate(ep.lastStudyDay, false)})${ep.status === 'behind' ? ' — الوقت ضيق جدًا' : ''}`, `Your ${ep.course.name} quota today: ~${fmtMinutes(ep.quota)} (about ${fmtMinutes(ep.requiredDaily)} a day until ${fmtDate(ep.lastStudyDay, false)})${ep.status === 'behind' ? ' — time is very tight' : ''}`);
}
