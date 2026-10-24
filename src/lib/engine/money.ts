// «مصاريفي»: daily allowance from the monthly budget, «يستحق؟» verdicts, cheaper / free swaps
// worked out from what was actually spent, and the report. Everything is computed locally.
import type { AppState, Expense, ExpenseCat, Subscription } from '../types';
import { addDays, addMonths, diffDays, parseKey, todayKey } from '../dates';
import { L, lang } from '../i18n';
import { toWestern } from '../parse';

export const CAT_ORDER: ExpenseCat[] = ['coffee', 'food', 'delivery', 'transport', 'shopping', 'subs', 'bills', 'study', 'fun', 'health', 'other'];

const CAT_META: Record<ExpenseCat, { emoji: string; ar: string; en: string; color: string; bg: string }> = {
  coffee: { emoji: '☕', ar: 'قهوة', en: 'Coffee', color: '#F7B84B', bg: '#FFF0E0' },
  food: { emoji: '🍔', ar: 'أكل', en: 'Food', color: '#FF8FA8', bg: '#FFE7EC' },
  delivery: { emoji: '🛵', ar: 'توصيل', en: 'Delivery', color: '#B36BF0', bg: '#F2E8FF' },
  transport: { emoji: '⛽', ar: 'مواصلات', en: 'Transport', color: '#5B9BFF', bg: '#E6F0FF' },
  shopping: { emoji: '🛍️', ar: 'تسوق', en: 'Shopping', color: '#F08A5D', bg: '#FFEDE4' },
  subs: { emoji: '📺', ar: 'اشتراكات', en: 'Subscriptions', color: '#7ED9A6', bg: '#E3F6EC' },
  bills: { emoji: '💡', ar: 'فواتير', en: 'Bills', color: '#E8B04A', bg: '#FFF6DD' },
  study: { emoji: '📚', ar: 'دراسة', en: 'Study', color: '#7E62F0', bg: '#EEE9FF' },
  fun: { emoji: '🎮', ar: 'ترفيه', en: 'Fun', color: '#F06BB5', bg: '#FDE6F3' },
  health: { emoji: '💊', ar: 'صحة', en: 'Health', color: '#2FA9D6', bg: '#E2F4FB' },
  other: { emoji: '🧾', ar: 'أخرى', en: 'Other', color: '#A9A3C6', bg: '#F1EFF8' },
};

export const catInfo = (c: ExpenseCat) => {
  const m = CAT_META[c] || CAT_META.other;
  return { ...m, label: lang() === 'en' ? m.en : m.ar };
};

export const fmtMoney = (n: number) => `${Math.round(n).toLocaleString('en-US')} ${L('ر.س', 'SAR')}`;
export const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US');

