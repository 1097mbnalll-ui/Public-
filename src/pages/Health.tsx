import { useMemo, useState } from 'react';
import { Collapse, Empty, Seg, Sheet, Switch, useNow } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { PageTop } from '../ui/PageTop';
import { closeSheet, openSheet } from '../ui/sheets';
import { go, useRoute } from '../ui/router';
import { toast } from '../ui/toast';
import { getState, useApp } from '../lib/store';
import * as A from '../lib/actions';
import { addDays, fmtDate, todayKey } from '../lib/dates';
import {
  allFoods, alternatives, amountText, blankDay, budgets, checkIn, checkInDue, dayIntake, dayOf, dayTarget, foodOf, fromTemplate, gramsText, limitFor, macros, mealIntake,
  proteinShort, shopping, slotName, slotsOf, startTargets, totals, trend, weeksToGoal, paceToReach, earliestSafe, MAX_PACE, MIN_PACE,
} from '../lib/engine/diet';
import { DISH } from '../lib/engine/foods';
import type { AppState, DietMeal, DietSetup, FoodKind } from '../lib/types';
import { L } from '../lib/i18n';
import { GymBody, GymTabs } from './Gym';

// «صحتي»: what you eat («أكلي»), your body («جسمي») and, when it's on, the gym («تمريني»).
// The meal plan: one number to watch (what's left today), the meals in order, each a tap away.

const n0 = (x: number) => Math.round(x).toLocaleString('en');
const WD = () => L('ح ن ث ر خ ج س', 'S M T W T F S').split(' ');
const KIND_COLOR: Record<string, string> = { starch: '#E8D3A2', protein: '#B97A45', veg: '#8CC47A', other: '#E9A23B' };
const group = (k: FoodKind) => (k === 'starch' || k === 'mixed' ? 'starch' : k === 'protein' || k === 'dairy' ? 'protein' : k === 'veg' ? 'veg' : 'other');
const GROUP_NAME: Record<string, () => string> = { starch: () => L('نشويات', 'Starch'), protein: () => L('بروتين', 'Protein'), veg: () => L('خضار', 'Veg'), other: () => L('غيرها', 'Other') };

export function Health() {
  const s = useApp();
  const id = useRoute().id;
  const sec = s.settings.sections || {};
  if (id === 'meal') return <MealPage />;
  if (id === 'build') return <BuildPage />;
  if (id === 'week') return <WeekPage />;
  if (id === 'shop') return <ShopPage />;
  if (id === 'foods') return <FoodsPage />;
  const tabs = [...(sec.diet ? [{ v: 'diet', l: L('أكلي', 'Food') }] : []), ...(sec.diet || sec.gym ? [{ v: 'body', l: L('جسمي', 'Body') }] : []), ...(sec.gym ? [{ v: 'gym', l: L('تمريني', 'Train') }] : [])];
  const tab = id === 'moves' ? 'gym' : tabs.find((t) => t.v === id)?.v ?? tabs[0]?.v;
  return (
    <div className="hl">
      <PageTop title={L('صحتي', 'Health')} />
      {!tabs.length ? (
        <Empty icon="gym" title={L('ما فعّلت شي هنا', 'Nothing switched on here')}>
          <button className="btn sm primary" onClick={() => go('me')}>{L('فعّل من «الأقسام» في الإعدادات', 'Turn it on in Settings › Sections')}</button>
        </Empty>
      ) : (
        <>
          {tabs.length > 1 && (
            <div className="hl-tabs" role="tablist">
              {tabs.map((t) => <button key={t.v} role="tab" aria-selected={tab === t.v} className={tab === t.v ? 'on' : ''} onClick={() => go(t.v === tabs[0].v ? 'health' : `health/${t.v}`)}>{t.l}</button>)}
            </div>
          )}
          {tab === 'diet' ? <DietHome /> : tab === 'body' ? <GymBody /> : <GymTabs tab={id === 'moves' ? 'moves' : 'train'} />}
        </>
      )}
    </div>
  );
}

// ---------------- pieces ----------------

function Ring({ left, total, eaten }: { left: number; total: number; eaten: number }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, total ? eaten / total : 0);
  const over = left < 0;
  return (
    <svg className="hl-ring" width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={over ? L(`زدت ${n0(-left)} سعرة`, `${n0(-left)} kcal over`) : L(`باقي ${n0(left)} من ${n0(total)} سعرة`, `${n0(left)} of ${n0(total)} kcal left`)}>
      <circle cx="66" cy="66" r={r} className="track" />
      <circle cx="66" cy="66" r={r} className={`bar ${over ? 'over' : ''}`} strokeDasharray={`${frac * c} ${c}`} transform="rotate(-90 66 66)" />
      <text x="66" y="64" textAnchor="middle" className="v">{n0(Math.abs(left))}</text>
      <text x="66" y="86" textAnchor="middle" className="k">{over ? L('زيادة', 'over') : L(`باقي من ${n0(total)}`, `left of ${n0(total)}`)}</text>
    </svg>
  );
}

function Macro({ label, v, of, cls }: { label: string; v: number; of: number; cls: string }) {
  return (
    <div className="hl-mac">
      <div><span>{label}</span><small className="num">{v} / {of} {L('جم', 'g')}</small></div>
      <i><b className={cls} style={{ width: `${Math.min(100, of ? (v / of) * 100 : 0)}%` }} /></i>
    </div>
  );
}

/** a plate split by what's on it (by weight, so a salad looks like half the plate) */
function Plate({ s, items, size = 44, labels }: { s: AppState; items: { food: string; qty: number }[]; size?: number; labels?: boolean }) {
  const parts = new Map<string, number>();
  for (const it of items) { const f = foodOf(s, it.food); if (f) parts.set(group(f.kind), (parts.get(group(f.kind)) || 0) + f.g * it.qty); }
  const sum = [...parts.values()].reduce((a, b) => a + b, 0);
  const R = size / 2;
  const r = R * 0.8;
  let a0 = -Math.PI / 2;
  const segs = [...parts.entries()].sort((a, b) => b[1] - a[1]).map(([k, g]) => {
    const a1 = a0 + (g / (sum || 1)) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number) => `${R + r * Math.cos(a)} ${R + r * Math.sin(a)}`;
    const mid = (a0 + a1) / 2;
    const seg = { k, d: a1 - a0 >= Math.PI * 2 - 1e-6 ? '' : `M${R} ${R} L${p(a0)} A${r} ${r} 0 ${large} 1 ${p(a1)} Z`, lx: R + r * 0.55 * Math.cos(mid), ly: R + r * 0.55 * Math.sin(mid), big: a1 - a0 > 0.6 };
    a0 = a1;
    return seg;
  });
  return (
    <svg className="hl-plate" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden={!labels} role={labels ? 'img' : undefined} aria-label={labels ? [...parts.keys()].map((k) => GROUP_NAME[k]()).join('، ') : undefined}>
      <circle cx={R} cy={R} r={R - 1} className="rim" />
      {segs.map((x) => (x.d ? <path key={x.k} d={x.d} fill={KIND_COLOR[x.k]} /> : <circle key={x.k} cx={R} cy={R} r={r} fill={KIND_COLOR[x.k]} />))}
      {labels && segs.filter((x) => x.big).map((x) => <text key={`t${x.k}`} x={x.lx} y={x.ly + 5} textAnchor="middle" className="pl">{GROUP_NAME[x.k]()}</text>)}
    </svg>
  );
}

