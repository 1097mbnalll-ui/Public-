import { useEffect, useMemo, useState } from 'react';
import { Collapse, Empty, Seg, useNow } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { PageTop } from '../ui/PageTop';
import { openSheet } from '../ui/sheets';
import { go, useRoute } from '../ui/router';
import { toast } from '../ui/toast';
import { worthColor, worthLabel } from '../ui/MoneySheets';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { addDays, fmtDate, monthNames, parseKey, relDay, todayKey } from '../lib/dates';
import {
  catInfo, catLimits, cutHabit, noSpend, suggestBudget, upcomingBills, favorites, fmtMoney, fmtNum, fmtRenew, freeAlternatives, moneyToday, potential, regrets, report,
  rangeOf, subIdle, subMonthly, suggestions, upcomingSubs, weekStrip, type Period,
} from '../lib/engine/money';
import type { AppState, Expense } from '../lib/types';
import { L } from '../lib/i18n';

const short = (d: string) => (L('ح ن ث ر خ ج س', 'Su Mo Tu We Th Fr Sa').split(' '))[parseKey(d).getDay()];
/** the savings goal: how far (%), how much in and left, add / withdraw, and every move */
function GoalCard({ goal, monthly }: { goal: NonNullable<AppState['money']['goal']>; monthly: number }) {
  const pct = Math.min(100, Math.round((goal.saved / goal.target) * 100));
  const left = Math.max(0, goal.target - goal.saved);
  const log = [...(goal.log || [])].sort((a, b) => b.at - a.at);
  return (
    <div className="card m-goal">
      <div className="m-goal-top">
        <div>
          <div className="k">🎯 {L('هدفك', 'Your goal')}</div>
          <h3>{goal.name}</h3>
          <span className="faint small">{fmtMoney(goal.target)}</span>
        </div>
        <div className="m-goal-ring" style={{ ['--p' as string]: pct / 100 }} role="img" aria-label={L(`وصلت ${pct}%`, `${pct}% there`)}><b className="num">{pct}<small>%</small></b></div>
      </div>
      <div className="ln"><i style={{ width: `${pct}%` }} /></div>
      <div className="ft">
        <span>{L('جمّعت', 'Saved')} <b>{fmtMoney(goal.saved)}</b></span>
        <span>{left <= 0 ? L('وصلت! 🎉', 'Reached! 🎉') : <>{L('باقي', 'Left')} <b>{fmtMoney(left)}</b> · {100 - pct}%</>}</span>
      </div>
      {left > 0 && monthly > 0 && (
        <div className="tip">💡 {L(`لو طبّقت البدائل تحت (${fmtMoney(monthly)} بالشهر) توصل له بعد ≈ ${Math.max(1, Math.ceil(left / monthly))} شهور.`, `With the swaps below (${fmtMoney(monthly)} a month) you'd get there in ≈ ${Math.max(1, Math.ceil(left / monthly))} months.`)}</div>
      )}
      <div className="m-goal-a">
        <button className="btn sm primary" onClick={() => openSheet({ type: 'goal-move', dir: 'in' })}><Icon name="plus" size={14} /> {L('إيداع', 'Add')}</button>
        <button className="btn sm" disabled={!goal.saved} onClick={() => openSheet({ type: 'goal-move', dir: 'out' })}>{L('➖ سحب', '➖ Withdraw')}</button>
      </div>
      {log.length > 0 && (
        <Collapse title={L('الحركات', 'History')} count={log.length}>
          <ul className="m-goal-log">
            {log.slice(0, 50).map((e) => (
              <li key={e.id}>
                <span className={`a num ${e.amount < 0 ? 'out' : 'in'}`}>{e.amount > 0 ? '+' : '−'}{fmtNum(Math.abs(e.amount))}</span>
                <span className="m"><span>{fmtDate(todayKey(e.at), false)}</span>{e.note && <small>{e.note}</small>}</span>
                <button className="icon-btn sm" aria-label={L('احذف الحركة', 'Delete entry')} onClick={() => { A.deleteGoalEntry(e.id); toast(L('انحذفت الحركة', 'Entry deleted'), { undoable: true }); }}><Icon name="x" size={13} /></button>
              </li>
            ))}
          </ul>
        </Collapse>
      )}
    </div>
  );
}

const buysAr = (n: number) => (n === 1 ? 'مشترى واحد' : n === 2 ? 'مشتريين' : n <= 10 ? `${n} مشتريات` : `${n} مشترى`);