// coffee and delivery first: «توصيل ماكدونالدز» is delivery, «قهوة» beats «مطعم»
const KEYWORDS: [ExpenseCat, RegExp][] = [
  ['delivery', /توصيل|هنقر|hunger|جاهز|jahez|مرسول|mrsool|كيتا|keeta|ذا ?شيفز|طلبات|talabat|نينجا|ninja|delivery/i],
  ['coffee', /قهو|كوفي|كافي|كوفيه|ستاربكس|starbucks|coffee|cafe|café|latte|لاتيه|كابتشينو|دانكن|dunkin|تيم ?هورتنز|tim ?hortons|بارنز|barn'?s|هاف ?مليون|half ?million|دوز|dose|كرك|شاي/i],
  ['subs', /اشتراك|نتفلكس|netflix|شاهد|shahid|سبوتيفاي|spotify|يوتيوب|youtube|icloud|chatgpt|openai|claude|anthropic|أنغامي|انغامي|anghami|subscription|osn|disney|apple\.com/i],
  ['transport', /بنزين|وقود|محطة|أوبر|اوبر|uber|كريم|careem|تاكسي|taxi|باص|مترو|metro|parking|مواقف|fuel|petrol|ساسكو|sasco|الدريس|aldrees|بترومين|petromin|نفط|غسيل سيار/i],
  ['bills', /فاتورة|كهرباء|مياه|ماء|جوال|انترنت|إنترنت|stc|موبايلي|mobily|زين|zain|إيجار|ايجار|rent|bill/i],
  ['study', /كتاب|كتب|مكتبة|جامعة|دورة|كورس|قرطاسية|طباعة|book|course|udemy|coursera|جرير|jarir/i],
  ['health', /صيدلي|دواء|مستشفى|عيادة|نادي|جيم|gym|pharmacy|نهدي|nahdi|طبيب|dentist|أسنان/i],
  ['fun', /سينما|cinema|vox|فوكس|ألعاب|العاب|بلايستيشن|playstation|steam|ستيم|ترفيه|ملاهي|بولينج|game/i],
  ['food', /غدا|عشا|فطور|مطعم|أكل|اكل|برجر|بيتزا|شاورما|ماكدونالدز|ماك|mcdonald|kfc|كنتاكي|البيك|albaik|هرفي|herfy|كودو|kudu|سندويش|وجبة|حلا|آيسكريم|restaurant|burger|pizza|lunch|dinner|breakfast|بقالة|سوبرماركت/i],
  ['shopping', /تسوق|ملابس|أمازون|امازون|amazon|نون|noon|شي ?ان|shein|بنده|panda|العثيم|othaim|كارفور|carrefour|دانوب|danube|لولو|lulu|تميمي|ايكيا|ikea|متجر|store|market|mall|سنتربوينت|centrepoint/i],
];

export function guessCat(text: string): ExpenseCat {
  for (const [c, re] of KEYWORDS) if (re.test(text)) return c;
  return 'other';
}

const CURRENCY = /(ر\.?\s?س\.?|ريالات|ريال|sar|sr)(?![a-z])/gi;

/** «قهوة ستاربكس 24» · «بنزين 60 أمس» → title, amount, day, category */
export function parseExpense(input: string, now = Date.now()) {
  let t = toWestern(input).replace(/٫/g, '.').replace(/،/g, ',');
  const today = todayKey(now);
  let day = today;
  const dayWords: [RegExp, number][] = [
    [/(أول|اول|قبل)\s*(أمس|امس|البارح)/, -2],
    [/\b(day before yesterday)\b/i, -2],
    [/(أمس|امس|البارح|yesterday)/i, -1],
    [/(اليوم|today)/i, 0],
  ];
  for (const [re, n] of dayWords) {
    if (re.test(t)) {
      day = addDays(today, n);
      t = t.replace(re, ' ');
      break;
    }
  }
  const nums = [...t.matchAll(/(\d+(?:[.,]\d{1,2})?)/g)];
  let amount: number | undefined;
  if (nums.length) {
    const last = nums[nums.length - 1];
    amount = Number(last[1].replace(',', '.'));
    t = t.slice(0, last.index) + ' ' + t.slice((last.index || 0) + last[0].length);
  }
  const title = t.replace(CURRENCY, ' ').replace(/\s+/g, ' ').trim();
  return { title, amount: amount && amount > 0 ? amount : undefined, day, cat: guessCat(title) };
}

// ---------------- budget & today ----------------

const monthStart = (day: string) => day.slice(0, 8) + '01';
export const daysInMonth = (day: string) => {
  const d = parseKey(day);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};
const monthEnd = (day: string) => day.slice(0, 8) + String(daysInMonth(day)).padStart(2, '0');

export function sumRange(list: Expense[], from: string, to: string): number {
  let s = 0;
  for (const e of list) if (e.day >= from && e.day <= to) s += e.amount;
  return s;
}

export interface MoneyToday {
  budget?: number;
  spentMonth: number;
  spentToday: number;
  /** what's left of the month's budget */
  leftMonth?: number;
  /** days left in the month, today included */
  daysLeft: number;
  /** today's fair share: (budget − spent before today) ÷ days left */
  allowance?: number;
  /** a plain daily line (budget ÷ days in month), for colouring past days */
  dailyLine?: number;
}

export function moneyToday(state: AppState, now = Date.now()): MoneyToday {
  const today = todayKey(now);
  const from = monthStart(today);
  const spentMonth = sumRange(state.expenses, from, today);
  const spentToday = sumRange(state.expenses, today, today);
  const daysLeft = diffDays(today, monthEnd(today)) + 1;
  const budget = state.money.budget && state.money.budget > 0 ? state.money.budget : undefined;
  if (!budget) return { spentMonth, spentToday, daysLeft };
  const before = spentMonth - spentToday;
  return {
    budget,
    spentMonth,
    spentToday,
    daysLeft,
    leftMonth: budget - spentMonth,
    allowance: Math.max(0, (budget - before) / daysLeft),
    dailyLine: budget / daysInMonth(today),
  };
}

export type DayMark = 'ok' | 'near' | 'over' | 'none';

/** the last 7 days, each against the plain daily line */
export function weekStrip(state: AppState, now = Date.now()): { day: string; spent: number; mark: DayMark }[] {
  const today = todayKey(now);
  const m = moneyToday(state, now);
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    const spent = sumRange(state.expenses, day, day);
    const line = m.dailyLine;
    const mark: DayMark = !line ? (spent ? 'ok' : 'none') : spent > line ? 'over' : spent > line * 0.8 ? 'near' : 'ok';
    out.push({ day, spent, mark });
  }
  return out;
}

