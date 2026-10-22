import { useEffect, useState } from 'react';
import { CoachChat } from './Coach';
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
import { TransferSheet } from './TransferSheet';
import { L } from '../lib/i18n';

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
    case 'transfer':
      return <TransferSheet />;
    case 'coach':
      return <CoachChat />;
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

/** end the running session: tasks get the minutes, study asks how much was covered */
export function finishTimerUI() {
  const r = A.stopTimer();
  if (!r) return;
  if (r.timer.kind === 'study') openSheet({ type: 'study-log', courseId: r.timer.courseId, unitId: r.timer.unitId, minutes: r.minutes, fromTimer: true });
  else toast(L(`سُجلت ${fmtMinutes(r.minutes)} على «${r.timer.label}»`, `Logged ${fmtMinutes(r.minutes)} on “${r.timer.label}”`));
}

/** compact bar while a session runs outside focus mode; tap it to go back into focus */
export function TimerBar() {
  const s = useApp();
  const [, setT] = useState(0);
  const timer = s.timer;
  useEffect(() => {
    if (!timer?.running) return;
    const id = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [timer?.running]);
  if (!timer || timer.focus) return null;
  const elapsed = A.timerElapsed(timer);
  return (
    <div className="timerbar" role="status">
      <button className="row" style={{ gap: 8, minWidth: 0 }} onClick={() => A.setFocus(true)} title={L("افتح وضع التركيز", "Open focus mode")}>
        {timer.running ? <span className="pulse" /> : <Icon name="pause" size={14} className="faint" />}
        <span className="ellipsis small" style={{ maxWidth: 150 }}>{timer.label}</span>
        <span className="clock">{clock(elapsed)}</span>
      </button>
      {timer.running ? (
        <button className="icon-btn sm" onClick={A.pauseTimer} aria-label={L("إيقاف مؤقت", "Pause")}><Icon name="pause" size={16} /></button>
      ) : (
        <button className="icon-btn sm" onClick={A.resumeTimer} aria-label={L("استئناف", "Resume")}><Icon name="play" size={14} /></button>
      )}
      <button className="icon-btn sm" onClick={finishTimerUI} aria-label={L("إنهاء وحفظ", "Finish & save")} style={{ color: 'var(--accent)' }}><Icon name="stop" size={15} /></button>
      <button className="icon-btn sm" onClick={() => { if (confirm(L('إلغاء المؤقت بدون حفظ الوقت؟', "Cancel the timer without saving the time?"))) A.cancelTimer(); }} aria-label={L("إلغاء", "Cancel")}><Icon name="x" size={15} /></button>
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
          buttons: r.ref ? [{ label: L('افتح', "Open"), fn: () => openRef(r.ref!) }] : [],
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
    toast(L('جاهز. ابدأ بإضافة أول مهمة أو مادة.', "Ready. Start by adding your first task or course."), { buttons: [{ label: L('أضف', "Add"), fn: () => openSheet({ type: 'quick' }), primary: true }] });
  };

  const hours = [60, 120, 180, 240, 300, 360, 480];
  return (
    <Sheet title={[L('أهلًا بك في «مسار»', "Welcome to Masar"), L('كم وقتك المتاح؟', "How much time do you have?"), L('قبل أن نبدأ', "Before we start")][step]} onClose={() => { A.setMeta({ onboarded: true }); closeSheet(); }}
      footer={
        <>
          {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>{L("رجوع", "Back")}</button>}
          <span className="grow" />
          {step < 2 ? <button className="btn primary" onClick={() => setStep(step + 1)}>{L("التالي", "Next")}</button> : <button className="btn primary" onClick={finish}>{L("ابدأ", "Start")}</button>}
        </>
      }>
      {step === 0 && (
        <div className="col" style={{ gap: 14 }}>
          <p className="muted" style={{ margin: 0 }}>{L("مساعد شخصي يرتب يومك بين الجامعة والعمل والحياة: يحسب ما يتسع له وقتك فعلًا، ينبهك مبكرًا إذا كان اختبار أو موعد في خطر، ويتابع خطوات إجراءات العمل حتى لا تضيع خطوة.", "A personal assistant that arranges your day across university, work and life: it calculates what your time can really hold, warns you early when an exam or deadline is at risk, and tracks the steps of work procedures so none get lost.")}</p>
          <div className="field">
            <label>{L("ماذا أناديك؟ (اختياري)", "What should I call you? (optional)")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={L("اسمك", "Your name")} />
          </div>
        </div>
      )}
      {step === 1 && (
        <div className="col" style={{ gap: 16 }}>
          <p className="muted small" style={{ margin: 0 }}>{L("الوقت الحر للمذاكرة والمهام ", "Free time for study and tasks ")}<b>{L("خارج", "outside")}</b>{L(" الدوام والمحاضرات. تقدير تقريبي يكفي، وتقدر تعدّله لكل يوم لاحقًا.", " work and lectures. A rough estimate is enough; you can adjust each day later.")}</p>
          <div className="field">
            <label>{L("أيام الأسبوع (الأحد – الخميس)", "Weekdays (Sunday – Thursday)")}</label>
            <div className="row wrap" style={{ gap: 6 }}>
              {hours.map((m) => <button key={m} className={`chip btnish ${weekday === m ? 'on' : ''}`} onClick={() => setWeekday(m)}>{fmtMinutes(m)}</button>)}
            </div>
          </div>
          <div className="field">
            <label>{L("نهاية الأسبوع (الجمعة – السبت)", "Weekend (Friday – Saturday)")}</label>
            <div className="row wrap" style={{ gap: 6 }}>
              {hours.map((m) => <button key={m} className={`chip btnish ${weekend === m ? 'on' : ''}`} onClick={() => setWeekend(m)}>{fmtMinutes(m)}</button>)}
            </div>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="col" style={{ gap: 12 }}>
          <div className="notice"><Icon name="shield" size={18} /><div><b>{L("بياناتك على جهازك فقط.", "Your data stays on your device.")}</b>{L(" لا حسابات ولا خوادم. نزّل نسخة احتياطية من الإعدادات بين فترة وأخرى.", " No accounts, no servers. Download a backup from settings every now and then.")}</div></div>
          <div className="notice"><Icon name="bell" size={18} /><div><b>{L("التنبيهات تعمل والموقع مفتوح.", "Reminders work while the site is open.")}</b>{L(" ما يفوتك وهو مغلق يظهر لك عند فتحه. للتنبيهات المضمونة استخدم زر «أضف للتقويم».", " Anything missed while it's closed shows up when you open it. For guaranteed alerts use the “Add to calendar” button.")}</div></div>
          <div className="notice"><Icon name="info" size={18} /><div><b>{L("كل الحسابات من بياناتك.", "All calculations come from your data.")}</b>{L(" التقديرات تتحسن كلما سجلت وقتك الفعلي. الذكاء الاصطناعي اختياري ولا يعمل إلا بمفتاحك.", " Estimates improve as you log your real time. AI is optional and only runs with your own key.")}</div></div>
          <button className="btn" onClick={async () => {
            const r = await requestNotifications();
            if (r === 'granted') { A.updateSettings({ notifications: true }); toast(L('فُعّلت إشعارات المتصفح', "Browser notifications enabled")); }
            else toast(r === 'unsupported' ? L('هذا المتصفح لا يدعم الإشعارات — ستظهر التذكيرات داخل الموقع', "This browser doesn't support notifications — reminders will show inside the site") : L('لم يُمنح الإذن — ستظهر التذكيرات داخل الموقع', "Permission not granted — reminders will show inside the site"));
          }}>
            <Icon name="bell" size={16} />{L(" فعّل إشعارات المتصفح", " Enable browser notifications")}</button>
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
