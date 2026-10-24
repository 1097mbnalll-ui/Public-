import { useMemo, useState } from 'react';
import { Collapse, NumInput, Seg, Sheet } from './kit';
import { Icon } from './Icon';
import { closeSheet, openSheet } from './sheets';
import { toast } from './toast';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { addDays, addMonths, fmtDate, todayKey } from '../lib/dates';
import { CAT_ORDER, catInfo, fmtMoney, fmtNum, guessCat, limitNote, parseBankSms, parseExpense, suggestBudget } from '../lib/engine/money';
import { getState } from '../lib/store';
import type { ExpenseCat, Worth } from '../lib/types';
import { L } from '../lib/i18n';

const pad = (n: number) => String(n).padStart(2, '0');
const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const worthLabel = (w: Worth) => ({ yes: L('يستحق', 'Worth it'), meh: L('عادي', 'Meh'), no: L('ما يستحق', 'Not worth it') })[w];
export const worthColor = (w?: Worth) => (w === 'yes' ? 'var(--green)' : w === 'no' ? 'var(--red)' : w === 'meh' ? 'var(--amber)' : 'transparent');

/** a one-line tip for the category being entered: the cheaper way and how often it happened this week */
function altTip(cat: ExpenseCat, count: number): string | undefined {
  const n = count + 1;
  const tips: Partial<Record<ExpenseCat, string>> = {
    coffee: L(`بالبيت ≈ 4 ر.س — هذي القهوة رقم ${n} هالأسبوع`, `At home ≈ 4 SAR — coffee #${n} this week`),
    delivery: L(`الاستلام بنفسك يوفر رسوم التوصيل — الطلب رقم ${n} هالأسبوع`, `Picking it up saves the fee — order #${n} this week`),
    food: n >= 4 ? L(`أكل برا ${n} مرات هالأسبوع — جرّب غدا من البيت`, `Eating out ${n} times this week — try lunch from home`) : undefined,
    study: L('شيّك مكتبة الجامعة قبل — غالبًا مجاني', 'Check the university library first — often free'),
    fun: n >= 3 ? L('فيه فعاليات مجانية كثير بالويكند', 'Plenty of free events on weekends') : undefined,
  };
  return tips[cat];
}

