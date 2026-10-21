import { useMemo, useState } from 'react';
import { Group, NumInput, Ring, Sheet, Seg, Switch } from './kit';
import { Icon } from './Icon';
import { getState, useApp } from '../lib/store';
import * as A from '../lib/actions';
import { addDays, atTime, daysWord, fmtDate, fmtMinutes, fmtMinutesShort, todayKey } from '../lib/dates';
import { planStudy, unitMinutes, type ExamPlan } from '../lib/engine/study';
import type { Unit } from '../lib/types';
import { coursePace } from '../lib/engine/learning';
import { buildIcs } from '../lib/reminders';
import { download } from '../lib/backup';
import { closeSheet, openSheet } from './sheets';
import { toast } from './toast';

export const STATUS_CHIP: Record<string, string> = { ok: 'green', tight: 'amber', behind: 'red', unknown: 'violet', done: 'green', past: 'blue' };

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

export function StudyLog({ courseId, unitId, minutes, fromTimer }: { courseId?: string; unitId?: string; minutes?: number; fromTimer?: boolean }) {
  const s = useApp();
  const courses = s.courses.filter((c) => !c.archived);
  const [cid, setCid] = useState(courseId || courses[0]?.id || '');
  const units = s.units.filter((u) => u.courseId === cid).sort((a, b) => a.order - b.order);
  const [uid, setUid] = useState(unitId || units.find((u) => u.progress < 1)?.id || '');
  const [mins, setMins] = useState<number | undefined>(minutes || 45);
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const course = s.courses.find((c) => c.id === cid);
  const unit = s.units.find((u) => u.id === uid);
  const left = unit ? Math.round(unit.size * (1 - unit.progress) * 10) / 10 : 0;

  if (!courses.length)
    return (
      <Sheet title="تسجيل مذاكرة" onClose={closeSheet}>
        <p className="muted">أضف مادة أولًا من صفحة الدراسة.</p>
        <button className="btn primary" onClick={() => openSheet({ type: 'course' })}>أضف مادة</button>
      </Sheet>
    );

  const save = () => {
    if (!cid || !mins) return;
    A.logStudy(cid, uid || undefined, mins, amount || 0);
    closeSheet();
    const pace = course ? coursePace({ ...s, sessions: [...s.sessions, { id: 'x', courseId: cid, unitId: uid, minutes: mins, amount: amount || 0, date: todayKey(), at: Date.now() }] }, course) : null;
    toast(
      amount && pace && course
        ? `سُجلت ${fmtMinutes(mins)}. سرعتك في ${course.name}: ~${pace.pace.toFixed(1)} د لكل ${course.sizeLabel} (مستوى صعوبة متوسط)`
        : `سُجلت ${fmtMinutes(mins)} مذاكرة`,
      { undoable: true },
    );
  };

  return (
    <Sheet
      title={fromTimer ? 'انتهت جلسة المذاكرة' : 'تسجيل مذاكرة'}
      onClose={closeSheet}
      footer={
        <button className="btn primary grow" onClick={save} disabled={!mins}>
          حفظ الجلسة
        </button>
      }
    >
      <div className="fields">
        <div className="fields two">
          <div className="field">
            <label>المادة</label>
            <select className="select" value={cid} onChange={(e) => { setCid(e.target.value); setUid(''); }}>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>الدرس</label>
            <select className="select" value={uid} onChange={(e) => setUid(e.target.value)}>
              <option value="">عام / مراجعة</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.title}{u.progress >= 1 ? ' ✓' : ''}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>المدة</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {[25, 45, 60, 90, 120].map((m) => (
              <button key={m} className={`chip btnish ${mins === m ? 'on' : ''}`} onClick={() => setMins(m)}>{fmtMinutes(m)}</button>
            ))}
            <div style={{ width: 110 }}><NumInput value={mins} onChange={setMins} suffix="د" /></div>
          </div>
        </div>
        <div className="field">
          <label>كم أنجزت؟ ({course?.sizeLabel || 'صفحة'})</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {unit && left > 0 && (
              <button className={`chip btnish ${amount === left ? 'on' : ''}`} onClick={() => setAmount(left)}>أنهيت الدرس ({left})</button>
            )}
            <div style={{ width: 130 }}><NumInput value={amount} onChange={setAmount} placeholder="مثال: 12" /></div>
          </div>
          <div className="faint tiny">هذا الرقم هو ما يجعل تقدير وقت المذاكرة مبنيًا على سرعتك الحقيقية. اتركه فارغًا إن كانت الجلسة مراجعة.</div>
        </div>
      </div>
    </Sheet>
  );
}

