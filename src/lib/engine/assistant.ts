// The personal assistant behind the coach chat. It answers the everyday questions —
// what's on today, a summary, what can wait, how am I doing — straight from your data,
// so it works without any AI. With a Claude key, the same data is handed to Claude.

import type { AppState, CoachAction, CoachTone } from '../types';
import { addDays, diffDays, fmtDate, fmtMinutes, relDay, todayKey } from '../dates';
import { L } from '../i18n';
import { planDay, procLevel, suggestDeferrals, weekLoad, type DayPlan, type PlanItem } from './planner';
import { calibration } from './learning';
import { coachFacts, toneLevel } from './coach';
import { blocksOn } from './schedule';
import { catInfo as catInfoFn, fmtMoney, moneyToday, potential, regrets, suggestions, report } from './money';

export type Intent = 'today' | 'summary' | 'defer' | 'performance' | 'now' | 'money' | 'help';

/** keyword matching for Gulf/MSA Arabic and English */
export function detectIntent(q: string): Intent {
  const t = q.toLowerCase();
  if (/صرف|مصروف|مصاريف|فلوس|ميزاني|وفّر|وفر|توفير|ريال|spend|money|budget|saving|expense/.test(t)) return 'money';
  if (/أأجل|اأجل|أاجل|اجل|أجل|أجّل|تأجيل|يتأجل|اخليه|أخليه لبكرة|postpone|defer|wait|push/.test(t)) return 'defer';
  if (/أداء|ادائي|أدائي|مستواي|رأيك|رايك|تقييم|كيف ماشي|perform|doing|how am i|rate me/.test(t)) return 'performance';
  if (/ملخص|لخص|الأسبوع|الاسبوع|وضعي|summary|summar|week|overview/.test(t)) return 'summary';
  if (/الحين|الآن|أبدأ|ابدأ|ابدا|وش أسوي|ايش اسوي|now|start|next/.test(t)) return 'now';
  if (/عندي|اليوم|علي|علي ايش|وش علي|today|have|agenda/.test(t)) return 'today';
  return 'help';
}

export interface Performance {
  done7: number;
  donePrev7: number;
  study7: number;
  quota7: number;
  onTime: { on: number; total: number };
  deferredOpen: number;
  overdue: number;
  estimateFactor: number;
  estimateN: number;
  /** 0–100 */
  score: number;
}

export function performance(state: AppState, now = Date.now()): Performance {
  const today = todayKey(now);
  const days = (from: number, n: number) => Array.from({ length: n }, (_, i) => addDays(today, from + i));
  const sum = (ds: string[], k: 'done' | 'study') => ds.reduce((a, d) => a + (state.days[d]?.[k] || 0), 0);
  const last7 = days(-6, 7);
  const prev7 = days(-13, 7);
  const quota7 = last7.reduce((a, d) => a + Object.values(state.quotaLog[d] || {}).reduce((x, y) => x + y, 0), 0);
  const since = now - 30 * 86_400_000;
  const dated = state.tasks.filter((t) => t.status === 'done' && t.due && (t.completedAt || 0) >= since);
  const on = dated.filter((t) => todayKey(t.completedAt!) <= t.due!).length;
  const overdue = state.tasks.filter((t) => t.status === 'open' && t.due && t.due < today).length;
  const deferredOpen = state.tasks.filter((t) => t.status === 'open' && t.deferrals >= 2).length;
  const cal = calibration(state);
  const study7 = Math.round(sum(last7, 'study'));

  let score = 60;
  if (dated.length) score += (on / dated.length - 0.7) * 50;
  if (quota7 > 0) score += (Math.min(1.2, study7 / quota7) - 0.8) * 40;
  score -= overdue * 5 + deferredOpen * 3;
  const done7 = sum(last7, 'done');
  const donePrev7 = sum(prev7, 'done');
  if (done7 > donePrev7) score += 5;
  else if (done7 < donePrev7) score -= 5;
  return { done7, donePrev7, study7, quota7: Math.round(quota7), onTime: { on, total: dated.length }, deferredOpen, overdue, estimateFactor: cal.factor, estimateN: cal.n, score: Math.max(0, Math.min(100, Math.round(score))) };
}

const bullet = (xs: string[]) => xs.map((x) => `• ${x}`).join('\n');
const itemLine = (i: PlanItem) => `${i.title}${i.sub ? ` — ${i.sub}` : ''} (~${fmtMinutes(i.minutes)})`;

