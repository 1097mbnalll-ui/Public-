import { useEffect, useState } from 'react';
import { Sheet, useNow } from './kit';
import { Icon } from './Icon';
import { getState, mutate, rollover, useApp } from '../lib/store';
import { planStudy } from '../lib/engine/study';
import * as A from '../lib/actions';
import { addDays, fmtMinutes, todayKey } from '../lib/dates';
import { requestNotifications, tick } from '../lib/reminders';
import { requestPersistence } from '../lib/db';
import { closeSheet, openSheet, useSheet } from './sheets';
import { toast } from './toast';
import { go } from './router';
import { QuickAdd } from './QuickAdd';
import { TaskEditor } from './TaskEditor';
import { CourseEditor, ExamEditor, LessonSheet, StudyLog } from './StudySheets';
import { StepConfirm, TemplateEditor } from './WorkSheets';
import { GoalSheet, Palette, ReplanSheet } from './MiscSheets';

export function SheetHost() {
  const sh = useSheet();
  if (!sh) return null;
  switch (sh.type) {
    case 'quick':
      return <QuickAdd key={sh.text} initial={sh.text} initialMode={sh.mode} />;
    case 'task':
      return <TaskEditor key={sh.id} id={sh.id} />;
    case 'study-log':
      return <StudyLog {...sh} />;
    case 'exam':
      return <ExamEditor key={sh.id || 'new'} id={sh.id} courseId={sh.courseId} />;
    case 'course':
      return <CourseEditor id={sh.id} />;
    case 'unit':
      return <LessonSheet key={sh.id} id={sh.id} />;
    case 'palette':
      return <Palette />;
    case 'replan':
      return <ReplanSheet />;
    case 'step-confirm':
      return <StepConfirm procId={sh.procId} stepId={sh.stepId} />;
    case 'template':
      return <TemplateEditor id={sh.id} fromProc={sh.fromProc} />;
    case 'goal':
      return <GoalSheet id={sh.id} />;
    case 'onboarding':
      return <Onboarding />;
  }
}

