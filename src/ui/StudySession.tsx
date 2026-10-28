import { useMemo, useState } from 'react';
import { Sheet, Switch } from './kit';
import { Icon } from './Icon';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { atTime, fmtMinutes, fmtTime, todayKey } from '../lib/dates';
import { planSession, type Rhythm } from '../lib/engine/focus';
import { planStudy } from '../lib/engine/study';
import { L } from '../lib/i18n';
import { closeSheet } from './sheets';
import { toast } from './toast';

const pad = (n: number) => String(n).padStart(2, '0');
const clockOf = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const PRESETS: [number, number][] = [[25, 5], [45, 10], [50, 10], [90, 20]];
const LENGTHS = [30, 60, 90, 120, 180];

function Stepper({ value, onChange, min, max, step, unit, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit: string; label: string }) {
  return (
    <div className="ps-step" role="group" aria-label={label}>
      <span className="ps-step-l">{label}</span>
      <div className="ps-step-c">
        <button aria-label={L('أقل', 'Less')} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>−</button>
        <b className="num">{value}<small> {unit}</small></b>
        <button aria-label={L('أكثر', 'More')} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>+</button>
      </div>
    </div>
  );
}

/**
 * «جلسة مذاكرة»: pick when you start, how long you'll study and your rhythm (25/5, 50/10 or your
 * own) — see the rounds, the breaks and the time you finish, then start or get reminded.
 */