/** add / edit an expense: amount up top, what it was, category grid, «يستحق؟» */
export function ExpenseSheet({ id, text }: { id?: string; text?: string }) {
  const s = useApp();
  const existing = id ? s.expenses.find((e) => e.id === id) : undefined;
  const parsed = useMemo(() => (text ? parseExpense(text) : undefined), [text]);
  const today = todayKey();
  const [amount, setAmount] = useState<number | undefined>(existing?.amount ?? parsed?.amount);
  const [title, setTitle] = useState(existing?.title ?? parsed?.title ?? '');
  const [cat, setCat] = useState<ExpenseCat>(existing?.cat ?? parsed?.cat ?? 'other');
  const [catPicked, setCatPicked] = useState(!!existing);
  const [day, setDay] = useState(existing?.day ?? parsed?.day ?? today);
  const [worth, setWorth] = useState<Worth | undefined>(existing?.worth);

  const weekCount = s.expenses.filter((e) => e.cat === cat && e.day >= addDays(today, -6) && e.id !== id).length;
  const tip = !existing ? altTip(cat, weekCount) : undefined;

  const onTitle = (v: string) => {
    // «قهوة 24» typed in the description fills the amount too
    const p = parseExpense(v);
    if (p.amount && /\d/.test(v.trim().split(/\s+/).pop() || '') && !amount) {
      setAmount(p.amount);
      setTitle(p.title);
    } else setTitle(v);
    if (!catPicked) setCat(guessCat(v));
  };

  const save = () => {
    if (!amount || amount <= 0) return toast(L('اكتب المبلغ', 'Enter the amount'));
    const data = { title: title.trim() || catInfo(cat).label, amount, cat, day, worth };
    if (existing) {
      A.updateExpense(existing.id, data);
      closeSheet();
      return;
    }
    A.addExpense({ ...data, ...(day === today ? { time: nowTime() } : {}) });
    closeSheet();
    const warn = limitNote(getState(), cat, amount);
    toast(L(`سُجّل ${fmtMoney(amount)} · ${catInfo(cat).label}`, `Logged ${fmtMoney(amount)} · ${catInfo(cat).label}`) + (warn ? `\n${warn}` : ''), { undoable: true, ms: warn ? 7000 : undefined });
  };

  return (
    <Sheet
      title={existing ? L('تعديل المصروف', 'Edit expense') : L('كم صرفت؟', 'How much?')}
      onClose={closeSheet}
      footer={
        <>
          <button className="btn primary grow" onClick={save}>{L('حفظ', 'Save')}</button>
          {existing && (
            <button className="btn danger" onClick={() => { A.deleteExpense(existing.id); closeSheet(); toast(L('حُذف المصروف', 'Expense deleted'), { undoable: true }); }}>
              <Icon name="trash" size={15} />
            </button>
          )}
        </>
      }
    >
      <div className="fields">
        <div className="m-amount">
          <input
            className="m-amount-in"
            inputMode="decimal"
            placeholder="0"
            value={amount ?? ''}
            onChange={(e) => {
              const v = Number(e.target.value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫,]/g, '.'));
              setAmount(e.target.value === '' || isNaN(v) ? undefined : v);
            }}
            autoFocus
            aria-label={L('المبلغ', 'Amount')}
          />
          <span>{L('ر.س', 'SAR')}</span>
        </div>
        <input className="input" value={title} onChange={(e) => onTitle(e.target.value)} placeholder={L('وش اشتريت؟ (قهوة ستاربكس…)', 'What was it? (Starbucks coffee…)')} />
        <div className="row wrap" style={{ gap: 6 }}>
          {[today, addDays(today, -1)].map((d, i) => (
            <button key={d} className={`chip btnish ${day === d ? 'on' : ''}`} onClick={() => setDay(d)}>{i ? L('أمس', 'Yesterday') : L('اليوم', 'Today')}</button>
          ))}
          <input type="date" className="input m-date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </div>
        <div className="m-cats">
          {CAT_ORDER.map((c) => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => { setCat(c); setCatPicked(true); }}>
              <i>{catInfo(c).emoji}</i>
              {catInfo(c).label}
            </button>
          ))}
        </div>
        <div className="field">
          <label>{L('يستحق؟', 'Worth it?')} <span className="faint tiny">{L('(اختياري)', '(optional)')}</span></label>
          <div className="m-worth">
            {(['yes', 'meh', 'no'] as Worth[]).map((w) => (
              <button key={w} className={`w-${w} ${worth === w ? 'on' : ''}`} onClick={() => setWorth(worth === w ? undefined : w)}>
                {w === 'yes' ? '👍' : w === 'meh' ? '😐' : '👎'} {worthLabel(w)}
              </button>
            ))}
          </div>
        </div>
        {tip && <div className="m-tip">💡 {tip}</div>}
        {!existing && (
          <button className="m-link" onClick={() => openSheet({ type: 'sms' })}>📩 {L('أو الصق رسائل البنك', 'Or paste bank text messages')}</button>
        )}
      </div>
    </Sheet>
  );
}

/** bank SMS → pick which purchases to add. Text can be pasted, or read from the file the
 *  Shortcuts automation keeps appending to; messages imported before are skipped. */
