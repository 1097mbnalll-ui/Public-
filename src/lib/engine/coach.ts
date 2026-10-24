// The coach: turns your plan and history into one honest message for today.
// The lateness score drives the tone — the further behind you are, the firmer it gets.

import type { AppState, CoachTone, Priority } from '../types';
import { addDays, diffDays, todayKey } from '../dates';
import { L } from '../i18n';
import type { DayPlan } from './planner';
import { calibration } from './learning';
import { moneyToday, regrets } from './money';

export interface LateItem {
  title: string;
  days: number;
  priority: Priority;
  deferrals: number;
  kind: 'task' | 'procedure';
}

export interface CoachFacts {
  today: string;
  hour: number;
  doneToday: string[];
  leftToday: { title: string; minutes: number; level?: 'urgent' | 'important' }[];
  overdue: LateItem[];
  postponedOften: { title: string; deferrals: number }[];
  study: { exam: string; daysLeft: number; status: string; quota: number; doneToday: number; yesterday?: { quota: number; done: number } }[];
  learned: { estimateFactor: number; estimateN: number; doneLast7: number; studyLast7: number };
  /** lateness score for today and the six days before it (oldest first) */
  trend: number[];
  score: number;
  /** 0 on track · 1 slipping · 2 behind · 3 well behind · 4 seriously behind */
  level: number;
  /** spending, when the user tracks it */
  money?: { spentToday: number; allowance?: number; spentMonth: number; budget?: number; regretMonth: number };
}

// low-priority items never drive the scolding — they're allowed to wait
const WEIGHT: Record<number, number> = { 3: 3, 2: 2, 1: 1, 0: 0 };

export function lateness(state: AppState, plan: DayPlan, now = Date.now()): { score: number; overdue: LateItem[] } {
  const today = todayKey(now);
  const overdue: LateItem[] = [];
  for (const t of state.tasks) {
    if (t.status !== 'open' || !t.due || t.due >= today) continue;
    overdue.push({ title: t.title, days: diffDays(t.due, today), priority: t.priority, deferrals: t.deferrals, kind: 'task' });
  }
  for (const p of state.procedures) {
    if (p.archived || p.completedAt || !p.due || p.due >= today) continue;
    overdue.push({ title: p.title, days: diffDays(p.due, today), priority: p.priority, deferrals: p.deferrals || 0, kind: 'procedure' });
  }
  overdue.sort((a, b) => b.days * WEIGHT[b.priority] - a.days * WEIGHT[a.priority]);

  let score = 0;
  for (const o of overdue) score += Math.min(o.days, 14) * WEIGHT[o.priority];
  for (const t of state.tasks) if (t.status === 'open' && t.priority >= 1 && t.deferrals >= 2) score += Math.min(t.deferrals, 6) - 1;
  for (const ep of plan.study.exams) {
    if (ep.status === 'behind') score += 3;
    else if (ep.status === 'tight') score += 1;
    const y = ep.yesterday;
    if (y && y.quota > 0 && y.done < y.quota) score += Math.min(4, Math.round((y.quota - y.done) / 30));
  }
  // urgent work still open late in the day
  const h = new Date(now).getHours();
  if (h >= 18) score += plan.items.filter((i) => i.level === 'urgent').length * 2;
  return { score, overdue };
}

export function levelOf(score: number): number {
  if (score <= 0) return 0;
  if (score <= 3) return 1;
  if (score <= 8) return 2;
  if (score <= 15) return 3;
  return 4;
}

/** gentle never scolds; firm stops one step short of the harshest */
export function toneLevel(level: number, tone: CoachTone): number {
  if (tone === 'gentle') return Math.min(level, 1);
  if (tone === 'firm') return Math.min(level, 3);
  return level;
}

