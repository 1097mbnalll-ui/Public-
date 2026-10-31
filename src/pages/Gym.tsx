import { useEffect, useMemo, useState } from 'react';
import { BodyLegend, BodyMap, sideOf } from '../ui/BodyMap';
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
  ACTIVITY, alternatives, bmi, bodyNow, e1rm, exercise, exerciseHistory, exName, fmtKg, GOAL_INFO, gymToday, gymWeek, history, liveSession, nextWorkout, nutrition, plates,
  program, records, scheme, sessionSummary, streakWeeks, target, targetLine, weightSeries, dayPlan, partsOf, GROUPS, groupLabel, groupsName, recovery, suggestToday, warmup, weeklySets, allExercises, exercisesFor, PARTS, partName,
  type GroupId, type Part, type Kind, type Readiness,
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
  if (r.id === 'today') return <TodayScreen />;
  if (r.id === 'log') return <LogScreen />;
  const tab = r.id === 'body' ? 'body' : r.id === 'moves' ? 'moves' : 'train';
  return <GymHome tab={tab} />;
}

/** «جسمي» inside «صحتي» */
export function GymBody() {
  const now = useNow(60_000);
  return <BodyTab now={now} />;
}

/** «تمريني» inside «صحتي»: today's training and the exercises */
export function GymTabs({ tab }: { tab: 'train' | 'moves' }) {
  const s = useApp();
  const now = useNow(60_000);
  return (
    <>
      <div className="row" style={{ marginBottom: 14, gap: 8, alignItems: 'center' }}>
        <div className="grow"><Seg value={tab} onChange={(v) => go(v === 'train' ? 'health/gym' : 'health/moves')} label={L('أقسام النادي', 'Gym sections')} options={[{ v: 'train', l: L('تمريني', 'Train') }, { v: 'moves', l: L('التمارين', 'Exercises') }]} /></div>
        {s.gym.profile && <button className="icon-btn" onClick={() => openSheet({ type: 'gym-setup' })} aria-label={L('برنامجي', 'My program')}><Icon name="settings" /></button>}
      </div>
      {tab === 'train' ? <TrainTab now={now} /> : <MovesTab />}
    </>
  );
}