/** what can move to tomorrow without breaking the priority rules */
export function deferrable(state: AppState, plan: DayPlan): PlanItem[] {
  const needed = suggestDeferrals(plan, state);
  if (needed.length) return needed;
  return plan.items.filter((i) => {
    if (i.must || i.kind === 'study') return false;
    if (i.kind === 'task') return state.tasks.find((t) => t.id === i.id)?.priority !== 3;
    const p = state.procedures.find((x) => x.id === i.id);
    return !!p && !procLevel(p, plan.today).must;
  });
}

export interface Reply {
  text: string;
  actions?: CoachAction[];
}

export function answer(intent: Intent, state: AppState, tone: CoachTone, now = Date.now()): Reply {
  const plan = planDay(state, now);
  const today = plan.today;
  const studyItems = plan.items.filter((i) => i.kind === 'study');
  const urgent = plan.items.filter((i) => i.level === 'urgent');
  const facts = coachFacts(state, plan, now);

  switch (intent) {
    case 'today': {
      if (!plan.items.length) return { text: L('ما عليك شيء ملح اليوم. تقدر تتقدم في شيء من «لو بقي وقت» أو ترتاح.', "Nothing pressing today. Get ahead on something under “If there's time”, or rest.") };
      const parts = [L(`عندك اليوم ${plan.items.length} ${plan.items.length === 1 ? 'شيء' : 'أشياء'} بمجموع ${fmtMinutes(plan.load)} من وقتك (${fmtMinutes(plan.remaining)} متاح):`, `Today you have ${plan.items.length} item${plan.items.length === 1 ? '' : 's'}, ${fmtMinutes(plan.load)} in total (${fmtMinutes(plan.remaining)} available):`)];
      if (urgent.length) parts.push(L('العاجل — لا يتأجل:', 'Urgent — not postponable:') + '\n' + bullet(urgent.map(itemLine)));
      if (studyItems.length) parts.push(L('المذاكرة المطلوبة:', 'Study required:') + '\n' + bullet(studyItems.map(itemLine)));
      const others = plan.items.filter((i) => i.level !== 'urgent' && i.kind !== 'study');
      if (others.length) parts.push(L('وبعدها:', 'Then:') + '\n' + bullet(others.map(itemLine)));
      if (facts.overdue.length) parts.push(L(`وعندك ${facts.overdue.length} متأخرة من قبل، أقدمها «${facts.overdue[0].title}».`, `Plus ${facts.overdue.length} overdue from before, the oldest “${facts.overdue[0].title}”.`));
      if (plan.overloaded) parts.push(L(`يومك أكبر من وقتك بـ${fmtMinutes(plan.overBy)} — اسألني «وش أأجل؟».`, `Your day is ${fmtMinutes(plan.overBy)} over your time — ask me “what can I postpone?”.`));
      return { text: parts.join('\n\n'), actions: [{ label: L('افتح صفحة اليوم', 'Open Today'), kind: 'go', path: 'today' }] };
    }

    case 'now': {
      const first = plan.items[0];
      if (!first) return { text: L('ما عليك شيء الحين. خذ راحتك أو قدّم شيء من «لو بقي وقت».', "Nothing due right now. Rest, or get ahead on something under “If there's time”.") };
      const why = first.reasons[0] ? ` — ${first.reasons[0]}` : '';
      return { text: L(`ابدأ بـ«${first.title}»${why}. ياخذ تقريبًا ${fmtMinutes(first.minutes)}.${first.sub ? `\n${first.sub}` : ''}`, `Start with “${first.title}”${why}. About ${fmtMinutes(first.minutes)}.${first.sub ? `\n${first.sub}` : ''}`), actions: [{ label: L('افتح صفحة اليوم', 'Open Today'), kind: 'go', path: 'today' }] };
    }

    case 'defer': {
      const can = deferrable(state, plan);
      const keep = plan.items.filter((i) => !can.includes(i));
      if (!can.length) {
        const waiting = plan.later.slice(0, 6);
        const parts = [
          plan.items.length
            ? L(`ما أنصحك تأجل شيء من يومك: كل اللي فيه ${urgent.length ? 'عاجل أو ' : ''}مهم أو موعده قريب أو مذاكرة مطلوبة.`, `I wouldn't move anything off today: it's all ${urgent.length ? 'urgent, ' : ''}important, due soon, or required study.`)
            : L('يومك فاضي من الأشياء الملزمة.', 'Nothing binding on today.'),
          waiting.length ? L('وهذي أصلًا مؤجلة تحت «لو بقي وقت» — لا تشغل بالك فيها اليوم:', "These are already set aside under “If there's time” — don't worry about them today:") + '\n' + bullet(waiting.map((i) => i.title)) : '',
          plan.overloaded ? L(`يومك أكبر من وقتك بـ${fmtMinutes(plan.overBy)} — زد وقتك اليوم من صفحة «اليوم» أو ابدأ الحين.`, `Your day is ${fmtMinutes(plan.overBy)} over — add time on the Today page, or start now.`) : '',
        ];
        return { text: parts.filter(Boolean).join('\n\n') };
      }
      const text = [
        plan.overloaded
          ? L(`يومك أكبر من وقتك بـ${fmtMinutes(plan.overBy)}. تقدر تأجل لبكرة:`, `Your day is ${fmtMinutes(plan.overBy)} over. You can move to tomorrow:`)
          : L('يومك يكفي، لكن لو احتجت وقت هذي اللي تتحمل التأجيل:', 'Your day fits, but if you need time, these can wait:'),
        bullet(can.map(itemLine)),
        keep.length ? L('ولا تأجل هذي أبدًا:', 'And never postpone these:') + '\n' + bullet(keep.map((i) => i.title)) : '',
      ].filter(Boolean).join('\n\n');
      return { text, actions: [{ label: L(`أجّلها لبكرة (${can.length})`, `Move to tomorrow (${can.length})`), kind: 'defer', ids: can.map((i) => i.id) }] };
    }

    case 'summary': {
      const week = weekLoad(state, now, 7, plan.study);
      const heavy = week.filter((d) => d.overloaded);
      const exams = plan.study.exams.filter((e) => e.daysLeft >= 0);
      const perf = performance(state, now);
      const parts = [
        L(`اليوم: ${plan.items.length} ${plan.items.length === 1 ? 'شيء' : 'أشياء'} (${fmtMinutes(plan.load)})${urgent.length ? `، منها ${urgent.length} عاجلة` : ''}.`, `Today: ${plan.items.length} item${plan.items.length === 1 ? '' : 's'} (${fmtMinutes(plan.load)})${urgent.length ? `, ${urgent.length} urgent` : ''}.`),
        facts.overdue.length ? L(`متأخرة: ${facts.overdue.length} — ${facts.overdue.slice(0, 3).map((o) => `«${o.title}» (${o.days} ي)`).join('، ')}.`, `Overdue: ${facts.overdue.length} — ${facts.overdue.slice(0, 3).map((o) => `“${o.title}” (${o.days}d)`).join(', ')}.`) : L('ما عليك شيء متأخر ✓', 'Nothing overdue ✓'),
        exams.length ? L('الاختبارات:', 'Exams:') + '\n' + bullet(exams.map((e) => L(`${e.course.name} — ${e.exam.title} ${relDay(e.exam.date, today)} (${fmtDate(e.exam.date, false)})، جاهزيتك ${Math.round(e.progress * 100)}%`, `${e.course.name} — ${e.exam.title} ${relDay(e.exam.date, today)} (${fmtDate(e.exam.date, false)}), ${Math.round(e.progress * 100)}% ready`))) : '',
        heavy.length ? L(`أيام ثقيلة هذا الأسبوع: ${heavy.map((d) => relDay(d.day, today)).join('، ')}.`, `Heavy days this week: ${heavy.map((d) => relDay(d.day, today)).join(', ')}.`) : L('ما فيه يوم محمّل فوق طاقتك هذا الأسبوع.', 'No day this week is over capacity.'),
        L(`آخر ٧ أيام: أنجزت ${perf.done7} وذاكرت ${fmtMinutes(perf.study7)}${perf.quota7 ? ` من ${fmtMinutes(perf.quota7)} مطلوبة` : ''}.`, `Last 7 days: finished ${perf.done7} and studied ${fmtMinutes(perf.study7)}${perf.quota7 ? ` of ${fmtMinutes(perf.quota7)} required` : ''}.`),
      ];
      return { text: parts.filter(Boolean).join('\n\n'), actions: [{ label: L('الأيام السبعة', 'Next 7 days'), kind: 'go', path: 'week' }] };
    }

    case 'money': {
      if (!state.expenses.length && !state.money.budget)
        return { text: L('لسا ما سجّلت مصاريف. سجّل مصاريفك من «مصاريفي» أسبوع، وأقول لك وين تروح فلوسك وكم تقدر توفر.', "You haven't logged any spending yet. Log it in “Spending” for a week and I'll tell you where your money goes and how much you could save."), actions: [{ label: L('مصاريفي', 'Spending'), kind: 'go', path: 'money' }] };
      const m = moneyToday(state, now);
      const r = report(state, 'month', now);
      const sw = suggestions(state, now);
      const pot = potential(state, now);
      const reg = regrets(state, now);
      const lvl = toneLevel(facts.level, tone);
      const over = m.allowance !== undefined && m.spentToday > m.allowance;
      const lines = [
        m.budget
          ? L(`هذا الشهر صرفت ${fmtMoney(m.spentMonth)} من ${fmtMoney(m.budget)} — باقي ${fmtMoney(m.leftMonth || 0)} لـ${m.daysLeft} أيام.`, `This month: ${fmtMoney(m.spentMonth)} of ${fmtMoney(m.budget)} — ${fmtMoney(m.leftMonth || 0)} left for ${m.daysLeft} days.`)
          : L(`هذا الشهر صرفت ${fmtMoney(m.spentMonth)}. حدد ميزانية عشان أقول لك كم تقدر تصرف كل يوم.`, `This month: ${fmtMoney(m.spentMonth)}. Set a budget so I can tell you your daily limit.`),
        m.allowance !== undefined
          ? over
            ? lvl >= 2
              ? L(`اليوم تجاوزت حدّك: ${fmtMoney(m.spentToday)} من ${fmtMoney(m.allowance)}. خلاص، ولا ريال زيادة اليوم.`, `You're over today's limit: ${fmtMoney(m.spentToday)} of ${fmtMoney(m.allowance)}. That's it — not one more riyal today.`)
              : L(`اليوم صرفت ${fmtMoney(m.spentToday)} وحدّك ${fmtMoney(m.allowance)} — حاول توقف هنا.`, `Today: ${fmtMoney(m.spentToday)} against a ${fmtMoney(m.allowance)} limit — try to stop here.`)
            : L(`اليوم صرفت ${fmtMoney(m.spentToday)} من ${fmtMoney(m.allowance)} — ماشي صح ✓`, `Today: ${fmtMoney(m.spentToday)} of ${fmtMoney(m.allowance)} — on track ✓`)
          : '',
        r.cats.length ? L(`أكثر شي تصرف عليه: ${r.cats.slice(0, 3).map((c) => `${catLabel(c.cat)} ${fmtMoney(c.total)}`).join('، ')}.`, `Biggest categories: ${r.cats.slice(0, 3).map((c) => `${catLabel(c.cat)} ${fmtMoney(c.total)}`).join(', ')}.`) : '',
        r.change !== undefined ? L(`مقارنة بالشهر اللي قبله: ${r.change <= 0 ? 'أقل' : 'أكثر'} بـ${Math.abs(Math.round(r.change * 100))}%.`, `Compared with last month: ${Math.abs(Math.round(r.change * 100))}% ${r.change <= 0 ? 'less' : 'more'}.`) : '',
        reg.total ? L(`صرفت ${fmtMoney(reg.total)} على أشياء قلت إنها ما تستحق.`, `${fmtMoney(reg.total)} went on things you said weren't worth it.`) : '',
        sw.length ? L(`تقدر توفر ≈ ${fmtMoney(pot.monthly)} بالشهر. أكبرها: ${sw[0].text} — ${sw[0].options.map((o) => o.label).join(' أو ')}.`, `You could save ≈ ${fmtMoney(pot.monthly)} a month. The biggest: ${sw[0].text} — ${sw[0].options.map((o) => o.label).join(' or ')}.`) : '',
      ];
      return { text: lines.filter(Boolean).join('\n\n'), actions: [{ label: L('وين أوفّر؟', 'Where to save'), kind: 'go', path: 'money/save' }] };
    }

    case 'performance': {
      const p = performance(state, now);
      if (!p.done7 && !p.donePrev7 && !p.onTime.total && !p.quota7 && !p.overdue)
        return { text: L('لسا ما عندي بيانات كافية أحكم فيها على أداءك. خلّص مهامك وسجّل مذاكرتك كم يوم، وبعدها أعطيك تقييم صريح بالأرقام.', "I don't have enough data to judge yet. Finish tasks and log your study for a few days, then I'll give you a frank verdict with numbers.") };
      const lvl = toneLevel(facts.level, tone);
      const verdict =
        p.score >= 80
          ? L('أداءك ممتاز — مستمر وملتزم.', "You're doing excellently — consistent and committed.")
          : p.score >= 60
            ? L('أداءك جيد، بس فيه مجال واضح للتحسن.', "You're doing well, with clear room to improve.")
            : p.score >= 40
              ? lvl >= 2
                ? L('بصراحة: أداءك متوسط وأنت قادر على أحسن بكثير.', "Honestly: you're average, and capable of much better.")
                : L('أداءك متوسط — خطوات صغيرة كل يوم تفرق.', "You're about average — small daily steps will change that.")
              : lvl >= 3
                ? L('أداءك ضعيف، وهذا مو حظ — هذا تأجيل متكرر. لازم يتغير من اليوم.', "Your performance is poor, and it isn't luck — it's repeated postponing. It has to change today.")
                : L('أداءك هذي الفترة ضعيف، بس تقدر تقلبه من اليوم.', "You've been struggling lately, but you can turn it around today.");
      const lines = [
        `${verdict} (${p.score}/100)`,
        L(`• الإنجاز: ${p.done7} هذا الأسبوع مقابل ${p.donePrev7} الأسبوع اللي قبله${p.done7 > p.donePrev7 ? ' ↑' : p.done7 < p.donePrev7 ? ' ↓' : ''}.`, `• Finished: ${p.done7} this week vs ${p.donePrev7} the week before${p.done7 > p.donePrev7 ? ' ↑' : p.done7 < p.donePrev7 ? ' ↓' : ''}.`),
        p.onTime.total ? L(`• الالتزام بالمواعيد: ${p.onTime.on} من ${p.onTime.total} خلصت في وقتها (${Math.round((p.onTime.on / p.onTime.total) * 100)}%).`, `• On time: ${p.onTime.on} of ${p.onTime.total} finished by their date (${Math.round((p.onTime.on / p.onTime.total) * 100)}%).`) : '',
        p.quota7 ? L(`• المذاكرة: ${fmtMinutes(p.study7)} من ${fmtMinutes(p.quota7)} مطلوبة (${Math.round((p.study7 / p.quota7) * 100)}%).`, `• Study: ${fmtMinutes(p.study7)} of ${fmtMinutes(p.quota7)} required (${Math.round((p.study7 / p.quota7) * 100)}%).`) : '',
        p.overdue ? L(`• متأخرة الحين: ${p.overdue}.`, `• Overdue now: ${p.overdue}.`) : L('• ما عليك شيء متأخر.', '• Nothing overdue.'),
        p.deferredOpen ? L(`• ${p.deferredOpen} مهام أجلتها مرتين أو أكثر — هذي عادة لازم تنتبه لها.`, `• ${p.deferredOpen} tasks postponed twice or more — a habit worth watching.`) : '',
        p.estimateN >= 3 && Math.abs(p.estimateFactor - 1) > 0.15 ? L(`• تقديراتك: الوقت الفعلي ≈ ${p.estimateFactor.toFixed(1)}× تقديرك — ${p.estimateFactor > 1 ? 'تستهين بالوقت' : 'تبالغ في التقدير'}.`, `• Estimates: real time ≈ ${p.estimateFactor.toFixed(1)}× your estimate — you ${p.estimateFactor > 1 ? 'underestimate' : 'overestimate'}.`) : '',
      ];
      return { text: lines.filter(Boolean).join('\n') };
    }

    default:
      return {
        text: L(
          'أقدر أساعدك في:\n• «وش عندي اليوم؟»\n• «عطني ملخص»\n• «وش أأجل؟»\n• «وش رأيك في أدائي؟»\n• «وش أسوي الحين؟»\n• «وش وضع مصاريفي؟»\n\nوإذا أضفت مفتاح Claude من الإعدادات أقدر أجاوب أي سؤال ثاني وأقسّم لك المهام وأخطط معك.',
          'I can help with:\n• “What do I have today?”\n• “Give me a summary”\n• “What can I postpone?”\n• “How am I doing?”\n• “What should I do now?”\n• “How’s my spending?”\n\nAdd a Claude key in settings and I can answer anything else, break tasks down and plan with you.',
        ),
      };
  }
}

