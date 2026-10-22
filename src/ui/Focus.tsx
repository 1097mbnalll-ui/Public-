import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { fmtMinutes } from '../lib/dates';
import { pomodoro } from '../lib/engine/focus';
import { nextStep } from '../lib/engine/procedures';
import { showSystemNotification } from '../lib/reminders';
import { finishTimerUI } from './Shell';
import { L } from '../lib/i18n';

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
  const { pomodoroWork: w, pomodoroBreak: b } = s.settings;
  const elapsed = A.timerElapsed(t);
  const p = pomodoro(elapsed, w, b);
  useWakeLock(true);

  useEffect(() => {
    if (!t.running) return;
    const id = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [t.running]);

  // signal phase changes (end of a work block / end of a break)
  const phaseKey = `${p.phase}:${p.done}`;
  useEffect(() => {
    if (lastPhase.current && lastPhase.current !== phaseKey && t.running) {
      chime();
      const msg = p.phase === 'break' ? L(`أحسنت — استراحة ${b} د`, `Well done — ${b} min break`) : L('انتهت الاستراحة — نرجع للتركيز', "Break's over — back to focus");
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
  } else if (t.unitId) {
    sub = s.units.find((u) => u.id === t.unitId)?.title || '';
  }

  const sessionThoughts = s.thoughts.filter((x) => x.at >= t.startedAt - t.acc);
  const size = 250;
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const frac = p.length ? 1 - p.left / p.length : 0;
  const isBreak = p.phase === 'break';

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
        <span className="faint small">{isBreak ? L('استراحة قصيرة', "Short break") : L(`تركيز · الجولة ${p.done + 1}`, `Focus · round ${p.done + 1}`)}</span>
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
            <div className="num">{mmss(p.left)}</div>
            <div className="faint small">{t.running ? (isBreak ? L('تنفّس، تحرّك، اشرب ماء', "Breathe, move, drink water") : L('ركّز على شيء واحد', "Focus on one thing")) : L('متوقف مؤقتًا', "Paused")}</div>
          </div>
        </div>

        <div className="focus-task">
          <div className="focus-title">{t.label}</div>
          {sub && <div className="muted">{sub}</div>}
          <div className="faint small">{L("عملت ", "Worked ")}{fmtMinutes(p.workMs / 60000)}{p.done ? L(` · ${p.done} ${p.done === 1 ? 'جولة مكتملة' : 'جولات مكتملة'}`, ` · ${p.done} ${p.done === 1 ? 'round done' : 'rounds done'}`) : ''}
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
      </div>
    </div>,
    document.body,
  );
}