export function coachFacts(state: AppState, plan: DayPlan, now = Date.now()): CoachFacts {
  const today = todayKey(now);
  const { score, overdue } = lateness(state, plan, now);
  const doneToday = state.tasks.filter((t) => t.status === 'done' && t.completedAt && todayKey(t.completedAt) === today).map((t) => t.title);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const cal = calibration(state);
  return {
    today,
    hour: new Date(now).getHours(),
    doneToday,
    leftToday: plan.items.map((i) => ({ title: i.title, minutes: i.minutes, level: i.level })),
    overdue: overdue.slice(0, 8),
    postponedOften: state.tasks
      .filter((t) => t.status === 'open' && t.deferrals >= 2)
      .sort((a, b) => b.deferrals - a.deferrals)
      .slice(0, 5)
      .map((t) => ({ title: t.title, deferrals: t.deferrals })),
    study: plan.study.exams.map((ep) => ({
      exam: ep.exam.title,
      daysLeft: ep.daysLeft,
      status: ep.status,
      quota: Math.round(ep.quota),
      doneToday: Math.round(ep.doneToday),
      yesterday: ep.yesterday && { quota: Math.round(ep.yesterday.quota), done: Math.round(ep.yesterday.done) },
    })),
    learned: {
      estimateFactor: Math.round(cal.factor * 100) / 100,
      estimateN: cal.n,
      doneLast7: week.reduce((n, d) => n + (state.days[d]?.done || 0), 0),
      studyLast7: Math.round(week.reduce((n, d) => n + (state.days[d]?.study || 0), 0)),
    },
    trend: week.map((d) => (d === today ? score : state.coach.history[d] ?? 0)),
    score,
    level: levelOf(score),
    money: moneyFacts(state, now),
  };
}

function moneyFacts(state: AppState, now: number): CoachFacts['money'] {
  if (!state.money.budget && !state.expenses.length) return undefined;
  const m = moneyToday(state, now);
  return { spentToday: Math.round(m.spentToday), allowance: m.allowance === undefined ? undefined : Math.round(m.allowance), spentMonth: Math.round(m.spentMonth), budget: m.budget, regretMonth: Math.round(regrets(state, now).total) };
}

/** one line about today's spending, as strong as the tone allows */
function moneyLine(f: CoachFacts, lvl: number): string {
  const m = f.money;
  if (!m || m.allowance === undefined) return '';
  const over = m.spentToday - m.allowance;
  if (over > 0) {
    const ratio = over / Math.max(1, m.allowance);
    if (lvl >= 3 || ratio >= 0.5)
      return L(` وفوق هذا فلوسك: صرفت ${m.spentToday} ر.س اليوم وحدّك ${m.allowance} — تجاوزته بـ${over}. وقّف الصرف لين بكرة، ولا تفتح تطبيق توصيل.`, ` And your money: you spent ${m.spentToday} SAR today against ${m.allowance} — ${over} over. No more spending until tomorrow, and don't open a delivery app.`);
    return L(` انتبه لفلوسك: صرفت ${m.spentToday} من ${m.allowance} ر.س المسموحة اليوم.`, ` Watch your money: ${m.spentToday} of today's ${m.allowance} SAR spent.`);
  }
  if (f.hour >= 20 && m.spentToday <= m.allowance * 0.6) return L(' ومصاريفك اليوم تحت السيطرة 👏', ' And your spending today is under control 👏');
  return '';
}

/** a stable fingerprint: the cached message is reused until something that matters changes */
export function factsKey(f: CoachFacts, tone: CoachTone, lang: string): string {
  const over = f.money?.allowance !== undefined && f.money.spentToday > f.money.allowance;
  return [f.today, tone, lang, f.level, f.overdue.length, f.leftToday.length, f.doneToday.length, Math.floor(f.hour / 6), over ? 'm' : ''].join('|');
}