const keyOf = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');

/** things bought again and again → one-tap chips */
export function favorites(state: AppState, now = Date.now(), max = 4) {
  const since = addDays(todayKey(now), -60);
  const map = new Map<string, { title: string; amount: number; cat: ExpenseCat; n: number }>();
  for (const e of state.expenses) {
    if (e.day < since || e.source === 'sub' || !e.title) continue;
    const k = keyOf(e.title) + '|' + e.amount;
    const cur = map.get(k);
    if (cur) cur.n++;
    else map.set(k, { title: e.title, amount: e.amount, cat: e.cat, n: 1 });
  }
  return [...map.values()].filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, max);
}

// ---------------- savings ----------------

export interface SwapOption {
  label: string;
  free?: boolean;
}

export interface Swap {
  id: string;
  cat: ExpenseCat;
  emoji: string;
  text: string;
  options: SwapOption[];
  /** realistic saving per month if the swap is followed */
  monthly: number;
  subId?: string;
}

function last30(state: AppState, now: number) {
  const today = todayKey(now);
  const from = addDays(today, -29);
  return state.expenses.filter((e) => e.day >= from && e.day <= today);
}

const stats = (list: Expense[]) => ({ n: list.length, sum: list.reduce((a, e) => a + e.amount, 0) });

/** idle = not marked as used for 30 days (or never, once it's a month old) */
export function subIdle(sub: Subscription, now = Date.now()): number | undefined {
  const today = todayKey(now);
  const ref = sub.lastUsed || todayKey(sub.createdAt);
  const d = diffDays(ref, today);
  return d >= 30 ? d : undefined;
}

export const subMonthly = (s: Subscription) => (s.cycle === 'year' ? s.amount / 12 : s.amount);

const FREE_SUB: [RegExp, string, string][] = [
  [/شاهد|shahid|نتفلكس|netflix|osn|disney/i, 'يوتيوب', 'YouTube'],
  [/سبوتيفاي|spotify|أنغامي|انغامي|anghami/i, 'النسخة المجانية', 'the free tier'],
];