/** مصاريفي: today (budget card, last 7 days, quick chips, list) · where to save · report */
export function Money() {
  const route = useRoute();
  if (route.id === 'd') return <DayPage day={route.query.get('d') || todayKey()} />;
  if (route.id === 'cat') return <CatPage cat={route.query.get('c') || 'food'} period={(route.query.get('p') as Period) || 'month'} />;
  return <MoneyHome />;
}

function MoneyHome() {
  const route = useRoute();
  const view = route.id === 'save' ? 'save' : route.id === 'report' ? 'report' : route.id === 'week' ? 'week' : 'day';
  const s = useApp();
  const now = useNow(60_000);
  useEffect(() => {
    A.processSubs();
  }, [s.subs]);
  const today = todayKey(now);
  const left = moneyToday(s, now).daysLeft - 1;
  const payday = !!s.money.payday;

  return (
    <div>
      <PageTop
        title={L('مصاريفي', 'My spending')}
        sub={payday ? (left ? L(`باقي ${left + 1} أيام على الراتب 💰`, `${left + 1} days to payday 💰`) : L('الراتب بكرة 💰', 'Payday tomorrow 💰')) : `${monthNames()[parseKey(today).getMonth()]} · ${left ? L(`باقي ${left} أيام`, `${left} days left`) : L('آخر يوم بالشهر', 'last day of the month')}`}
        actions={<button className="icon-btn" onClick={() => openSheet({ type: 'money-settings' })} aria-label={L('الميزانية والهدف', 'Budget & goal')}><Icon name="settings" /></button>}
      />
      <div style={{ marginBottom: 14 }}>
        <Seg value={view} onChange={(v) => go(v === 'day' ? 'money' : `money/${v}`)} options={[
          { v: 'day', l: L('اليوم', 'Today') }, { v: 'week', l: L('الأسبوع', 'Week') }, { v: 'save', l: L('التوفير', 'Save') }, { v: 'report', l: L('التقرير', 'Report') },
        ]} />
      </div>
      {view === 'day' ? <DayView now={now} /> : view === 'week' ? <WeekView now={now} /> : view === 'save' ? <SaveView now={now} /> : <ReportView now={now} />}
    </div>
  );
}

function ExpenseRow({ e }: { e: Expense }) {
  const c = catInfo(e.cat);
  const sub = [e.time ? e.time : '', e.worth ? worthLabel(e.worth) : '', e.source === 'sub' ? L('تجديد اشتراك', 'renewal') : ''].filter(Boolean).join(' · ') || c.label;
  return (
    <button className="m-ex" onClick={() => openSheet({ type: 'expense', id: e.id })}>
      <span className="em" style={{ background: c.bg }}>{c.emoji}</span>
      <span className="grow"><b>{e.title}</b><span>{sub}</span></span>
      <b className="money">{fmtNum(e.amount)}</b>
      <span className="m-dot" style={{ background: worthColor(e.worth) }} />
    </button>
  );
}