/** «شيء واحد / شيئين / 3 أشياء» — Arabic counted nouns */
function countAr(n: number, one: string, two: string, few: string, many = few): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${n} ${n <= 10 ? few : many}`;
}

function pick<T>(xs: T[], seed: string): T {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return xs[Math.abs(h) % xs.length];
}

/** built-in message, used without an API key or when the AI call fails */
export function offlineMessage(f: CoachFacts, tone: CoachTone): string {
  const lvl = toneLevel(f.level, tone);
  const counted = f.overdue.filter((o) => o.priority >= 1);
  const worst = counted[0];
  const next = f.leftToday[0];
  const urgentNow = f.leftToday.find((i) => i.level === 'urgent');
  const w = worst ? `«${worst.title}»` : '';
  const d = worst ? worst.days : 0;
  const days = countAr(d, 'يوم', 'يومين', 'أيام', 'يومًا');
  const n = counted.length;
  const late = countAr(n, 'مهمة متأخرة', 'مهمتين متأخرتين', 'مهام متأخرة', 'مهمة متأخرة');
  const doneN = countAr(f.doneToday.length, 'مهمة', 'مهمتين', 'مهام', 'مهمة');
  // what's urgent today always comes first
  const nx = urgentNow
    ? L(` «${urgentNow.title}» عاجل وما يتأجل — ابدأ فيه الحين.`, ` “${urgentNow.title}” is urgent and can't wait — start it now.`)
    : next
      ? L(` ابدأ الآن بـ«${next.title}».`, ` Start “${next.title}” now.`)
      : '';
  const lines: Record<number, string[]> = {
    0: f.doneToday.length
      ? [
          L(`أنجزت ${doneN} اليوم وما عليك تأخير — هذا الانضباط اللي يفرق. كمّل.`, `You finished ${f.doneToday.length} today with nothing overdue — that's the discipline that counts. Keep going.`),
          L('يومك نظيف ومافي شيء متأخر. حافظ على هالمستوى، النجاح تراكم أيام مثل هذا.', 'Clean day, nothing overdue. Keep this up — success is a pile of days like this one.'),
        ]
      : [
          L('ما عليك أي تأخير، والبداية الحين أسهل من بعدين.' + nx, 'Nothing overdue — and starting now is easier than later.' + nx),
          L('الطريق مفتوح قدامك اليوم. خطوة وحدة الحين تفتح الباقي.' + nx, 'The road is clear today. One step now opens up the rest.' + nx),
        ],
    1: [
      L(`بدأت تتزحلق شوي${w ? ` — ${w} صار له ${days}` : ''}. لا تخليها تكبر، خلّصها اليوم.${nx}`, `You're starting to slip${w ? ` — ${w} is ${d} day${d === 1 ? '' : 's'} late` : ''}. Don't let it grow; finish it today.${nx}`),
      L(`تأخير بسيط، بس التأخير البسيط هو اللي يصير كبير. ${w ? `${w} أولًا.` : ''}${nx}`, `A small delay — but small delays are what become big ones. ${w ? `${w} first.` : ''}${nx}`),
    ],
    2: [
      L(`أنت متأخر. ${w} له ${days} وأنت تأجل. كل يوم تأجيل يخلي الحمل أثقل عليك بكرة. اقفل كل شيء ثاني وخلّصه.`, `You're behind. ${w} is ${d} day${d === 1 ? '' : 's'} late and you keep pushing it. Every day you postpone makes tomorrow heavier. Shut everything else and finish it.`),
      L(`الوضع ما يطمّن: ${late}. ما يحتاج تحفيز، يحتاج تبدأ. الحين.`, `This isn't reassuring: ${f.overdue.length} thing${f.overdue.length === 1 ? '' : 's'} overdue. You don't need motivation — you need to start. Now.`),
    ],
    3: [
      L(`لا، هذا ما يصير. ${w} متأخر ${days} وأنت تعرف إنه لازم ينخلص. التأجيل صار عادة عندك، والعادة هذي تكلفك. اليوم ما فيه أعذار — ابدأ فيه قبل أي شيء.`, `No, this won't do. ${w} is ${d} day${d === 1 ? '' : 's'} late and you know it has to get done. Postponing has become a habit, and that habit is costing you. No excuses today — start it before anything else.`),
      L(`أنت قاعد تخذل نفسك. عندك ${late}، وكل وحدة كانت تاخذ أقل من الوقت اللي ضاع وأنت تأجلها. وقّف التبرير وابدأ بـ${w || 'أول شيء في القائمة'}.`, `You're letting yourself down. ${f.overdue.length} tasks overdue, and each would have taken less time than you've lost postponing it. Stop justifying and start ${w || 'the first thing on the list'}.`),
    ],
    4: [
      L(`هذا تأخير ثقيل وما راح أجامّلك فيه. ${w} صار له ${days}، و${late} متكدّسة فوقك لأنك اخترت تأجلها مرة بعد مرة. المواعيد ما تنتظرك والنتيجة راح تدفعها أنت. سكّر الجوال، افتح ${w}، ولا تقوم إلا وهو خالص.`, `This is a serious delay and I won't sugar-coat it. ${w} is ${d} day${d === 1 ? '' : 's'} late, and ${f.overdue.length} things are piled on you because you chose to postpone them again and again. Deadlines don't wait, and you'll pay the price. Put the phone away, open ${w}, and don't get up until it's done.`),
      L(`كفاية. الأرقام واضحة: ${late}، وأقدمها ${days}. أنت مو مشغول، أنت تهرب. اليوم تخلّص ${w} أول شيء — بدون نقاش.`, `Enough. The numbers are clear: ${f.overdue.length} overdue, the oldest ${d} day${d === 1 ? '' : 's'}. You're not busy — you're avoiding. Today you finish ${w} first. No discussion.`),
    ],
  };
  return pick(lines[lvl], f.today + f.overdue.length) + moneyLine(f, lvl);
}

