import { useEffect, useMemo, useState } from 'react';
import { Seg, Sheet, useNow } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { PageTop } from '../ui/PageTop';
import { closeSheet, openSheet } from '../ui/sheets';
import { go, useRoute } from '../ui/router';
import { toast } from '../ui/toast';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { fmtClock, fmtDate, relDay, todayKey } from '../lib/dates';
import {
  ACTIVITY, alternatives, bmi, bodyNow, e1rm, EXERCISES, exercise, exerciseHistory, exName, fmtKg, GOAL_INFO, gymToday, gymWeek, history, liveSession, muscleName, nextWorkout, nutrition, plates,
  program, records, scheme, sessionSummary, streakWeeks, target, targetLine, weightSeries, type Muscle,
} from '../lib/engine/gym';
import type { AppState, GymGoal, GymProfile, GymSession } from '../lib/types';
import { L } from '../lib/i18n';

// «النادي» answers, in this order:
//  1. what do I train today, and what do I lift? → the next workout, every exercise with today's number
//  2. am I keeping it up? → this week and the weeks in a row
//  3. am I getting stronger? → the records and how far they climbed in a month
//  4. and my body? → weight, measurements, calories and protein («جسمي»)

const DAY1 = () => L('ح ن ث ر خ ج س', 'S M T W T F S').split(' ');
const num = (x: number) => +x.toFixed(1);

export function Gym() {
  const r = useRoute();
  const s = useApp();
  if (r.id === 'live') {
    const live = liveSession(s);
    return live ? <Live key={live.id} ses={live} /> : <GymHome tab="train" />;
  }
  const tab = r.id === 'body' ? 'body' : r.id === 'moves' ? 'moves' : 'train';
  return <GymHome tab={tab} />;
}

function GymHome({ tab }: { tab: 'train' | 'body' | 'moves' }) {
  const s = useApp();
  const now = useNow(60_000);
  const wk = gymWeek(s, now);
  const st = streakWeeks(s, now);
  return (
    <div>
      <PageTop
        title={L('النادي', 'Gym')}
        sub={s.gym.profile ? `${L(`${wk.done} من ${wk.target} تمارين هالأسبوع`, `${wk.done} of ${wk.target} workouts this week`)}${st ? L(` · 🔥 ${st} أسبوع ورا بعض`, ` · 🔥 ${st} weeks in a row`) : ''}` : L('برنامج على مقاسك، والوزن الجاي محسوب لك.', 'A program cut to you, and your next weight worked out.')}
        actions={s.gym.profile ? <button className="icon-btn" onClick={() => openSheet({ type: 'gym-setup' })} aria-label={L('برنامجي', 'My program')}><Icon name="settings" /></button> : undefined}
      />
      <div style={{ marginBottom: 14 }}>
        <Seg value={tab} onChange={(v) => go(v === 'train' ? 'gym' : `gym/${v}`)} label={L('أقسام النادي', 'Gym sections')} options={[
          { v: 'train', l: L('تمريني', 'Train') }, { v: 'body', l: L('جسمي', 'Body') }, { v: 'moves', l: L('التمارين', 'Exercises') },
        ]} />
      </div>
      {tab === 'train' ? <TrainTab now={now} /> : tab === 'body' ? <BodyTab now={now} /> : <MovesTab />}
    </div>
  );
}

// ---------------- تمريني ----------------

function GoalStart() {
  return (
    <section className="gy-start">
      <h2 className="sh-h">{L('وش هدفك؟', "What's your goal?")}</h2>
      <p className="faint small">{L('اختر، وأفصّل لك برنامج على أيامك ووقتك ومستواك — في النادي أو البيت.', 'Pick one and I’ll cut a program to your days, time and level — gym or home.')}</p>
      <div className="gy-goals">
        {GOAL_INFO.map((g) => (
          <button key={g.v} className="gy-goal" onClick={() => openSheet({ type: 'gym-setup', goal: g.v })}>
            <b>{L(...g.t)}</b>
            <span>{L(...g.d)}</span>
            <Icon name="chevron" size={14} className="chev-end" />
          </button>
        ))}
      </div>
    </section>
  );
}