export function SmsSheet() {
  const s = useApp();
  const [text, setText] = useState('');
  const [fromFile, setFromFile] = useState(false);
  const seen = useMemo(() => new Set(s.money.smsSeen || []), [s.money.smsSeen]);
  const all = useMemo(() => parseBankSms(text), [text]);
  const found = all.filter((f) => !seen.has(f.key));
  const old = all.length - found.length;
  // the same amount on the same day is probably already logged
  const dup = (f: (typeof found)[number]) => s.expenses.some((e) => e.day === f.day && Math.abs(e.amount - f.amount) < 0.01);
  const [skip, setSkip] = useState<Record<string, boolean>>({});
  const isOn = (f: (typeof found)[number]) => (skip[f.key] === undefined ? !dup(f) : !skip[f.key]);
  const chosen = found.filter(isOn);

  const readFile = async (file?: File) => {
    if (!file) return;
    setText(await file.text());
    setFromFile(true);
    setSkip({});
  };

  return (
    <Sheet
      title={L('رسائل البنك', 'Bank messages')}
      onClose={closeSheet}
      footer={
        <button className="btn primary grow" disabled={!found.length} onClick={() => {
          A.addExpenses(chosen.map(({ key: _k, ...f }) => ({ ...f, source: 'sms' as const })));
          // everything shown counts as handled — unticked ones won't come back from the file
          A.markSmsSeen(found.map((f) => f.key));
          closeSheet();
          toast(chosen.length === 1 ? L('أُضيف المصروف', 'Expense added') : chosen.length ? L(`أُضيفت ${chosen.length} مصاريف`, `Added ${chosen.length} expenses`) : L('تمام — ما أضفت شي', 'Done — nothing added'), { undoable: chosen.length > 0 });
        }}>
          {chosen.length ? L(`أضف ${chosen.length}`, `Add ${chosen.length}`) : found.length ? L('تم', 'Done') : L('أضف', 'Add')}
        </button>
      }
    >
      <div className="fields">
        <label className="btn block">
          📂 {L('افتح ملف الرسائل', 'Open the messages file')}
          <input type="file" hidden onChange={(e) => readFile(e.target.files?.[0])} />
        </label>
        {!fromFile && (
          <>
            <div className="faint small" style={{ textAlign: 'center' }}>{L('أو الصق رسالة أو أكثر هنا', 'or paste one or more messages here')}</div>
            <textarea className="input" rows={4} dir="auto" value={text} onChange={(e) => { setText(e.target.value); setSkip({}); }} placeholder={L('الصق الرسائل هنا…', 'Paste the messages here…')} />
          </>
        )}
        {text.trim() && !all.length && <div className="notice amber">{L('ما لقيت عمليات شراء فيها مبلغ.', "Couldn't find purchases with an amount.")}</div>}
        {old > 0 && <div className="faint small">{L(`${old} رسائل استوردتها قبل — تجاهلتها.`, `${old} messages were imported before — skipped.`)}</div>}
        {all.length > 0 && !found.length && <div className="notice">{L('ما فيه رسائل جديدة ✓', 'No new messages ✓')}</div>}
        {found.map((f) => (
          <label key={f.key} className="m-sms">
            <input type="checkbox" checked={isOn(f)} onChange={() => setSkip({ ...skip, [f.key]: isOn(f) })} />
            <span className="em">{catInfo(f.cat).emoji}</span>
            <span className="grow">
              <b>{f.title}</b>
              <span className="faint tiny">{fmtDate(f.day)}{f.time ? ` · ${f.time}` : ''}{dup(f) ? L(' · يمكن مسجّل', ' · maybe logged') : ''}</span>
            </span>
            <b className="money">{fmtMoney(f.amount)}</b>
          </label>
        ))}
        <button className="m-link" onClick={() => openSheet({ type: 'sync' })}>⚡ {L('أسهل: شغّل المزامنة وخلّ الرسائل تدخل لحالها بدون ملف', 'Easier: turn on sync and let messages come in by themselves, no file')}</button>
        <Collapse title={L('خلّ رسائل البنك تنحفظ لحالها (آيفون)', 'Save bank messages automatically (iPhone)')} defaultOpen={!s.money.smsSeen?.length && !text}>
          <ol className="m-guide">
            <li>{L('افتح تطبيق «الاختصارات» ← «الأتمتة» ← زر +.', 'Open Shortcuts → Automation → +.')}</li>
            <li>{L('اختر «رسالة»: في «المرسل» اختر رقم البنك، وفي «الرسالة تحتوي» اكتب: شراء — ثم «تشغيل فورًا».', 'Choose “Message”: Sender = your bank, Message Contains = Purchase — then “Run Immediately”.')}</li>
            <li>{L('أضف إجراء «نص» واكتب فيه سطرين:', 'Add a “Text” action with these lines:')}
              <div className="m-code">{L('«التاريخ الحالي» (اضغطه واختر تنسيق 2026-10-24 09:10)', '“Current Date” (tap it, pick format 2026-10-24 09:10)')}<br />{L('«مُدخل الاختصار» ← اضغطه واختر «المحتوى»', '“Shortcut Input” → tap it, choose “Content”')}<br />---</div>
            </li>
            <li>{L('أضف إجراء «إلحاق بملف نصي»: اكتب اسم الملف ', 'Add “Append to Text File”: file ')}<bdi className="m-file">masar-sms.txt</bdi>{L(' وفعّل «إنشاء سطر جديد».', ', turn on “Make New Line”.')}</li>
            <li>{L('خلاص. كل رسالة شراء تنحفظ في iCloud Drive ← Shortcuts. هنا اضغط «افتح ملف الرسائل» واختره متى ما تبي — الجديد بس ينضاف.', "That's it. Each purchase message is saved to iCloud Drive → Shortcuts. Tap “Open the messages file” here whenever you like — only new ones are added.")}</li>
          </ol>
          <div className="faint tiny">{L('البنك يرسل من أكثر من رقم؟ سوّ أتمتة لكل رقم بنفس الملف. كل شي يبقى على جهازك.', 'Bank sends from several numbers? Make one automation per number, same file. It all stays on your device.')}</div>
        </Collapse>
      </div>
    </Sheet>
  );
}