const TONE_RULES: Record<CoachTone, string> = {
  gentle: 'Tone: warm and encouraging. Never scold, even when behind — motivate and point to the next step.',
  firm: 'Tone: direct and honest. Praise real progress; when behind, call it out plainly and firmly. Strength must match the lateness level (0–3).',
  harsh: 'Tone: a tough, no-nonsense coach the user explicitly asked for. When behind, scold hard — blunt, stinging, proportional to the lateness level (0–4); at level 4 be severe. When on track, give short strong praise.',
};

/** system prompt for both the daily message and the chat */
export function coachSystem(tone: CoachTone, lang: 'ar' | 'en', about: string): string {
  return [
    'You are the personal coach inside «Masar», a planning app. You know the user only through the facts given to you.',
    lang === 'ar'
      ? 'Always reply in natural Saudi/Gulf Arabic dialect, short and human.'
      : 'Always reply in natural, plain English, short and human.',
    TONE_RULES[tone],
    'Hard limits, at every level: criticise the behaviour, never the person — no insults about intelligence, worth, looks, family or religion, no profanity, no threats. Every scolding ends with one concrete action to do right now.',
    'Use the actual item names and numbers from the facts. Never invent tasks, dates or numbers that are not in the facts.',
    'If the trend shows several bad days in a row, say so; if things improved, acknowledge it.',
    about.trim() ? `What the user told you about themselves:\n${about.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function factsText(f: CoachFacts): string {
  return JSON.stringify(
    {
      now: `${f.today} ${f.hour}:00`,
      lateness: { score: f.score, level: f.level, last7days: f.trend },
      doneToday: f.doneToday,
      stillPlannedToday: f.leftToday,
      overdue: f.overdue,
      postponedOften: f.postponedOften,
      exams: f.study,
      ...(f.money ? { spending: { todaySAR: f.money.spentToday, todayAllowanceSAR: f.money.allowance, monthSAR: f.money.spentMonth, monthBudgetSAR: f.money.budget, notWorthItThisMonthSAR: f.money.regretMonth } } : {}),
      learnedAboutUser: {
        estimateAccuracy: f.learned.estimateN >= 3 ? `real time ≈ ${f.learned.estimateFactor}× own estimates` : 'not enough data yet',
        tasksDoneLast7Days: f.learned.doneLast7,
        studyMinutesLast7Days: f.learned.studyLast7,
      },
    },
    null,
    1,
  );
}