/** the day being looked at (from ?d=), today by default */
const useDay = () => {
  const q = useRoute().query.get('d');
  return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayKey();
};

// ---------------- أكلي ----------------

function DietHome() {
  const s = useApp();
  const now = useNow(60_000);
  const today = todayKey(now);
  const [day, setDay] = useState(today);
  if (!s.diet.setup || s.diet.kcal == null) return <DietWelcome />;
  const d = dayOf(s, day);
  const target = dayTarget(s, day);
  const eaten = d.meals.filter((m) => m.eaten).reduce((a, m) => { const x = mealIntake(s, m); return { kcal: a.kcal + x.kcal, p: a.p + x.p }; }, { kcal: 0, p: 0 });
  const eatenMac = d.meals.filter((m) => m.eaten && m.eaten !== 'other').reduce((a, m) => { const t = totals(s, m.items); return { c: a.c + t.c, f: a.f + t.f }; }, { c: 0, f: 0 });
  const mac = macros(target, s.diet.protein ?? 0);
  const slots = slotsOf(s.diet.setup);
  const next = d.meals.findIndex((m) => !m.eaten);
  const strip = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const due = checkInDue(s, now);
  return (
    <div className="hl-diet">
      <div className="hl-strip">
        {strip.map((k) => {
          const st = s.diet.days[k];
          const kc = st ? dayIntake(s, st).kcal : 0;
          const dot = !st || !st.meals.some((m) => m.eaten) ? '' : Math.abs(kc - dayTarget(s, k)) <= dayTarget(s, k) * 0.1 ? 'ok' : 'off';
          return (
            <button key={k} className={k === day ? 'on' : ''} onClick={() => setDay(k)} aria-pressed={k === day}>
              <span>{WD()[new Date(`${k}T12:00:00`).getDay()]}</span>
              <b className="num">{+k.slice(8)}</b>
              <i className={dot} />
            </button>
          );
        })}
      </div>

      <section className="hl-sum">
        <Ring left={target - eaten.kcal} total={target} eaten={eaten.kcal} />
        <div className="hl-macs">
          <Macro label={L('بروتين', 'Protein')} v={eaten.p} of={mac.protein} cls="p" />
          <Macro label={L('نشويات', 'Carbs')} v={eatenMac.c} of={mac.carbs} cls="c" />
          <Macro label={L('دهون', 'Fat')} v={eatenMac.f} of={mac.fat} cls="f" />
        </div>
      </section>

      {due && (
        <button className="hl-due" onClick={() => go('health/week')}>
          <span className="m"><small>{L('صار لك أسبوع', 'A week has passed')}</small><b>{L('شوف وزنك وعدّل خطتك', 'See your weight, adjust the plan')}</b></span>
          <Icon name="chevron" size={16} className="chev-end" />
        </button>
      )}

      <section className="hl-meals">
        <div className="hl-h">
          <h2>{day === today ? L('وجبات اليوم', 'Today’s meals') : fmtDate(day)}</h2>
          <button onClick={() => go(`health/build?d=${day}`)}>{d.built ? L('عدّل جدولك', 'Edit your day') : L('اصنع جدولك', 'Build your day')}</button>
        </div>
        {d.meals.map((m, i) => {
          const t = mealIntake(s, m);
          const dish = m.dish ? DISH.get(m.dish) : undefined;
          const title = m.eaten === 'other' ? (m.other?.note || L('أكلت شي ثاني', 'Something else')) : dish ? L(...dish.t) : m.items.length ? m.items.slice(0, 2).map((it) => foodOf(s, it.food)?.name).filter(Boolean).join(' + ') + (m.items.length > 2 ? ' …' : '') : L('فاضية', 'Empty');
          const isNext = i === next && day === today;
          return (
            <button key={i} className={`hl-meal ${m.eaten ? 'done' : ''} ${isNext ? 'next' : ''}`} onClick={() => go(`health/meal?d=${day}&i=${i}`)}>
              <Plate s={s} items={m.items} size={isNext ? 52 : 44} />
              <span className="m">
                <small>{slotName(m.slot, i, slots)}{isNext ? L(' · الحين', ' · now') : ''}</small>
                <b>{title}</b>
                {isNext && <small className="faint">{L('انقر للمزيد', 'Tap for more')}</small>}
              </span>
              <span className="k num">{m.eaten ? <Icon name="check" size={15} /> : null}{n0(t.kcal)}</span>
            </button>
          );
        })}
      </section>

      <div className="hl-links">
        <button className="td-pill" onClick={() => go('health/shop')}>{L('قائمة المشتريات', 'Shopping list')}</button>
        <button className="td-pill" onClick={() => go('health/week')}>{L('أسبوعي', 'My week')}</button>
        <button className="td-pill" onClick={() => go('health/foods')}>{L('أكلاتي', 'My foods')}</button>
        <button className="td-pill" onClick={() => openSheet({ type: 'diet-setup' })}><Icon name="settings" size={14} /></button>
      </div>
    </div>
  );
}

function DietWelcome() {
  return (
    <section className="hl-welcome">
      <Plate s={getState()} items={[{ food: 'salad', qty: 1 }, { food: 'rice_white', qty: 4 }, { food: 'chicken_breast', qty: 1 }]} size={120} />
      <h2>{L('جدول أكل جاهز لنزول الوزن', 'A ready meal plan for losing weight')}</h2>
      <ul>
        <li>{L('من أكل بيتكم ومن أكلات بسيطة تطبخها، بالملاعق والجرام', 'From your family’s food and simple meals you cook, in spoons and grams')}</li>
        <li>{L('أو اصنع جدولك بنفسك، والنظام يمنعك تتجاوز حدك', 'Or build your own; the system keeps you within your limits')}</li>
        <li>{L('كل أسبوع يتعدّل من وزنك الحقيقي', 'Adjusted every week from your real weight')}</li>
      </ul>
      <button className="btn primary" onClick={() => openSheet({ type: 'diet-setup' })}>{L('ابدأ', 'Start')}</button>
      <small className="faint">{L('إذا عندك سكري أو مرض مزمن أو حامل، استشر طبيبك قبل أي خطة.', 'If you have diabetes, a chronic illness or are pregnant, ask your doctor first.')}</small>
    </section>
  );
}