/** cheaper / free swaps worked out from the last 30 days, biggest saving first */
export function suggestions(state: AppState, now = Date.now()): Swap[] {
  const list = last30(state, now);
  const by = (c: ExpenseCat) => list.filter((e) => e.cat === c);
  const out: Swap[] = [];
  const C = (c: ExpenseCat) => catInfo(c).emoji;

  const coffee = stats(by('coffee'));
  if (coffee.n >= 3) {
    out.push({
      id: 'coffee', cat: 'coffee', emoji: C('coffee'),
      text: L(`تشتري قهوة برا ${coffee.n} مرة بالشهر = ${fmtMoney(coffee.sum)}`, `You buy coffee out ${coffee.n} times a month = ${fmtMoney(coffee.sum)}`),
      options: [{ label: L('قهوة الدوام', 'Office coffee'), free: true }, { label: L('بالبيت · 4 ر.س', 'At home · 4 SAR') }, { label: L('مرتين بالأسبوع بس', 'Only twice a week') }],
      monthly: Math.max(0, coffee.sum - coffee.n * 4),
    });
  }
  const delivery = stats(by('delivery'));
  if (delivery.n >= 2) {
    out.push({
      id: 'delivery', cat: 'delivery', emoji: C('delivery'),
      text: L(`طلبت توصيل ${delivery.n} مرات = ${fmtMoney(delivery.sum)}`, `${delivery.n} delivery orders = ${fmtMoney(delivery.sum)}`),
      options: [{ label: L('استلمه بنفسك', 'Pick it up yourself') }, { label: L('اطبخ مرتين بالأسبوع', 'Cook twice a week') }],
      monthly: delivery.sum * 0.45,
    });
  }
  const food = stats(by('food'));
  if (food.sum >= 300) {
    out.push({
      id: 'food', cat: 'food', emoji: C('food'),
      text: L(`الأكل برا كلّفك ${fmtMoney(food.sum)} هالشهر`, `Eating out cost you ${fmtMoney(food.sum)} this month`),
      options: [{ label: L('جهّز غداك من البيت', 'Bring lunch from home') }, { label: L('عروض الغداء', 'Lunch deals') }],
      monthly: food.sum * 0.3,
    });
  }
  const rides = stats(by('transport').filter((e) => /أوبر|اوبر|uber|كريم|careem|تاكسي|taxi/i.test(e.title)));
  if (rides.sum >= 80) {
    out.push({
      id: 'rides', cat: 'transport', emoji: '🚕',
      text: L(`مشاوير أوبر/كريم ${rides.n} مرات = ${fmtMoney(rides.sum)}`, `${rides.n} ride-hailing trips = ${fmtMoney(rides.sum)}`),
      options: [{ label: L('مترو / باص', 'Metro / bus') }, { label: L('مشاركة مشوار', 'Share a ride') }],
      monthly: rides.sum * 0.4,
    });
  }
  const gym = stats(by('health').filter((e) => /نادي|جيم|gym/i.test(e.title)));
  if (gym.sum > 0) {
    out.push({
      id: 'gym', cat: 'health', emoji: '🏋️',
      text: L(`النادي ${fmtMoney(gym.sum)} بالشهر`, `The gym is ${fmtMoney(gym.sum)} a month`),
      options: [{ label: L('مشي + تمارين بيت', 'Walking + home workouts'), free: true }],
      monthly: gym.sum,
    });
  }
  const books = stats(by('study'));
  if (books.sum >= 50) {
    out.push({
      id: 'study', cat: 'study', emoji: C('study'),
      text: L(`كتب ودورات ${fmtMoney(books.sum)}`, `Books and courses ${fmtMoney(books.sum)}`),
      options: [{ label: L('مكتبة الجامعة', 'University library'), free: true }, { label: L('المكتبة الرقمية', 'Digital library'), free: true }],
      monthly: books.sum * 0.7,
    });
  }
  const fun = stats(by('fun'));
  if (fun.sum >= 100) {
    out.push({
      id: 'fun', cat: 'fun', emoji: C('fun'),
      text: L(`الترفيه ${fmtMoney(fun.sum)} هالشهر`, `Fun cost ${fmtMoney(fun.sum)} this month`),
      options: [{ label: L('فعاليات مجانية', 'Free events'), free: true }, { label: L('حديقة / مشي', 'Park / a walk'), free: true }],
      monthly: fun.sum * 0.5,
    });
  }
  const regret = stats(list.filter((e) => e.worth === 'no' && e.cat === 'shopping'));
  if (regret.sum > 0) {
    out.push({
      id: 'impulse', cat: 'shopping', emoji: C('shopping'),
      text: L(`مشتريات قلت إنها ما تستحق = ${fmtMoney(regret.sum)}`, `Purchases you said weren't worth it = ${fmtMoney(regret.sum)}`),
      options: [{ label: L('انتظر ٢٤ ساعة قبل الشراء', 'Wait 24 hours before buying') }, { label: L('قائمة مشتريات', 'A shopping list') }],
      monthly: regret.sum,
    });
  }
  for (const sub of state.subs) {
    const idle = subIdle(sub, now);
    if (idle === undefined) continue;
    const free = FREE_SUB.find(([re]) => re.test(sub.name));
    out.push({
      id: 'sub:' + sub.id, cat: 'subs', emoji: C('subs'), subId: sub.id,
      text: L(`«${sub.name}» ما استخدمته من ${idle} يوم — يتجدد ${fmtRenew(sub.next, now)}`, `“${sub.name}” unused for ${idle} days — renews ${fmtRenew(sub.next, now)}`),
      options: [...(free ? [{ label: lang() === 'en' ? free[2] : free[1], free: true }] : []), { label: L('ألغِه', 'Cancel it') }],
      monthly: subMonthly(sub),
    });
  }
  return out.filter((s) => s.monthly >= 1).sort((a, b) => b.monthly - a.monthly);
}