export function StudySessionSheet({ examId }: { examId?: string }) {
  const s = useApp();
  const now = Date.now();
  const plan = useMemo(() => planStudy(s, now), [s]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = plan.exams.filter((ep) => ep.status !== 'past' && ep.status !== 'unknown');
  const [pick, setPick] = useState<string | undefined>(examId ?? (rows.find((ep) => ep.todayMinutes > 0) || rows[0])?.exam.id);
  const ep = rows.find((x) => x.exam.id === pick);
  const suggested = ep && ep.todayMinutes > 0 ? Math.max(15, Math.ceil(ep.todayMinutes / 5) * 5) : 60;
  const [total, setTotal] = useState(suggested);
  const [startNow, setStartNow] = useState(true);
  const [time, setTime] = useState(() => clockOf(Math.ceil((now + 15 * 60000) / 900_000) * 900_000));
  const st = s.settings;
  const [work, setWork] = useState(st.pomodoroWork || 25);
  const [brk, setBrk] = useState(st.pomodoroBreak ?? 5);
  const [longOn, setLongOn] = useState((st.pomodoroLongEvery || 0) > 0);
  const [longEvery, setLongEvery] = useState(st.pomodoroLongEvery || 4);
  const [longBrk, setLongBrk] = useState(st.pomodoroLong || 15);
  const r: Rhythm = { work, brk, longEvery: longOn ? longEvery : 0, longBrk };
  // a start time earlier than now means tomorrow
  const startAt = startNow ? now : (() => { const t = atTime(todayKey(now), time); return t < now - 60_000 ? t + 86_400_000 : t; })();
  const sp = planSession(startAt, total, r);

  const pickExam = (id: string) => {
    setPick(id);
    const x = rows.find((y) => y.exam.id === id);
    if (x && x.todayMinutes > 0) setTotal(Math.max(15, Math.ceil(x.todayMinutes / 5) * 5));
  };
  const label = ep ? L(`مذاكرة ${ep.course.name}`, `Study ${ep.course.name}`) : L('جلسة مذاكرة', 'Study session');
  const keepRhythm = () => A.updateSettings({ pomodoroWork: work, pomodoroBreak: brk, pomodoroLongEvery: longOn ? longEvery : 0, pomodoroLong: longBrk });

  const start = () => {
    keepRhythm();
    closeSheet();
    const unit = ep?.portion[0]?.unit;
    A.startTimer({ kind: 'study', refId: ep?.exam.id ?? 'session', courseId: ep?.course.id, unitId: unit?.id, label: unit && ep ? `${ep.course.name} · ${unit.title}` : label, plan: { total, work, brk, longEvery: longOn ? longEvery : 0, longBrk } });
  };
  const remind = () => {
    keepRhythm();
    A.saveRemind({ title: L(`ابدأ ${label} — ${fmtMinutes(total)}، تخلص ${fmtTime(sp.end)}`, `Start ${label} — ${fmtMinutes(total)}, done by ${fmtTime(sp.end)}`), note: L(`${work} د تركيز + ${brk} د راحة · ${sp.rounds} جولات`, `${work} min focus + ${brk} min break · ${sp.rounds} rounds`), at: startAt, repeat: 'none', ref: 'study' });
    closeSheet();
    toast(L(`🔔 بذكّرك الساعة ${fmtTime(startAt)} تبدأ`, `🔔 I'll remind you to start at ${fmtTime(startAt)}`));
  };

  return (
    <Sheet title={L('خطّط جلستك', 'Plan your session')} onClose={closeSheet} footer={
      startNow ? (
        <button className="btn primary grow" onClick={start}><Icon name="play" size={15} /> {L(`ابدأ — تخلص ${fmtTime(sp.end)}`, `Start — done by ${fmtTime(sp.end)}`)}</button>
      ) : (
        <button className="btn primary grow" onClick={remind}><Icon name="bell" size={15} /> {L(`ذكّرني ${fmtTime(startAt)}`, `Remind me at ${fmtTime(startAt)}`)}</button>
      )
    }>
      <div className="ps">
        {rows.length > 0 && (
          <div className="field">
            <label>{L('وش بتذاكر؟', 'Studying what?')}</label>
            <div className="row wrap" style={{ gap: 6 }}>
              {rows.map((x) => (
                <button key={x.exam.id} className={`chip btnish ${pick === x.exam.id ? 'on' : ''}`} onClick={() => pickExam(x.exam.id)}>
                  <span className="sx-dot" style={{ background: x.course.color }} /> {x.course.name}{x.todayMinutes > 0 ? ` · ${fmtMinutes(x.todayMinutes)}` : ''}
                </button>
              ))}
              <button className={`chip btnish ${!pick ? 'on' : ''}`} onClick={() => setPick(undefined)}>{L('عام', 'General')}</button>
            </div>
          </div>
        )}

        <div className="field">
          <label>{L('متى تبدأ؟', 'Start when?')}</label>
          <div className="ps-start">
            <button className={`chip btnish ${startNow ? 'on' : ''}`} onClick={() => setStartNow(true)}>{L('الحين', 'Now')}</button>
            <button className={`chip btnish ${!startNow ? 'on' : ''}`} onClick={() => setStartNow(false)}>{L('وقت ثاني', 'Later')}</button>
            {!startNow && <input type="time" className="input" aria-label={L('وقت البداية', 'Start time')} value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />}
          </div>
        </div>

        <div className="field">
          <label>{L('كم بتذاكر؟', 'How long?')}{ep && ep.todayMinutes > 0 ? <small className="faint"> · {L(`حصة اليوم ${fmtMinutes(ep.todayMinutes)}`, `today's share ${fmtMinutes(ep.todayMinutes)}`)}</small> : null}</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {[...new Set([suggested, ...LENGTHS])].sort((a, b) => a - b).map((m) => <button key={m} className={`chip btnish ${total === m ? 'on' : ''}`} onClick={() => setTotal(m)}>{fmtMinutes(m)}</button>)}
          </div>
          <Stepper label={L('المذاكرة كلها', 'Total focus')} value={total} onChange={setTotal} min={10} max={600} step={5} unit={L('د', 'min')} />
        </div>

        <div className="field">
          <label>{L('الإيقاع', 'Rhythm')}</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {PRESETS.map(([w, b]) => <button key={w} className={`chip btnish ${work === w && brk === b ? 'on' : ''}`} onClick={() => { setWork(w); setBrk(b); }}>{L(`${w} د + ${b} راحة`, `${w} + ${b} break`)}</button>)}
          </div>
          <div className="ps-steps">
            <Stepper label={L('تركيز', 'Focus')} value={work} onChange={setWork} min={5} max={180} step={5} unit={L('د', 'min')} />
            <Stepper label={L('راحة', 'Break')} value={brk} onChange={setBrk} min={0} max={60} step={brk < 5 ? 1 : 5} unit={L('د', 'min')} />
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span>{L('راحة أطول كل كم جولة', 'A longer break every few rounds')}</span>
            <Switch on={longOn} onChange={setLongOn} label={L('راحة أطول', 'Longer break')} />
          </div>
          {longOn && (
            <div className="ps-steps">
              <Stepper label={L('كل', 'Every')} value={longEvery} onChange={setLongEvery} min={2} max={8} step={1} unit={L('جولات', 'rounds')} />
              <Stepper label={L('مدتها', 'Length')} value={longBrk} onChange={setLongBrk} min={5} max={60} step={5} unit={L('د', 'min')} />
            </div>
          )}
        </div>

        <div className="ps-sum">
          <div className="ps-end">
            <small>{L('تخلص الساعة', 'You finish at')}</small>
            <b className="num">{fmtTime(sp.end)}</b>
          </div>
          <div className="ps-facts">
            <span>{L(`تبدأ ${fmtTime(startAt)}`, `Start ${fmtTime(startAt)}`)}</span>
            <span>{sp.rounds === 1 ? L('جولة وحدة', 'One round') : sp.rounds === 2 ? L('جولتين', 'Two rounds') : L(`${sp.rounds} جولات`, `${sp.rounds} rounds`)}</span>
            <span>{L(`${fmtMinutes(sp.workMin)} مذاكرة`, `${fmtMinutes(sp.workMin)} study`)}</span>
            <span>{sp.breakMin ? L(`${fmtMinutes(sp.breakMin)} راحة`, `${fmtMinutes(sp.breakMin)} breaks`) : L('بدون راحة', 'No breaks')}</span>
          </div>
          <ol className="ps-line" aria-label={L('جدول الجلسة', 'Session timeline')}>
            {sp.blocks.map((b, i) => (
              <li key={i} className={b.kind}>
                <span className="t num">{fmtTime(b.from)}</span>
                <span className="k">{b.kind === 'work' ? L(`تركيز ${b.min} د`, `Focus ${b.min} min`) : b.kind === 'long' ? L(`راحة طويلة ${b.min} د`, `Long break ${b.min} min`) : L(`راحة ${b.min} د`, `Break ${b.min} min`)}</span>
              </li>
            ))}
            <li className="end"><span className="t num">{fmtTime(sp.end)}</span><span className="k">{L('خلصت 🎉', 'Done 🎉')}</span></li>
          </ol>
        </div>
      </div>
    </Sheet>
  );
}