// ---------------- one meal ----------------

function MealPage() {
  const s = useApp();
  const day = useDay();
  const i = +(useRoute().query.get('i') || 0);
  const [swap, setSwap] = useState(false);
  const d = dayOf(s, day);
  const m = d.meals[i];
  if (!s.diet.setup || !m) return <div className="hl"><PageTop title={L('أكلي', 'Food')} back={{ label: L('أكلي', 'Food'), to: 'health' }} /></div>;
  const slots = slotsOf(s.diet.setup);
  const t = totals(s, m.items);
  const dish = m.dish ? DISH.get(m.dish) : undefined;
  const save = (meals: DietMeal[]) => A.saveDietDay({ ...d, meals });
  const mark = (eaten?: 'yes') => { save(d.meals.map((x, k) => (k === i ? { ...x, eaten, other: undefined } : x))); if (eaten) { toast(L('بالعافية ✓', 'Enjoy ✓')); go('health'); } };
  const alts = swap ? alternatives(s, d, i) : [];
  return (
    <div className="hl hl-mealp">
      <div className="hl-top">
        <button className="icon-btn" aria-label={L('رجوع', 'Back')} onClick={() => go('health')}><Icon name="back" /></button>
        <span>{slotName(m.slot, i, slots)} · {day === todayKey() ? L('اليوم', 'today') : fmtDate(day)}</span>
        {!d.built ? <button className="icon-btn" aria-label={L('بدّل الوجبة', 'Swap meal')} aria-pressed={swap} onClick={() => setSwap(!swap)}><Icon name="repeat" /></button> : <button className="icon-btn" aria-label={L('عدّل', 'Edit')} onClick={() => go(`health/build?d=${day}&i=${i}`)}><Icon name="edit" /></button>}
      </div>
      <div className="hl-hero">
        <Plate s={s} items={m.items} size={200} labels />
        <h1>{dish ? L(...dish.t) : L('وجبتك', 'Your meal')}</h1>
        <div className="hl-chips">
          <span className="k">{n0(t.kcal)} {L('سعرة', 'kcal')}</span>
          <span className="p">{L('بروتين', 'Protein')} {t.p}</span>
          <span className="c">{L('نشويات', 'Carbs')} {t.c}</span>
          <span className="f">{L('دهون', 'Fat')} {t.f}</span>
        </div>
      </div>
      {swap ? (
        <section className="hl-list">
          <div className="hl-h"><h2>{L('بدّلها بـ', 'Swap for')}</h2><small>{L('نفس السعرات تقريبًا', 'About the same calories')}</small></div>
          {alts.map((a, k) => {
            const ad = a.dish ? DISH.get(a.dish) : undefined;
            return (
              <button key={k} className="hl-row" onClick={() => { save(d.meals.map((x, j) => (j === i ? a : x))); setSwap(false); toast(L('تبدّلت', 'Swapped')); }}>
                <Plate s={s} items={a.items} size={36} />
                <span className="m"><b>{ad ? L(...ad.t) : ''}</b><small>{ad?.family ? L('من أكل البيت', 'From the family’s food') : ad?.cook ? L(`تطبخها · ${ad.cook.min} د`, `You cook it · ${ad.cook.min} min`) : ''}</small></span>
                <span className="k num">{n0(totals(s, a.items).kcal)}</span>
              </button>
            );
          })}
        </section>
      ) : (
        <>
          <section className="hl-list">
            {m.items.map((it, k) => {
              const f = foodOf(s, it.food);
              if (!f) return null;
              return (
                <div key={k} className="hl-item">
                  <i style={{ background: KIND_COLOR[group(f.kind)] }} />
                  <span className="n">{f.name}</span>
                  <b>{f.free ? L('بلا حد', 'freely') : amountText(f, it.qty)}</b>
                  <small className="num">{gramsText(f, it.qty)}</small>
                </div>
              );
            })}
          </section>
          {dish?.cook && !dish.family && (
            <Collapse title={L(`طريقة التحضير · ${dish.cook.min} د`, `How to make it · ${dish.cook.min} min`)}>
              <ol className="hl-steps">{dish.cook.steps.map((x, k) => <li key={k}>{L(...x)}</li>)}</ol>
            </Collapse>
          )}
        </>
      )}
      {m.eaten ? (
        <div className="hl-acts">
          <span className="hl-eaten"><Icon name="check" size={16} /> {m.eaten === 'other' ? L(`أكلت شي ثاني · ${n0(m.other?.kcal || 0)} سعرة`, `Ate something else · ${n0(m.other?.kcal || 0)} kcal`) : L('أكلتها', 'Eaten')}</span>
          <button className="btn ghost" onClick={() => mark(undefined)}>{L('تراجع', 'Undo')}</button>
        </div>
      ) : (
        <div className="hl-acts">
          <button className="hl-cta" onClick={() => mark('yes')}>{L('أكلتها', 'Ate it')}</button>
          <button className="btn" onClick={() => openSheet({ type: 'diet-other', day, i })}>{L('أكلت غيرها', 'Ate something else')}</button>
        </div>
      )}
    </div>
  );
}

/** «أكلت شي ثاني»: about how much — the weekly check-in counts it */
export function DietOtherSheet({ day, i }: { day: string; i: number }) {
  const s = useApp();
  const d = dayOf(s, day);
  const m = d.meals[i];
  const planned = m ? totals(s, m.items) : { kcal: 0, p: 0 };
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [note, setNote] = useState('');
  const ok = +kcal > 0;
  const quick = [{ l: L('نفسها تقريبًا', 'About the same'), k: 1 }, { l: L('أكثر بالنص', 'Half as much again'), k: 1.5 }, { l: L('ضعفها', 'Double'), k: 2 }, { l: L('أقل', 'Less'), k: 0.6 }];
  return (
    <Sheet title={L('وش أكلت بدالها؟', 'What did you eat instead?')} onClose={closeSheet} footer={
      <button className="btn primary grow" disabled={!ok} onClick={() => { A.saveDietDay({ ...d, meals: d.meals.map((x, k) => (k === i ? { ...x, eaten: 'other', other: { kcal: Math.round(+kcal), protein: Math.round(+p || 0), ...(note.trim() ? { note: note.trim().slice(0, 80) } : {}) } } : x)) }); closeSheet(); go('health'); }}>{L('احفظ', 'Save')}</button>
    }>
      <div className="fields">
        <p className="muted small" style={{ margin: 0 }}>{L('ما يحتاج دقة. التعديل الأسبوعي يصحح من وزنك.', 'No need to be exact — the weekly check-in corrects from your weight.')}</p>
        <div className="row wrap" style={{ gap: 6 }}>{quick.map((q) => <button key={q.k} className="chip btnish" onClick={() => { setKcal(String(Math.round(planned.kcal * q.k))); setP(String(Math.round(planned.p * q.k))); }}>{q.l}</button>)}</div>
        <label className="field"><span>{L('السعرات تقريبًا', 'Calories, roughly')}</span><input className="input num" type="number" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} /></label>
        <label className="field"><span>{L('البروتين (اختياري)', 'Protein (optional)')}</span><input className="input num" type="number" inputMode="numeric" value={p} onChange={(e) => setP(e.target.value)} /></label>
        <label className="field"><span>{L('وش كان؟ (اختياري)', 'What was it? (optional)')}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} /></label>
      </div>
    </Sheet>
  );
}

