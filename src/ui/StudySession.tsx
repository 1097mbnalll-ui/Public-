import { useMemo, useState } from 'react';
import { Seg, Sheet, Switch, useNow } from './kit';
import { Icon } from './Icon';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { atTime, fmtMinutes, fmtTime, todayKey } from '../lib/dates';
import { blockParts, fitTotal, planSession, type Rhythm, type SessionPart } from '../lib/engine/focus';
import { planStudy, type ExamPlan } from '../lib/engine/study';
import { L } from '../lib/i18n';
import { closeSheet } from './sheets';
import { toast } from './toast';

const pad = (n: number) => String(n).padStart(2, '0');
const clockOf = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const PRESETS: [number, number][] = [[25, 5], [45, 10], [50, 10], [90, 20]];
const LENGTHS = [30, 45, 60, 90, 120, 180];
const MIN = 60000;

type When = 'start' | 'end' | 'window';
type Amount = 'today' | 'custom';

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

/** a clock time today — or tomorrow when it's already passed */
function nextAt(hhmm: string, now: number) {
  const t = atTime(todayKey(now), hhmm);
  return t < now - MIN ? t + 86_400_000 : t;
}

/** «4:30 م» — with «بكرة» when it's tomorrow */
function when(ms: number, now: number) {
  return todayKey(ms) === todayKey(now) ? fmtTime(ms) : L(`بكرة ${fmtTime(ms)}`, `tomorrow ${fmtTime(ms)}`);
}