/** one plain sentence: where you stand for this exam */
export function examSentence(ep: ExamPlan): { text: string; tone: 'green' | 'amber' | 'red' | 'violet' | 'blue' } {
  switch (ep.status) {
    case 'unknown':
      return { text: 'حدد الدروس المطلوبة لأحسب لك الخطة', tone: 'violet' };
    case 'done':
      return { text: 'أنهيت كل الدروس — وقت المراجعة وحل الأسئلة', tone: 'green' };
    case 'past':
      return { text: 'الاختبار اليوم — بالتوفيق', tone: 'blue' };
    case 'ok':
      return { text: `على المسار — ~${fmtMinutes(ep.quota || ep.requiredDaily)} يوميًا تكفي، وتنهي ${fmtDate(ep.finishDay || ep.lastStudyDay, false)}`, tone: 'green' };
    case 'tight':
      return { text: `ممكن لكن بلا هامش — التزم بـ ~${fmtMinutes(ep.quota || ep.requiredDaily)} يوميًا`, tone: 'amber' };
    case 'behind':
      return { text: `الوقت لا يكفي بوتيرتك الحالية — ينقصك ~${fmtMinutes(ep.shortfall)}`, tone: 'red' };
  }
}

const TONE: Record<string, string> = { green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', violet: 'var(--violet)', blue: 'var(--accent)' };

export function ExamPlanView({ ep }: { ep: ExamPlan }) {
  const today = todayKey();
  const sent = examSentence(ep);
  const paceNote =
    ep.pace.source === 'data'
      ? `التقدير من ${ep.pace.n} ${ep.pace.n === 1 ? 'جلسة' : 'جلسات'} سجلتها`
      : ep.pace.source === 'guess'
        ? 'التقدير من سرعتك المتوقعة — يدق بعد أول جلسات تسجلها'
        : ep.pace.source === 'global'
          ? 'التقدير من سرعتك في موادك الأخرى'
          : 'تقدير افتراضي — سجّل جلسة أو جلستين ليصبح دقيقًا';
  const active = ep.status !== 'unknown' && ep.status !== 'done' && ep.status !== 'past';
  return (
    <div className="exam-hero">
      <div className="row" style={{ gap: 14 }}>
        <Ring value={ep.progress} size={58} stroke={5} color={ep.course.color} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="faint small">{ep.daysLeft === 0 ? 'اليوم' : ep.daysLeft === 1 ? 'غدًا' : `بعد ${daysWord(ep.daysLeft)}`} · {fmtDate(ep.exam.date)}</div>
          <div className="status-line" style={{ marginTop: 4, color: TONE[sent.tone], fontWeight: 600 }}>{sent.text}</div>
        </div>
      </div>
      {active && (
        <>
          <div className="kpis">
            <div className="kpi"><div className="v">{fmtMinutesShort(ep.todayMinutes)}</div><div className="k">مذاكرة اليوم</div></div>
            <div className="kpi"><div className="v">{fmtMinutesShort(ep.mid)}</div><div className="k">متبقي (±{Math.round(ep.pace.spread * 100)}%)</div></div>
            <div className="kpi">
              <div className="v">{ep.startBy ? (ep.startBy <= today ? 'الآن' : fmtDate(ep.startBy, false)) : 'متأخر'}</div>
              <div className="k">ابدأ قبل</div>
            </div>
          </div>
          <div className="faint tiny">{paceNote}. أيام المراجعة: {ep.exam.reviewDays ? daysWord(ep.exam.reviewDays) : 'بدون'} قبل الاختبار.</div>
        </>
      )}
      {ep.todayUnits.length > 0 && (
        <div className="small"><span className="muted">ابدأ اليوم بـ: </span>{ep.todayUnits.map((w) => w.unit.title).join('، ')}</div>
      )}
      {ep.reviewCompressed && <div className="notice amber">لم يعد هناك وقت لأيام المراجعة؛ الخطة تستخدم كل الأيام المتبقية للمذاكرة.</div>}
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

/** lesson row: progress ring · title · time left. Tap for details. */
export function LessonRow({ u, color, pace, sizeLabel }: { u: Unit; color: string; pace: number; sizeLabel: string }) {
  const s = useApp();
  const c = s.courses.find((x) => x.id === u.courseId);
  const left = c ? unitMinutes(u, c, pace, s.settings.reviewFactor) : 0;
  const done = u.progress >= 1;
  return (
    <button className={`r ${done && u.reviewed ? 'done' : ''}`} onClick={() => openSheet({ type: 'unit', id: u.id })}>
      <span className="mini-ring"><Ring value={u.progress} size={30} stroke={3} color={color} label={done ? '✓' : ''} /></span>
      <span className="main-t">
        <div className="lbl">{u.title}</div>
        <div className="sub">
          {done ? (u.reviewed ? 'تمت المذاكرة والمراجعة' : 'تمت المذاكرة · بقيت المراجعة') : u.progress > 0 ? `${Math.round(u.progress * 100)}% · بقي ~${fmtMinutes(left)}` : `${u.size} ${sizeLabel} · ~${fmtMinutes(left)}`}
        </div>
      </span>
      <Icon name="chevron" size={15} className="chev-end" />
    </button>
  );
}

export function LessonSheet({ id }: { id: string }) {
  const s = useApp();
  const u = s.units.find((x) => x.id === id);
  if (!u) return null;
  const c = s.courses.find((x) => x.id === u.courseId);
  const sessions = s.sessions.filter((x) => x.unitId === id);
  const up = (patch: Partial<Unit>) => A.updateUnit(id, patch);
  return (
    <Sheet
      title={u.title}
      onClose={closeSheet}
      footer={
        <>
          <button className="btn primary grow" onClick={() => { closeSheet(); A.startTimer({ kind: 'study', refId: id, courseId: u.courseId, unitId: id, label: `${c?.name || ''} · ${u.title}` }); }}>
            <Icon name="play" size={14} /> ذاكر الآن
          </button>
          <button className="btn" onClick={() => { closeSheet(); openSheet({ type: 'study-log', courseId: u.courseId, unitId: id }); }}>سجّل جلسة</button>
        </>
      }
    >
      <div className="fields">
        <div className="field">
          <label>وين وصلت؟</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <button key={v} className={`chip btnish ${Math.abs(u.progress - v) < 0.13 ? 'on' : ''}`} onClick={() => up({ progress: v })}>
                {v === 0 ? 'لم أبدأ' : v === 1 ? 'أنهيته ✓' : `${v * 100}%`}
              </button>
            ))}
          </div>
        </div>
        <div className="row between">
          <div>
            <div style={{ fontWeight: 500 }}>راجعته</div>
            <div className="faint tiny">بعد المراجعة لا أحسب له وقت مراجعة إضافي.</div>
          </div>
          <Switch on={u.reviewed} onChange={(v) => up({ reviewed: v })} label="راجعته" />
        </div>
        <div className="divider" style={{ margin: '4px 0' }} />
        <div className="field">
          <label>الاسم</label>
          <input className="input" value={u.title} onChange={(e) => up({ title: e.target.value })} />
        </div>
        <div className="fields two">
          <div className="field">
            <label>الحجم ({c?.sizeLabel || 'صفحة'})</label>
            <NumInput value={u.size} min={0.5} onChange={(v) => v && up({ size: v })} />
          </div>
          <div className="field">
            <label>صعوبته</label>
            <select className="select" value={u.difficulty || ''} onChange={(e) => up({ difficulty: e.target.value ? +e.target.value : undefined })}>
              <option value="">مثل المادة</option>
              {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{['سهل جدًا', 'سهل', 'متوسط', 'صعب', 'صعب جدًا'][d - 1]}</option>)}
            </select>
          </div>
        </div>
        {(u.spent > 0 || sessions.length > 0) && (
          <div className="faint small">ذاكرت فيه {fmtMinutes(u.spent)} في {sessions.length} {sessions.length === 1 ? 'جلسة' : 'جلسات'}.</div>
        )}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => A.moveUnit(id, -1)}><Icon name="up" size={14} /> قدّمه</button>
          <button className="btn sm" onClick={() => A.moveUnit(id, 1)}><Icon name="down" size={14} /> أخّره</button>
          <span className="grow" />
          <button className="btn sm danger" onClick={() => { A.deleteUnit(id); closeSheet(); toast('حُذف الدرس', { undoable: true }); }}><Icon name="trash" size={14} /> حذف</button>
        </div>
      </div>
    </Sheet>
  );
}