function TrainTab({ now }: { now: number }) {
  const s = useApp();
  const p = s.gym.profile;
  if (!p) return <GoalStart />;
  const live = liveSession(s);
  const next = nextWorkout(s, now)!;
  const today = todayKey(now);
  const prog = program(p);
  const recs = records(s, now).slice(0, 5);
  const past = history(s).slice(0, 6);
  return (
    <>
      {live ? (
        <button className="gy-live-bar" onClick={() => go('gym/live')}>
          <span className="pulse" />
          <b>{L(`تمرينك شغّال: ${live.name}`, `Workout on: ${live.name}`)}</b>
          <span className="num">{Math.round((now - live.start) / 60000)} {L('د', 'min')}</span>
          <Icon name="chevron" size={14} className="chev-end" />
        </button>
      ) : (
        <NextCard s={s} next={next} today={today} />
      )}

      <WeekCard s={s} now={now} />

      {recs.length > 0 && (
        <section>
          <div className="group-title"><span className="sh-h2">{L('أرقامك', 'Your numbers')}</span></div>
          <div className="gy-recs">
            {recs.map((r) => {
              const climb = r.monthAgo ? Math.round(((r.best - r.monthAgo) / r.monthAgo) * 100) : 0;
              return (
                <button key={r.exId} className="gy-rec" onClick={() => openSheet({ type: 'gym-ex', exId: r.exId })}>
                  <span className="m"><b>{exName(r.exId)}</b><span>{L(`أفضل مجموعة · ${fmtDate(r.day, false)}`, `Best set · ${fmtDate(r.day, false)}`)}</span></span>
                  <span className="v num"><b>{fmtKg(r.kg)}</b><small>× {r.reps}</small></span>
                  {climb > 0 && <span className="up num">+{climb}%</span>}
                </button>
              );
            })}
          </div>
          <p className="faint tiny">{L('النسبة: كم زادت قوتك في التمرين خلال شهر.', 'The % is how much stronger you got on it in a month.')}</p>
        </section>
      )}

      <section>
        <div className="group-title"><span className="sh-h2">{L('برنامجك', 'Your program')}</span><button onClick={() => openSheet({ type: 'gym-setup' })}>{L('غيّره', 'Change')}</button></div>
        <div className="gy-prog">
          <div className="gy-prog-h">
            <b>{prog.name}</b>
            <span>{[...p.days].sort().map((d) => DAY1()[d]).join(' · ')}{p.time ? ` · ${fmtClock(p.time)}` : ''} · {p.place === 'home' ? L('البيت', 'Home') : L('النادي', 'Gym')}</span>
          </div>
          {prog.slots.map((sl, i) => (
            <details key={sl.key} className={`gy-slot ${i === next.index ? 'next' : ''}`}>
              <summary><b>{sl.name}</b><span>{sl.sub} · ~{sl.minutes} {L('د', 'min')}</span>{i === next.index && <em>{L('الجاي', 'Next')}</em>}</summary>
              <ol>{sl.items.map((it) => <li key={it.exId}><button onClick={() => openSheet({ type: 'gym-ex', exId: it.exId })}>{exName(it.exId)}</button><span className="num">{exercise(it.exId).unit === 'min' ? L(`${it.scheme.lo} د`, `${it.scheme.lo} min`) : `${it.scheme.sets} × ${it.scheme.lo === it.scheme.hi ? it.scheme.lo : `${it.scheme.lo}–${it.scheme.hi}`}${exercise(it.exId).unit === 'sec' ? L(' ث', 's') : ''}`}</span></li>)}</ol>
            </details>
          ))}
        </div>
      </section>

      {past.length > 0 && (
        <section>
          <div className="group-title"><span className="sh-h2">{L('تمارينك', 'Your workouts')}</span><span className="faint small num">{history(s).length}</span></div>
          <div className="gy-hist">
            {past.map((x) => {
              const sm = sessionSummary(s, x);
              return (
                <button key={x.id} className="gy-h" onClick={() => openSheet({ type: 'gym-session', id: x.id })}>
                  <span className="d"><b className="num">{new Date(`${x.day}T12:00:00`).getDate()}</b><span>{relDay(x.day, today)}</span></span>
                  <span className="m"><b>{x.name}</b><span className="num">{L(`${sm.minutes} د · ${sm.sets} مجموعة · ${Math.round(sm.volume).toLocaleString('en')} كجم`, `${sm.minutes} min · ${sm.sets} sets · ${Math.round(sm.volume).toLocaleString('en')} kg`)}</span></span>
                  {sm.prs.length > 0 && <em>{L(`🏆 ${sm.prs.length}`, `🏆 ${sm.prs.length}`)}</em>}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

function NextCard({ s, next, today }: { s: AppState; next: NonNullable<ReturnType<typeof nextWorkout>>; today: string }) {
  const p = s.gym.profile!;
  const isToday = next.day === today;
  const when = isToday ? L('اليوم', 'Today') : relDay(next.day, today);
  return (
    <section className="gy-next">
      <div className="k">{L('تمرينك الجاي', 'Next workout')} · {when}{p.time ? ` ${fmtClock(p.time)}` : ''}</div>
      <h2 className="t">{next.slot.name}</h2>
      <div className="sub">{next.slot.sub} · {L(`${next.slot.items.length} تمارين`, `${next.slot.items.length} exercises`)} · ~{next.slot.minutes} {L('د', 'min')}</div>
      <ul className="gy-plan">
        {next.slot.items.map((it) => {
          const ex = exercise(it.exId);
          const t = target(s, it.exId, it.scheme);
          return (
            <li key={it.exId} className={t.tag}>
              <b>{exName(it.exId)}</b>
              <span>{t.tag === 'first' ? (ex.unit === 'min' ? L(`${t.reps} دقيقة`, `${t.reps} min`) : L(`${it.scheme.sets} × ${t.reps}${ex.unit === 'sec' ? ' ث' : ''}`, `${it.scheme.sets} × ${t.reps}${ex.unit === 'sec' ? 's' : ''}`)) : targetLine(t, ex).replace(/^[^:]+: /, '')}{t.tag === 'up' ? ' ↑' : ''}</span>
            </li>
          );
        })}
      </ul>
      <div className="a">
        <button className="btn primary gy-go" onClick={() => { A.startWorkout(); go('gym/live'); }}><Icon name="play" size={15} /> {L('ابدأ التمرين', 'Start workout')}</button>
        <button className="btn ghost sm" onClick={() => { A.skipGymSlot(); toast(L('تخطيته — الجاي بعده', 'Skipped — the one after is next'), { undoable: true }); }}>{L('مو هذا، خذ اللي بعده', 'Not this one — next')}</button>
      </div>
    </section>
  );
}

function WeekCard({ s, now }: { s: AppState; now: number }) {
  const wk = gymWeek(s, now);
  const st = streakWeeks(s, now);
  const today = todayKey(now);
  const left = Math.max(0, wk.target - wk.done);
  const daysLeft = wk.days.filter((d) => d.day > today).length + (wk.days.find((d) => d.day === today && !d.done) ? 1 : 0);
  return (
    <section className="gy-week">
      <div className="gy-week-h">
        <div><b className="num">{wk.done}<small>/{wk.target}</small></b><span>{L('هالأسبوع', 'this week')}</span></div>
        <div className="st"><b className="num">{st}</b><span>{st === 1 ? L('أسبوع كامل 🔥', 'full week 🔥') : L('أسابيع ورا بعض 🔥', 'weeks in a row 🔥')}</span></div>
      </div>
      <div className="gy-days">
        {wk.days.map((d, i) => (
          <span key={d.day} className={`${d.done ? 'done' : ''} ${d.planned ? 'plan' : ''} ${d.day === today ? 'today' : ''}`}>
            <i>{d.done ? '✓' : ''}</i>
            <small>{DAY1()[i]}</small>
          </span>
        ))}
      </div>
      <p className="gy-note">
        {left === 0
          ? L('كمّلت أسبوعك 💪 أي تمرين زيادة مكسب.', 'Week done 💪 anything more is a bonus.')
          : left > daysLeft
            ? L(`باقي ${left} وما بقى إلا ${daysLeft} أيام — تمرين وحد ينقذ الأسبوع.`, `${left} to go with ${daysLeft} days left — one workout still counts.`)
            : L(`باقي ${left === 1 ? 'تمرين واحد' : `${left} تمارين`} وتكمّل الأسبوع${st ? ' وتحافظ على السلسلة' : ''}.`, `${left} more to finish the week${st ? ' and keep the streak' : ''}.`)}
      </p>
    </section>
  );
}

// ---------------- التمرين الحي ----------------

function clock(ms: number) {
  const t = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(t / 60);
  return `${m}:${String(t % 60).padStart(2, '0')}`;
}

function Live({ ses }: { ses: GymSession }) {
  const s = useApp();
  const now = useNow(1000);
  const p = s.gym.profile;
  const total = ses.entries.reduce((a, e) => a + e.sets.length, 0);
  const done = ses.entries.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
  const rest = ses.restUntil ? ses.restUntil - now : 0;
  useEffect(() => {
    if (ses.restUntil && rest <= 0 && rest > -1500) navigator.vibrate?.([200, 100, 200]);
  }, [rest, ses.restUntil]);

  const finish = () => {
    if (!done && !confirm(L('ما علّمت ولا مجموعة. تنهي التمرين كذا؟', "You haven't ticked a set. Finish anyway?"))) return;
    A.finishWorkout(ses.id);
    // leaving the page closes sheets — show the summary once we're back
    addEventListener('hashchange', () => openSheet({ type: 'gym-done', id: ses.id }), { once: true });
    go('gym');
  };

  return (
    <div className="gy-live">
      <header className="gy-live-top">
        <button className="btn sm ghost" onClick={() => go('gym')}><Icon name="back" size={16} /> {L('النادي', 'Gym')}</button>
        <span className="clk num">{clock(now - ses.start)}</span>
        <button className="btn sm primary" onClick={finish}>{L('خلّصت', 'Finish')}</button>
      </header>
      <h1 className="title-xl">{ses.name}</h1>
      <div className="gy-prog-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={L('المجموعات', 'Sets')}><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
      <p className="faint small num">{L(`${done} من ${total} مجموعة`, `${done} of ${total} sets`)}</p>

      {ses.entries.map((e, ei) => {
        const ex = exercise(e.exId);
        const sc = p ? scheme(p, ex) : { sets: 3, lo: 10, hi: 12, rest: 60 };
        const t = target(s, e.exId, sc, ses.start);
        const unit = ex.unit === 'sec' ? L('ث', 's') : ex.unit === 'min' ? L('د', 'min') : L('عدّة', 'reps');
        const weighted = ex.kind !== 'body' && ex.kind !== 'cardio';
        const allDone = e.sets.every((x) => x.done);
        return (
          <section key={ei} className={`gy-ex ${allDone ? 'done' : ''}`}>
            <div className="gy-ex-h">
              <button className="n" onClick={() => openSheet({ type: 'gym-ex', exId: e.exId, sid: ses.id, ei })}>
                <b>{exName(e.exId)}</b>
                <span className={`tg ${t.tag}`}>{targetLine(t, ex)}</span>
              </button>
              <button className="icon-btn sm" aria-label={L(`بدّل ${exName(e.exId)}`, `Swap ${exName(e.exId)}`)} title={L('بدّل التمرين', 'Swap exercise')} onClick={() => openSheet({ type: 'gym-ex', exId: e.exId, sid: ses.id, ei })}><Icon name="repeat" size={16} /></button>
            </div>
            <div className="gy-sets">
              <div className="gy-set head" aria-hidden>
                <span>#</span>
                {weighted && <span>{L('كجم', 'kg')}</span>}
                <span>{unit}</span>
                <span />
              </div>
              {e.sets.map((x, si) => (
                <div key={si} className={`gy-set ${x.done ? 'on' : ''} ${weighted ? '' : 'nokg'}`}>
                  <span className="i num">{si + 1}</span>
                  {weighted && <input className="input num" inputMode="decimal" type="number" step="0.5" min={0} value={x.kg ?? ''} placeholder="—" aria-label={L(`وزن المجموعة ${si + 1}`, `Set ${si + 1} weight`)} onChange={(ev) => A.setGymSet(ses.id, ei, si, { kg: ev.target.value === '' ? undefined : Math.max(0, +ev.target.value) })} />}
                  <input className="input num" inputMode="numeric" type="number" min={0} value={x.reps || ''} placeholder="0" aria-label={L(`تكرارات المجموعة ${si + 1}`, `Set ${si + 1} reps`)} onChange={(ev) => A.setGymSet(ses.id, ei, si, { reps: Math.max(0, Math.round(+ev.target.value || 0)) })} />
                  <button className={`gy-tick ${x.done ? 'on' : ''}`} aria-pressed={x.done} aria-label={x.done ? L(`إلغاء المجموعة ${si + 1}`, `Undo set ${si + 1}`) : L(`خلّصت المجموعة ${si + 1}`, `Done set ${si + 1}`)} onClick={() => A.tickGymSet(ses.id, ei, si, si === e.sets.length - 1 && ei === ses.entries.length - 1 ? 0 : sc.rest)}><Icon name="check" size={16} stroke={3} /></button>
                </div>
              ))}
            </div>
            <div className="gy-ex-a">
              <button className="btn sm ghost" onClick={() => A.addGymSet(ses.id, ei)}><Icon name="plus" size={13} /> {L('مجموعة', 'Set')}</button>
              {e.sets.length > 1 && <button className="btn sm ghost" onClick={() => A.removeGymSet(ses.id, ei)}><Icon name="minus" size={13} /> {L('شيل وحدة', 'Remove one')}</button>}
              {weighted && e.sets[0]?.kg && ex.kind === 'bar' ? <span className="faint tiny">{plateText(e.sets.find((x) => !x.done)?.kg ?? e.sets[0].kg)}</span> : null}
            </div>
          </section>
        );
      })}

      <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn" onClick={() => openSheet({ type: 'gym-pick', sid: ses.id })}><Icon name="plus" size={14} /> {L('أضف تمرين', 'Add exercise')}</button>
        <button className="btn ghost" onClick={() => { if (confirm(L('تلغي هذا التمرين؟ ما ينحسب.', 'Cancel this workout? It won’t count.'))) { A.cancelWorkout(ses.id); go('gym'); toast(L('ألغيته', 'Cancelled'), { undoable: true }); } }}>{L('ألغِ التمرين', 'Cancel workout')}</button>
      </div>

      {ses.restUntil && rest > -60_000 && (
        <div className={`gy-rest ${rest <= 0 ? 'over' : ''}`} role="timer" aria-live="polite">
          <span>{rest > 0 ? L('راحة', 'Rest') : L('يلا المجموعة الجاية 💪', 'Next set 💪')}</span>
          <b className="num">{rest > 0 ? clock(rest) : ''}</b>
          {rest > 0 && <button className="btn sm" onClick={() => A.endRest(ses.id, 15)}>+15{L('ث', 's')}</button>}
          <button className="btn sm ghost" onClick={() => A.endRest(ses.id)}>{rest > 0 ? L('تخطّ', 'Skip') : L('تمام', 'OK')}</button>
        </div>
      )}
    </div>
  );
}

function plateText(kg?: number): string {
  if (!kg || kg < 20) return '';
  const r = plates(kg);
  if (!r.each.length) return L('البار فاضي', 'Empty bar');
  return L(`كل جهة: ${r.each.map(fmtKg).join(' + ')}`, `Each side: ${r.each.map(fmtKg).join(' + ')}`) + (r.left > 0.01 ? L(` (ناقص ${fmtKg(r.left)})`, ` (${fmtKg(r.left)} short)`) : '');
}

// ---------------- جسمي ----------------

function Spark({ pts }: { pts: { day: string; kg: number }[] }) {
  if (pts.length < 2) return null;
  const W = 300;
  const H = 70;
  const min = Math.min(...pts.map((x) => x.kg));
  const max = Math.max(...pts.map((x) => x.kg));
  const span = max - min || 1;
  const t0 = new Date(pts[0].day).getTime();
  const t1 = new Date(pts[pts.length - 1].day).getTime() || t0 + 1;
  const xy = pts.map((x) => [((new Date(x.day).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 8) + 4, H - 6 - ((x.kg - min) / span) * (H - 12)]);
  return (
    <svg className="gy-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={L(`الوزن من ${fmtKg(pts[0].kg)} إلى ${fmtKg(pts[pts.length - 1].kg)}`, `Weight from ${fmtKg(pts[0].kg)} to ${fmtKg(pts[pts.length - 1].kg)}`)} preserveAspectRatio="none">
      <polyline points={xy.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="4" fill="var(--accent)" />
    </svg>
  );
}

const MEAS: { k: 'fat' | 'waist' | 'chest' | 'arm' | 'thigh'; t: [string, string]; u: [string, string]; good: -1 | 1 }[] = [
  { k: 'fat', t: ['الدهون', 'Body fat'], u: ['%', '%'], good: -1 },
  { k: 'waist', t: ['الخصر', 'Waist'], u: ['سم', 'cm'], good: -1 },
  { k: 'chest', t: ['الصدر', 'Chest'], u: ['سم', 'cm'], good: 1 },
  { k: 'arm', t: ['الذراع', 'Arm'], u: ['سم', 'cm'], good: 1 },
  { k: 'thigh', t: ['الفخذ', 'Thigh'], u: ['سم', 'cm'], good: 1 },
];

function BodyTab({ now }: { now: number }) {
  const s = useApp();
  const b = bodyNow(s);
  const pts = weightSeries(s, 90, now);
  const n = nutrition(s, now);
  const w = b.weight;
  const diff = w?.before != null ? w.v - w.before : null;
  const goal = s.gym.profile?.goal;
  const bm = bmi(w?.v, s.gym.info.height);
  const logs = [...s.gym.body].sort((a, x) => x.day.localeCompare(a.day)).slice(0, 8);
  return (
    <>
      <section className="gy-weight">
        <div className="h">
          <div>
            <span className="k">{L('وزنك', 'Your weight')}</span>
            {w ? <b className="num">{num(w.v)}<small>{L('كجم', 'kg')}</small></b> : <b className="none">—</b>}
          </div>
          {diff != null && Math.abs(diff) >= 0.1 && (
            <span className={`dl num ${(goal === 'fat' ? diff < 0 : goal === 'muscle' ? diff > 0 : true) ? 'good' : ''}`}>{diff > 0 ? '+' : '−'}{num(Math.abs(diff))} {L('بشهر', 'in a month')}</span>
          )}
        </div>
        <Spark pts={pts} />
        <button className="btn primary sm" onClick={() => openSheet({ type: 'gym-body' })}><Icon name="plus" size={14} /> {L('سجّل وزن أو قياس', 'Log weight or measurements')}</button>
        {!w && <p className="faint small" style={{ margin: 0 }}>{L('توزّن الصبح قبل الأكل، مرة أو مرتين بالأسبوع — وأرسم لك الخط.', 'Weigh in the morning before eating, once or twice a week — I’ll draw the line.')}</p>}
      </section>

      {MEAS.some((m) => b[m.k]) && (
        <section className="gy-meas">
          {MEAS.filter((m) => b[m.k]).map((m) => {
            const x = b[m.k]!;
            const d = x.before != null ? x.v - x.before : 0;
            return (
              <div key={m.k}>
                <span>{L(...m.t)}</span>
                <b className="num">{num(x.v)}<small>{L(...m.u)}</small></b>
                {Math.abs(d) >= 0.1 && <em className={`num ${Math.sign(d) === m.good ? 'good' : ''}`}>{d > 0 ? '+' : '−'}{num(Math.abs(d))}</em>}
              </div>
            );
          })}
        </section>
      )}

      <section>
        <div className="group-title"><span className="sh-h2">{L('أكلك اليومي', 'Daily food')}</span></div>
        {n ? (
          <div className="gy-food">
            <div className="acc"><b className="num">{n.kcal.toLocaleString('en')}</b><span>{L('سعرة', 'kcal')}</span></div>
            <div><b className="num">{n.protein}</b><span>{L('جم بروتين', 'g protein')}</span></div>
            <div><b className="num">{n.water}</b><span>{L('لتر موية', 'L water')}</span></div>
            <p>{goal === 'fat' ? L(`أقل من ثباتك (${n.maintain.toLocaleString('en')}) بـ ٢٠٪ عشان تنزل دهون بدون ما تخسر عضل.`, `20% under your maintenance (${n.maintain.toLocaleString('en')}) to lose fat, not muscle.`) : goal === 'muscle' ? L(`فوق ثباتك (${n.maintain.toLocaleString('en')}) بشوي عشان تبني عضل.`, `A little over maintenance (${n.maintain.toLocaleString('en')}) to build muscle.`) : L(`ثباتك تقريبًا ${n.maintain.toLocaleString('en')} سعرة.`, `Your maintenance is about ${n.maintain.toLocaleString('en')} kcal.`)}{bm ? L(` مؤشر كتلة الجسم ${num(bm)}.`, ` BMI ${num(bm)}.`) : ''}</p>
            <button className="btn ghost sm" onClick={() => openSheet({ type: 'gym-info' })}>{L('عدّل بياناتي', 'Edit my details')}</button>
          </div>
        ) : (
          <div className="gy-food empty">
            <p>{L('أعطني طولك وعمرك وجنسك ووزنك، وأحسب لك كم سعرة وكم بروتين تحتاج لهدفك.', 'Give me your height, age, sex and weight and I’ll work out calories and protein for your goal.')}</p>
            <button className="btn sm primary" onClick={() => openSheet({ type: 'gym-info' })}>{L('أكمل بياناتي', 'Add my details')}</button>
          </div>
        )}
      </section>

      {logs.length > 0 && (
        <section>
          <div className="group-title"><span className="sh-h2">{L('آخر القياسات', 'Recent entries')}</span></div>
          <div className="gy-hist">
            {logs.map((x) => (
              <div key={x.id} className="gy-h">
                <span className="m"><b>{fmtDate(x.day)}</b><span className="num">{[x.weight != null ? L(`${num(x.weight)} كجم`, `${num(x.weight)} kg`) : '', ...MEAS.filter((m) => x[m.k] != null).map((m) => `${L(...m.t)} ${num(x[m.k]!)}`)].filter(Boolean).join(' · ')}</span></span>
                <button className="icon-btn sm" aria-label={L('احذف', 'Delete')} onClick={() => { A.deleteBody(x.id); toast(L('انحذف', 'Deleted'), { undoable: true }); }}><Icon name="trash" size={15} /></button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ---------------- التمارين ----------------

const MUSCLES: Muscle[] = ['chest', 'back', 'legs', 'glutes', 'shoulders', 'arms', 'core', 'cardio'];

function MovesTab() {
  const s = useApp();
  const [m, setM] = useState<Muscle>('chest');
  const [kg, setKg] = useState(60);
  const [bar, setBar] = useState(20);
  const [rm, setRm] = useState<{ kg: number; reps: number }>({ kg: 80, reps: 5 });
  const pl = plates(kg, bar);
  const one = e1rm(rm.kg, rm.reps);
  const recs = useMemo(() => new Map(records(s).map((r) => [r.exId, r])), [s]);
  return (
    <>
      <section className="gy-tool">
        <b>{L('كم قرص أركّب؟', 'Which plates?')}</b>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input className="input num" style={{ width: 96 }} inputMode="decimal" type="number" step="2.5" min={0} value={kg} onChange={(e) => setKg(Math.max(0, +e.target.value || 0))} aria-label={L('الوزن الكلي', 'Total weight')} />
          <span className="faint small">{L('كجم مع البار', 'kg with the bar')}</span>
          <span className="grow" />
          <Seg value={bar} onChange={setBar} label={L('وزن البار', 'Bar weight')} options={[{ v: 20, l: '20' }, { v: 15, l: '15' }, { v: 10, l: '10' }]} />
        </div>
        <div className="gy-plates" aria-label={plateText(kg)}>
          <i className="bar" />
          {pl.each.map((p, i) => <i key={i} className={`p p${String(p).replace('.', '_')}`} style={{ height: `${28 + Math.min(25, p) * 2}px` }}><span>{fmtKg(p)}</span></i>)}
        </div>
        <span className="faint small">{pl.each.length ? L(`كل جهة: ${pl.each.map(fmtKg).join(' + ')}`, `Each side: ${pl.each.map(fmtKg).join(' + ')}`) : L('البار بس', 'Just the bar')}{pl.left > 0.01 ? L(` — ناقص ${fmtKg(pl.left)} ما تطلع بالأقراص`, ` — ${fmtKg(pl.left)} can’t be made`) : ''}</span>
      </section>

      <section className="gy-tool">
        <b>{L('أقصى وزن لمرة وحدة', 'One-rep max')}</b>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input className="input num" style={{ width: 86 }} inputMode="decimal" type="number" min={0} value={rm.kg} onChange={(e) => setRm({ ...rm, kg: Math.max(0, +e.target.value || 0) })} aria-label={L('الوزن', 'Weight')} />
          <span>×</span>
          <input className="input num" style={{ width: 70 }} inputMode="numeric" type="number" min={1} max={20} value={rm.reps} onChange={(e) => setRm({ ...rm, reps: Math.max(1, Math.min(20, Math.round(+e.target.value || 1))) })} aria-label={L('التكرارات', 'Reps')} />
          <span className="grow" />
          <b className="num gy-1rm">≈ {fmtKg(Math.round(one * 2) / 2)}</b>
        </div>
        <div className="gy-pct num">{[95, 90, 85, 80, 75, 70].map((p) => <span key={p}><b>{fmtKg(Math.round((one * p) / 100 / 2.5) * 2.5)}</b><small>{p}%</small></span>)}</div>
      </section>

      <div className="gy-mus" role="tablist" aria-label={L('العضلة', 'Muscle')}>
        {MUSCLES.map((x) => <button key={x} role="tab" aria-selected={m === x} className={m === x ? 'on' : ''} onClick={() => setM(x)}>{muscleName(x)}</button>)}
      </div>
      <div className="gy-hist">
        {EXERCISES.filter((e) => e.muscle === m).map((e) => {
          const r = recs.get(e.id);
          return (
            <button key={e.id} className="gy-h" onClick={() => openSheet({ type: 'gym-ex', exId: e.id })}>
              <span className="m"><b>{exName(e.id)}</b><span>{L(...e.tip)}</span></span>
              {r ? <em className="num">{fmtKg(r.kg)}×{r.reps}</em> : <small className="faint">{e.kind === 'body' ? L('بدون أدوات', 'No kit') : e.kind === 'db' ? L('دمبل', 'Dumbbell') : e.kind === 'bar' ? L('بار', 'Barbell') : e.kind === 'machine' ? L('جهاز', 'Machine') : ''}</small>}
            </button>
          );
        })}
      </div>
    </>
  );
}

// ---------------- sheets ----------------

export function GymSetupSheet({ goal }: { goal?: GymGoal }) {
  const s = useApp();
  const p0 = s.gym.profile;
  const [p, setP] = useState<GymProfile>(() => ({ goal: goal || p0?.goal || 'muscle', level: p0?.level || 'new', place: p0?.place || 'gym', days: p0?.days || [0, 2, 4], minutes: p0?.minutes || 60, time: p0?.time, swaps: p0?.swaps }));
  const prog = program(p);
  const set = (x: Partial<GymProfile>) => setP({ ...p, ...x });
  const toggleDay = (d: number) => set({ days: p.days.includes(d) ? p.days.filter((x) => x !== d) : [...p.days, d].sort() });
  return (
    <Sheet title={L('برنامجي', 'My program')} onClose={closeSheet} footer={
      <button className="btn primary grow" disabled={!p.days.length} onClick={() => { A.setGymProfile(p); closeSheet(); go('gym'); toast(p0 ? L('تحدّث برنامجك ✓', 'Program updated ✓') : L('برنامجك جاهز 💪 أول تمرين ينتظرك', 'Your program is ready 💪')); }}>{p0 ? L('احفظ', 'Save') : L('ابدأ البرنامج', 'Start the program')}</button>
    }>
      <div className="gy-form">
        <div className="gy-f"><span>{L('الهدف', 'Goal')}</span>
          <div className="gy-chips">{GOAL_INFO.map((g) => <button key={g.v} className={p.goal === g.v ? 'on' : ''} onClick={() => set({ goal: g.v })}>{L(...g.t)}</button>)}</div>
          <small className="faint">{L(...GOAL_INFO.find((g) => g.v === p.goal)!.d)}</small>
        </div>
        <div className="gy-f"><span>{L('مستواك', 'Your level')}</span>
          <Seg value={p.level} onChange={(level) => set({ level })} options={[{ v: 'new', l: L('مبتدئ', 'New') }, { v: 'mid', l: L('متوسط', 'Some years') }, { v: 'pro', l: L('متقدم', 'Advanced') }]} />
        </div>
        <div className="gy-f"><span>{L('وين تتمرن؟', 'Where?')}</span>
          <Seg value={p.place} onChange={(place) => set({ place })} options={[{ v: 'gym', l: L('النادي', 'Gym') }, { v: 'home', l: L('البيت بدون أدوات', 'Home, no kit') }]} />
        </div>
        <div className="gy-f"><span>{L('أيام التمرين', 'Training days')}</span>
          <div className="gy-wd">{DAY1().map((d, i) => <button key={i} className={p.days.includes(i) ? 'on' : ''} aria-pressed={p.days.includes(i)} aria-label={L(['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][i], ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i])} onClick={() => toggleDay(i)}>{d}</button>)}</div>
          {p.level === 'new' && p.days.length > 4 && <small className="gy-warn">{L('للمبتدئ ٣–٤ أيام أفضل — العضلة تكبر وقت الراحة.', 'For a beginner 3–4 days is better — muscle grows while resting.')}</small>}
        </div>
        <div className="gy-two">
          <div className="gy-f"><span>{L('مدة التمرين', 'Session length')}</span>
            <select className="input" value={p.minutes} onChange={(e) => set({ minutes: +e.target.value })}>{[30, 45, 60, 75, 90].map((m) => <option key={m} value={m}>{L(`${m} دقيقة`, `${m} min`)}</option>)}</select>
          </div>
          <div className="gy-f"><span>{L('الوقت (اختياري)', 'Time (optional)')}</span>
            <input className="input" type="time" value={p.time || ''} onChange={(e) => set({ time: e.target.value || undefined })} />
          </div>
        </div>
        {p.time && <small className="faint">{L('يومك في «اليوم» ينحسب حول وقت النادي، وتجيك تذكرة قبله بنص ساعة في التطبيق.', 'Your day plans around gym time, and the app reminds you 30 min before.')}</small>}

        <div className="gy-preview" aria-live="polite">
          <b>{prog.name}</b>
          {prog.slots.map((sl) => (
            <div key={sl.key}><span>{sl.name}</span><small>{sl.items.map((it) => exName(it.exId)).join('، ')}</small></div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

export function GymExSheet({ exId, sid, ei }: { exId: string; sid?: string; ei?: number }) {
  const s = useApp();
  const ex = exercise(exId);
  const hist = exerciseHistory(s, exId).slice(0, 8);
  const rec = records(s).find((r) => r.exId === exId);
  const alts = alternatives(s.gym.profile, exId);
  const [keep, setKeep] = useState(true);
  const inSession = sid != null && ei != null;
  return (
    <Sheet title={exName(exId)} onClose={closeSheet}>
      <div className="gy-form">
        <div className="gy-exinfo">
          <span className="chip">{muscleName(ex.muscle)}</span>
          <p>{L(...ex.tip)}</p>
        </div>
        {rec && <div className="ss-sum"><div className="acc"><b className="num">{fmtKg(rec.kg)} × {rec.reps}</b><span>{L('أفضل مجموعة', 'Best set')}</span></div><div><b className="num">{fmtKg(Math.round(rec.best))}</b><span>{L('أقصى لمرة (تقدير)', 'Est. 1-rep max')}</span></div></div>}
        {hist.length > 0 ? (
          <div className="gy-exh">
            {hist.map(({ ses, sets }) => (
              <div key={ses.id}><span>{fmtDate(ses.day, false)}</span><b className="num">{sets.map((x) => (x.kg ? `${fmtKg(x.kg)}×${x.reps}` : `${x.reps}`)).join('  ')}</b></div>
            ))}
          </div>
        ) : <p className="faint small">{L('ما سويته قبل. أول مرة: ابدأ خفيف وركّز على الحركة.', 'Not done yet. First time: go light and nail the form.')}</p>}

        {inSession && alts.length > 0 && (
          <>
            <div className="gy-f"><span>{L('بدّله بـ', 'Swap for')}</span></div>
            <div className="gy-alts">
              {alts.map((a) => (
                <button key={a.id} onClick={() => { A.swapGymExercise(sid!, ei!, a.id, keep); closeSheet(); toast(keep ? L(`بدّلته — وصار في برنامجك`, 'Swapped — and in your program now') : L('بدّلته لهالمرة', 'Swapped for today')); }}>
                  <b>{L(a.ar, a.en)}</b><small>{L(...a.tip)}</small>
                </button>
              ))}
            </div>
            <label className="gy-keep"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> {L('خلّه في برنامجي على طول', 'Keep it in my program')}</label>
            <button className="btn ghost sm" onClick={() => { A.removeGymExercise(sid!, ei!); closeSheet(); }}>{L('شيله من تمرين اليوم', 'Drop it from today')}</button>
          </>
        )}
      </div>
    </Sheet>
  );
}

export function GymPickSheet({ sid }: { sid: string }) {
  const [m, setM] = useState<Muscle>('chest');
  return (
    <Sheet title={L('أضف تمرين', 'Add exercise')} onClose={closeSheet}>
      <div className="gy-mus" role="tablist">{MUSCLES.map((x) => <button key={x} role="tab" aria-selected={m === x} className={m === x ? 'on' : ''} onClick={() => setM(x)}>{muscleName(x)}</button>)}</div>
      <div className="gy-alts">
        {EXERCISES.filter((e) => e.muscle === m).map((e) => (
          <button key={e.id} onClick={() => { A.addGymExercise(sid, e.id); closeSheet(); }}><b>{L(e.ar, e.en)}</b><small>{L(...e.tip)}</small></button>
        ))}
      </div>
    </Sheet>
  );
}

export function GymDoneSheet({ id }: { id: string }) {
  const s = useApp();
  const ses = s.gym.sessions.find((x) => x.id === id);
  if (!ses) return null;
  const sm = sessionSummary(s, ses);
  const wk = gymWeek(s);
  const st = streakWeeks(s);
  return (
    <Sheet title={L('عاش! 💪', 'Nice work! 💪')} onClose={closeSheet} footer={<button className="btn primary grow" onClick={closeSheet}>{L('تم', 'Done')}</button>}>
      <div className="gy-form">
        <div className="ss-sum">
          <div><b className="num">{sm.minutes}</b><span>{L('دقيقة', 'min')}</span></div>
          <div><b className="num">{sm.sets}</b><span>{L('مجموعة', 'sets')}</span></div>
          <div className="acc"><b className="num">{sm.volume.toLocaleString('en')}</b><span>{L('كجم رفعتها', 'kg lifted')}</span></div>
        </div>
        {sm.prs.length > 0 && (
          <div className="gy-prs">
            <b>{L(`🏆 ${sm.prs.length === 1 ? 'رقم قياسي جديد' : `${sm.prs.length} أرقام قياسية جديدة`}`, `🏆 ${sm.prs.length} new record${sm.prs.length === 1 ? '' : 's'}`)}</b>
            {sm.prs.map((p) => <span key={p.exId}>{exName(p.exId)} — <bdi className="num">{fmtKg(p.kg)} × {p.reps}</bdi></span>)}
          </div>
        )}
        <p className="gy-note">{wk.done >= wk.target ? L(`كمّلت أسبوعك (${wk.done}/${wk.target})${st > 1 ? ` — ${st} أسابيع ورا بعض 🔥` : ' 🔥'}`, `Week complete (${wk.done}/${wk.target})${st > 1 ? ` — ${st} weeks in a row 🔥` : ' 🔥'}`) : L(`${wk.done} من ${wk.target} هالأسبوع — باقي ${wk.target - wk.done}.`, `${wk.done} of ${wk.target} this week — ${wk.target - wk.done} to go.`)}</p>
        <p className="faint small">{L('المرة الجاية أقولك وش تزيد: الوزن لو وصلت أعلى عدّة في كل المجموعات، وإلا عدّة زيادة.', 'Next time I’ll tell you what to add: weight if you hit the top reps on every set, else one more rep.')}</p>
      </div>
    </Sheet>
  );
}

export function GymSessionSheet({ id }: { id: string }) {
  const s = useApp();
  const ses = s.gym.sessions.find((x) => x.id === id);
  if (!ses) return null;
  const sm = sessionSummary(s, ses);
  return (
    <Sheet title={`${ses.name} · ${fmtDate(ses.day, false)}`} onClose={closeSheet}>
      <div className="gy-form">
        <div className="ss-sum">
          <div><b className="num">{sm.minutes}</b><span>{L('دقيقة', 'min')}</span></div>
          <div><b className="num">{sm.sets}</b><span>{L('مجموعة', 'sets')}</span></div>
          <div className="acc"><b className="num">{sm.volume.toLocaleString('en')}</b><span>{L('كجم', 'kg')}</span></div>
        </div>
        <div className="gy-exh">
          {ses.entries.map((e, i) => {
            const d = e.sets.filter((x) => x.done);
            return d.length ? <div key={i}><span>{exName(e.exId)}{sm.prs.some((p) => p.exId === e.exId) ? ' 🏆' : ''}</span><b className="num">{d.map((x) => (x.kg ? `${fmtKg(x.kg)}×${x.reps}` : `${x.reps}`)).join('  ')}</b></div> : null;
          })}
        </div>
        <button className="btn ghost sm" onClick={() => { A.deleteGymSession(ses.id); closeSheet(); toast(L('انحذف التمرين', 'Workout deleted'), { undoable: true }); }}><Icon name="trash" size={14} /> {L('احذف التمرين', 'Delete workout')}</button>
      </div>
    </Sheet>
  );
}

export function GymBodySheet() {
  const s = useApp();
  const last = bodyNow(s);
  const [day, setDay] = useState(todayKey());
  const [v, setV] = useState<Record<string, string>>({});
  const field = (k: string, t: string, u: string, ph?: number) => (
    <label className="gy-f" key={k}><span>{t}</span>
      <span className="gy-in"><input className="input num" inputMode="decimal" type="number" step="0.1" min={0} value={v[k] ?? ''} placeholder={ph != null ? String(num(ph)) : ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} /><small>{u}</small></span>
    </label>
  );
  const val = (k: string) => (v[k] && +v[k] > 0 ? +v[k] : undefined);
  const any = Object.values(v).some((x) => x && +x > 0);
  return (
    <Sheet title={L('سجّل قياس', 'Log measurements')} onClose={closeSheet} footer={
      <button className="btn primary grow" disabled={!any} onClick={() => { A.logBody({ day, weight: val('weight'), fat: val('fat'), waist: val('waist'), chest: val('chest'), arm: val('arm'), thigh: val('thigh') }); closeSheet(); toast(L('انحفظ ✓', 'Saved ✓')); }}>{L('احفظ', 'Save')}</button>
    }>
      <div className="gy-form">
        <label className="gy-f"><span>{L('اليوم', 'Day')}</span><input className="input" type="date" value={day} max={todayKey()} onChange={(e) => setDay(e.target.value || todayKey())} /></label>
        {field('weight', L('الوزن', 'Weight'), L('كجم', 'kg'), last.weight?.v)}
        <small className="faint">{L('الباقي اختياري — قِس بالمتر مرة بالشهر، أصدق من الميزان.', 'The rest is optional — a tape once a month tells more than the scale.')}</small>
        <div className="gy-two">
          {MEAS.map((m) => field(m.k, L(...m.t), L(...m.u), last[m.k]?.v))}
        </div>
      </div>
    </Sheet>
  );
}

export function GymInfoSheet() {
  const s = useApp();
  const i = s.gym.info;
  const [sex, setSex] = useState<'m' | 'f' | undefined>(i.sex);
  const [year, setYear] = useState(i.birthYear ? String(i.birthYear) : '');
  const [height, setHeight] = useState(i.height ? String(i.height) : '');
  const [weight, setWeight] = useState('');
  const [act, setAct] = useState<number | undefined>(i.activity);
  const hasW = !!bodyNow(s).weight;
  const y = +year;
  const ok = !!sex && y > 1920 && y < new Date().getFullYear() - 10 && +height > 100 && +height < 250 && (hasW || +weight > 25);
  return (
    <Sheet title={L('بياناتي', 'My details')} onClose={closeSheet} footer={
      <button className="btn primary grow" disabled={!ok} onClick={() => { A.setGymInfo({ sex, birthYear: y, height: +height, activity: act }); if (!hasW && +weight > 0) A.logBody({ day: todayKey(), weight: +weight }); closeSheet(); }}>{L('احسب', 'Calculate')}</button>
    }>
      <div className="gy-form">
        <div className="gy-f"><span>{L('الجنس', 'Sex')}</span><Seg value={sex || ('' as 'm')} onChange={setSex} options={[{ v: 'm', l: L('ذكر', 'Male') }, { v: 'f', l: L('أنثى', 'Female') }]} /></div>
        <div className="gy-two">
          <label className="gy-f"><span>{L('سنة الميلاد', 'Birth year')}</span><input className="input num" inputMode="numeric" type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2004" /></label>
          <label className="gy-f"><span>{L('الطول (سم)', 'Height (cm)')}</span><input className="input num" inputMode="numeric" type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="175" /></label>
        </div>
        {!hasW && <label className="gy-f"><span>{L('الوزن (كجم)', 'Weight (kg)')}</span><input className="input num" inputMode="decimal" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>}
        <div className="gy-f"><span>{L('نشاطك', 'Activity')}</span>
          <div className="gy-chips">{ACTIVITY.map((a) => <button key={a.v} className={act === a.v ? 'on' : ''} onClick={() => setAct(act === a.v ? undefined : a.v)}>{L(...a.t)}</button>)}</div>
          <small className="faint">{L('لو ما اخترت، أحسبه من أيام برنامجك.', 'If you leave it, I use your program days.')}</small>
        </div>
      </div>
    </Sheet>
  );
}

/** on «اليوم»: today's workout, or the one going on */
export function GymTodayCard() {
  const s = useApp();
  const now = useNow(60_000);
  const live = liveSession(s);
  const t = gymToday(s, now);
  if (!live && !t) return null;
  return (
    <section className="tile gy-today">
      <span className="gy-today-i"><Icon name="gym" size={20} /></span>
      <span className="m">
        <b>{live ? L(`تمرينك شغّال: ${live.name}`, `Workout on: ${live.name}`) : L(`اليوم تمرين: ${t!.slot.name}`, `Workout today: ${t!.slot.name}`)}</b>
        <span>{live ? L(`من ${Math.round((now - live.start) / 60000)} دقيقة`, `${Math.round((now - live.start) / 60000)} min in`) : `${t!.slot.sub} · ~${t!.slot.minutes} ${L('د', 'min')}${s.gym.profile?.time ? ` · ${fmtClock(s.gym.profile.time)}` : ''}`}</span>
      </span>
      <button className="btn primary sm" onClick={() => { if (!live) A.startWorkout(); go('gym/live'); }}>{live ? L('كمّل', 'Resume') : L('ابدأ', 'Start')}</button>
    </section>
  );
}