export function fmtRenew(day: string, now = Date.now()): string {
  const d = diffDays(todayKey(now), day);
  if (d <= 0) return L('اليوم', 'today');
  if (d === 1) return L('بكرة', 'tomorrow');
  return L(`بعد ${d} أيام`, `in ${d} days`);
}

/** this month's «ما يستحق» spending, grouped by what was bought */
export function regrets(state: AppState, now = Date.now()) {
  const today = todayKey(now);
  const list = state.expenses.filter((e) => e.worth === 'no' && e.day >= monthStart(today) && e.day <= today);
  const map = new Map<string, { title: string; n: number; sum: number }>();
  for (const e of list) {
    const k = keyOf(e.title || catInfo(e.cat).label);
    const cur = map.get(k) || { title: e.title || catInfo(e.cat).label, n: 0, sum: 0 };
    cur.n++;
    cur.sum += e.amount;
    map.set(k, cur);
  }
  const items = [...map.values()].sort((a, b) => b.sum - a.sum);
  return { total: items.reduce((a, x) => a + x.sum, 0), items };
}

const FREE_ALTS: { cat: ExpenseCat; emoji: string; from: () => string; to: () => string; tag: () => string; free: boolean }[] = [
  { cat: 'coffee', emoji: '☕', from: () => L('قهوة برا', 'Coffee out'), to: () => L('قهوة الدوام', 'Office coffee'), tag: () => L('مجاني', 'Free'), free: true },
  { cat: 'study', emoji: '📚', from: () => L('شراء كتاب', 'Buying a book'), to: () => L('مكتبة الجامعة', 'University library'), tag: () => L('مجاني', 'Free'), free: true },
  { cat: 'health', emoji: '🏋️', from: () => L('اشتراك نادي', 'Gym membership'), to: () => L('مشي + تمارين بيت', 'Walks + home workouts'), tag: () => L('مجاني', 'Free'), free: true },
  { cat: 'delivery', emoji: '🛵', from: () => L('توصيل', 'Delivery'), to: () => L('استلام بنفسك', 'Pick it up'), tag: () => L('أرخص', 'Cheaper'), free: false },
  { cat: 'subs', emoji: '📺', from: () => L('اشتراك أفلام', 'Streaming'), to: () => L('يوتيوب', 'YouTube'), tag: () => L('مجاني', 'Free'), free: true },
  { cat: 'fun', emoji: '🎮', from: () => L('ترفيه مدفوع', 'Paid fun'), to: () => L('فعاليات مجانية', 'Free events'), tag: () => L('مجاني', 'Free'), free: true },
  { cat: 'food', emoji: '🍱', from: () => L('غدا برا', 'Lunch out'), to: () => L('غدا من البيت', 'Lunch from home'), tag: () => L('أرخص', 'Cheaper'), free: false },
  { cat: 'transport', emoji: '🚇', from: () => L('أوبر', 'Uber'), to: () => L('مترو / باص', 'Metro / bus'), tag: () => L('أرخص', 'Cheaper'), free: false },
];

