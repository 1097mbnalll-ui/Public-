import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { fmtMinutes, fmtTime } from '../lib/dates';
import { clockAfter, partAt, planSession, pomodoro } from '../lib/engine/focus';
import { prayerGaps } from '../lib/engine/prayer';
import { nextStep } from '../lib/engine/procedures';
import { showSystemNotification } from '../lib/reminders';
import { finishTimerUI } from './Shell';
import { PipButton } from './PipTimer';
import { L, szn } from '../lib/i18n';

const pad = (n: number) => String(n).padStart(2, '0');
const mmss = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};

function chime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 1.3);
  } catch {
    /* sound is a nice-to-have */
  }
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* ignore */
  }
}

/** keep the phone screen on while focusing (where supported) */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: any = null;
    const get = () => (navigator as any).wakeLock.request('screen').then((l: any) => (lock = l)).catch(() => {});
    get();
    const vis = () => document.visibilityState === 'visible' && get();
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      lock?.release?.().catch?.(() => {});
    };
  }, [active]);
}

/**
 * Deep focus: nothing on screen but the Pomodoro clock, what you're working on,
 * and a place to park stray thoughts without leaving.
 */
export function FocusScreen() {
  const s = useApp();
  const t = s.timer!;
  const [, tick] = useState(0);
  const [thought, setThought] = useState('');
  const lastPhase = useRef<string | null>(null);
  const rh = A.rhythmOf(t, s.settings);
  const { work: w, brk: b } = rh;
  const elapsed = A.timerElapsed(t);
  const p = pomodoro(elapsed, w, b, rh.longEvery, rh.longBrk);
  // a planned session knows its length: how many rounds, and the clock time it ends (pauses push it)
  const plan = t.plan ? planSession(0, t.plan.total, rh) : null;
  const finished = !!t.plan && p.workMs >= t.plan.total * 60000;
  // the finish on the clock, with the prayers on the way (the session stops for each)
  const endsAt = plan ? clockAfter(Date.now(), Math.max(0, plan.end - elapsed), prayerGaps(s.settings, Date.now(), Date.now() + 2 * 86_400_000)) : 0;
  // several subjects in one session: the one you're on now, and what's left of it
  const parts = t.plan?.parts && t.plan.parts.length > 1 ? t.plan.parts : null;
  const cur = parts ? partAt(parts, p.workMs / 60000) : null;
  const part = parts && cur ? parts[cur.index] : null;
  const label = part ? part.label : t.label;
  const unitId = part ? part.unitId : t.unitId;
  useWakeLock(true);

  useEffect(() => {
    if (!t.running) return;
    const id = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [t.running]);

  // signal phase changes (end of a work block / end of a break)
  const phaseKey = finished ? 'finished' : `${p.phase}:${p.done}:${cur?.index ?? 0}`;
  useEffect(() => {
    if (lastPhase.current && lastPhase.current !== phaseKey && t.running) {
      chime();
      const brk = Math.round(p.length / 60000);
      const switched = !!part && !lastPhase.current.endsWith(`:${cur!.index}`) && lastPhase.current !== 'finished';
      const msg = finished ? L('خلصت جلستك 🎉 سجّلها', 'Session done 🎉 log it') : switched && p.phase === 'work' ? L(`خلصت حصة المادة — الحين: ${part!.label}`, `Subject done — now: ${part!.label}`) : p.phase === 'break' ? L(`أحسنت — استراحة ${p.long ? 'طويلة ' : ''}${brk} د`, `Well done — ${p.long ? 'long ' : ''}${brk} min break`) : L('انتهت الاستراحة — نرجع للتركيز', "Break's over — back to focus");
      if (document.visibilityState === 'hidden' && s.settings.notifications) showSystemNotification(L('جلسة التركيز', "Focus session"), msg, 'focus-phase', '#/today');
    }
    lastPhase.current = phaseKey;
  }, [phaseKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target as HTMLElement).closest('input') && A.setFocus(false);
    addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  // what exactly is being worked on
  let sub = '';
  if (t.kind === 'task') {
    const task = s.tasks.find((x) => x.id === t.refId);
    const next = task?.checklist.find((c) => !c.done);
    if (next) sub = L(`الخطوة الحالية: ${next.title}`, `Current step: ${next.title}`);
  } else if (t.kind === 'procedure') {
    const pr = s.procedures.find((x) => x.id === t.refId);
    const n = pr && nextStep(pr);
    if (n) sub = L(`الخطوة التالية: ${n.title}`, `Next step: ${n.title}`);
  } else if (unitId) {
    // the lesson, and how much of it is left — the goal of the session
    const u = s.units.find((x) => x.id === unitId);
    const c = u && s.courses.find((x) => x.id === u.courseId);
    if (u) {
      const left = Math.round(u.size * (1 - Math.min(1, u.progress)) * 10) / 10;
      const title = label.endsWith(u.title) ? '' : `${u.title} · `;
      sub = left > 0 ? L(`${title}باقي ${szn(left, c?.sizeLabel)}`, `${title}${szn(left, c?.sizeLabel)} left`) : L(`${title}مراجعة`, `${title}review`);
    }
  }

  const sessionThoughts = s.thoughts.filter((x) => x.at >= t.startedAt - t.acc);
  const size = 250;
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const frac = finished ? 1 : p.length ? 1 - p.left / p.length : 0;
  const isBreak = !finished && p.phase === 'break';
  const round = Math.min(p.done + 1, plan?.rounds ?? Infinity);

  const addThought = () => {
    const v = thought.trim();
    if (!v) return;
    A.addThought(v, t.label);
    setThought('');
  };

  return createPortal(
    <div className={`focus-screen ${isBreak ? 'is-break' : ''}`} role="dialog" aria-label={L("وضع التركيز", "Focus mode")}>
      <div className="focus-top">
        <button className="btn sm ghost" onClick={() => A.setFocus(false)}>
          <Icon name="down" size={15} />{L(" تصغير", " Minimise")}</button>
        <PipButton />
        <span className="faint small">{finished ? L('خلصت الجلسة', 'Session done') : isBreak ? (p.long ? L('استراحة طويلة', 'Long break') : L('استراحة قصيرة', "Short break")) : plan ? L(`تركيز · الجولة ${round} من ${plan.rounds}`, `Focus · round ${round} of ${plan.rounds}`) : L(`تركيز · الجولة ${p.done + 1}`, `Focus · round ${p.done + 1}`)}</span>
      </div>

      <div className="focus-center">
        <div className="focus-ring" style={{ width: size, height: size }}>
          <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--track)" strokeWidth="7" fill="none" />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={isBreak ? 'var(--green)' : 'var(--accent)'}
              strokeWidth="7"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - frac)}
              style={{ transition: 'stroke-dashoffset .5s linear' }}
            />
          </svg>
          <div className="focus-clock">
            <div className="num">{finished ? '✓' : mmss(plan && p.phase === 'work' ? Math.min(p.left, t.plan!.total * 60000 - p.workMs) : p.left)}</div>
            <div className="faint small">{finished ? L('اضغط ✓ وسجّل وش خلصت', 'Tap ✓ and log what you covered') : t.running ? (isBreak ? L('تنفّس، تحرّك، اشرب ماء', "Breathe, move, drink water") : L('ركّز على شيء واحد', "Focus on one thing")) : L('متوقف مؤقتًا', "Paused")}</div>
          </div>
        </div>

        <div className="focus-task">
          <div className="focus-title">{label}</div>
          {parts && cur && !finished && <div className="faint small">{L(`المادة ${cur.index + 1} من ${parts.length} · باقي لها ${fmtMinutes(cur.left)}${parts[cur.index + 1] ? ` · بعدها ${parts[cur.index + 1].label}` : ''}`, `Subject ${cur.index + 1} of ${parts.length} · ${fmtMinutes(cur.left)} left${parts[cur.index + 1] ? ` · then ${parts[cur.index + 1].label}` : ''}`)}</div>}
          {sub && <div className="muted">{sub}</div>}
          {plan && !finished && <div className="focus-ends">{L(`تخلص الساعة ${fmtTime(endsAt)}`, `Ends at ${fmtTime(endsAt)}`)}{t.running ? '' : L(' (إذا كمّلت الحين)', ' (if you resume now)')}</div>}
          <div className="faint small">{L("عملت ", "Worked ")}{fmtMinutes(Math.min(p.workMs, (t.plan?.total ?? Infinity) * 60000) / 60000)}{plan ? L(` من ${fmtMinutes(t.plan!.total)}`, ` of ${fmtMinutes(t.plan!.total)}`) : ''}{p.done ? L(` · ${p.done} ${p.done === 1 ? 'جولة مكتملة' : 'جولات مكتملة'}`, ` · ${p.done} ${p.done === 1 ? 'round done' : 'rounds done'}`) : ''}
          </div>
        </div>

        <div className="row" style={{ gap: 12, justifyContent: 'center' }}>
          {t.running ? (
            <button className="focus-btn" onClick={A.pauseTimer} aria-label={L("إيقاف مؤقت", "Pause")}><Icon name="pause" size={24} /></button>
          ) : (
            <button className="focus-btn" onClick={A.resumeTimer} aria-label={L("استئناف", "Resume")}><Icon name="play" size={22} /></button>
          )}
          <button className="focus-btn primary" onClick={finishTimerUI} aria-label={L("إنهاء الجلسة", "End session")}><Icon name="check" size={26} stroke={2.4} /></button>
        </div>
      </div>

      <div className="focus-dump">
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            value={thought}
            onChange={(e) => setThought(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && addThought()}
            placeholder={L("فكرة أو شيء تذكرته؟ اكتبه هنا وارجع لعملك", "A thought or something you remembered? Write it here and get back to work")}
            aria-label={L("تفريغ الأفكار", "Brain dump")}
          />
          <button className="btn" onClick={addThought} disabled={!thought.trim()}>{L("حفظ", "Save")}</button>
        </div>
        {sessionThoughts.length > 0 && (
          <div className="faint tiny" style={{ marginTop: 6 }}>{L("حفظت ", "Saved ")}{sessionThoughts.length} {sessionThoughts.length === 1 ? L('فكرة', "thought") : L('أفكار', "thoughts")}{L(" — تجدها في صفحة «اليوم» بعد الجلسة.", " — you'll find them on the “Today” page after the session.")}</div>
        )}
        {plan ? (
          <div className="faint tiny" style={{ marginTop: 10, textAlign: 'center' }}>{L(`${b ? `${w} د تركيز + ${b} د راحة` : `${w} د تركيز بدون راحات`}${rh.longEvery ? ` · راحة ${rh.longBrk} د كل ${rh.longEvery} جولات` : ''}`, `${w} min focus + ${b} min break${rh.longEvery ? ` · ${rh.longBrk} min every ${rh.longEvery} rounds` : ''}`)}</div>
        ) : (
        <div className="row" style={{ gap: 6, marginTop: 10, justifyContent: 'center' }}>
          {[
            [25, 5],
            [50, 10],
            [90, 15],
          ].map(([ww, bb]) => (
            <button key={ww} className={`chip btnish ${w === ww ? 'on' : ''}`} style={{ height: 26, fontSize: 11 }} onClick={() => A.updateSettings({ pomodoroWork: ww, pomodoroBreak: bb })}>
              {ww}/{bb}
            </button>
          ))}
        </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
