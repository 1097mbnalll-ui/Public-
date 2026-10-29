import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { fmtTime } from '../lib/dates';
import { partAt, planSession, pomodoro, rhythmOf } from '../lib/engine/focus';
import { closePip, openPip, pipState, pipSubscribe, pipSupported, setAutoPip } from '../lib/pip';
import type { AppState } from '../lib/types';
import { L } from '../lib/i18n';
import { toast } from './toast';
import { getState } from '../lib/store';

const pad = (n: number) => String(n).padStart(2, '0');
const mmss = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return t >= 3600 ? `${Math.floor(t / 3600)}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}` : `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};

/** what the floating clock shows: the time left in this phase, which phase, what, and when it all ends */
export function timerView(s: AppState, now = Date.now()) {
  const t = s.timer;
  if (!t) return null;
  const rh = rhythmOf(t, s.settings);
  const elapsed = t.acc + (t.running ? now - t.startedAt : 0);
  const p = pomodoro(elapsed, rh.work, rh.brk, rh.longEvery, rh.longBrk);
  const plan = t.plan ? planSession(0, t.plan.total, rh) : null;
  const finished = !!t.plan && p.workMs >= t.plan.total * 60000;
  const parts = t.plan?.parts && t.plan.parts.length > 1 ? t.plan.parts : null;
  const part = parts ? parts[partAt(parts, p.workMs / 60000).index] : null;
  const left = finished ? 0 : plan && p.phase === 'work' ? Math.min(p.left, t.plan!.total * 60000 - p.workMs) : p.left;
  return {
    clock: finished ? '✓' : mmss(left),
    phase: finished ? 'done' : p.phase,
    phaseText: finished ? L('خلصت الجلسة', 'Session done') : p.phase === 'break' ? (p.long ? L('راحة طويلة', 'Long break') : L('راحة', 'Break')) : plan ? L(`تركيز · ${Math.min(p.done + 1, plan.rounds)}/${plan.rounds}`, `Focus · ${Math.min(p.done + 1, plan.rounds)}/${plan.rounds}`) : L(`تركيز · الجولة ${p.done + 1}`, `Focus · round ${p.done + 1}`),
    label: part ? part.label : t.label,
    ends: plan && !finished ? now + Math.max(0, plan.end - elapsed) : 0,
    running: t.running,
    frac: finished ? 1 : p.length ? 1 - p.left / p.length : 0,
  };
}

/** the floating clock itself (the Document PiP window and the app's own floating window) */
export function PipView() {
  const s = useApp();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, []);
  const v = timerView(s);
  if (!v) return <div className="pipv"><b className="pipv-clock">—</b></div>;
  return (
    <div className={`pipv ${v.phase}`}>
      <span className="pipv-k">{v.phaseText}</span>
      <b className="pipv-clock num">{v.clock}</b>
      <span className="pipv-l">{v.label}</span>
      {v.ends > 0 && <span className="pipv-e">{L(`تخلص ${fmtTime(v.ends)}`, `Ends ${fmtTime(v.ends)}`)}</span>}
      <i className="pipv-bar"><i style={{ width: `${v.frac * 100}%` }} /></i>
      {!pipState().inPip && (
        <button className="pipv-btn" onClick={v.running ? A.pauseTimer : A.resumeTimer} aria-label={v.running ? L('إيقاف مؤقت', 'Pause') : L('استئناف', 'Resume')}>
          <Icon name={v.running ? 'pause' : 'play'} size={18} />
        </button>
      )}
    </div>
  );
}

/** the canvas version for phone browsers: same content, drawn */
function paint(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const v = timerView(getState());
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  ctx.fillStyle = v?.phase === 'break' ? (dark ? '#0f2a20' : '#e3f6ee') : dark ? '#1b1830' : '#f3efff';
  ctx.fillRect(0, 0, w, h);
  if (!v) return;
  const ink = dark ? '#f4f2ff' : '#26233a';
  const accent = v.phase === 'break' ? '#14A06B' : '#7E62F0';
  ctx.textAlign = 'center';
  ctx.direction = document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
  ctx.fillStyle = accent;
  ctx.font = '600 30px system-ui, sans-serif';
  ctx.fillText(v.phaseText, w / 2, 62);
  ctx.fillStyle = ink;
  ctx.font = '700 120px system-ui, sans-serif';
  ctx.fillText(v.clock, w / 2, 200);
  ctx.font = '500 28px system-ui, sans-serif';
  ctx.fillText(v.label.length > 28 ? `${v.label.slice(0, 27)}…` : v.label, w / 2, 256);
  if (v.ends) {
    ctx.fillStyle = accent;
    ctx.fillText(L(`تخلص ${fmtTime(v.ends)}`, `Ends ${fmtTime(v.ends)}`), w / 2, 300);
  }
  ctx.fillStyle = dark ? '#ffffff22' : '#26233a1a';
  ctx.fillRect(40, 330, w - 80, 10);
  ctx.fillStyle = accent;
  ctx.fillRect(40, 330, (w - 80) * v.frac, 10);
  if (!v.running) {
    ctx.fillStyle = ink;
    ctx.font = '600 26px system-ui, sans-serif';
    ctx.fillText(L('متوقف', 'Paused'), w / 2, 108);
  }
}

export const usePip = () => useSyncExternalStore(pipSubscribe, pipState);

/** a «نافذة عائمة» button for the focus screen and the timer bar */
export function PipButton({ className = 'btn sm ghost', label = true }: { className?: string; label?: boolean }) {
  const st = usePip();
  if (!pipSupported()) return null;
  const open = !!(st.win || st.video);
  return (
    <button
      className={className}
      aria-label={L('نافذة عائمة', 'Floating window')}
      onClick={async () => {
        if (open) return closePip();
        const ok = await openPip(paint, (play) => (play ? A.resumeTimer() : A.pauseTimer()));
        if (ok) {
          if (getState().timer?.focus) A.setFocus(false);
        } else toast(L('ما قدرت أفتح النافذة العائمة في هالمتصفح', "Couldn't open a floating window in this browser"));
      }}
    >
      <Icon name="pip" size={15} />{label ? (open ? L(' سكّر النافذة', ' Close window') : L(' نافذة عائمة', ' Floating window')) : null}
    </button>
  );
}

/** mounted once: renders into the Document PiP window, closes it with the timer, and arms the app's auto-float */
export function PipHost() {
  const s = useApp();
  const st = usePip();
  const running = !!s.timer?.running;
  const has = !!s.timer;
  useEffect(() => setAutoPip(running), [running]);
  useEffect(() => {
    if (!has && (st.win || st.video)) closePip();
  }, [has, st.win, st.video]);
  return st.win ? createPortal(<PipView />, st.win.document.body) : null;
}