function GymHome({ tab }: { tab: 'train' | 'body' | 'moves' }) {
  const s = useApp();
  const now = useNow(60_000);
  return (
    <div>
      <PageTop
        title={L('النادي', 'Gym')}
        sub={fmtDate(todayKey(now))}
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

const STATE_TEXT: Record<Readiness, [string, string]> = { ready: ['جاهزة', 'Ready'], recovering: ['تتعافى', 'Recovering'], tired: ['ترتاح', 'Resting'] };

/** «تمريني»: how rested each muscle is, what that means for today, one button — then the rest, quietly */
function TrainTab({ now }: { now: number }) {
  const s = useApp();
  const p = s.gym.profile;
  const live = liveSession(s);
  const rec = useMemo(() => recovery(s, now), [s, now]);
  const sug = useMemo(() => suggestToday(s, now), [s, now]);
  const [mark, setMark] = useState<Part | null>(null);
  const states = Object.fromEntries(PARTS.map((x) => [x.id, rec[x.id].state])) as Record<Part, Readiness>;
  const plan = useMemo(() => dayPlan(s, sug.groups), [s, sug.groups]);
  const wk = gymWeek(s, now);
  const st = streakWeeks(s, now);
  const recs = records(s, now).slice(0, 3);
  const last = history(s)[0];
  const m = mark ? rec[mark] : null;
  const ago = (t?: number) => {
    if (!t) return L('ما تمرّنتها بعد', 'not trained yet');
    const h = Math.round((now - t) / 3600_000);
    return h < 24 ? L(`آخر تمرين قبل ${h} ساعة`, `trained ${h}h ago`) : L(`آخر تمرين ${relDay(todayKey(t), todayKey(now))}`, `last trained ${relDay(todayKey(t), todayKey(now))}`);
  };
  return (
    <>
      {live ? (
        <button className="gy-live-bar" onClick={() => go('gym/live')}>
          <span className="pulse" />
          <b>{L(`كمّل تمرينك: ${live.name}`, `Resume: ${live.name}`)}</b>
          <span className="num">{Math.round((now - live.start) / 60000)} {L('د', 'min')}</span>
        </button>
      ) : (
        <section className="gy-sug">
          {sug.why && <p>{sug.why}</p>}
          <button className="btn primary gy-go" onClick={() => { A.startWorkout(Date.now(), sug.groups); go('gym/live'); }}>
            <span>{L(`ابدأ ${groupsName(sug.groups)}`, `Start ${groupsName(sug.groups)}`)}</span>
            <small className="num">{L(`${plan.items.length} تمارين · ${plan.minutes} د`, `${plan.items.length} exercises · ${plan.minutes} min`)}</small>
          </button>
          <button className="gy-link" onClick={() => go('gym/today')}>{L('اختر عضلات ثانية', 'Pick other muscles')}</button>
        </section>
      )}

      <section className="gy-rec-card" aria-label={L('عضلاتك اليوم', 'Your muscles today')}>
        <h2 className="sh-h">{L('عضلاتك اليوم', 'Your muscles today')}</h2>
        <BodyMap states={states} marked={mark} onPart={(x) => setMark(mark === x ? null : x)} />
        <div className="gy-rleg" aria-hidden>
          {(['ready', 'recovering', 'tired'] as Readiness[]).map((k) => <span key={k}><i className={k} />{L(...STATE_TEXT[k])}</span>)}
        </div>
        <p className="gy-rnote" aria-live="polite">
          {m && mark ? <><b>{partName(mark)}</b> · {L(...STATE_TEXT[m.state])} · {ago(m.last)}</> : L('اضغط أي عضلة تشوف حالها.', 'Tap a muscle to see how it is.')}
        </p>
      </section>

      <section className="gy-stats">
        {p ? (
          <>
            <div><b className="num">{wk.done}<small>/{wk.target}</small></b><span>{L('هالأسبوع', 'this week')}</span></div>
            <div><b className="num">{st}</b><span>{L('أسابيع ورا بعض', 'weeks in a row')}</span></div>
          </>
        ) : (
          <button className="gy-stat-cta" onClick={() => openSheet({ type: 'gym-setup' })}><b>{L('فصّل برنامجك', 'Set up a program')}</b><span>{L('هدفك وأيامك', 'Goal and days')}</span></button>
        )}
        <div><b className="num">{last ? relDay(last.day, todayKey(now)) : '—'}</b><span>{L('آخر تمرين', 'last workout')}</span></div>
      </section>

      {recs.length > 0 && (
        <section>
          <div className="group-title"><span className="sh-h2">{L('أرقامك', 'Your numbers')}</span></div>
          <div className="gy-recs2">
            {recs.map((r) => {
              const climb = r.monthAgo ? Math.round(((r.best - r.monthAgo) / r.monthAgo) * 100) : 0;
              return (
                <button key={r.exId} onClick={() => openSheet({ type: 'gym-ex', exId: r.exId })}>
                  <span>{exName(r.exId)}</span>
                  <b className="num">{fmtKg(r.kg)}<small>×{r.reps}</small></b>
                  {climb > 0 ? <em className="num">+{climb}% {L('بشهر', '/mo')}</em> : <em className="faint">{fmtDate(r.day, false)}</em>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="gy-links">
        {p && (
          <button onClick={() => openSheet({ type: 'gym-setup' })}>
            <span className="m"><b>{L('برنامجي', 'My program')}</b><span>{program(p).name} · {[...p.days].sort().map((d) => DAY1()[d]).join(' ')}</span></span>
            <Icon name="chevron" size={14} className="chev-end" />
          </button>
        )}
        <button onClick={() => go('gym/log')}>
          <span className="m"><b>{L('سجل تمارينك', 'Workout log')}</b><span className="num">{history(s).length ? L(`${history(s).length} تمرين`, `${history(s).length} workouts`) : L('فاضي للحين', 'Empty for now')}</span></span>
          <Icon name="chevron" size={14} className="chev-end" />
        </button>
      </section>
    </>
  );
}

/** «اختر عضلاتك»: its own screen, so the home stays calm */
function TodayScreen() {
  const s = useApp();
  const now = useNow(60_000);
  const sug = useMemo(() => suggestToday(s, now), [s, now]);
  return (
    <div>
      <PageTop title={L('تمرين اليوم', "Today's workout")} back={{ label: L('النادي', 'Gym'), to: 'gym' }} />
      <TodayPick s={s} initial={sug.groups} />
    </div>
  );
}

/** hard sets this week for each muscle group, against the range that builds it */
function WeekSets({ only }: { only?: GroupId[] }) {
  const s = useApp();
  const now = useNow(60_000);
  const rows = weeklySets(s, now).filter((r) => (only ? only.includes(r.g) : true));
  return (
    <div className="gy-ws">
      {rows.map((r) => {
        const max = Math.max(r.hi * 1.25, r.sets);
        const tone = r.sets >= r.hi ? 'over' : r.sets >= r.lo ? 'ok' : r.sets > 0 ? 'low' : 'none';
        return (
          <div key={r.g} className={tone}>
            <span className="n">{groupLabel(r.g)}</span>
            <span className="bar" aria-hidden>
              <i className="band" style={{ insetInlineStart: `${(r.lo / max) * 100}%`, width: `${((r.hi - r.lo) / max) * 100}%` }} />
              <i className="fill" style={{ width: `${Math.min(100, (r.sets / max) * 100)}%` }} />
            </span>
            <span className="v num">{r.sets}<small>/{r.lo}–{r.hi}</small></span>
          </div>
        );
      })}
    </div>
  );
}

/** the program and every workout so far */
function LogScreen() {
  const s = useApp();
  const now = useNow(60_000);
  const p = s.gym.profile;
  const today = todayKey(now);
  const prog = p ? program(p) : null;
  const next = nextWorkout(s, now);
  const all = history(s);
  const [limit, setLimit] = useState(20);
  return (
    <div>
      <PageTop title={L('سجل تمارينك', 'Workout log')} back={{ label: L('النادي', 'Gym'), to: 'gym' }} />
      <WeekCard s={s} now={now} />
      <section>
        <div className="group-title"><span className="sh-h2">{L('مجموعاتك هالأسبوع', 'Your sets this week')}</span></div>
        <WeekSets />
        <p className="faint tiny">{L('المنطقة المظللة: كم مجموعة بالأسبوع تبني العضلة. المجموعة على العضلة الأساسية تنحسب كاملة، وعلى المساعدة نص.', 'The shaded band is how many weekly sets build a muscle. A set counts in full for its main muscle, half for one it also works.')}</p>
      </section>
      {p && prog && next && (
        <section>
          <div className="group-title"><span className="sh-h2">{L('برنامجك', 'Your program')}</span><button onClick={() => openSheet({ type: 'gym-setup' })}>{L('غيّره', 'Change')}</button></div>
          <div className="gy-prog">
            <div className="gy-prog-h"><b>{prog.name}</b><span>{[...p.days].sort().map((d) => DAY1()[d]).join(' · ')}{p.time ? ` · ${fmtClock(p.time)}` : ''}</span></div>
            {prog.slots.map((sl, i) => (
              <details key={sl.key} className="gy-slot">
                <summary><b>{sl.name}</b><span>{sl.sub} · ~{sl.minutes} {L('د', 'min')}</span>{i === next.index && <em>{L('الجاي', 'Next')}</em>}</summary>
                <ol>{sl.items.map((it) => <li key={it.exId}><button onClick={() => openSheet({ type: 'gym-ex', exId: it.exId })}>{exName(it.exId)}</button></li>)}</ol>
              </details>
            ))}
          </div>
        </section>
      )}
      <section>
        <div className="group-title"><span className="sh-h2">{L('كل التمارين', 'All workouts')}</span><span className="faint small num">{all.length}</span></div>
        {all.length ? (
          <div className="gy-hist">
            {all.slice(0, limit).map((x) => {
              const sm = sessionSummary(s, x);
              return (
                <button key={x.id} className="gy-h" onClick={() => openSheet({ type: 'gym-session', id: x.id })}>
                  <span className="d"><b className="num">{new Date(`${x.day}T12:00:00`).getDate()}</b><span>{relDay(x.day, today)}</span></span>
                  <span className="m"><b>{x.name}</b><span className="num">{L(`${sm.minutes} د · ${sm.sets} مجموعة · ${Math.round(sm.volume).toLocaleString('en')} كجم`, `${sm.minutes} min · ${sm.sets} sets · ${Math.round(sm.volume).toLocaleString('en')} kg`)}</span></span>
                  {sm.prs.length > 0 && <em>🏆 {sm.prs.length}</em>}
                </button>
              );
            })}
          </div>
        ) : <p className="faint small">{L('أول تمرين تخلصه يطلع هنا.', 'Your first finished workout shows up here.')}</p>}
        {all.length > limit && <button className="btn ghost" onClick={() => setLimit(limit + 20)}>{L('اعرض أقدم', 'Show older')}</button>}
      </section>
    </div>
  );
}

/** «وش تتمرن اليوم؟»: pick the muscles (or tap them on the body), see the workout they make, start */
function TodayPick({ s, initial }: { s: AppState; initial: GroupId[] }) {
  const suggested = initial;
  const [groups, setGroups] = useState<GroupId[]>(suggested);
  const [drop, setDrop] = useState<string[]>([]);
  const plan = useMemo(() => dayPlan(s, groups), [s, groups]);
  const items = plan.items.filter((i) => !drop.includes(i.exId));
  const { main, also } = partsOf(items.map((i) => i.exId));
  const toggle = (g: GroupId) => {
    setGroups((x) => (x.includes(g) ? x.filter((y) => y !== g) : [...x, g]));
    setDrop([]);
  };
  const same = groups.length === suggested.length && groups.every((g) => suggested.includes(g));
  const minutes = Math.round(8 + items.reduce((a, it) => a + (exercise(it.exId).unit === 'min' ? it.scheme.lo : it.scheme.sets * (0.8 + it.scheme.rest / 60) + 1.5), 0));
  return (
    <section className="gy-next">
      <h2 className="sh-h">{L('وش تتمرن اليوم؟', 'What are you training today?')}</h2>
      <div className="gy-groups" role="group" aria-label={L('العضلات', 'Muscles')}>
        {GROUPS.map((g) => (
          <button key={g.id} className={groups.includes(g.id) ? 'on' : ''} aria-pressed={groups.includes(g.id)} onClick={() => toggle(g.id)}>{groupLabel(g.id)}</button>
        ))}
      </div>
      <BodyMap main={main} also={also} onPart={(part) => { const g = GROUPS.find((x) => x.parts.includes(part)); if (g) toggle(g.id); }} />
      <BodyLegend main={main} also={also} />
      {items.length ? (
        <>
          <div className="sub num">{groupsName(groups)} · {L(`${items.length} تمارين`, `${items.length} exercises`)} · ~{minutes} {L('د', 'min')}</div>
          <ul className="gy-plan">
            {items.map((it) => {
              const ex = exercise(it.exId);
              const t = target(s, it.exId, it.scheme);
              return (
                <li key={it.exId} className={t.tag}>
                  <button className="nm" onClick={() => openSheet({ type: 'gym-ex', exId: it.exId })}>{exName(it.exId)}</button>
                  <span>{t.tag === 'first' ? (ex.unit === 'min' ? L(`${t.reps} دقيقة`, `${t.reps} min`) : `${it.scheme.sets} × ${t.reps}${ex.unit === 'sec' ? L(' ث', 's') : ''}`) : targetLine(t, ex).replace(/^[^:]+: /, '')}{t.tag === 'up' ? ' ↑' : ''}</span>
                  <button className="icon-btn sm" aria-label={L(`شيل ${exName(it.exId)}`, `Remove ${exName(it.exId)}`)} onClick={() => setDrop([...drop, it.exId])}><Icon name="x" size={14} /></button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="gy-note">{L('اختر العضلات فوق، أو اضغط عليها في الجسم.', 'Pick the muscles above, or tap them on the body.')}</p>
      )}
      <div className="a">
        <button className="btn primary gy-go" disabled={!items.length} onClick={() => { A.startWorkout(Date.now(), groups, items.map((i) => i.exId)); go('gym/live'); }}><Icon name="play" size={15} /> {L('ابدأ التمرين', 'Start workout')}</button>
        {!same && <button className="btn ghost sm" onClick={() => { setGroups(suggested); setDrop([]); }}>{L('رجّع المقترح', 'Back to the suggestion')}</button>}
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
  const now = useNow(1000);
  const total = ses.entries.reduce((a, e) => a + e.sets.length, 0);
  const done = ses.entries.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
  const rest = ses.restUntil ? ses.restUntil - now : 0;
  const firstOpen = () => Math.max(0, ses.entries.findIndex((e) => e.sets.some((x) => !x.done)));
  const [open, setOpen] = useState<number>(firstOpen);
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
  /** after an exercise: the next one with sets left */
  const next = (from: number) => {
    const n = ses.entries.findIndex((en, k) => k > from && en.sets.some((x) => !x.done));
    const m = n >= 0 ? n : ses.entries.findIndex((e) => e.sets.some((x) => !x.done));
    setOpen(m >= 0 ? m : -1);
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
      <p className="faint small num">{L(`${done} من ${total} مجموعة`, `${done} of ${total} sets`)}{done === total && total ? L(' — كلها خلصت، اضغط «خلّصت» فوق 💪', ' — all done, press Finish 💪') : ''}</p>

      <div className="gy-xlist">
        {ses.entries.map((e, ei) => (ei === open ? <ExerciseOpen key={`${e.exId}-${ei}`} ses={ses} ei={ei} onDone={() => next(ei)} /> : <ExerciseRow key={`${e.exId}-${ei}`} ses={ses} ei={ei} onOpen={() => setOpen(ei)} />))}
      </div>

      <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
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

const EFFORT: { v: 'easy' | 'ok' | 'hard'; l: [string, string]; e: string }[] = [
  { v: 'easy', l: ['سهلة', 'Easy'], e: '😌' },
  { v: 'ok', l: ['مناسبة', 'About right'], e: '👍' },
  { v: 'hard', l: ['صعبة', 'Hard'], e: '🥵' },
];

const fmtSet = (x: { kg?: number; reps: number }, unit?: string) => (x.kg ? `${fmtKg(x.kg)}×${x.reps}` : `${x.reps}${unit === 'sec' ? L('ث', 's') : unit === 'min' ? L('د', 'm') : ''}`);

/** an exercise not being worked on: one line — done with its best set, or what's coming */
function ExerciseRow({ ses, ei, onOpen }: { ses: GymSession; ei: number; onOpen: () => void }) {
  const s = useApp();
  const e = ses.entries[ei];
  const ex = exercise(e.exId);
  const n = e.sets.filter((x) => x.done).length;
  const all = n === e.sets.length;
  const sc = s.gym.profile ? scheme(s.gym.profile, ex) : { sets: 3, lo: 10, hi: 12, rest: 60 };
  const t = target(s, e.exId, sc, ses.start);
  const best = e.sets.filter((x) => x.done).sort((a, b) => (b.kg || 0) - (a.kg || 0) || b.reps - a.reps)[0];
  return (
    <button className={`gy-xr ${all ? 'done' : n ? 'part' : ''}`} onClick={onOpen}>
      <span className="st num" aria-hidden>{all ? <Icon name="check" size={15} stroke={3} /> : `${n}/${e.sets.length}`}</span>
      <span className="m">
        <b>{exName(e.exId)}</b>
        <span className="num">{all ? `${best ? fmtSet(best, ex.unit) : ''} · ${L(`${n} مجموعات`, `${n} sets`)}${e.effort ? ` · ${EFFORT.find((x) => x.v === e.effort)!.e}` : ''}` : targetLine(t, ex)}</span>
      </span>
      <Icon name="chevron" size={14} className="chev-end" />
    </button>
  );
}

/** a − value + control for the thumb; the number can still be typed */
function Stepper({ value, onChange, step, unit, label, min = 0 }: { value?: number; onChange: (v: number | undefined) => void; step: number; unit: string; label: string; min?: number }) {
  const v = value ?? 0;
  return (
    <div className="gy-step" role="group" aria-label={label}>
      <button aria-label={L(`نقّص ${label}`, `Less ${label}`)} onClick={() => onChange(Math.max(min, +(v - step).toFixed(2)))}><Icon name="minus" size={18} stroke={2.6} /></button>
      <label>
        <input className="num" inputMode="decimal" type="number" step={step} min={min} value={value ?? ''} placeholder="—" aria-label={label} onChange={(ev) => onChange(ev.target.value === '' ? undefined : Math.max(min, +ev.target.value))} />
        <small>{unit}</small>
      </label>
      <button aria-label={L(`زِد ${label}`, `More ${label}`)} onClick={() => onChange(+(v + step).toFixed(2))}><Icon name="plus" size={18} stroke={2.6} /></button>
    </div>
  );
}

/** the exercise being worked on: what to lift and why, the warm-up, then one set at a time */
function ExerciseOpen({ ses, ei, onDone }: { ses: GymSession; ei: number; onDone: () => void }) {
  const s = useApp();
  const e = ses.entries[ei];
  const ex = exercise(e.exId);
  const sc = s.gym.profile ? scheme(s.gym.profile, ex) : { sets: 3, lo: 10, hi: 12, rest: 60 };
  const t = target(s, e.exId, sc, ses.start);
  const weighted = ex.kind !== 'body' && ex.kind !== 'cardio';
  const firstUndone = e.sets.findIndex((x) => !x.done);
  const [pick, setPick] = useState<number | null>(null);
  const sel = pick != null && pick < e.sets.length ? pick : firstUndone >= 0 ? firstUndone : e.sets.length - 1;
  const set = e.sets[sel];
  const all = firstUndone < 0;
  const wu = !e.sets.some((x) => x.done) ? warmup(e.exId, set?.kg) : [];
  const isLast = ei === ses.entries.length - 1 && sel === e.sets.length - 1;
  const unit = ex.unit === 'sec' ? L('ثانية', 'sec') : ex.unit === 'min' ? L('دقيقة', 'min') : L('عدّة', 'reps');
  const kgStep = ex.kind === 'db' ? 2 : 2.5;
  const repStep = ex.unit === 'sec' ? 5 : 1;
  return (
    <section className={`gy-ex ${all ? 'done' : ''}`}>
      <div className="gy-ex-h">
        <span className="gy-mini" aria-hidden><BodyMap size="xs" only={sideOf(ex.hits[0])} main={new Set(ex.hits)} also={new Set(ex.also)} /></span>
        <button className="n" onClick={() => openSheet({ type: 'gym-ex', exId: e.exId, sid: ses.id, ei })}>
          <b>{exName(e.exId)}</b>
          <span className={`tg ${t.tag}`}>{targetLine(t, ex)}{t.why ? ` — ${t.why}` : ''}</span>
        </button>
        <button className="icon-btn sm" aria-label={L(`بدّل ${exName(e.exId)}`, `Swap ${exName(e.exId)}`)} title={L('بدّل التمرين', 'Swap exercise')} onClick={() => openSheet({ type: 'gym-ex', exId: e.exId, sid: ses.id, ei })}><Icon name="repeat" size={16} /></button>
      </div>

      {wu.length > 0 && <p className="gy-wu num">{L('إحماء قبلها (ما ينحسب): ', 'Warm up first (not counted): ')}<bdi dir="ltr">{wu.map((w) => `${fmtKg(w.kg)}×${w.reps}`).join('  ·  ')}</bdi></p>}

      <div className="gy-chips-sets" role="tablist" aria-label={L('المجموعات', 'Sets')}>
        {e.sets.map((x, si) => (
          <button key={si} role="tab" aria-selected={si === sel} className={`${x.done ? 'on' : ''} ${si === sel ? 'sel' : ''}`} onClick={() => setPick(si)}>
            <span className="i num">{x.done ? '✓' : si + 1}</span>
            <span className="v num">{fmtSet(x, ex.unit)}</span>
          </button>
        ))}
        <button className="add" aria-label={L('أضف مجموعة', 'Add a set')} onClick={() => A.addGymSet(ses.id, ei)}><Icon name="plus" size={14} /></button>
      </div>

      {set && !all && (
        <div className="gy-panel">
          <div className="gy-panel-h">{L(`المجموعة ${sel + 1} من ${e.sets.length}`, `Set ${sel + 1} of ${e.sets.length}`)}{weighted && ex.kind === 'bar' && set.kg ? <span className="faint"> · {plateText(set.kg)}</span> : null}</div>
          <div className={`gy-steps ${weighted ? '' : 'one'}`}>
            {weighted && <Stepper value={set.kg} step={kgStep} unit={L('كجم', 'kg')} label={L('الوزن', 'weight')} onChange={(v) => A.setGymSet(ses.id, ei, sel, { kg: v })} />}
            <Stepper value={set.reps} step={repStep} unit={unit} label={unit} onChange={(v) => A.setGymSet(ses.id, ei, sel, { reps: Math.round(v || 0) })} />
          </div>
          <button className="btn primary gy-done-set" onClick={() => { A.tickGymSet(ses.id, ei, sel, set.done || isLast ? 0 : sc.rest); setPick(null); }}>
            {set.done ? L('رجّعها', 'Undo it') : <><Icon name="check" size={17} stroke={3} /> {L(`خلّصت المجموعة ${sel + 1}`, `Done set ${sel + 1}`)}</>}
          </button>
        </div>
      )}

      {all && (
        <div className="gy-effort">
          <b>{L('كيف كانت؟', 'How did it feel?')}</b>
          <div>
            {EFFORT.map((x) => (
              <button key={x.v} className={e.effort === x.v ? 'on' : ''} aria-pressed={e.effort === x.v} onClick={() => { A.setGymEffort(ses.id, ei, x.v); onDone(); }}>
                <span aria-hidden>{x.e}</span>{L(...x.l)}
              </button>
            ))}
          </div>
          <small className="faint">{L('سهلة: أزيد لك أكثر المرة الجاية. صعبة: نثبّت الوزن.', 'Easy: a bigger step next time. Hard: we hold the weight.')}</small>
          {pick != null && e.sets[pick]?.done && <button className="btn ghost sm" onClick={() => { A.tickGymSet(ses.id, ei, pick, 0); setPick(null); }}>{L(`رجّع المجموعة ${pick + 1}`, `Undo set ${pick + 1}`)}</button>}
        </div>
      )}

      {!all && e.sets.length > 1 && !e.sets[e.sets.length - 1].done && (
        <div className="gy-ex-a"><button className="btn sm ghost" onClick={() => A.removeGymSet(ses.id, ei)}><Icon name="minus" size={13} /> {L('شيل آخر مجموعة', 'Drop the last set')}</button></div>
      )}
    </section>
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

/** a list row for an exercise: name, how, and the best you've done on it */
function ExRow({ id, best, tag, onClick, extra }: { id: string; best?: string; tag?: string; onClick: () => void; extra?: React.ReactNode }) {
  const e = exercise(id);
  return (
    <div className="gy-h">
      <button className="gy-h-main" onClick={onClick}>
        <span className="m"><b>{exName(id)}{tag ? <em className="gy-tag">{tag}</em> : null}</b><span>{e.custom ? [...e.hits].map(partName).join(L('، ', ', ')) : L(...e.tip)}</span></span>
        {best ? <em className="num">{best}</em> : <small className="faint">{e.kind === 'body' ? L('بدون أدوات', 'No kit') : e.kind === 'db' ? L('دمبل', 'Dumbbell') : e.kind === 'bar' ? L('بار', 'Barbell') : e.kind === 'machine' ? L('جهاز', 'Machine') : L('كارديو', 'Cardio')}</small>}
      </button>
      {extra}
    </div>
  );
}

function MovesTab() {
  const s = useApp();
  const [part, setPart] = useState<Part | null>(null);
  const [q, setQ] = useState('');
  const [kg, setKg] = useState(60);
  const [bar, setBar] = useState(20);
  const [rm, setRm] = useState<{ kg: number; reps: number }>({ kg: 80, reps: 5 });
  const pl = plates(kg, bar);
  const one = e1rm(rm.kg, rm.reps);
  const recs = useMemo(() => new Map(records(s).map((r) => [r.exId, r])), [s]);
  const info = PARTS.find((x) => x.id === part);
  const query = q.trim();
  const list = query ? allExercises().filter((e) => e.ar.includes(query) || e.en.toLowerCase().includes(query.toLowerCase())) : part ? exercisesFor(part) : [];
  const best = (id: string) => {
    const r = recs.get(id);
    return r ? `${fmtKg(r.kg)}×${r.reps}` : undefined;
  };
  const mine = s.gym.custom || [];
  return (
    <>
      <section className="gy-tool">
        <b>{L('اضغط على أي عضلة', 'Tap any muscle')}</b>
        <BodyMap size="lg" picked={part ? new Set([part]) : undefined} onPart={(x) => { setPart(part === x ? null : x); setQ(''); }} />
        <div className="gy-parts" role="group" aria-label={L('العضلات', 'Muscles')}>
          {PARTS.map((x) => <button key={x.id} className={part === x.id ? 'on' : ''} aria-pressed={part === x.id} onClick={() => { setPart(part === x.id ? null : x.id); setQ(''); }}>{partName(x.id)}</button>)}
        </div>
      </section>

      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L(`ابحث في ${allExercises().length} تمرين…`, `Search ${allExercises().length} exercises…`)} aria-label={L('ابحث عن تمرين', 'Search exercises')} style={{ marginBottom: 10 }} />

      {(info || query) && (
        <section>
          {info && !query && (
            <div className="gy-part-info">
              <b>{partName(info.id)}</b>
              <span>{L(...info.about)}</span>
            </div>
          )}
          <div className="gy-hist">
            {list.map((e) => <ExRow key={e.id} id={e.id} best={best(e.id)} tag={part && !query ? (e.hits.includes(part) ? undefined : L('يساعد', 'also')) : undefined} onClick={() => openSheet({ type: 'gym-ex', exId: e.id })} />)}
            {!list.length && <p className="faint small" style={{ padding: 14, margin: 0 }}>{L('ما لقيت. اكتبه من عندك تحت.', "Not found. Write your own below.")}</p>}
          </div>
        </section>
      )}

      <section>
        <div className="group-title"><span className="sh-h2">{L('تمارينك الخاصة', 'Your own exercises')}</span><button onClick={() => openSheet({ type: 'gym-custom' })}>{L('+ تمرين من عندك', '+ Your own')}</button></div>
        {mine.length ? (
          <div className="gy-hist">
            {mine.map((c) => <ExRow key={c.id} id={c.id} best={best(c.id)} onClick={() => openSheet({ type: 'gym-ex', exId: c.id })} extra={<button className="icon-btn sm" aria-label={L(`احذف ${c.name}`, `Delete ${c.name}`)} onClick={() => { A.deleteCustomExercise(c.id); toast(L('انحذف', 'Deleted'), { undoable: true }); }}><Icon name="trash" size={15} /></button>} />)}
          </div>
        ) : <p className="faint small">{L('تمرين مو في القائمة؟ اكتبه واختر العضلات اللي يشتغل عليها من الجسم.', 'Not in the list? Write it and tap the muscles it works.')}</p>}
      </section>

      <details className="gy-tools">
        <summary>{L('أدوات: كم قرص أركّب، وأقصى وزن لمرة', 'Tools: plates, one-rep max')}</summary>
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

      </details>
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
        <BodyMap size="sm" main={new Set(ex.hits)} also={new Set(ex.also.filter((x) => !ex.hits.includes(x)))} />
        <BodyLegend main={new Set(ex.hits)} also={new Set(ex.also.filter((x) => !ex.hits.includes(x)))} />
        {!ex.custom && <p className="gy-tip">{L(...ex.tip)}</p>}
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
  const s = useApp();
  const [part, setPart] = useState<Part | null>(null);
  const [q, setQ] = useState('');
  const query = q.trim();
  const live = s.gym.sessions.find((x) => x.id === sid);
  const inIt = new Set(live?.entries.map((e) => e.exId) || []);
  const list = (query ? allExercises().filter((e) => e.ar.includes(query) || e.en.toLowerCase().includes(query.toLowerCase())) : part ? exercisesFor(part) : allExercises()).filter((e) => !inIt.has(e.id));
  return (
    <Sheet title={L('أضف تمرين', 'Add exercise')} onClose={closeSheet}>
      <div className="gy-form">
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('ابحث بالاسم…', 'Search by name…')} aria-label={L('ابحث عن تمرين', 'Search exercises')} />
        <BodyMap size="sm" picked={part ? new Set([part]) : undefined} onPart={(x) => { setPart(part === x ? null : x); setQ(''); }} />
        <p className="faint small" style={{ margin: 0 }}>{part ? L(`تمارين ${partName(part)} — `, `${partName(part)} exercises — `) : L('كل التمارين — ', 'All exercises — ')}{L('اضغط عضلة بالجسم عشان تفلتر.', 'tap a muscle to filter.')}</p>
        <button className="btn" onClick={() => openSheet({ type: 'gym-custom', sid, name: query || undefined })}><Icon name="edit" size={14} /> {query ? L(`اكتب «${query}» كتمرين من عندك`, `Write “${query}” as your own`) : L('اكتب تمرين من عندك', 'Write your own exercise')}</button>
        <div className="gy-hist">
          {list.map((e) => <ExRow key={e.id} id={e.id} tag={part && !e.hits.includes(part) ? L('يساعد', 'also') : undefined} onClick={() => { A.addGymExercise(sid, e.id); closeSheet(); toast(L(`انضاف: ${exName(e.id)}`, `Added: ${exName(e.id)}`)); }} />)}
        </div>
      </div>
    </Sheet>
  );
}

const KINDS: { v: Kind; l: [string, string] }[] = [
  { v: 'bar', l: ['بار', 'Barbell'] }, { v: 'db', l: ['دمبل', 'Dumbbell'] }, { v: 'machine', l: ['جهاز/كيبل', 'Machine'] }, { v: 'body', l: ['وزن الجسم', 'Bodyweight'] }, { v: 'cardio', l: ['كارديو', 'Cardio'] },
];

/** your own exercise: a name, what it's done with, and the muscles — tap once for «mainly», again for «also» */
export function GymCustomSheet({ sid, name: n0 }: { sid?: string; name?: string }) {
  const [name, setName] = useState(n0 || '');
  const [kind, setKind] = useState<Kind>('db');
  const [main, setMain] = useState<Part[]>([]);
  const [also, setAlso] = useState<Part[]>([]);
  const tap = (p: Part) => {
    if (main.includes(p)) {
      setMain(main.filter((x) => x !== p));
      setAlso([...also, p]);
    } else if (also.includes(p)) setAlso(also.filter((x) => x !== p));
    else setMain([...main, p]);
  };
  const ok = name.trim() && (main.length || kind === 'cardio');
  return (
    <Sheet title={L('تمرين من عندك', 'Your own exercise')} onClose={closeSheet} footer={
      <button className="btn primary grow" disabled={!ok} onClick={() => {
        const id = A.addCustomExercise({ name: name.trim().slice(0, 60), kind, hits: main, also });
        if (sid) A.addGymExercise(sid, id);
        closeSheet();
        toast(sid ? L('انضاف لتمرينك وانحفظ في قائمتك', 'Added to your workout and saved') : L('انحفظ في تمارينك', 'Saved to your exercises'));
      }}>{sid ? L('احفظ وأضفه', 'Save and add') : L('احفظ', 'Save')}</button>
    }>
      <div className="gy-form">
        <label className="gy-f"><span>{L('اسم التمرين', 'Name')}</span><input className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={L('مثلًا: سحب كيبل بيد وحدة', 'e.g. Single-arm cable pull')} /></label>
        <div className="gy-f"><span>{L('بإيش؟', 'With what?')}</span>
          <div className="gy-chips">{KINDS.map((k) => <button key={k.v} className={kind === k.v ? 'on' : ''} onClick={() => setKind(k.v)}>{L(...k.l)}</button>)}</div>
        </div>
        <div className="gy-f"><span>{L('العضلات المستهدفة', 'Target muscles')}</span>
          <small className="faint">{L('اضغط مرة = أساسي، مرتين = يساعد، الثالثة تشيلها.', 'Tap once = mainly, twice = also, three times = off.')}</small>
        </div>
        <BodyMap main={new Set(main)} also={new Set(also)} onPart={tap} />
        <div className="gy-parts" role="group" aria-label={L('العضلات', 'Muscles')}>
          {PARTS.map((x) => <button key={x.id} className={main.includes(x.id) ? 'on' : also.includes(x.id) ? 'half' : ''} onClick={() => tap(x.id)}>{partName(x.id)}</button>)}
        </div>
        <BodyLegend main={new Set(main)} also={new Set(also)} />
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
        {ses.groups?.length ? <><b className="gy-sub">{L('مجموعاتك هالأسبوع', 'Your sets this week')}</b><WeekSets only={ses.groups as GroupId[]} /></> : null}
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
  if (!s.settings.sections?.gym) return null;
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