function clock(ms: number) {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

export function TimerBar() {
  const s = useApp();
  const [, setT] = useState(0);
  const timer = s.timer;
  useEffect(() => {
    if (!timer?.running) return;
    const id = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [timer?.running]);
  if (!timer) return null;
  const elapsed = A.timerElapsed(timer);
  const stop = () => {
    const r = A.stopTimer();
    if (!r) return;
    if (r.timer.kind === 'study') openSheet({ type: 'study-log', courseId: r.timer.courseId, unitId: r.timer.unitId, minutes: r.minutes, fromTimer: true });
    else toast(`سُجلت ${fmtMinutes(r.minutes)} على «${r.timer.label}»`, { undoable: false });
  };
  return (
    <div className="timerbar" role="status">
      {timer.running ? <span className="pulse" /> : <Icon name="pause" size={14} className="faint" />}
      <span className="ellipsis small" style={{ maxWidth: 160 }}>{timer.label}</span>
      <span className="clock">{clock(elapsed)}</span>
      {timer.running ? (
        <button className="icon-btn sm" onClick={A.pauseTimer} aria-label="إيقاف مؤقت"><Icon name="pause" size={16} /></button>
      ) : (
        <button className="icon-btn sm" onClick={A.resumeTimer} aria-label="استئناف"><Icon name="play" size={14} /></button>
      )}
      <button className="icon-btn sm" onClick={stop} aria-label="إنهاء وحفظ" style={{ color: 'var(--accent)' }}><Icon name="stop" size={15} /></button>
      <button className="icon-btn sm" onClick={() => { if (confirm('إلغاء المؤقت بدون حفظ الوقت؟')) A.cancelTimer(); }} aria-label="إلغاء"><Icon name="x" size={15} /></button>
    </div>
  );
}

/** Background loop while the app is open: reminders + day rollover. */
export function useHeartbeat() {
  useEffect(() => {
    let day = todayKey();
    const run = () => {
      const now = Date.now();
      if (todayKey(now) !== day) {
        day = todayKey(now);
        rollover(now);
      }
      const live = tick(getState(), now);
      for (const r of live)
        toast(`🔔 ${r.title} — ${r.body}`, {
          ms: 12000,
          buttons: r.ref ? [{ label: 'افتح', fn: () => openRef(r.ref!) }] : [],
        });
    };
    const first = setTimeout(run, 1500);
    const id = setInterval(run, 30_000);
    const vis = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
}

export function openRef(ref: string) {
  const [kind, id] = ref.split('/');
  if (kind === 'task' && id) openSheet({ type: 'task', id });
  else go(ref);
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSheet({ type: 'palette' });
        return;
      }
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('.sheet')) return;
      if (e.key === 'n' || e.key === 'ى' || e.key === '+') {
        e.preventDefault();
        openSheet({ type: 'quick' });
      } else if (e.key === '/') {
        e.preventDefault();
        openSheet({ type: 'palette' });
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}

function Onboarding() {
  const s = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(s.settings.name);
  const [weekday, setWeekday] = useState(240);
  const [weekend, setWeekend] = useState(360);

  const finish = async () => {
    const av = [weekday, weekday, weekday, weekday, weekday, weekend, weekend];
    A.updateSettings({
      name: name.trim(),
      available: av,
      studyCap: av.map((m) => Math.round((m * 0.6) / 15) * 15),
    });
    A.setMeta({ onboarded: true });
    requestPersistence();
    closeSheet();
    toast('جاهز. ابدأ بإضافة أول مهمة أو مادة.', { buttons: [{ label: 'أضف', fn: () => openSheet({ type: 'quick' }), primary: true }] });
  };

  const hours = [60, 120, 180, 240, 300, 360, 480];
  return (
    <Sheet title={['أهلًا بك في «مسار»', 'كم وقتك المتاح؟', 'قبل أن نبدأ'][step]} onClose={() => { A.setMeta({ onboarded: true }); closeSheet(); }}
      footer={
        <>
          {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>رجوع</button>}
          <span className="grow" />
          {step < 2 ? <button className="btn primary" onClick={() => setStep(step + 1)}>التالي</button> : <button className="btn primary" onClick={finish}>ابدأ</button>}
        </>
      }>
      {step === 0 && (
        <div className="col" style={{ gap: 14 }}>
          <p className="muted" style={{ margin: 0 }}>
            مساعد شخصي يرتب يومك بين الجامعة والعمل والحياة: يحسب ما يتسع له وقتك فعلًا، ينبهك مبكرًا إذا كان اختبار أو موعد في خطر، ويتابع خطوات إجراءات العمل حتى لا تضيع خطوة.
          </p>
          <div className="field">
            <label>ماذا أناديك؟ (اختياري)</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسمك" />
          </div>
        </div>
      )}
      {step === 1 && (
        <div className="col" style={{ gap: 16 }}>
          <p className="muted small" style={{ margin: 0 }}>
            الوقت الحر للمذاكرة والمهام <b>خارج</b> الدوام والمحاضرات. تقدير تقريبي يكفي، وتقدر تعدّله لكل يوم لاحقًا.
          </p>
          <div className="field">
            <label>أيام الأسبوع (الأحد – الخميس)</label>
            <div className="row wrap" style={{ gap: 6 }}>
              {hours.map((m) => <button key={m} className={`chip btnish ${weekday === m ? 'on' : ''}`} onClick={() => setWeekday(m)}>{fmtMinutes(m)}</button>)}
            </div>
          </div>
          <div className="field">
            <label>نهاية الأسبوع (الجمعة – السبت)</label>
            <div className="row wrap" style={{ gap: 6 }}>
              {hours.map((m) => <button key={m} className={`chip btnish ${weekend === m ? 'on' : ''}`} onClick={() => setWeekend(m)}>{fmtMinutes(m)}</button>)}
            </div>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="col" style={{ gap: 12 }}>
          <div className="notice"><Icon name="shield" size={18} /><div><b>بياناتك على جهازك فقط.</b> لا حسابات ولا خوادم. نزّل نسخة احتياطية من الإعدادات بين فترة وأخرى.</div></div>
          <div className="notice"><Icon name="bell" size={18} /><div><b>التنبيهات تعمل والموقع مفتوح.</b> ما يفوتك وهو مغلق يظهر لك عند فتحه. للتنبيهات المضمونة استخدم زر «أضف للتقويم».</div></div>
          <div className="notice"><Icon name="info" size={18} /><div><b>كل الحسابات من بياناتك.</b> لا يوجد ذكاء اصطناعي خارجي؛ التقديرات تتحسن كلما سجلت وقتك الفعلي.</div></div>
          <button className="btn" onClick={async () => {
            const r = await requestNotifications();
            if (r === 'granted') { A.updateSettings({ notifications: true }); toast('فُعّلت إشعارات المتصفح'); }
            else toast(r === 'unsupported' ? 'هذا المتصفح لا يدعم الإشعارات — ستظهر التذكيرات داخل الموقع' : 'لم يُمنح الإذن — ستظهر التذكيرات داخل الموقع');
          }}>
            <Icon name="bell" size={16} /> فعّل إشعارات المتصفح
          </button>
        </div>
      )}
    </Sheet>
  );
}


/** remember each day's study quota (first value of the day) so tomorrow can explain any change */
export function useQuotaLog() {
  const s = useApp();
  const now = useNow(60_000);
  useEffect(() => {
    const today = todayKey(now);
    const plan = planStudy(s, now);
    const log = s.quotaLog[today] || {};
    const missing = plan.exams.filter((ep) => ep.quota > 0 && log[ep.exam.id] == null);
    if (!missing.length) return;
    mutate((st) => {
      const l = (st.quotaLog[today] ||= {});
      for (const ep of missing) l[ep.exam.id] = ep.quota;
      for (const d of Object.keys(st.quotaLog)) if (d < addDays(today, -21)) delete st.quotaLog[d];
    });
  }, [s, now]);
}