// ---------------- build your own ----------------

function BuildPage() {
  const s = useApp();
  const day = useDay();
  const q = useRoute().query.get('i');
  const setup = s.diet.setup;
  const stored = s.diet.days[day];
  const d = stored?.built ? stored : blankDay(s, day);
  const [sel, setSel] = useState(() => (q != null ? +q : Math.max(0, d.meals.findIndex((m) => !m.items.length))));
  if (!setup) return null;
  const slots = slotsOf(setup);
  const bud = budgets(s, day);
  const target = dayTarget(s, day);
  const used = dayIntake(s, d).kcal;
  const m = d.meals[sel] || d.meals[0];
  const mt = totals(s, m.items).kcal;
  const short = proteinShort(s, d);
  const colors = ['#E9A23B', '#C9502C', '#8C6BD8', '#3C9D74', '#D86F9B', '#4D8FD1', '#B58B3F'];
  return (
    <div className="hl hl-build">
      <div className="hl-top">
        <button className="icon-btn" aria-label={L('رجوع', 'Back')} onClick={() => go('health')}><Icon name="back" /></button>
        <h1>{L('اصنع جدولك', 'Build your day')}</h1>
        <button className="btn sm ghost" disabled={!used} onClick={() => { const name = prompt(L('اسم القالب؟ مثلًا «يوم الكبسة»', 'Template name?')); if (name != null) { A.saveDietTemplate(name, d.meals); toast(L('انحفظ القالب', 'Template saved')); } }}>{L('احفظ قالب', 'Save template')}</button>
      </div>

      <section className="hl-card">
        <div className="hl-h"><small>{day === todayKey() ? L('يومك', 'Your day') : fmtDate(day)}</small><span className="num"><b>{n0(used)}</b> / {n0(target)}</span></div>
        <div className="hl-stack">{d.meals.map((x, k) => <b key={k} style={{ width: `${(totals(s, x.items).kcal / Math.max(1, target)) * 100}%`, background: colors[k % colors.length] }} />)}</div>
        <div className="hl-legend">{d.meals.map((x, k) => <span key={k}><i style={{ background: colors[k % colors.length] }} />{slotName(x.slot, k, slots)} {n0(totals(s, x.items).kcal)}</span>)}</div>
      </section>

      <div className="hl-slots">
        {d.meals.map((x, k) => {
          const full = totals(s, x.items).kcal >= bud[k] * 0.95;
          return <button key={k} className={k === sel ? 'on' : ''} onClick={() => setSel(k)}>{slotName(x.slot, k, slots)}{full ? ' ✓' : ''}</button>;
        })}
      </div>

      <section className="hl-card">
        <div className="hl-h"><b>{slotName(m.slot, sel, slots)}</b><small className="num">{L(`باقي ${n0(Math.max(0, bud[sel] - mt))} من ${n0(bud[sel])}`, `${n0(Math.max(0, bud[sel] - mt))} of ${n0(bud[sel])} left`)}</small></div>
        {m.items.map((it, k) => {
          const f = foodOf(s, it.food);
          return f ? (
            <button key={k} className="hl-brow" onClick={() => openSheet({ type: 'diet-pick', day, i: sel, food: it.food, at: k })}>
              <span>{f.name} · {amountText(f, it.qty)}</span><span className="num">{n0(f.kcal * it.qty)}</span>
            </button>
          ) : null;
        })}
        <button className="hl-add" onClick={() => openSheet({ type: 'diet-pick', day, i: sel })}>+ {L(`أضف لـ${slotName(m.slot, sel, slots)}`, `Add to ${slotName(m.slot, sel, slots)}`)}</button>
      </section>

      {short > 0 && used > target * 0.5 && <p className="hl-note">{L(`البروتين ناقص ${short} جم — خلّ الباقي دجاج أو تونة أو بيض أو زبادي يوناني.`, `Protein is ${short} g short — make the rest chicken, tuna, eggs or Greek yogurt.`)}</p>}

      {s.diet.templates.length > 0 && (
        <Collapse title={L('قوالبك', 'Your templates')} count={s.diet.templates.length}>
          <div className="hl-list">
            {s.diet.templates.map((t) => (
              <div key={t.id} className="hl-row">
                <button className="m" onClick={() => { A.saveDietDay(fromTemplate(s, t.meals, day)); toast(L('تطبّق القالب على أرقام يومك', 'Template applied to today’s numbers')); }}><b>{t.name}</b></button>
                <button className="icon-btn sm" aria-label={L('احذف', 'Delete')} onClick={() => A.deleteDietTemplate(t.id)}><Icon name="trash" size={14} /></button>
              </div>
            ))}
          </div>
        </Collapse>
      )}
      {stored && <button className="btn ghost sm" onClick={() => { A.dropDietDay(day); go('health'); }}>{L('رجّع الجدول الجاهز لهاليوم', 'Back to the ready plan for this day')}</button>}
    </div>
  );
}