/** free or cheaper alternatives for what you actually spend on (or the common ones, with no data yet) */
export function freeAlternatives(state: AppState, now = Date.now(), max = 4) {
  const spent = new Map<ExpenseCat, number>();
  for (const e of last30(state, now)) spent.set(e.cat, (spent.get(e.cat) || 0) + e.amount);
  const ranked = [...FREE_ALTS].sort((a, b) => (spent.get(b.cat) || 0) - (spent.get(a.cat) || 0) || Number(b.free) - Number(a.free));
  return ranked.slice(0, max).map((a) => ({ cat: a.cat, emoji: a.emoji, from: a.from(), to: a.to(), tag: a.tag(), free: a.free }));
}

/** the habit worth a «what if I cut it down» slider: most frequent of coffee / delivery / food */
export function cutHabit(state: AppState, now = Date.now()) {
  const list = last30(state, now);
  const best = (['coffee', 'delivery', 'food'] as ExpenseCat[])
    .map((c) => ({ cat: c, ...stats(list.filter((e) => e.cat === c)) }))
    .filter((x) => x.n >= 4)
    .sort((a, b) => b.n - a.n)[0];
  return best ? { cat: best.cat, n: best.n, avg: best.sum / best.n } : undefined;
}

export function potential(state: AppState, now = Date.now()) {
  const sw = suggestions(state, now);
  const monthly = sw.reduce((a, s) => a + s.monthly, 0);
  const tried = sw.filter((s) => state.money.swaps[s.id]).reduce((a, s) => a + s.monthly, 0);
  return { monthly, yearly: monthly * 12, tried };
}

// ---------------- report ----------------

export type Period = 'week' | 'month' | 'year';

function rangeOf(period: Period, today: string, back = 0): [string, string] {
  if (period === 'week') {
    const to = addDays(today, -7 * back);
    return [addDays(to, -6), to];
  }
  if (period === 'month') {
    const ref = addMonths(monthStart(today), -back);
    return [ref, back ? monthEnd(ref) : today];
  }
  const y = Number(today.slice(0, 4)) - back;
  return [`${y}-01-01`, back ? `${y}-12-31` : today];
}

export function report(state: AppState, period: Period, now = Date.now()) {
  const today = todayKey(now);
  const [from, to] = rangeOf(period, today);
  const [pFrom, pTo] = rangeOf(period, today, 1);
  const cur = state.expenses.filter((e) => e.day >= from && e.day <= to);
  const prev = state.expenses.filter((e) => e.day >= pFrom && e.day <= pTo);
  const total = cur.reduce((a, e) => a + e.amount, 0);
  const prevTotal = prev.reduce((a, e) => a + e.amount, 0);
  const change = prevTotal > 0 ? (total - prevTotal) / prevTotal : undefined;

  const cats = CAT_ORDER.map((cat) => {
    const t = cur.filter((e) => e.cat === cat).reduce((a, e) => a + e.amount, 0);
    const p = prev.filter((e) => e.cat === cat).reduce((a, e) => a + e.amount, 0);
    return { cat, total: t, prev: p, change: p > 0 ? (t - p) / p : undefined };
  })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  // bars: days of the week / weeks of the month / months of the year
  let buckets: { label: string; total: number; current: boolean }[] = [];
  if (period === 'week') {
    for (let i = 0; i < 7; i++) {
      const d = addDays(from, i);
      buckets.push({ label: shortDay(d), total: sumRange(cur, d, d), current: d === today });
    }
  } else if (period === 'month') {
    const end = monthEnd(from);
    for (let w = 0; w < 5; w++) {
      const a = addDays(from, w * 7);
      if (a > end) break;
      const b = w === 4 ? end : addDays(a, 6) > end ? end : addDays(a, 6);
      buckets.push({ label: L(`أسبوع ${w + 1}`, `Week ${w + 1}`), total: sumRange(cur, a, b), current: today >= a && today <= b });
    }
  } else {
    const y = from.slice(0, 4);
    const names = lang() === 'en' ? ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] : ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'];
    buckets = names.map((label, m) => {
      const a = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      return { label, total: sumRange(cur, a, monthEnd(a)), current: today.slice(0, 7) === a.slice(0, 7) };
    });
  }

  // month view: one bar per day against the daily line
  const daily: { day: string; total: number; future: boolean }[] = [];
  if (period === 'month') {
    const n = daysInMonth(from);
    for (let i = 0; i < n; i++) {
      const d = addDays(from, i);
      daily.push({ day: d, total: sumRange(cur, d, d), future: d > today });
    }
  }
  const budget = state.money.budget || undefined;
  const dailyLine = budget ? budget / daysInMonth(today) : undefined;
  const daysSoFar = diffDays(from, to) + 1;

  return { from, to, total, prevTotal, change, cats, buckets, daily, budget, dailyLine, avgDay: total / Math.max(1, daysSoFar), insights: insights(state, cats, now) };
}