export function ExamEditor({ id, courseId }: { id?: string; courseId?: string }) {
  const s = useApp();
  const existing = id ? s.exams.find((e) => e.id === id) : undefined;
  const courses = s.courses.filter((c) => !c.archived);
  const [cid, setCid] = useState(existing?.courseId || courseId || courses[0]?.id || '');
  const [title, setTitle] = useState(existing?.title || 'اختبار');
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
      <Sheet title="اختبار جديد" onClose={closeSheet}>
        <p className="muted">أضف المادة أولًا، ثم أضف اختبارها.</p>
        <button className="btn primary" onClick={() => openSheet({ type: 'course' })}>أضف مادة</button>
      </Sheet>
    );

  const save = () => {
    let ids = unitIds;
    if (bulk.trim()) {
      const added = A.addUnits(cid, parseUnitLines(bulk, 10));
      ids = [...ids, ...added];
    }
    const eid = A.saveExam({ id, courseId: cid, title: title.trim() || 'اختبار', date, time: time || undefined, reviewDays, weight, score, unitIds: ids });
    closeSheet();
    toast(quotaMessage(eid) || (id ? 'حُفظ الاختبار' : 'أُضيف الاختبار'), { ms: 8000 });
  };

  const exportCal = () => {
    const start = time ? atTime(date, time) : atTime(date, '08:00');
    download(`${course?.name || 'exam'}.ics`, buildIcs([{ uid: `exam-${id || date}`, title: `اختبار ${course?.name || ''} — ${title}`, start, minutes: 90, allDay: !time, alarmMinutes: [24 * 60, 120] }]), 'text/calendar');
  };

  return (
    <Sheet
      wide
      title={existing ? `${course?.name || ''} — ${existing.title}` : 'اختبار جديد'}
      onClose={closeSheet}
      headExtra={existing && <Seg value={tab} onChange={setTab} options={[{ v: 'plan', l: 'الخطة' }, { v: 'edit', l: 'تعديل' }]} />}
      footer={
        tab === 'edit' ? (
          <>
            <button className="btn primary grow" onClick={save}>حفظ</button>
            {existing && (
              <button className="icon-btn" onClick={() => { A.deleteExam(existing.id); closeSheet(); toast('حُذف الاختبار', { undoable: true }); }} aria-label="حذف">
                <Icon name="trash" size={18} />
              </button>
            )}
          </>
        ) : (
          <>
            <button className="btn primary" onClick={() => { closeSheet(); openSheet({ type: 'study-log', courseId: cid }); }}>سجّل مذاكرة</button>
            <button className="btn" onClick={() => { A.startTimer({ kind: 'study', refId: existing!.id, courseId: cid, unitId: ep?.todayUnits[0]?.unit.id, label: `مذاكرة ${course?.name}` }); closeSheet(); }}>
              <Icon name="play" size={15} /> ابدأ مؤقت
            </button>
            <span className="grow" />
            <button className="btn ghost" onClick={exportCal}><Icon name="calplus" size={16} /> للتقويم</button>
          </>
        )
      }
    >
      {tab === 'plan' && ep ? (
        <div className="col" style={{ gap: 16 }}>
          <ExamPlanView ep={ep} />
          <Group title={`الدروس المطلوبة (${existing!.unitIds.length})`}>
            {s.units.filter((u) => existing!.unitIds.includes(u.id)).sort((a, b) => a.order - b.order).map((u) => (
              <LessonRow key={u.id} u={u} color={course?.color || 'var(--accent)'} pace={ep.pace.pace} sizeLabel={course?.sizeLabel || 'صفحة'} />
            ))}
          </Group>
        </div>
      ) : (
        <div className="fields">
          <div className="fields two">
            <div className="field">
              <label>المادة</label>
              <select className="select" value={cid} onChange={(e) => { setCid(e.target.value); setUnitIds(s.units.filter((u) => u.courseId === e.target.value).map((u) => u.id)); }}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>اسم الاختبار</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ميد 1، كويز، نهائي…" />
            </div>
            <div className="field">
              <label>التاريخ</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label>الوقت</label>
              <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>أيام المراجعة قبل الاختبار</label>
            <Seg value={reviewDays} onChange={setReviewDays} options={[0, 1, 2, 3].map((n) => ({ v: n, l: n === 0 ? 'بدون' : daysWord(n) }))} />
            <div className="faint tiny">أنهي المنهج قبلها، وأتركها للمراجعة وحل الأسئلة.</div>
          </div>
          <div className="field">
            <label>الدروس المطلوبة ({unitIds.length})</label>
            {courseUnits.length > 0 && (
              <div className="list" style={{ maxHeight: 220, overflowY: 'auto' }}>
                {courseUnits.map((u) => {
                  const on = unitIds.includes(u.id);
                  return (
                    <label className="item tap" key={u.id} style={{ padding: '9px 12px', alignItems: 'center' }}>
                      <input type="checkbox" checked={on} onChange={() => setUnitIds(on ? unitIds.filter((x) => x !== u.id) : [...unitIds, u.id])} />
                      <span className="grow">{u.title}</span>
                      <span className="faint tiny">{u.size} {course?.sizeLabel}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <textarea
              className="textarea"
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={`أضف دروسًا جديدة، كل درس في سطر مع حجمه (${course?.sizeLabel || 'صفحة'}):\nالدرس 1 - 24\nالدرس 2 - 18`}
            />
          </div>
          <div className="fields two">
            <div className="field">
              <label>الوزن من الدرجة (%)</label>
              <NumInput value={weight} onChange={setWeight} placeholder="اختياري" />
            </div>
            <div className="field">
              <label>درجتك (بعد الاختبار %)</label>
              <NumInput value={score} onChange={setScore} placeholder="—" />
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function ProgressPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const steps = [0, 0.25, 0.5, 0.75, 1];
  return (
    <select className="select" style={{ width: 92, height: 32, padding: '0 10px', paddingInlineStart: 26, fontSize: 13 }} value={steps.reduce((b, x) => (Math.abs(x - value) < Math.abs(b - value) ? x : b), 0)} onChange={(e) => onChange(+e.target.value)} aria-label="التقدم">
      {steps.map((x) => <option key={x} value={x}>{x === 1 ? 'تم ✓' : `${x * 100}%`}</option>)}
    </select>
  );
}

const PALETTE = ['#5e9cff', '#ff8a5c', '#5fd4a0', '#c58cff', '#ffcb47', '#ff6b9a', '#4fd1e0', '#a3d65c'];

export function CourseEditor({ id }: { id?: string }) {
  const s = useApp();
  const c = id ? s.courses.find((x) => x.id === id) : undefined;
  const [name, setName] = useState(c?.name || '');
  const [difficulty, setDifficulty] = useState(c?.difficulty || 3);
  const [sizeLabel, setSizeLabel] = useState(c?.sizeLabel || 'صفحة');
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
      toast(`أُضيفت ${name.trim()}`, { buttons: [{ label: 'أضف اختبارها', fn: () => openSheet({ type: 'exam', courseId: cid }), primary: true }] });
    }
  };

  return (
    <Sheet title={c ? 'تعديل المادة' : 'مادة جديدة'} onClose={closeSheet} footer={<button className="btn primary grow" onClick={save} disabled={!name.trim()}>حفظ</button>}>
      <div className="fields">
        <div className="field">
          <label>اسم المادة</label>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مبادئ الإحصاء" />
        </div>
        <div className="field">
          <label>الصعوبة بالنسبة لك</label>
          <Seg value={difficulty} onChange={setDifficulty} options={[1, 2, 3, 4, 5].map((d) => ({ v: d, l: ['سهلة جدًا', 'سهلة', 'متوسطة', 'صعبة', 'صعبة جدًا'][d - 1] }))} />
        </div>
        <div className="fields two">
          <div className="field">
            <label>وحدة قياس المنهج</label>
            <select className="select" value={sizeLabel} onChange={(e) => setSizeLabel(e.target.value)}>
              {['صفحة', 'شريحة', 'محاضرة', 'درس', 'مسألة'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div className="field">
            <label>كم دقيقة تحتاج لكل {sizeLabel}؟</label>
            <NumInput value={pace} onChange={setPace} placeholder="لا أعرف" suffix="د" />
          </div>
        </div>
        <div className="field">
          <label>اللون</label>
          <div className="row" style={{ gap: 8 }}>
            {PALETTE.map((p) => <button key={p} className={`color-swatch ${color === p ? 'on' : ''}`} style={{ background: p }} onClick={() => setColor(p)} aria-label={p} />)}
          </div>
        </div>
        <div className="field">
          <label>الدروس / الفصول (اختياري)</label>
          <textarea className="textarea" value={units} onChange={(e) => setUnits(e.target.value)} placeholder={`كل درس في سطر مع حجمه:\nالفصل 1 - 24\nالفصل 2 - 18\nالفصل 3 - 30`} />
          <div className="faint tiny">الحجم يساعدني على تقدير الوقت. إن لم تكتبه أفترض 10.</div>
        </div>
      </div>
    </Sheet>
  );
}

/** "حصتك من إحصاء: 55 د يوميًا حتى 7 نوفمبر" — shown right after an exam is added or changed */
export function quotaMessage(examId: string): string | null {
  const ep = planStudy(getState()).exams.find((e) => e.exam.id === examId);
  if (!ep) return null;
  if (ep.status === 'unknown') return 'حُفظ الاختبار — حدد دروسه لأحسب حصتك اليومية';
  if (ep.inReview) return 'حُفظ الاختبار — أنت في أيام المراجعة';
  if (ep.quota <= 0) return null;
  return `حصتك من ${ep.course.name}: ~${fmtMinutes(ep.quota)} يوميًا حتى ${fmtDate(ep.lastStudyDay, false)}${ep.status === 'behind' ? ' — الوقت ضيق جدًا' : ''}`;
}