/** pick a food and how much — the + stops at the limit and says why */
export function DietPickSheet({ day, i, food: food0, at }: { day: string; i: number; food?: string; at?: number }) {
  const s = useApp();
  const setup = s.diet.setup!;
  const stored = s.diet.days[day];
  const d = stored?.built ? stored : blankDay(s, day);
  const [food, setFood] = useState<string | undefined>(food0);
  const [q, setQ] = useState('');
  const editing = at != null && d.meals[i]?.items[at]?.food === food;
  const f = food ? foodOf(s, food) : undefined;
  const lim = f ? limitFor(s, d, i, f.id, editing ? at : undefined) : null;
  const [qty, setQty] = useState<number | null>(null);
  const cur = qty ?? (editing ? d.meals[i].items[at!].qty : f ? Math.min(f.step === 0.5 && f.kcal > 150 ? 0.5 : 1, lim?.max ?? 1) : 1);
  const list = useMemo(() => {
    const t = q.trim();
    return allFoods(s).filter((x) => !x.tags.some((tg) => setup.avoid.includes(tg)) && (!t || x.name.includes(t)));
  }, [s, q, setup.avoid]);
  const slots = slotsOf(setup);
  const meal = slotName(d.meals[i].slot, i, slots);
  const why = !lim ? '' : lim.by === 'kind' ? (f && (f.kind === 'starch' || f.kind === 'mixed') ? L(`النشويات حدها نص ${meal}.`, `Starch is capped at half of ${meal}.`) : L(`الدهون والحلا والمشروبات حدها خُمس ${meal}.`, `Fats, sweets and sugary drinks are capped at a fifth of ${meal}.`)) : lim.by === 'day' ? L('وصلت حد يومك.', 'You’ve reached your day’s limit.') : L(`هذا أقصى شي لـ${meal}: باقي له ${n0(lim.room)} سعرة.`, `That’s the most ${meal} can take: ${n0(lim.room)} kcal left.`);
  const save = () => {
    if (!f || cur <= 0) return;
    const meals = d.meals.map((m, k) => {
      if (k !== i) return m;
      const items = [...m.items];
      if (editing) items[at!] = { food: f.id, qty: cur };
      else {
        const j = items.findIndex((x) => x.food === f.id);
        if (j >= 0) items[j] = { food: f.id, qty: items[j].qty + cur };
        else items.push({ food: f.id, qty: cur });
      }
      return { ...m, items };
    });
    A.saveDietDay({ ...d, built: true, meals });
    closeSheet();
  };
  const remove = () => { A.saveDietDay({ ...d, built: true, meals: d.meals.map((m, k) => (k === i ? { ...m, items: m.items.filter((_, j) => j !== at) } : m)) }); closeSheet(); };
  if (!f) {
    return (
      <Sheet title={L(`أضف لـ${meal}`, `Add to ${meal}`)} onClose={closeSheet}>
        <div className="fields">
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('ابحث: رز، دجاج، تمر…', 'Search: rice, chicken, dates…')} aria-label={L('بحث', 'Search')} />
          <div className="hl-list">
            {list.map((x) => (
              <button key={x.id} className="hl-row" onClick={() => setFood(x.id)}>
                <i className="hl-dot" style={{ background: KIND_COLOR[group(x.kind)] }} />
                <span className="m"><b>{x.name}{x.own ? L(' · أكلتك', ' · yours') : ''}</b><small>{n0(x.kcal)} {L('سعرة لكل', 'kcal per')} {x.unit[0]}</small></span>
              </button>
            ))}
          </div>
          <button className="btn sm ghost" onClick={() => { closeSheet(); openSheet({ type: 'diet-food' }); }}>+ {L('أكلة من عندي', 'A food of my own')}</button>
        </div>
      </Sheet>
    );
  }
  const can = lim ? cur + f.step <= lim.max + 1e-9 : true;
  const fits = lim ? cur <= lim.max + 1e-9 : true;
  return (
    <Sheet title={f.name} onClose={closeSheet} footer={
      <>
        <button className="btn primary grow" disabled={!fits || cur <= 0} onClick={save}>{editing ? L('احفظ', 'Save') : L(`أضف لـ${meal}`, `Add to ${meal}`)} · {n0(f.kcal * cur)}</button>
        {editing && <button className="btn ghost" aria-label={L('احذف', 'Remove')} onClick={remove}><Icon name="trash" size={15} /></button>}
      </>
    }>
      <div className="hl-pick">
        <small className="faint">{n0(f.kcal)} {L('سعرة لكل', 'kcal per')} {f.unit[0]}</small>
        <div className="hl-step">
          <button aria-label={L('أقل', 'Less')} disabled={cur <= f.step} onClick={() => setQty(Math.max(f.step, cur - f.step))}>−</button>
          <div><b>{amountText(f, cur)}</b><small className="num">{gramsText(f, cur)} · {n0(f.kcal * cur)} {L('سعرة', 'kcal')}</small></div>
          <button aria-label={L('أكثر', 'More')} disabled={!can} onClick={() => setQty(cur + f.step)}>+</button>
        </div>
        {lim && (
          <div className="hl-cap">
            <i><b style={{ width: `${Math.min(100, lim.max ? (cur / lim.max) * 100 : 100)}%` }} /></i>
            {(!can || !fits) && <span>{lim.max <= 0 ? L(`ما بقى مكان في ${meal}. شيل شي أو اختر أكل أخف.`, `No room left in ${meal}. Remove something or pick something lighter.`) : why}</span>}
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ---------------- the week ----------------

function WeekPage() {
  const s = useApp();
  const now = useNow(60_000);
  const c = checkIn(s, now);
  const due = checkInDue(s, now);
  const setup = s.diet.setup;
  const tr = trend(s).filter((x) => x.day >= addDays(todayKey(now), -13));
  if (!setup) return null;
  const lastW = s.diet.weeks.at(-1);
  const nextDay = addDays(lastW?.day ?? setup.start, 7);
  const msg = !c ? '' : c.status === 'provisional' ? L(`لسا أول أسبوعين: نعتمد على الحساب لين يصير عندنا وزن كافي (${c.weighIns} وزنات من 10).`, `Still the first two weeks: the formula leads until there are enough weigh-ins (${c.weighIns} of 10).`) : c.status === 'ontrack' ? L('وزنك نازل على السرعة اللي اخترتها.', 'You’re losing at the pace you chose.') : c.status === 'slow' ? L('النزول أبطأ من المطلوب، فنقصنا شوي.', 'Slower than planned, so a little less.') : c.status === 'fast' ? L('تنزل أسرع من الآمن، فزدنا شوي عشان ما تخسر عضل.', 'Faster than is safe, so a little more to protect muscle.') : L('الأيام اللي طلعت فيها عن الخطة كثيرة — الأرقام ما تتغير، حاول تلتزم هالأسبوع.', 'Many days off the plan — the numbers stay; try to keep to it this week.');
  const lost = c?.from != null && c.to != null ? Math.round((c.from - c.to) * 10) / 10 : null;
  const w = tr.map((x) => x.w);
  const lo = Math.min(...w, ...tr.map((x) => x.t)) - 0.3;
  const hi = Math.max(...w, ...tr.map((x) => x.t)) + 0.3;
  const X = (i: number) => (tr.length < 2 ? 160 : 310 - (i * 290) / (tr.length - 1));
  const Y = (v: number) => 110 - ((v - lo) / Math.max(0.1, hi - lo)) * 95;
  return (
    <div className="hl hl-week">
      <div className="hl-top">
        <button className="icon-btn" aria-label={L('رجوع', 'Back')} onClick={() => go('health')}><Icon name="back" /></button>
        <span>{L('أسبوعي', 'My week')}</span>
        <span />
      </div>
      {!c ? (
        <Empty icon="gym" title={L('سجّل وزنك', 'Log your weight')}>{L('توزّن كل يوم الصبح، وكل أسبوع نعدّل خطتك.', 'Weigh in each morning; the plan adjusts every week.')}</Empty>
      ) : (
        <>
          <div className="hl-wh">
            <h1>{lost != null && lost > 0 ? L(`نزلت ${lost} كجم`, `Down ${lost} kg`) : lost != null && lost < 0 ? L(`زدت ${-lost} كجم`, `Up ${-lost} kg`) : L(`وزنك ${c.to} كجم`, `${c.to} kg`)}</h1>
            <span className={`hl-status ${c.status}`}>{c.status === 'provisional' ? L('البداية', 'Getting started') : c.status === 'ontrack' ? L(`على الخطة · ${c.pct}% بالأسبوع`, `On track · ${c.pct}% a week`) : c.status === 'fast' ? L('أسرع من اللازم', 'Too fast') : c.status === 'slow' ? L('أبطأ من المطلوب', 'Slower than planned') : L('بعيد عن الخطة', 'Off the plan')}</span>
          </div>
          {tr.length > 1 && (
            <section className="hl-card">
              <div className="hl-h"><small>{L('وزنك آخر 14 يوم', 'Your weight, last 14 days')}</small><small>{L('الخط = الاتجاه', 'Line = trend')}</small></div>
              <svg className="hl-chart" viewBox="0 0 320 120" role="img" aria-label={L(`وزنك من ${tr[0].w} إلى ${tr.at(-1)!.w}`, `From ${tr[0].w} to ${tr.at(-1)!.w}`)}>
                {[...tr].reverse().map((x, i) => <circle key={x.day} cx={X(i)} cy={Y(x.w)} r="3.5" className="dot" />)}
                <polyline points={[...tr].reverse().map((x, i) => `${X(i)},${Y(x.t)}`).join(' ')} className="line" />
              </svg>
            </section>
          )}
          <div className="sq-stats">
            {c.adherence != null && <div><b className="num">{Math.round(c.adherence * 100)}%</b><span>{L('وجبات مشيت فيها على الخطة', 'Meals as planned')}</span></div>}
            <div><b className="num">{c.expenditure ? n0(c.expenditure) : '—'}</b><span>{L('حرقك الحقيقي باليوم (تقدير)', 'Real daily burn (estimate)')}</span></div>
          </div>
          <section className="hl-card hl-new">
            <small>{due ? L('خطتك الجاية', 'Your next plan') : L('خطتك الحالية', 'Your current plan')}</small>
            <b className="num">{due && c.kcal !== s.diet.kcal ? `${n0(s.diet.kcal ?? 0)} ← ${n0(c.kcal)}` : n0(s.diet.kcal ?? 0)} {L('سعرة', 'kcal')}</b>
            <p>{msg} {L(`البروتين ${c.protein} جم.`, `Protein ${c.protein} g.`)}{setup.by ? L(` موعدك ${fmtDate(setup.by)} · باقي ${Math.max(0, Math.ceil((new Date(`${setup.by}T12:00:00`).getTime() - now) / (7 * 86_400_000)))} أسبوع.`, ` Your date: ${fmtDate(setup.by)}.`) : ''}</p>
          </section>
          {due ? (
            <button className="hl-cta" onClick={() => { A.applyCheckIn({ kcal: c.kcal, protein: c.protein, ...(c.expenditure ? { expenditure: c.expenditure } : {}), ...(c.from != null ? { from: c.from } : {}), ...(c.to != null ? { to: c.to } : {}), ...(c.adherence != null ? { adherence: c.adherence } : {}) }); toast(L('تعدّلت خطتك ✓', 'Plan adjusted ✓')); go('health'); }}>{L('تمام، جهّز الأسبوع', 'OK, set up the week')}</button>
          ) : (
            <p className="faint small" style={{ textAlign: 'center' }}>{L(`التعديل الجاي ${fmtDate(nextDay)}`, `Next check-in ${fmtDate(nextDay)}`)}</p>
          )}
        </>
      )}
    </div>
  );
}

// ---------------- shopping, your foods ----------------

function ShopPage() {
  const s = useApp();
  const week = todayKey();
  const list = shopping(s, week);
  const got = s.diet.shop?.week === week ? s.diet.shop.got : [];
  return (
    <div className="hl">
      <PageTop title={L('قائمة المشتريات', 'Shopping list')} sub={L('للأكل اللي تطبخه بنفسك، الأيام السبعة الجاية', 'For what you cook yourself, the next seven days')} back={{ label: L('أكلي', 'Food'), to: 'health' }} />
      {list.length ? (
        <div className="hl-list">
          {list.map((x) => (
            <button key={x.food.id} className={`hl-row ${got.includes(x.food.id) ? 'got' : ''}`} onClick={() => A.toggleShop(week, x.food.id)} aria-pressed={got.includes(x.food.id)}>
              <i className="hl-dot" style={{ background: KIND_COLOR[group(x.food.kind)] }} />
              <span className="m"><b>{x.food.name}</b><small className="num">{amountText(x.food, x.qty)} · {gramsText(x.food, x.qty)}</small></span>
              {got.includes(x.food.id) && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      ) : (
        <Empty icon="check" title={L('ما تحتاج تشتري شي', 'Nothing to buy')}>{L('أكلك هالأسبوع من أكل البيت.', 'Your food this week comes from home.')}</Empty>
      )}
    </div>
  );
}

function FoodsPage() {
  const s = useApp();
  return (
    <div className="hl">
      <PageTop title={L('أكلاتي', 'My foods')} sub={L('أكلات من عندك، تنحسب مثل الباقي', 'Your own foods, counted like the rest')} back={{ label: L('أكلي', 'Food'), to: 'health' }} />
      <button className="btn primary" onClick={() => openSheet({ type: 'diet-food' })}><Icon name="plus" size={15} /> {L('أكلة جديدة', 'New food')}</button>
      <div className="hl-list" style={{ marginTop: 12 }}>
        {s.diet.foods.map((f) => (
          <div key={f.id} className="hl-row">
            <i className="hl-dot" style={{ background: KIND_COLOR[group(f.kind)] }} />
            <span className="m"><b>{f.name}</b><small className="num">{f.unit} ({f.g} {L('جم', 'g')}) · {f.kcal} {L('سعرة', 'kcal')} · {L('بروتين', 'protein')} {f.protein}</small></span>
            <button className="icon-btn sm" aria-label={L('احذف', 'Delete')} onClick={() => A.deleteDietFood(f.id)}><Icon name="trash" size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

const KINDS: { v: FoodKind; l: () => string }[] = [
  { v: 'protein', l: () => L('بروتين', 'Protein') }, { v: 'starch', l: () => L('نشويات', 'Starch') }, { v: 'mixed', l: () => L('طبخة', 'Cooked dish') }, { v: 'dairy', l: () => L('ألبان', 'Dairy') },
  { v: 'veg', l: () => L('خضار', 'Veg') }, { v: 'fruit', l: () => L('فاكهة', 'Fruit') }, { v: 'fat', l: () => L('دهون ومكسرات', 'Fats & nuts') }, { v: 'sweet', l: () => L('حلا', 'Sweet') }, { v: 'drink', l: () => L('مشروب', 'Drink') },
];

export function DietFoodSheet() {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState(L('حبة', 'piece'));
  const [g, setG] = useState('');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [kind, setKind] = useState<FoodKind>('protein');
  const ok = name.trim() && unit.trim() && +g > 0 && +kcal > 0;
  return (
    <Sheet title={L('أكلة من عندي', 'A food of my own')} onClose={closeSheet} footer={
      <button className="btn primary grow" disabled={!ok} onClick={() => { A.addDietFood({ name: name.trim().slice(0, 60), unit: unit.trim().slice(0, 30), g: +g, kcal: Math.round(+kcal), protein: Math.round(+p || 0), kind }); closeSheet(); toast(L('انضافت', 'Added')); }}>{L('احفظ', 'Save')}</button>
    }>
      <div className="fields">
        <p className="muted small" style={{ margin: 0 }}>{L('الأرقام تلقاها على الغلاف، أو اكتب تقديرك.', 'The numbers are on the label, or write your estimate.')}</p>
        <label className="field"><span>{L('الاسم', 'Name')}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={L('مثلًا: بروتين بار', 'e.g. protein bar')} /></label>
        <div className="row" style={{ gap: 8 }}>
          <label className="field grow"><span>{L('الوحدة', 'Unit')}</span><input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={30} /></label>
          <label className="field grow"><span>{L('وزنها (جم)', 'Weight (g)')}</span><input className="input num" type="number" inputMode="numeric" value={g} onChange={(e) => setG(e.target.value)} /></label>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <label className="field grow"><span>{L('سعرات الوحدة', 'kcal per unit')}</span><input className="input num" type="number" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} /></label>
          <label className="field grow"><span>{L('بروتين (جم)', 'Protein (g)')}</span><input className="input num" type="number" inputMode="numeric" value={p} onChange={(e) => setP(e.target.value)} /></label>
        </div>
        <div className="field"><span>{L('نوعها', 'Kind')}</span><div className="row wrap" style={{ gap: 6 }}>{KINDS.map((k) => <button key={k.v} className={`chip btnish ${kind === k.v ? 'on' : ''}`} onClick={() => setKind(k.v)}>{k.l()}</button>)}</div></div>
      </div>
    </Sheet>
  );
}

// ---------------- setup ----------------

const AVOID: { v: string; l: () => string }[] = [
  { v: 'fish', l: () => L('سمك وتونة', 'Fish & tuna') }, { v: 'egg', l: () => L('بيض', 'Eggs') }, { v: 'dairy', l: () => L('ألبان', 'Dairy') }, { v: 'redmeat', l: () => L('لحم أحمر', 'Red meat') }, { v: 'nuts', l: () => L('مكسرات', 'Nuts') },
];

export function DietSetupSheet() {
  const s = useApp();
  const old = s.diet.setup;
  const info = s.gym.info;
  const kgNow = trend(s).at(-1)?.w;
  const [weight, setWeight] = useState(kgNow ? String(kgNow) : '');
  const [goal, setGoal] = useState(old ? String(old.goalKg) : '');
  const [height, setHeight] = useState(info.height ? String(info.height) : '');
  const [year, setYear] = useState(info.birthYear ? String(info.birthYear) : '');
  const [sex, setSex] = useState<'m' | 'f' | undefined>(info.sex);
  const [pace, setPace] = useState<number>(old?.pace ?? 0.75);
  const [mode, setMode] = useState<'pace' | 'date'>(old?.by ? 'date' : 'pace');
  const [by, setBy] = useState(old?.by ?? addDays(todayKey(), 7 * 16));
  const [meals, setMeals] = useState(old?.meals ?? 3);
  const [snack, setSnack] = useState(old?.snack ?? true);
  const [avoid, setAvoid] = useState<string[]>(old?.avoid ?? []);
  const [family, setFamily] = useState<DietSetup['family']>(old?.family ?? 'most');
  const [activity, setActivity] = useState(old?.activity ?? 1.4);
  const kg = +weight;
  const base = kg > 30 && +goal > 30 && +goal < kg + 0.01 && +height > 120 && +height < 230 && +year > 1930 && +year < new Date().getFullYear() - 12 && !!sex;
  // a date of your own: the pace it needs, and whether that's safe
  const weeks = Math.max(0, (new Date(`${by}T12:00:00`).getTime() - new Date(`${todayKey()}T12:00:00`).getTime()) / (7 * 86_400_000));
  const need = base ? paceToReach(kg, +goal, weeks) : 0;
  const safeBy = base ? earliestSafe(kg, +goal) : '';
  const tooFast = mode === 'date' && base && need > MAX_PACE;
  const ok = base && !tooFast;
  const usePace = mode === 'date' ? Math.max(MIN_PACE, Math.min(MAX_PACE, need)) : pace;
  const preview = ok ? startTargets({ ...s, gym: { ...s.gym, info: { ...info, sex, height: +height, birthYear: +year } }, diet: { ...s.diet, setup: { ...(old || ({} as DietSetup)), activity } } }, { pace: usePace }, kg) : null;
  const save = () => {
    A.setupDiet({ setup: { goalKg: +goal, pace: usePace, ...(mode === 'date' ? { by } : {}), meals, snack, avoid, family, activity, ...(old?.split && old.meals === meals && old.snack === snack ? { split: old.split } : {}) }, info: { sex, height: +height, birthYear: +year }, weight: kgNow === kg ? undefined : kg });
    closeSheet();
    go('health');
  };
  return (
    <Sheet title={old ? L('خطة أكلك', 'Your meal plan') : L('نبدأ خطة أكلك', 'Start your meal plan')} onClose={closeSheet} footer={
      <button className="btn primary grow" disabled={!ok} onClick={save}>{preview ? L(`احفظ · ${n0(preview.kcal)} سعرة باليوم`, `Save · ${n0(preview.kcal)} kcal a day`) : L('احفظ', 'Save')}</button>
    }>
      <div className="fields hl-setup">
        <div className="hl-two">
          <label className="field"><span>{L('وزنك الحين (كجم)', 'Weight now (kg)')}</span><input className="input num" type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
          <label className="field"><span>{L('الوزن اللي تبيه', 'Goal weight')}</span><input className="input num" type="number" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
          <label className="field"><span>{L('طولك (سم)', 'Height (cm)')}</span><input className="input num" type="number" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} /></label>
          <label className="field"><span>{L('سنة ميلادك', 'Birth year')}</span><input className="input num" type="number" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></label>
        </div>
        <div className="field"><span>{L('الجنس', 'Sex')}</span><Seg value={sex || ('' as 'm')} onChange={setSex} options={[{ v: 'm', l: L('ذكر', 'Male') }, { v: 'f', l: L('أنثى', 'Female') }]} /></div>
        <div className="field">
          <span>{L('كيف تبي تنزل؟', 'How do you want to lose it?')}</span>
          <Seg value={mode} onChange={setMode} options={[{ v: 'pace', l: L('بسرعة أختارها', 'At a pace') }, { v: 'date', l: L('بتاريخ أحدده', 'By a date') }]} />
        </div>
        {mode === 'date' ? (
          <div className="field">
            <span>{L('متى تبي توصل؟', 'By when?')}</span>
            <input className="input" type="date" value={by} min={addDays(todayKey(), 7)} onChange={(e) => e.target.value && setBy(e.target.value)} />
            {base && (tooFast ? (
              <div className="hl-warn">
                <span>{L(`هذا يحتاج ${Math.round(kg * need) / 100} كجم بالأسبوع (${need}% من وزنك) — أسرع من الآمن، وتخسر فيه عضل مو بس دهون.`, `That needs ${Math.round(kg * need) / 100} kg a week (${need}% of your weight) — faster than is safe; you'd lose muscle, not just fat.`)}</span>
                <button className="btn sm" onClick={() => setBy(safeBy)}>{L(`خلّه أقرب موعد آمن: ${fmtDate(safeBy)}`, `Use the earliest safe date: ${fmtDate(safeBy)}`)}</button>
              </div>
            ) : (
              <small className="hl-ok">{L(`تنزل ${Math.round(kg * usePace) / 100} كجم بالأسبوع تقريبًا (${usePace}% من وزنك) — كل أسبوع نعدّل عشان توصل بموعدك.`, `About ${Math.round(kg * usePace) / 100} kg a week (${usePace}% of your weight) — adjusted weekly to arrive on time.`)}</small>
            ))}
          </div>
        ) : (
        <div className="field">
          <span>{L('سرعة النزول', 'Pace')}</span>
          <div className="hl-pace">
            {([0.5, 0.75, 1] as const).map((p) => (
              <button key={p} className={pace === p ? 'on' : ''} onClick={() => setPace(p)}>
                {p === 0.5 ? L('هادئة', 'Gentle') : p === 0.75 ? L('عادية', 'Normal') : L('سريعة', 'Fast')}
                <small className="num">{kg > 0 ? L(`${Math.round(kg * p) / 100} كجم/أسبوع`, `${Math.round(kg * p) / 100} kg/wk`) : `${p}%`}</small>
              </button>
            ))}
          </div>
          {ok && <small className="hl-ok">{L(`توصل ${goal} كجم تقريبًا بعد ${weeksToGoal(kg, +goal, pace)} أسبوع`, `About ${weeksToGoal(kg, +goal, pace)} weeks to ${goal} kg`)}</small>}
        </div>
        )}
        <div className="field">
          <span>{L('كم وجبة باليوم؟', 'Meals a day?')}</span>
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            {[1, 2, 3, 4, 5, 6].map((n) => <button key={n} className={`chip btnish ${meals === n ? 'on' : ''}`} onClick={() => setMeals(n)}>{n}</button>)}
            <span className="grow" />
            <span className="small">{L('سناك', 'Snack')}</span><Switch on={snack} onChange={setSnack} label={L('سناك', 'Snack')} />
          </div>
        </div>
        <div className="field"><span>{L('أكل ما تاكله', 'Foods you don’t eat')}</span><div className="row wrap" style={{ gap: 6 }}>{AVOID.map((a) => <button key={a.v} className={`chip btnish ${avoid.includes(a.v) ? 'on' : ''}`} aria-pressed={avoid.includes(a.v)} onClick={() => setAvoid(avoid.includes(a.v) ? avoid.filter((x) => x !== a.v) : [...avoid, a.v])}>{a.l()}</button>)}</div></div>
        <div className="field"><span>{L('تاكل غدا البيت؟', 'Do you eat the family lunch?')}</span><Seg value={family} onChange={setFamily} options={[{ v: 'most', l: L('أغلب الأيام', 'Most days') }, { v: 'some', l: L('أحيانًا', 'Sometimes') }, { v: 'rare', l: L('نادرًا', 'Rarely') }]} /></div>
        {!s.settings.sections?.gym && (
          <div className="field"><span>{L('حركتك اليومية', 'Daily activity')}</span><Seg value={activity} onChange={setActivity} options={[{ v: 1.25, l: L('قليلة', 'Low') }, { v: 1.4, l: L('متوسطة', 'Moderate') }, { v: 1.55, l: L('كثيرة', 'High') }]} /></div>
        )}
        <small className="faint">{L('إذا عندك سكري أو مرض مزمن أو حامل، استشر طبيبك قبل أي خطة.', 'If you have diabetes, a chronic illness or are pregnant, ask your doctor first.')}</small>
      </div>
    </Sheet>
  );
}

// ---------------- on «اليوم» ----------------

/** two lines at most: the morning weigh-in, and the next meal */
export function DietTodayRows() {
  const s = useApp();
  const now = useNow(60_000);
  if (!s.settings.sections?.diet || !s.diet.setup || s.diet.kcal == null) return null;
  const today = todayKey(now);
  const weighed = s.gym.body.some((b) => b.day === today && b.weight != null);
  const d = dayOf(s, today);
  const i = d.meals.findIndex((m) => !m.eaten);
  const left = dayTarget(s, today) - d.meals.filter((m) => m.eaten).reduce((a, m) => a + mealIntake(s, m).kcal, 0);
  const slots = slotsOf(s.diet.setup);
  const m = d.meals[i];
  const dish = m?.dish ? DISH.get(m.dish) : undefined;
  return (
    <>
      {!weighed && new Date(now).getHours() < 14 && (
        <section className="sq-today">
          <span className="m"><small>{L('وزن الصبح', 'Morning weigh-in')}</small><b>{L('ما وزنت اليوم', 'Not weighed yet today')}</b></span>
          <button className="sq-go sm" onClick={() => openSheet({ type: 'gym-body' })}>{L('سجّل', 'Log')}</button>
        </section>
      )}
      {m && (
        <button className="sq-today done hl-trow" onClick={() => go(`health/meal?d=${today}&i=${i}`)}>
          <span className="m"><small>{L(`أكلي · باقي ${n0(left)} سعرة`, `Food · ${n0(left)} kcal left`)}</small><b>{slotName(m.slot, i, slots)}: {dish ? L(...dish.t) : m.items.map((it) => foodOf(s, it.food)?.name).filter(Boolean).slice(0, 2).join(' + ') || L('اصنعها', 'build it')}</b></span>
          <Icon name="chevron" size={16} className="chev-end" />
        </button>
      )}
    </>
  );
}