function DayView({ now }: { now: number }) {
  const s = useApp();
  const today = todayKey(now);
  const m = moneyToday(s, now);
  const strip = weekStrip(s, now);
  const favs = favorites(s, now);
  const recent = useMemo(() => {
    const from = addDays(today, -6);
    const list = s.expenses.filter((e) => e.day >= from && e.day <= today).sort((a, b) => b.day.localeCompare(a.day) || (b.time || '').localeCompare(a.time || '') || b.createdAt - a.createdAt);
    const days: { day: string; items: Expense[]; total: number }[] = [];
    for (const e of list) {
      let g = days.find((d) => d.day === e.day);
      if (!g) days.push((g = { day: e.day, items: [], total: 0 }));
      g.items.push(e);
      g.total += e.amount;
    }
    return days;
  }, [s.expenses, today]);

  const over = m.allowance !== undefined && m.spentToday > m.allowance;
  const sug = m.budget ? undefined : suggestBudget(s, now);
  const ns = noSpend(s, now);
  const bills = upcomingBills(s, now);
  const limits = catLimits(s, now);
  return (
    <div className="stack">
      <div className="m-card">
        {m.budget ? (
          <>
            <div className="k">{s.money.payday ? L('باقي لين الراتب', 'Left until payday') : L('باقي من ميزانية الشهر', "Left of this month's budget")}</div>
            <div className="big"><span className="money">{fmtNum(m.leftMonth || 0)}</span> <small>{L(`من ${fmtNum(m.budget)} ر.س`, `of ${fmtNum(m.budget)} SAR`)}</small></div>
            <div className="ln"><i style={{ width: `${Math.max(0, Math.min(100, ((m.leftMonth || 0) / m.budget) * 100))}%` }} /></div>
            <div className="ft">
              <span>{L(`اليوم تقدر: ${fmtNum(m.allowance || 0)} ر.س`, `Today you can: ${fmtNum(m.allowance || 0)} SAR`)}</span>
              <span className={over ? 'over' : ''}>{L(`صرفت اليوم ${fmtNum(m.spentToday)}`, `Spent today ${fmtNum(m.spentToday)}`)}</span>
            </div>
          </>
        ) : (
          <>
            <div className="k">{L('صرفت هذا الشهر', 'Spent this month')}</div>
            <div className="big"><span className="money">{fmtNum(m.spentMonth)}</span> <small>{L('ر.س', 'SAR')}</small></div>
            {sug ? (
              <div className="m-sug">🤖 {L(`متوسط صرفك ${fmtNum(sug.avg)} — أقترح ميزانية ${fmtNum(sug.suggest)} ر.س`, `You average ${fmtNum(sug.avg)} — try a ${fmtNum(sug.suggest)} SAR budget`)}
                <button className="m-card-btn" onClick={() => { A.setBudget(sug.suggest); toast(L('تم — حدّك اليومي صار ينحسب', 'Done — your daily limit is on'), { undoable: true }); }}>{L('استخدمه', 'Use it')}</button>
              </div>
            ) : (
              <button className="m-card-btn" onClick={() => openSheet({ type: 'money-settings' })}>{L('حدد ميزانية الشهر ←', 'Set a monthly budget →')}</button>
            )}
          </>
        )}
      </div>

      <div className="m-strip">
        {strip.map((d) => (
          <button key={d.day} className={d.day === today ? 'on' : ''} title={fmtMoney(d.spent)} aria-label={L(`${relDay(d.day, today)}: ${fmtMoney(d.spent)}`, `${relDay(d.day, today)}: ${fmtMoney(d.spent)}`)} onClick={() => go(`money/d?d=${d.day}`)}>
            {short(d.day)}<b>{Number(d.day.slice(8))}</b><i className={`mk-${d.mark}`} />
          </button>
        ))}
      </div>

      {(ns.days > 0 || bills.length > 0) && (
        <div className="m-badges">
          {ns.streak >= 1 ? <span>🔥 {L(`${ns.streak} ${ns.streak === 1 ? 'يوم' : 'أيام'} ورا بعض بدون صرف`, `${ns.streak}-day no-spend run`)}</span> : ns.days > 0 ? <span>🌱 {L(`${ns.days} أيام بدون صرف هالشهر`, `${ns.days} no-spend days this month`)}</span> : null}
          {bills.slice(0, 2).map((b) => (
            <button key={b.id} onClick={() => openSheet({ type: 'sub', id: b.id })}>📆 {b.name} {fmtNum(b.amount)} · {fmtRenew(b.next, now)}</button>
          ))}
        </div>
      )}

      {limits.length > 0 && (
        <button className="card m-limits" onClick={() => openSheet({ type: 'money-settings' })}>
          {limits.map((l) => {
            const info = catInfo(l.cat);
            return (
              <div key={l.cat} className="lr" role="link" tabIndex={0} onClick={(ev) => { ev.stopPropagation(); go(`money/cat?c=${encodeURIComponent(l.cat)}&p=month`); }} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); go(`money/cat?c=${encodeURIComponent(l.cat)}&p=month`); } }}>
                <div className="h"><b>{info.emoji} {info.label}</b><span className={l.used > l.limit ? 'bad' : ''}>{L(`${fmtNum(l.used)} من ${fmtNum(l.limit)}`, `${fmtNum(l.used)} of ${fmtNum(l.limit)}`)}{l.used > l.limit ? L(' — تجاوزت!', ' — over!') : ''}</span></div>
                <div className="bar"><i style={{ width: `${Math.min(100, l.pct * 100)}%`, background: l.used > l.limit ? 'var(--red)' : l.pct >= 0.8 ? 'var(--amber)' : info.color }} /></div>
              </div>
            );
          })}
        </button>
      )}

      <div className="m-fav">
        <button className="ad" onClick={() => openSheet({ type: 'expense' })}>＋ {L('مصروف', 'Expense')}</button>
        <button onClick={() => openSheet({ type: 'sms' })}>📩 {L('البنك', 'Bank')}</button>
        {favs.map((f) => (
          <button key={f.title + f.amount} onClick={() => {
            A.addExpense({ title: f.title, amount: f.amount, cat: f.cat, day: today, time: new Date().toTimeString().slice(0, 5) });
            toast(L(`سُجّل ${f.title} ${fmtNum(f.amount)}`, `Logged ${f.title} ${fmtNum(f.amount)}`), { undoable: true });
          }}>{catInfo(f.cat).emoji} {f.title} {fmtNum(f.amount)}</button>
        ))}
      </div>

      {recent.length ? (
        recent.map((g) => (
          <section key={g.day}>
            <div className="group-title"><span>{relDay(g.day, today)} · {fmtMoney(g.total)}</span></div>
            <div className="card m-list">{g.items.map((e) => <ExpenseRow key={e.id} e={e} />)}</div>
          </section>
        ))
      ) : (
        <div className="card">
          <Empty icon="wallet" title={L('سجّل أول مصروف', 'Log your first expense')}>
            {L('اكتب «قهوة 18» أو الصق رسائل البنك. بعد أسبوع أقول لك وين تقدر توفر.', 'Type “coffee 18” or paste your bank messages. After a week I’ll show you where to save.')}
            <div style={{ marginTop: 12 }} className="row wrap center" >
              <button className="btn sm primary" onClick={() => openSheet({ type: 'expense' })}><Icon name="plus" size={14} /> {L('مصروف', 'Expense')}</button>
              <button className="btn sm" onClick={() => openSheet({ type: 'sms' })}>📩 {L('رسائل البنك', 'Bank messages')}</button>
            </div>
          </Empty>
        </div>
      )}
    </div>
  );
}