/** monthly budget, payday, category limits + savings goal */
export function MoneySettingsSheet() {
  const s = useApp();
  const [budget, setBudget] = useState<number | undefined>(s.money.budget);
  const [payday, setPayday] = useState<number | undefined>(s.money.payday);
  const [limits, setLimits] = useState<Partial<Record<ExpenseCat, number>>>(s.money.limits || {});
  const [goalName, setGoalName] = useState(s.money.goal?.name || '');
  const [target, setTarget] = useState<number | undefined>(s.money.goal?.target);
  const [saved, setSaved] = useState<number | undefined>(s.money.goal?.saved);
  const sug = suggestBudget(s);
  // the categories you actually spend on come first
  const spent = new Map<ExpenseCat, number>();
  for (const e of s.expenses) spent.set(e.cat, (spent.get(e.cat) || 0) + e.amount);
  const cats = [...CAT_ORDER].filter((c) => c !== 'other').sort((x, y) => (spent.get(y) || 0) - (spent.get(x) || 0));
  return (
    <Sheet
      title={L('الميزانية والهدف', 'Budget & goal')}
      onClose={closeSheet}
      footer={<button className="btn primary grow" onClick={() => {
        A.setBudget(budget);
        const clean = Object.fromEntries(Object.entries(limits).filter(([, v]) => v && v > 0));
        A.updateMoney({ payday: payday && payday >= 1 && payday <= 31 ? payday : undefined, limits: Object.keys(clean).length ? clean : undefined });
        A.setGoal(goalName.trim() && target ? { name: goalName.trim(), target, saved: saved || 0 } : undefined);
        closeSheet();
      }}>{L('حفظ', 'Save')}</button>}
    >
      <div className="fields">
        <div className="fields two">
          <div className="field">
            <label>{L('ميزانية الشهر', 'Monthly budget')}</label>
            <NumInput value={budget} min={0} onChange={setBudget} suffix={L('ر.س', 'SAR')} placeholder={L('مثلًا 4500', 'e.g. 4500')} />
          </div>
          <div className="field">
            <label>💰 {L('يوم الراتب', 'Payday')}</label>
            <NumInput value={payday} min={1} onChange={setPayday} placeholder={L('مثلًا 27', 'e.g. 27')} />
          </div>
        </div>
        {sug && budget !== sug.suggest && (
          <div className="m-tip">🤖 {L(`متوسط صرفك ${fmtNum(sug.avg)} بالشهر — أقترح ${fmtNum(sug.suggest)} وتوفر ${fmtNum(Math.max(0, sug.avg - sug.suggest))}.`, `You average ${fmtNum(sug.avg)} a month — try ${fmtNum(sug.suggest)} and save ${fmtNum(Math.max(0, sug.avg - sug.suggest))}.`)}{' '}
            <button className="m-link" style={{ padding: 0 }} onClick={() => setBudget(sug.suggest)}>{L('استخدمه', 'Use it')}</button>
          </div>
        )}
        <div className="faint tiny">{L('مع يوم الراتب، شهرك يبدأ يوم الراتب ويخلص قبل الراتب الجاي، وحدّ اليوم ينحسب على الأيام الباقية له.', 'With a payday, your month runs from one payday to the next and the daily limit spreads over the days left.')}</div>
        <div className="divider" />
        <div className="field">
          <label>{L('حد لكل تصنيف بالشهر (اختياري)', 'Monthly limit per category (optional)')}</label>
          <div className="m-lim-grid">
            {cats.map((c) => (
              <label key={c}>
                <span>{catInfo(c).emoji} {catInfo(c).label}</span>
                <input className="input" inputMode="numeric" value={limits[c] ?? ''} placeholder="—" onChange={(e) => {
                  const v = Number(e.target.value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
                  setLimits({ ...limits, [c]: e.target.value === '' || isNaN(v) ? undefined : v });
                }} />
              </label>
            ))}
          </div>
          <div className="faint tiny">{L('أنبهك لما تقرب (80%) ولما تتجاوز.', "I'll warn you at 80% and when you go over.")}</div>
        </div>
        <div className="divider" />
        <div className="field">
          <label>🎯 {L('هدف التوفير (اختياري)', 'Savings goal (optional)')}</label>
          <input className="input" value={goalName} onChange={(e) => setGoalName(e.target.value)} placeholder={L('لابتوب جديد، سفرة…', 'New laptop, a trip…')} />
        </div>
        <div className="fields two">
          <div className="field">
            <label>{L('المبلغ', 'Target')}</label>
            <NumInput value={target} min={0} onChange={setTarget} suffix={L('ر.س', 'SAR')} />
          </div>
          <div className="field">
            <label>{L('موفّر له حاليًا', 'Saved so far')}</label>
            <NumInput value={saved} min={0} onChange={setSaved} suffix={L('ر.س', 'SAR')} />
          </div>
        </div>
      </div>
    </Sheet>
  );
}

export function SubSheet({ id }: { id?: string }) {
  const s = useApp();
  const existing = id ? s.subs.find((x) => x.id === id) : undefined;
  const today = todayKey();
  const [name, setName] = useState(existing?.name || '');
  const [amount, setAmount] = useState<number | undefined>(existing?.amount);
  const [cycle, setCycle] = useState<'month' | 'year'>(existing?.cycle || 'month');
  const [kind, setKind] = useState<'sub' | 'bill'>(existing?.kind || 'sub');
  const [next, setNext] = useState(existing?.next || addMonths(today, 1));
  return (
    <Sheet
      title={existing ? existing.name : L('اشتراك أو فاتورة', 'Subscription or bill')}
      onClose={closeSheet}
      footer={
        <>
          <button className="btn primary grow" disabled={!name.trim() || !amount} onClick={() => {
            A.saveSub({ id, name: name.trim(), amount: amount || 0, cycle, next, kind, lastUsed: existing?.lastUsed ?? today });
            closeSheet();
          }}>{L('حفظ', 'Save')}</button>
          {existing && <button className="btn danger" onClick={() => { A.deleteSub(existing.id); closeSheet(); toast(L('حُذف الاشتراك', 'Subscription removed'), { undoable: true }); }}><Icon name="trash" size={15} /></button>}
        </>
      }
    >
      <div className="fields">
        <Seg value={kind} onChange={setKind} options={[{ v: 'sub', l: L('📺 اشتراك', '📺 Subscription') }, { v: 'bill', l: L('💡 فاتورة', '💡 Bill') }]} />
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'bill' ? L('الجوال، الإيجار، الكهرباء…', 'Phone, rent, electricity…') : L('شاهد، سبوتيفاي، iCloud…', 'Netflix, Spotify, iCloud…')} autoFocus />
        <div className="fields two">
          <div className="field">
            <label>{L('المبلغ', 'Amount')}</label>
            <NumInput value={amount} min={0} onChange={setAmount} suffix={L('ر.س', 'SAR')} />
          </div>
          <div className="field">
            <label>{L('يتجدد', 'Renews')}</label>
            <input type="date" className="input" value={next} onChange={(e) => e.target.value && setNext(e.target.value)} />
          </div>
        </div>
        <Seg value={cycle} onChange={setCycle} options={[{ v: 'month', l: L('شهري', 'Monthly') }, { v: 'year', l: L('سنوي', 'Yearly') }]} />
        <div className="faint tiny">{L('يوم التجديد يتسجّل المبلغ تلقائيًا في مصاريفك.', 'On renewal day the charge is logged in your expenses automatically.')}</div>
        {existing && kind === 'sub' && (
          <button className="btn" onClick={() => { A.markSubUsed(existing.id); closeSheet(); toast(L('تمام — سجّلت إنك تستخدمه', "Got it — marked as used")); }}>
            <Icon name="check" size={15} /> {L('استخدمته مؤخرًا', 'I used it recently')}
          </button>
        )}
      </div>
    </Sheet>
  );
}