const shortDay = (d: string) => (lang() === 'en' ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] : ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'])[parseKey(d).getDay()];

function insights(state: AppState, cats: { cat: ExpenseCat; total: number; prev: number; change?: number }[], now: number) {
  const out: { emoji: string; text: string }[] = [];
  const today = todayKey(now);
  const since = addDays(today, -59);
  const recent = state.expenses.filter((e) => e.day >= since && e.day <= today);
  // the priciest weekday, once there are two weeks to compare
  if (recent.length && diffDays(recent.reduce((m, e) => (e.day < m ? e.day : m), today), today) >= 13) {
    const sums = Array(7).fill(0);
    const counts = Array(7).fill(0);
    for (let d = since; d <= today; d = addDays(d, 1)) counts[parseKey(d).getDay()]++;
    for (const e of recent) sums[parseKey(e.day).getDay()] += e.amount;
    const avg = sums.map((s, i) => s / Math.max(1, counts[i]));
    const top = avg.indexOf(Math.max(...avg));
    const names = lang() === 'en' ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] : ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    if (avg[top] > 0) out.push({ emoji: '📅', text: L(`أكثر يوم تصرف فيه ${names[top]} — متوسط ${fmtMoney(avg[top])}`, `You spend most on ${names[top]}s — ${fmtMoney(avg[top])} on average`) });
  }
  const moved = cats.filter((c) => c.change !== undefined && Math.abs(c.change) >= 0.15 && Math.abs(c.total - c.prev) >= 30);
  const down = moved.filter((c) => (c.change || 0) < 0).sort((a, b) => (a.change || 0) - (b.change || 0))[0];
  const up = moved.filter((c) => (c.change || 0) > 0).sort((a, b) => (b.total - b.prev) - (a.total - a.prev))[0];
  if (down) out.push({ emoji: catInfo(down.cat).emoji, text: L(`${catInfo(down.cat).label} نزل ${Math.round(-(down.change || 0) * 100)}% عن اللي قبله 👏`, `${catInfo(down.cat).label} is down ${Math.round(-(down.change || 0) * 100)}% 👏`) });
  if (up) out.push({ emoji: '⚠️', text: L(`${catInfo(up.cat).label} زاد ${Math.round((up.change || 0) * 100)}% — ${fmtMoney(up.total - up.prev)} أكثر`, `${catInfo(up.cat).label} is up ${Math.round((up.change || 0) * 100)}% — ${fmtMoney(up.total - up.prev)} more`) });
  // most visited place
  const map = new Map<string, { title: string; n: number; sum: number }>();
  for (const e of recent) {
    if (!e.title || e.source === 'sub') continue;
    const k = keyOf(e.title);
    const cur = map.get(k) || { title: e.title, n: 0, sum: 0 };
    cur.n++;
    cur.sum += e.amount;
    map.set(k, cur);
  }
  const top = [...map.values()].sort((a, b) => b.n - a.n)[0];
  if (top && top.n >= 3) out.push({ emoji: '🏪', text: L(`أكثر شي تكرر: ${top.title} — ${top.n} مرات · ${fmtMoney(top.sum)}`, `Most repeated: ${top.title} — ${top.n} times · ${fmtMoney(top.sum)}`) });
  return out;
}

/** subscriptions sorted by next renewal */
export function upcomingSubs(state: AppState) {
  return [...state.subs].sort((a, b) => a.next.localeCompare(b.next));
}