function SaveView({ now }: { now: number }) {
  const s = useApp();
  const sw = suggestions(s, now);
  const pot = potential(s, now);
  const reg = regrets(s, now);
  const alts = freeAlternatives(s, now);
  const habit = cutHabit(s, now);
  const goal = s.money.goal;
  const [cut, setCut] = useState<number | undefined>(undefined);
  const keep = cut ?? (habit ? Math.round(habit.n / 3) : 0);

  return (
    <div className="stack">
      <div className="card m-sum">
        <div><div className="k">{L('تقدر توفر شهريًا', 'You could save a month')}</div><b className="money">{fmtMoney(pot.monthly)}</b></div>
        <div style={{ textAlign: 'end' }}><div className="k">{L('بالسنة', 'A year')}</div><b className="money yr">{fmtNum(pot.yearly)}</b></div>
      </div>

      {goal ? (
        <GoalCard goal={goal} monthly={pot.monthly} />
      ) : (
        <button className="card m-goal-empty" onClick={() => openSheet({ type: 'money-settings' })}>🎯 {L('حط هدف توفير — لابتوب، سفرة… وأحسب لك متى توصله', "Set a savings goal — a laptop, a trip… and I'll work out when you'll get there")}</button>
      )}

      <section>
        <div className="group-title"><span>{L('اقتراحات لك', 'Suggestions for you')}</span></div>
        {sw.length ? (
          <div className="stack" style={{ gap: 10 }}>
            {sw.map((x) => {
              const on = !!s.money.swaps[x.id];
              return (
                <div key={x.id} className="card m-sg">
                  <div className="h"><span className="em" style={{ background: catInfo(x.cat).bg }}>{x.emoji}</span><div className="grow">{x.text}</div></div>
                  <div className="ops">{x.options.map((o) => <span key={o.label} className={o.free ? 'free' : ''}>{o.label}{o.free ? L(' · مجاني', ' · free') : ''}</span>)}</div>
                  <div className="ft">
                    <span>{L('توفر حتى', 'Save up to')} <b>{fmtMoney(x.monthly)} {L('/ شهر', '/ mo')}</b></span>
                    {x.subId ? (
                      <button className="pill" onClick={() => openSheet({ type: 'sub', id: x.subId })}>{L('إدارة', 'Manage')}</button>
                    ) : (
                      <button className={`pill ${on ? 'on' : ''}`} onClick={() => A.toggleSwap(x.id)}>{on ? L('✓ مفعّل', '✓ On') : L('جربها', 'Try it')}</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card"><Empty icon="wallet" title={L('ما فيه اقتراحات بعد', 'No suggestions yet')}>{L('سجّل مصاريفك أسبوع أو أكثر، وأطلع لك وين تروح فلوسك وكيف توفر.', "Log your spending for a week or so and I'll show where it goes and how to save.")}</Empty></div>
        )}
      </section>

      {reg.total > 0 && (
        <div className="card m-reg">
          <div className="t">👎 {L(`قلت «ما يستحق» هذا الشهر · ${fmtMoney(reg.total)}`, `“Not worth it” this month · ${fmtMoney(reg.total)}`)}</div>
          {reg.items.slice(0, 4).map((r) => <div key={r.title} className="r"><span>{r.title}{r.n > 1 ? ` ×${r.n}` : ''}</span><b className="money">{fmtNum(r.sum)}</b></div>)}
        </div>
      )}

      <section>
        <div className="group-title"><span>{L('بدائل مجانية أو أرخص', 'Free or cheaper alternatives')}</span></div>
        <div className="m-fg">
          {alts.map((a) => (
            <div key={a.to} className="card m-fc">
              <span className="e">{a.emoji}</span>
              <div className="a">{a.from}</div>
              <div className="b">{a.to}</div>
              <span className={`tg ${a.free ? '' : 'cheap'}`}>{a.tag}</span>
            </div>
          ))}
        </div>
      </section>

      {habit && (
        <div className="card m-calc">
          <div className="t">{L(`لو خففت ${catInfo(habit.cat).label}…`, `If you cut down on ${catInfo(habit.cat).label.toLowerCase()}…`)}</div>
          <div className="row" style={{ gap: 10, marginTop: 10 }}>
            <span className="faint small">{habit.n}</span>
            <input type="range" className="grow" min={0} max={habit.n} value={keep} onChange={(e) => setCut(Number(e.target.value))} style={{ direction: 'rtl' }} />
            <span className="faint small">0</span>
          </div>
          <div className="res">{L(`إلى ${keep} مرات بالشهر ← توفر `, `To ${keep} times a month → save `)}<b>{fmtMoney((habit.n - keep) * habit.avg)}</b></div>
        </div>
      )}
    </div>
  );
}

function ReportView({ now }: { now: number }) {
  const s = useApp();
  const [period, setPeriod] = useState<Period>('month');
  const r = report(s, period, now);
  const subs = upcomingSubs(s);
  const maxB = Math.max(1, ...r.buckets.map((b) => b.total));
  const maxD = Math.max(1, r.dailyLine || 0, ...r.daily.map((d) => d.total));
  const subsMonthly = subs.reduce((a, x) => a + subMonthly(x), 0);

  return (
    <div className="stack">
      <Seg value={period} onChange={setPeriod} options={[{ v: 'week', l: L('الأسبوع', 'Week') }, { v: 'month', l: L('الشهر', 'Month') }, { v: 'year', l: L('السنة', 'Year') }]} />
      <div className="m-cmp">
        <div className="card"><span>{L('صرفت', 'Spent')}</span><b className="money">{fmtNum(r.total)}</b><span>{period === 'month' && r.budget ? L(`من ${fmtNum(r.budget)}`, `of ${fmtNum(r.budget)}`) : L(`متوسط اليوم ${fmtNum(r.avgDay)}`, `${fmtNum(r.avgDay)} a day`)}</span></div>
        <div className="card">
          <span>{period === 'week' ? L('عن الأسبوع اللي قبله', 'vs last week') : period === 'month' ? L('عن الشهر اللي قبله', 'vs last month') : L('عن السنة اللي قبلها', 'vs last year')}</span>
          {r.change === undefined ? <b>—</b> : <b className={r.change <= 0 ? 'good' : 'bad'}>{r.change <= 0 ? '↓' : '↑'} {Math.abs(Math.round(r.change * 100))}%</b>}
          <span>{r.change === undefined ? L('ما فيه بيانات قبل', 'no earlier data') : r.total <= r.prevTotal ? L(`أقل بـ ${fmtNum(r.prevTotal - r.total)}`, `${fmtNum(r.prevTotal - r.total)} less`) : L(`أكثر بـ ${fmtNum(r.total - r.prevTotal)}`, `${fmtNum(r.total - r.prevTotal)} more`)}</span>
        </div>
      </div>

      <div className="card">
        <div className="m-wk">
          {r.buckets.map((b, i) => (
            <div key={i} className={b.current ? 'hi' : ''}>
              <small className="money">{b.total ? fmtNum(b.total) : ''}</small>
              <i style={{ height: `${Math.max(4, (b.total / maxB) * 100)}px` }} />
              {b.label}
            </div>
          ))}
        </div>
      </div>

      {period === 'month' && (
        <div className="card m-daily">
          <div className="t">{L('كل يوم من الشهر', 'Every day this month')}{r.dailyLine ? <span className="faint tiny"> · {L('الوردي تجاوزت حدّ اليوم', 'pink = over the daily line')}</span> : null}</div>
          <div className="bars">
            {r.dailyLine ? <div className="lim" style={{ bottom: `${(r.dailyLine / maxD) * 100}%` }}><span>{L('حدّ اليوم', 'daily line')}</span></div> : null}
            {r.daily.map((d) => (
              <i key={d.day} role={d.future ? undefined : 'link'} onClick={() => !d.future && go(`money/d?d=${d.day}`)} title={`${Number(d.day.slice(8))}: ${fmtMoney(d.total)}`} className={d.future ? 'f' : d.day === todayKey(now) ? 't' : r.dailyLine && d.total > r.dailyLine ? 'o' : ''} style={{ height: `${d.future ? 4 : Math.max(3, (d.total / maxD) * 100)}%` }} />
            ))}
          </div>
          <div className="axis"><span>1</span><span>10</span><span>20</span><span>{r.daily.length}</span></div>
        </div>
      )}

      {r.cats.length > 0 && (
        <div className="card m-cats-r">
          {r.cats.map((c) => {
            const info = catInfo(c.cat);
            return (
              <button key={c.cat} className="cr" onClick={() => go(`money/cat?c=${encodeURIComponent(c.cat)}&p=${period}`)}>
                <span className="em" style={{ background: info.bg }}>{info.emoji}</span>
                <span className="grow"><b>{info.label}</b><span className="mb"><i style={{ width: `${(c.total / r.cats[0].total) * 100}%`, background: info.color }} /></span></span>
                <span className="v"><b className="money">{fmtNum(c.total)}</b>{c.change !== undefined && <small className={c.change > 0 ? 'bad' : 'good'}>{c.change > 0 ? '↑' : '↓'} {Math.abs(Math.round(c.change * 100))}%</small>}</span>
              </button>
            );
          })}
        </div>
      )}

      {r.insights.length > 0 && (
        <section>
          <div className="group-title"><span>{L('ملاحظات', 'Notes')}</span></div>
          <div className="card m-ins">{r.insights.map((x, i) => <div key={i}><i>{x.emoji}</i><span>{x.text}</span></div>)}</div>
        </section>
      )}

      <section>
        <div className="group-title">
          <span>{L('الاشتراكات', 'Subscriptions')}{subs.length ? ` · ${fmtMoney(subsMonthly)} ${L('بالشهر', 'a month')}` : ''}</span>
          <button onClick={() => openSheet({ type: 'sub' })}>{L('+ اشتراك', '+ Subscription')}</button>
        </div>
        {subs.length ? (
          <div className="card m-list">
            {subs.map((x) => {
              const idle = subIdle(x, now);
              return (
                <button key={x.id} className="m-ex" onClick={() => openSheet({ type: 'sub', id: x.id })}>
                  <span className="em" style={{ background: catInfo('subs').bg }}>📺</span>
                  <span className="grow"><b>{x.name} · {fmtNum(x.amount)}</b><span>{L('يتجدد', 'Renews')} {fmtRenew(x.next, now)}{x.cycle === 'year' ? L(' · سنوي', ' · yearly') : ''}</span></span>
                  {idle !== undefined ? <span className="m-tag bad">{L('ما تستخدمه', 'unused')}</span> : <span className="m-tag good">{L('مستخدم', 'in use')}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="card faint small" style={{ padding: 14 }}>{L('أضف اشتراكاتك وأنبهك قبل التجديد، وأقول لك إذا فيه اشتراك ما تستخدمه.', "Add your subscriptions — I'll flag renewals and the ones you don't use.")}</div>
        )}
      </section>
    </div>
  );
}

const DAY_NAMES = () => L('الأحد الإثنين الثلاثاء الأربعاء الخميس الجمعة السبت', 'Sunday Monday Tuesday Wednesday Thursday Friday Saturday').split(' ');
const sumOf = (list: Expense[]) => list.reduce((a, e) => a + e.amount, 0);
const byTime = (a: Expense, b: Expense) => (b.time || '').localeCompare(a.time || '') || b.createdAt - a.createdAt;

/** «الأسبوع»: a calendar week, Sunday to Saturday — each day with its total; tap one for its purchases */
function WeekView({ now }: { now: number }) {
  const s = useApp();
  const r = useRoute();
  const today = todayKey(now);
  const thisWeek = addDays(today, -parseKey(today).getDay());
  const w = r.query.get('w') || thisWeek;
  const days = Array.from({ length: 7 }, (_, i) => addDays(w, i));
  const rows = days.map((d) => {
    const list = s.expenses.filter((e) => e.day === d);
    return { d, list, total: sumOf(list) };
  });
  const total = rows.reduce((a, x) => a + x.total, 0);
  const max = Math.max(1, ...rows.map((x) => x.total));
  const prev = sumOf(s.expenses.filter((e) => e.day >= addDays(w, -7) && e.day <= addDays(w, -1)));
  const cats = new Map<string, number>();
  for (const x of rows) for (const e of x.list) cats.set(e.cat, (cats.get(e.cat) || 0) + e.amount);
  const topCats = [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const goWeek = (k: number) => go(`money/week?w=${addDays(w, 7 * k)}`);
  return (
    <div className="stack">
      <div className="m-weeknav">
        <button className="icon-btn" aria-label={L('الأسبوع اللي قبل', 'Previous week')} onClick={() => goWeek(-1)}><Icon name="back" size={18} /></button>
        <div><b>{w === thisWeek ? L('هالأسبوع', 'This week') : w === addDays(thisWeek, -7) ? L('الأسبوع اللي فات', 'Last week') : `${fmtDate(w, false)} – ${fmtDate(addDays(w, 6), false)}`}</b><span className="money">{fmtMoney(total)}</span></div>
        <button className="icon-btn" aria-label={L('الأسبوع اللي بعد', 'Next week')} disabled={w >= thisWeek} onClick={() => goWeek(1)}><Icon name="chevron" size={18} /></button>
      </div>
      {prev > 0 && <p className="faint small" style={{ margin: '0 4px' }}>{total <= prev ? L(`أقل من الأسبوع اللي قبله بـ ${fmtMoney(prev - total)}`, `${fmtMoney(prev - total)} less than the week before`) : L(`أكثر من الأسبوع اللي قبله بـ ${fmtMoney(total - prev)}`, `${fmtMoney(total - prev)} more than the week before`)}</p>}
      <div className="card m-days">
        {rows.map((x) => (
          <button key={x.d} className={`${x.d === today ? 'today' : ''} ${x.d > today ? 'later' : ''}`} disabled={x.d > today} onClick={() => go(`money/d?d=${x.d}`)}>
            <span className="n"><b>{DAY_NAMES()[parseKey(x.d).getDay()]}</b><small>{fmtDate(x.d, false)}</small></span>
            <span className="bar"><i style={{ width: `${(x.total / max) * 100}%` }} /></span>
            <span className="v"><b className="money">{x.total ? fmtNum(x.total) : '—'}</b><small>{x.list.length ? L(buysAr(x.list.length), `${x.list.length} items`) : x.d > today ? '' : L('بدون صرف', 'no spend')}</small></span>
            {x.d <= today && <Icon name="chevron" size={14} className="chev-end" />}
          </button>
        ))}
      </div>
      {topCats.length > 0 && (
        <section>
          <div className="group-title"><span>{L('على وش صرفت', 'Where it went')}</span></div>
          <div className="card m-cats-r">
            {topCats.map(([cat, t]) => {
              const info = catInfo(cat);
              return (
                <button key={cat} className="cr" onClick={() => go(`money/cat?c=${encodeURIComponent(cat)}&p=week&w=${w}`)}>
                  <span className="em" style={{ background: info.bg }}>{info.emoji}</span>
                  <span className="grow"><b>{info.label}</b><span className="mb"><i style={{ width: `${(t / topCats[0][1]) * 100}%`, background: info.color }} /></span></span>
                  <span className="v"><b className="money">{fmtNum(t)}</b></span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/** one day: its purchases, newest first; tap one to edit it */
function DayPage({ day }: { day: string }) {
  const s = useApp();
  const today = todayKey();
  const list = s.expenses.filter((e) => e.day === day).sort(byTime);
  const total = sumOf(list);
  const w = addDays(day, -parseKey(day).getDay());
  return (
    <div>
      <PageTop title={`${DAY_NAMES()[parseKey(day).getDay()]} ${fmtDate(day, false)}`} sub={list.length ? L(`${fmtMoney(total)} · ${buysAr(list.length)}`, `${fmtMoney(total)} · ${list.length} items`) : L('ما صرفت شي هاليوم', 'Nothing spent this day')} back={{ label: L('الأسبوع', 'Week'), to: `money/week?w=${w}` }} />
      <div className="m-weeknav sm">
        <button className="icon-btn" aria-label={L('اليوم اللي قبل', 'Previous day')} onClick={() => go(`money/d?d=${addDays(day, -1)}`)}><Icon name="back" size={18} /></button>
        <b>{relDay(day, today)}</b>
        <button className="icon-btn" aria-label={L('اليوم اللي بعد', 'Next day')} disabled={day >= today} onClick={() => go(`money/d?d=${addDays(day, 1)}`)}><Icon name="chevron" size={18} /></button>
      </div>
      {list.length ? <div className="card m-list">{list.map((e) => <ExpenseRow key={e.id} e={e} />)}</div> : (
        <div className="card"><Empty icon="wallet" title={L('يوم بدون صرف 🌱', 'A no-spend day 🌱')} /></div>
      )}
    </div>
  );
}

/** one category: its purchases in the period, grouped by day, each with amount and time */
function CatPage({ cat, period }: { cat: string; period: Period }) {
  const s = useApp();
  const r = useRoute();
  const today = todayKey();
  const w = r.query.get('w');
  const [from, to] = period === 'week' && w ? [w, addDays(w, 6)] : rangeOf(period, today);
  const info = catInfo(cat);
  const list = s.expenses.filter((e) => e.cat === cat && e.day >= from && e.day <= to).sort((a, b) => b.day.localeCompare(a.day) || byTime(a, b));
  const total = sumOf(list);
  const days: { day: string; items: Expense[]; total: number }[] = [];
  for (const e of list) {
    let g = days.find((x) => x.day === e.day);
    if (!g) days.push((g = { day: e.day, items: [], total: 0 }));
    g.items.push(e);
    g.total += e.amount;
  }
  return (
    <div>
      <PageTop title={`${info.emoji} ${info.label}`} sub={list.length ? L(`${fmtMoney(total)} · ${list.length === 1 ? 'مرة' : list.length === 2 ? 'مرتين' : `${list.length} مرات`} · متوسط ${fmtMoney(total / list.length)}`, `${fmtMoney(total)} · ${list.length} times · avg ${fmtMoney(total / list.length)}`) : L('ما فيه مشتريات بهالفترة', 'No purchases in this period')} back={{ label: L('مصاريفي', 'Spending'), to: period === 'week' && w ? `money/week?w=${w}` : 'money/report' }} />
      <div style={{ marginBottom: 14 }}>
        <Seg value={period} onChange={(p) => go(`money/cat?c=${encodeURIComponent(cat)}&p=${p}`)} options={[{ v: 'week', l: L('الأسبوع', 'Week') }, { v: 'month', l: L('الشهر', 'Month') }, { v: 'year', l: L('السنة', 'Year') }]} />
      </div>
      <p className="faint small" style={{ margin: '0 4px 12px' }}>{fmtDate(from, false)} – {fmtDate(to, false)}</p>
      {days.length ? days.map((g) => (
        <section key={g.day}>
          <div className="group-title"><button className="m-daylink" onClick={() => go(`money/d?d=${g.day}`)}>{relDay(g.day, today)} · {fmtDate(g.day, false)}</button><span className="money">{fmtMoney(g.total)}</span></div>
          <div className="card m-list">{g.items.map((e) => <ExpenseRow key={e.id} e={e} />)}</div>
        </section>
      )) : <div className="card"><Empty icon="wallet" title={L('ما صرفت على هالتصنيف بهالفترة 👏', 'Nothing in this category for this period 👏')} /></div>}
    </div>
  );
}

/** small tile for the Today page */
export function MoneyTile({ now }: { now: number }) {
  const s = useApp();
  const m = moneyToday(s, now);
  if (!m.budget && !s.expenses.some((e) => e.day >= addDays(todayKey(now), -6))) return null;
  const over = m.allowance !== undefined && m.spentToday > m.allowance;
  return (
    <div>
    <button className="tile m-tile" onClick={() => go('money')}>
      <div className="k2 row between"><span><Icon name="wallet" size={15} /> {L('مصاريف اليوم', "Today's spending")}</span><Icon name="chevron" size={14} /></div>
      {m.allowance !== undefined ? (
        <>
          <div className="m-tile-v"><b className={`money ${over ? 'bad' : ''}`}>{fmtNum(m.spentToday)}</b> <span>{L(`من ${fmtNum(m.allowance)} ر.س`, `of ${fmtNum(m.allowance)} SAR`)}</span></div>
          <div className="m-tile-bar"><i className={over ? 'bad' : ''} style={{ width: `${Math.min(100, (m.spentToday / Math.max(1, m.allowance)) * 100)}%` }} /></div>
          {over && <div className="tiny bad">{L(`تجاوزت حدّ اليوم بـ ${fmtNum(m.spentToday - m.allowance)} ر.س`, `${fmtNum(m.spentToday - m.allowance)} SAR over today's line`)}</div>}
        </>
      ) : (
        <div className="m-tile-v"><b className="money">{fmtNum(m.spentToday)}</b> <span>{L('ر.س اليوم', 'SAR today')}</span></div>
      )}
    </button>
    </div>
  );
}