/** everything the AI gets to see when you chat — richer than the daily message */
export function assistantContext(state: AppState, now = Date.now()): string {
  const plan = planDay(state, now);
  const today = plan.today;
  const perf = performance(state, now);
  const week = weekLoad(state, now, 7, plan.study);
  const open = state.tasks
    .filter((t) => t.status === 'open')
    .slice(0, 40)
    .map((t) => ({ title: t.title, area: t.area, priority: ['low', 'normal', 'important', 'urgent'][t.priority], due: t.due, deferrals: t.deferrals || undefined, waitingOn: t.waitingOn, canBePostponed: !(t.priority === 3 || t.hard) }));
  const procs = state.procedures
    .filter((p) => !p.archived && !p.completedAt)
    .map((p) => ({ title: p.title, priority: ['low', 'normal', 'important', 'urgent'][p.priority], due: p.due, nextStep: p.steps.find((s) => !s.done)?.title, stepsLeft: p.steps.filter((s) => !s.done).length }));
  return JSON.stringify(
    {
      now: `${today} ${new Date(now).getHours()}:00`,
      todayPlan: { availableMinutes: plan.remaining, plannedMinutes: plan.load, overloadedBy: plan.overBy || undefined, items: plan.items.map((i) => ({ title: i.title, detail: i.sub, minutes: i.minutes, level: i.level, mustBeToday: i.must, why: i.reasons })) },
      canWait: deferrable(state, plan).map((i) => i.title),
      ifThereIsTime: plan.later.slice(0, 10).map((i) => i.title),
      openTasks: open,
      workProcedures: procs,
      exams: plan.study.exams.map((e) => ({ course: e.course.name, exam: e.exam.title, date: e.exam.date, daysLeft: e.daysLeft, readiness: `${Math.round(e.progress * 100)}%`, status: e.status, todayQuotaMinutes: Math.round(e.quota), studiedToday: Math.round(e.doneToday), todayLessons: e.portion.map((x) => x.unit.title) })),
      next7days: week.map((d) => ({ day: d.day, loadMinutes: d.study + d.tasks, capacity: d.capacity, exams: d.exams.length ? d.exams : undefined })),
      performance: { score: perf.score, doneLast7: perf.done7, donePrev7: perf.donePrev7, studyLast7: perf.study7, studyRequiredLast7: perf.quota7, onTime30d: perf.onTime, overdueNow: perf.overdue, postponedTwiceOrMore: perf.deferredOpen, estimateFactor: perf.estimateN >= 3 ? perf.estimateFactor : undefined },
      latenessLast7Days: coachFacts(state, plan, now).trend,
      spending: spendingContext(state, now),
      timetableToday: blocksOn(state, today).map((x) => ({ title: x.b.title, kind: x.b.kind, from: x.b.start, to: x.b.end })),
      daysSinceStart: diffDays(todayKey(state.meta.createdAt), today),
    },
    null,
    1,
  );
}

const catLabel = (c: Parameters<typeof catInfoFn>[0]) => catInfoFn(c).label;

function spendingContext(state: AppState, now: number) {
  if (!state.expenses.length && !state.money.budget) return undefined;
  const m = moneyToday(state, now);
  const r = report(state, 'month', now);
  return {
    currency: 'SAR',
    monthBudget: m.budget,
    spentThisMonth: Math.round(m.spentMonth),
    spentToday: Math.round(m.spentToday),
    todayAllowance: m.allowance === undefined ? undefined : Math.round(m.allowance),
    byCategoryThisMonth: r.cats.map((c) => ({ cat: c.cat, total: Math.round(c.total), lastMonth: Math.round(c.prev) })),
    notWorthItThisMonth: Math.round(regrets(state, now).total),
    savingIdeas: suggestions(state, now).slice(0, 5).map((x) => ({ idea: x.text, alternatives: x.options.map((o) => o.label), monthlySaving: Math.round(x.monthly) })),
    subscriptions: state.subs.map((x) => ({ name: x.name, amount: x.amount, cycle: x.cycle, renews: x.next, lastUsed: x.lastUsed })),
    goal: state.money.goal,
  };
}