// ---------------- bank SMS ----------------

const INCOME = /إيداع|ايداع|راتب|حوالة واردة|واردة|استرداد|استرجاع|deposit|credited|refund|received|incoming|salary/i;
const SPEND = /شراء|مشتريات|purchase|pos|مدى|mada|apple ?pay|سداد|دفع|خصم|debit|صادرة|withdraw|سحب|payment|online/i;

/** read purchases out of pasted bank text messages (Arabic or English); income is skipped */
/** a short fingerprint of one message, so a file that keeps growing is never imported twice */
export function smsKey(chunk: string): string {
  const t = chunk.replace(/\s+/g, ' ').trim();
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 33) ^ c;
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + t.length.toString(36);
}

export function parseBankSms(text: string, now = Date.now()) {
  const clean = toWestern(text).replace(/٫/g, '.').replace(/\r/g, '');
  // the Shortcuts automation separates messages with a «---» line; pasted ones are split on blank lines
  let chunks = clean.split(/\n\s*-{3,}\s*(?=\n|$)/).map((c) => c.trim()).filter(Boolean);
  // no «---»? each saved message still starts with its own date line (2026-10-24 17:26)
  if (chunks.length === 1) chunks = clean.split(/\n(?=\s*\d{4}-\d{1,2}-\d{1,2}[ T]\d{1,2}:\d{2}\s*\n)/).map((c) => c.trim()).filter(Boolean);
  if (chunks.length === 1) chunks = clean.split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean);
  if (chunks.length === 1) chunks = clean.split(/(?=(?:^|\n)\s*(?:شراء|purchase|pos|مدفوعات|سداد|عملية))/i).map((c) => c.trim()).filter(Boolean);
  const today = todayKey(now);
  const out: { title: string; amount: number; day: string; time?: string; cat: ExpenseCat; key: string }[] = [];
  for (const c of chunks) {
    if (INCOME.test(c) && !SPEND.test(c.replace(INCOME, ''))) continue;
    const m =
      c.match(/(?:SAR|ر\.?\s?س|ريال|SR)\s*:?\s*([\d,]+(?:\.\d+)?)/i) ||
      c.match(/([\d,]+(?:\.\d+)?)\s*(?:SAR|ر\.?\s?س|ريال|SR)\b/i) ||
      c.match(/(?:مبلغ|بمبلغ|المبلغ|amount)\s*:?\s*([\d,]+(?:\.\d+)?)/i);
    if (!m) continue;
    const amount = Number(m[1].replace(/,/g, ''));
    if (!(amount > 0)) continue;
    // merchant: the specific words first, the vague ones («من», «في») only as a fallback
    let title = '';
    for (const w of ['لدى', 'عند', 'التاجر', 'المتجر', 'merchant', 'at', 'من', 'from', 'في']) {
      const mm = c.match(new RegExp(`(?:^|[\\s:])${w}(?:\\s*:\\s*|\\s+)([^\\n]+)`, 'i'));
      if (mm && /[A-Za-z\u0621-\u064A]{2}/.test(mm[1]) && !/^(بطاقة|حساب|card|account)/i.test(mm[1].trim())) {
        title = mm[1];
        break;
      }
    }
    title = title.replace(/(?:SAR|ر\.?\s?س|ريال|SR)\s*[\d,.]+/gi, '').replace(/\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}.*$/, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    let day = today;
    const dm = c.match(/(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})/);
    if (dm) {
      let [y, mo, d] = dm[1].length === 4 ? [dm[1], dm[2], dm[3]] : [dm[3], dm[2], dm[1]];
      if (y.length === 2) y = '20' + y;
      const k = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k <= today && k >= addDays(today, -400)) day = k;
    }
    const tm = c.match(/\b(\d{1,2}):(\d{2})\b/);
    out.push({ title: title || L('مشتريات', 'Purchase'), amount, day, ...(tm ? { time: `${tm[1].padStart(2, '0')}:${tm[2]}` } : {}), cat: guessCat(title), key: smsKey(c) });
  }
  return out;
}