/** total minutes handed to the subjects in proportion to their share today; whole minutes that add up exactly */
function share(rows: { ep: ExamPlan; base: number }[], total: number): number[] {
  const sum = rows.reduce((a, r) => a + r.base, 0) || 1;
  const raw = rows.map((r) => (r.base / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  // the leftover minutes go to the biggest remainders
  const order = raw.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; out[i]++; left--; }
  return out;
}

/** what's left of a subject today, in lessons: «الفصل 2 (الباقي)، الفصل 3» */
function lessonsOf(ep: ExamPlan) {
  const p = ep.portion.map((x) => x.unit.title);
  return p.length > 2 ? `${p.slice(0, 2).join(L('، ', ', '))} +${p.length - 2}` : p.join(L('، ', ', '));
}

/**
 * «خطّط جلستك»: which subjects (all of today's, or some), how long, and when — from a start time,
 * back from the time you want to be done, or whatever fits between two times. Shows the start, every
 * round and break with its subject, and the finish, to the minute.
 */
export function StudySessionSheet({ examId }: { examId?: string }) {
  const s = useApp();
  const tick = useNow(15_000);
  const now = Math.floor(tick / MIN) * MIN;
  const plan = useMemo(() => planStudy(s, tick), [s]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = plan.exams.filter((ep) => ep.status !== 'past' && ep.status !== 'unknown');
  const today = rows.filter((ep) => ep.todayMinutes > 0);
  const [picked, setPicked] = useState<string[]>(() => (examId ? [examId] : today.length ? today.map((ep) => ep.exam.id) : rows.slice(0, 1).map((ep) => ep.exam.id)));
  // in the order you put them — that's the order you study them in
  const chosen = picked.map((id) => rows.find((ep) => ep.exam.id === id)).filter((ep): ep is ExamPlan => !!ep);
  // a subject with nothing left today still gets a fair default (its next lesson's worth, or 30 min)
  const base = chosen.map((ep) => ({ ep, base: Math.max(1, Math.round(ep.todayMinutes > 0 ? ep.todayMinutes : ep.work[0]?.minutes || 30)) }));
  const todayTotal = base.reduce((a, r) => a + r.base, 0);

  const st = s.settings;
  const [work, setWork] = useState(st.pomodoroWork || 25);
  const [brk, setBrk] = useState(st.pomodoroBreak ?? 5);
  const [longOn, setLongOn] = useState((st.pomodoroLongEvery || 0) > 0);
  const [longEvery, setLongEvery] = useState(st.pomodoroLongEvery || 4);
  const [longBrk, setLongBrk] = useState(st.pomodoroLong || 15);
  const r: Rhythm = { work, brk, longEvery: longOn ? longEvery : 0, longBrk };

  const [mode, setMode] = useState<When>('start');
  const [startNow, setStartNow] = useState(true);
  const [startTime, setStartTime] = useState(() => clockOf(Math.ceil((tick + 15 * MIN) / (15 * MIN)) * 15 * MIN));
  const [endTime, setEndTime] = useState(() => clockOf(Math.ceil((tick + 3 * 3600_000) / (15 * MIN)) * 15 * MIN));
  const [amount, setAmount] = useState<Amount>('today');
  const [custom, setCustom] = useState(60);

  // when you start, how much you study, and so when you finish
  const startFixed = startNow ? now : nextAt(startTime, now);
  let total = amount === 'today' ? todayTotal : custom;
  let startAt = startFixed;
  if (mode === 'window') {
    const endAt = nextAt(endTime, startFixed);
    // what fits between the two times — but no more than you asked for (finishing early is fine)
    total = Math.min(total, fitTotal(startFixed, endAt < startFixed ? endAt + 86_400_000 : endAt, r));
  } else if (mode === 'end') {
    const span = planSession(0, Math.max(1, total), r).end;
    const endAt = nextAt(endTime, now);
    startAt = endAt - span;
  }
  total = Math.max(0, Math.round(total));
  const late = mode === 'end' && startAt < now - MIN;
  const sp = planSession(startAt, Math.max(1, total), r);
  const mins = share(base, total);
  const parts: SessionPart[] = base.map((b, i) => ({ examId: b.ep.exam.id, courseId: b.ep.course.id, unitId: b.ep.portion[0]?.unit.id ?? b.ep.work[0]?.unit.id, label: b.ep.course.name, minutes: mins[i] })).filter((p) => p.minutes > 0);
  const covers = blockParts(sp, parts);
  const startsNow = Math.abs(startAt - now) < 2 * MIN;
  const ok = total > 0 && parts.length > 0 && !late;

  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const move = (i: number, d: -1 | 1) => setPicked((x) => {
    const order = chosen.map((ep) => ep.exam.id);
    const j = i + d;
    if (j < 0 || j >= order.length) return x;
    [order[i], order[j]] = [order[j], order[i]];
    return order;
  });
  const all = rows.length > 1 && picked.length === rows.length;
  const label = parts.length === 1 ? L(`مذاكرة ${parts[0].label}`, `Study ${parts[0].label}`) : L(`مذاكرة: ${parts.map((p) => p.label).join(' + ')}`, `Study: ${parts.map((p) => p.label).join(' + ')}`);
  const keepRhythm = () => A.updateSettings({ pomodoroWork: work, pomodoroBreak: brk, pomodoroLongEvery: longOn ? longEvery : 0, pomodoroLong: longBrk });

  const start = () => {
    keepRhythm();
    closeSheet();
    const first = parts[0];
    const unit = s.units.find((u) => u.id === first.unitId);
    A.startTimer({ kind: 'study', refId: first.examId ?? 'session', courseId: first.courseId, unitId: first.unitId, label: parts.length === 1 && unit ? `${first.label} · ${unit.title}` : label, plan: { total, work, brk, longEvery: longOn ? longEvery : 0, longBrk, ...(parts.length > 1 ? { parts } : {}) } });
  };
  const remind = () => {
    keepRhythm();
    A.saveRemind({ title: L(`ابدأ ${label} — تخلص ${fmtTime(sp.end)}`, `Start ${label} — done by ${fmtTime(sp.end)}`), note: L(`${fmtMinutes(total)} مذاكرة · ${work} د تركيز + ${brk} د راحة`, `${fmtMinutes(total)} study · ${work} min focus + ${brk} min break`), at: startAt, repeat: 'none', ref: 'study' });
    closeSheet();
    toast(L(`🔔 بذكّرك ${when(startAt, now)} تبدأ`, `🔔 I'll remind you ${when(startAt, now)} to start`));
  };

  const timeChips = (
    <div className="ps-start">
      <button className={`chip btnish ${startNow ? 'on' : ''}`} onClick={() => setStartNow(true)}>{L('الحين', 'Now')}</button>
      {[15, 30, 60].map((m) => {
        const v = clockOf(now + m * MIN);
        return <button key={m} className={`chip btnish ${!startNow && startTime === v ? 'on' : ''}`} onClick={() => { setStartNow(false); setStartTime(v); }}>{m === 60 ? L('بعد ساعة', 'In 1h') : L(`بعد ${m} د`, `In ${m} min`)}</button>;
      })}
      <input type="time" className={`input ${!startNow ? 'on' : ''}`} aria-label={L('وقت البداية', 'Start time')} value={startNow ? clockOf(now) : startTime} onChange={(e) => { if (e.target.value) { setStartNow(false); setStartTime(e.target.value); } }} />
    </div>
  );

  return (
    <Sheet title={L('خطّط جلستك', 'Plan your session')} onClose={closeSheet} footer={
      !ok ? (
        <button className="btn primary grow" disabled>{late ? L('ما يمديك — غيّر الوقت أو المدة', "Doesn't fit — change the time or length") : L('اختر مادة', 'Pick a subject')}</button>
      ) : startsNow ? (
        <button className="btn primary grow" onClick={start}><Icon name="play" size={15} /> {L(`ابدأ الحين — تخلص ${fmtTime(sp.end)}`, `Start now — done by ${fmtTime(sp.end)}`)}</button>
      ) : (
        <>
          <button className="btn primary grow" onClick={remind}><Icon name="bell" size={15} /> {L(`ذكّرني ${when(startAt, now)}`, `Remind me ${when(startAt, now)}`)}</button>
          <button className="btn" onClick={start}>{L('ابدأ الحين', 'Start now')}</button>
        </>
      )
    }>
      <div className="ps">
        {rows.length > 0 && (
          <div className="field">
            <label>{L('وش بتذاكر؟', 'Studying what?')} <small className="faint">{L('اختر وحدة أو أكثر', 'one or more')}</small></label>
            <div className="ps-subjects">
              {rows.length > 1 && <button className={`chip btnish ${all ? 'on' : ''}`} onClick={() => setPicked(all ? [] : rows.map((ep) => ep.exam.id))}>{L('الكل', 'All')}</button>}
              {rows.map((ep) => {
                const on = picked.includes(ep.exam.id);
                return (
                  <button key={ep.exam.id} className={`chip btnish ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(ep.exam.id)}>
                    {on ? <Icon name="check" size={13} /> : <span className="sx-dot" style={{ background: ep.course.color }} />} {ep.course.name}{ep.todayMinutes > 0 ? ` · ${fmtMinutes(Math.round(ep.todayMinutes))}` : ''}
                  </button>
                );
              })}
            </div>
            {chosen.length > 0 && (<>
              {base.length > 1 && <small className="faint">{L('بهالترتيب تذاكرها — غيّره بالأسهم.', 'You study them in this order — change it with the arrows.')}</small>}
              <ul className="ps-parts">
                {base.map((b, i) => (
                  <li key={b.ep.exam.id}>
                    {base.length > 1 && <span className="ps-ord num">{i + 1}</span>}
                    <b>{b.ep.course.name}</b>
                    <span className="faint">{b.ep.todayMinutes > 0 ? lessonsOf(b.ep) : L('مو من حصة اليوم — تقدّم', 'not due today — getting ahead')}</span>
                    <span className="num">{fmtMinutes(mins[i])}</span>
                    {base.length > 1 && (
                      <span className="ps-move">
                        <button aria-label={L(`قدّم ${b.ep.course.name}`, `Move ${b.ep.course.name} up`)} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" size={14} /></button>
                        <button aria-label={L(`أخّر ${b.ep.course.name}`, `Move ${b.ep.course.name} down`)} disabled={i === base.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={14} /></button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>)}
          </div>
        )}

        <div className="field">
          <label>{L('الوقت', 'Time')}</label>
          <Seg<When> value={mode} onChange={setMode} options={[{ v: 'start', l: L('أبدأ الساعة…', 'Start at…') }, { v: 'end', l: L('أخلص الساعة…', 'Finish by…') }, { v: 'window', l: L('من… إلى…', 'From… to…') }]} />
          {mode === 'start' && <>{timeChips}</>}
          {mode === 'end' && (
            <div className="ps-start">
              <span className="faint">{L('أبي أخلص الساعة', 'Done by')}</span>
              <input type="time" className="input on" aria-label={L('وقت النهاية', 'Finish time')} value={endTime} onChange={(e) => e.target.value && setEndTime(e.target.value)} />
            </div>
          )}
          {mode === 'window' && (
            <>
              {timeChips}
              <div className="ps-start">
                <span className="faint">{L('إلى الساعة', 'until')}</span>
                <input type="time" className="input on" aria-label={L('وقت النهاية', 'Finish time')} value={endTime} onChange={(e) => e.target.value && setEndTime(e.target.value)} />
              </div>
            </>
          )}
          {late && <small className="rm-err">{L(`عشان تخلص ${fmtTime(sp.end)} كان لازم تبدأ ${fmtTime(startAt)} — قلّل المدة أو أخّر وقت النهاية.`, `To finish by ${fmtTime(sp.end)} you'd have had to start at ${fmtTime(startAt)} — shorten it or finish later.`)}</small>}
        </div>

        {(
          <div className="field">
            <label>{L('كم بتذاكر؟', 'How long?')}</label>
            <div className="ps-start">
              <button className={`chip btnish ${amount === 'today' ? 'on' : ''}`} onClick={() => setAmount('today')}>{L(`حصة اليوم · ${fmtMinutes(todayTotal)}`, `Today's share · ${fmtMinutes(todayTotal)}`)}</button>
              {LENGTHS.map((m) => <button key={m} className={`chip btnish ${amount === 'custom' && custom === m ? 'on' : ''}`} onClick={() => { setAmount('custom'); setCustom(m); }}>{fmtMinutes(m)}</button>)}
            </div>
            {amount === 'custom' && <Stepper label={L('المذاكرة كلها', 'Total focus')} value={custom} onChange={setCustom} min={5} max={720} step={5} unit={L('د', 'min')} />}
            {amount === 'custom' && parts.length > 1 && <small className="faint">{L('تتوزع على المواد بنفس نسبة حصة اليوم.', "Shared between the subjects in the same proportion as today's share.")}</small>}
          </div>
        )}

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

        {ok && (
          <div className="ps-sum">
            <div className="ps-se">
              <div><small>{L('تبدأ', 'Start')}</small><b className="num">{fmtTime(startAt)}</b>{todayKey(startAt) !== todayKey(now) && <small>{L('بكرة', 'tomorrow')}</small>}</div>
              <span className="ps-arrow" aria-hidden>{L('←', '→')}</span>
              <div><small>{L('تخلص', 'Finish')}</small><b className="num">{fmtTime(sp.end)}</b>{todayKey(sp.end) !== todayKey(startAt) && <small>{L('اليوم اللي بعده', 'next day')}</small>}</div>
            </div>
            <div className="ps-facts">
              <span>{L(`${fmtMinutes(total)} مذاكرة`, `${fmtMinutes(total)} study`)}</span>
              <span>{sp.breakMin ? L(`${fmtMinutes(sp.breakMin)} راحة`, `${fmtMinutes(sp.breakMin)} breaks`) : L('بدون راحة', 'No breaks')}</span>
              <span>{sp.rounds === 1 ? L('جولة وحدة', 'One round') : sp.rounds === 2 ? L('جولتين', 'Two rounds') : L(`${sp.rounds} ${sp.rounds <= 10 ? 'جولات' : 'جولة'}`, `${sp.rounds} rounds`)}</span>
              <span>{L(`الجلسة كلها ${fmtMinutes((sp.end - startAt) / MIN)}`, `${fmtMinutes((sp.end - startAt) / MIN)} in all`)}</span>
            </div>
            {mode === 'window' && total < (amount === 'today' ? todayTotal : custom) && <small className="ps-note">{L(`بين الوقتين يمديك ${fmtMinutes(total)} بس من ${fmtMinutes(amount === 'today' ? todayTotal : custom)} — الباقي ${fmtMinutes((amount === 'today' ? todayTotal : custom) - total)}.`, `Only ${fmtMinutes(total)} of ${fmtMinutes(amount === 'today' ? todayTotal : custom)} fits — ${fmtMinutes((amount === 'today' ? todayTotal : custom) - total)} left over.`)}</small>}
            {mode === 'window' && total >= (amount === 'today' ? todayTotal : custom) && nextAt(endTime, startAt) - sp.end >= 5 * MIN && <small className="ps-note ok">{L(`تخلص قبل الوقت اللي حددته بـ${fmtMinutes((nextAt(endTime, startAt) - sp.end) / MIN)}.`, `You'll be done ${fmtMinutes((nextAt(endTime, startAt) - sp.end) / MIN)} early.`)}</small>}
            <ol className="ps-line" aria-label={L('جدول الجلسة', 'Session timeline')}>
              {sp.blocks.map((b, i) => (
                <li key={i} className={b.kind}>
                  <span className="t num">{fmtTime(b.from)}</span>
                  <span className="k">
                    {b.kind === 'work' ? L(`تركيز ${b.min} د`, `Focus ${b.min} min`) : b.kind === 'long' ? L(`راحة طويلة ${b.min} د`, `Long break ${b.min} min`) : L(`راحة ${b.min} د`, `Break ${b.min} min`)}
                    {b.kind === 'work' && parts.length > 1 && <small>{covers[i].map((c) => (covers[i].length > 1 ? `${c.label} ${c.min} د` : c.label)).join(' · ')}</small>}
                  </span>
                </li>
              ))}
              <li className="end"><span className="t num">{fmtTime(sp.end)}</span><span className="k">{L('خلصت 🎉', 'Done 🎉')}</span></li>
            </ol>
          </div>
        )}
      </div>
    </Sheet>
  );
}
