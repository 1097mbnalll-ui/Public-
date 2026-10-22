// "Attention" feed: things that are late, at risk, forgotten, or need a quick answer from you.

import type { AppState } from '../types';
import { daysWord, diffDays, fmtDate, fmtMinutes, todayKey } from '../dates';
import { type DayPlan, deadlineRisks, openTasks, suggestDeferrals, weekLoad } from './planner';
import type { StudyPlan } from './study';
import { kindInfo, lastActivity, nextStep, procStage } from './procedures';
import { L, sz } from '../i18n';

export type Level = 'critical' | 'warn' | 'info' | 'ask';

export interface Action {
  label: string;
  act: string;
  arg?: string;
  value?: number;
}

export interface Insight {
  id: string;
  level: Level;
  title: string;
  detail?: string;
  actions: Action[];
}

const DAY = 86_400_000;

export function buildInsights(state: AppState, plan: DayPlan, study: StudyPlan, now = Date.now()): Insight[] {
  const today = todayKey(now);
  const out: Insight[] = [];

  // --- عاجلة: very important, today ---
  const urgent = openTasks(state).filter((t) => t.priority === 3 && !t.waitingOn && !(t.plannedFor && t.plannedFor > today));
  for (const t of urgent.slice(0, 3))
    out.push({
      id: `urgent:${t.id}:${today}`,
      level: 'critical',
      title: L(`عاجلة: ${t.title}`, `Urgent: ${t.title}`),
      detail: L('ضرورية جدًا — خلّصها اليوم قبل أي شيء آخر.', "Very important — finish it today before anything else."),
      actions: [
        { label: L('ابدأ الآن', "Start now"), act: 'start-task', arg: t.id },
        { label: L('أنجزتها', "Done it"), act: 'done-task', arg: t.id },
      ],
    });

  // --- عاجل (إجراءات العمل): in today, never postponed ---
  for (const p of state.procedures) {
    if (p.archived || p.completedAt || p.priority !== 3) continue;
    const next = nextStep(p);
    if (!next) continue;
    const waiting = procStage(p) === 'waiting';
    out.push({
      id: `urgent-proc:${p.id}:${today}`,
      level: 'critical',
      title: L(`إجراء عاجل: ${p.title}`, `Urgent procedure: ${p.title}`),
      detail: waiting ? L(`بانتظار ${next.target || 'الرد'} — تابعه اليوم.`, `Waiting for ${next.target || 'the reply'} — follow up today.`) : L(`الخطوة التالية: ${next.title}${next.target ? ` (${next.target})` : ''}. ضروري اليوم.`, `Next step: ${next.title}${next.target ? ` (${next.target})` : ''}. Needed today.`),
      actions: [
        { label: L('افتح', "Open"), act: 'open-proc', arg: p.id },
        ...(waiting ? [] : [{ label: L('تمت الخطوة', "Step done"), act: 'step-done', arg: `${p.id}:${next.id}` }]),
      ],
    });
  }

  // --- exams ---
  for (const ep of study.exams) {
    const name = `${ep.course.name} — ${ep.exam.title}`;
    if (ep.status === 'unknown') {
      out.push({
        id: `exam-units:${ep.exam.id}`,
        level: 'ask',
        title: L(`ما الفصول المطلوبة في ${name}؟`, `Which chapters are in ${name}?`),
        detail: L('بدونها لا أستطيع تقدير وقت المذاكرة أو تنبيهك إن كنت متأخرًا.', "Without them I can't estimate study time or warn you if you're behind."),
        actions: [{ label: L('حدد الفصول', "Set chapters"), act: 'open-exam', arg: ep.exam.id }],
      });
    } else if (ep.status === 'behind') {
      out.push({
        id: `exam-behind:${ep.exam.id}`,
        level: 'critical',
        title: L(`${name}: الوقت المتاح لا يكفي`, `${name}: not enough time`),
        detail: L(`ينقصك حوالي ${fmtMinutes(ep.shortfall)} من المذاكرة قبل ${fmtDate(ep.lastStudyDay)}. ${ep.suggestions[0] || ''}`, `You're about ${fmtMinutes(ep.shortfall)} of study short before ${fmtDate(ep.lastStudyDay)}. ${ep.suggestions[0] || ''}`),
        actions: [{ label: L('افتح الخطة', "Open plan"), act: 'open-exam', arg: ep.exam.id }],
      });
    } else if (ep.status === 'tight') {
      out.push({
        id: `exam-tight:${ep.exam.id}`,
        level: 'warn',
        title: L(`${name}: الخطة ضيقة`, `${name}: tight plan`),
        detail: L(`تكفي إذا التزمت بحوالي ${fmtMinutes(ep.requiredDaily)} يوميًا، لكن لا يوجد هامش لأي تأخير.`, `Enough if you keep about ${fmtMinutes(ep.requiredDaily)} a day, but there's no margin for any delay.`),
        actions: [{ label: L('افتح الخطة', "Open plan"), act: 'open-exam', arg: ep.exam.id }],
      });
    } else if (ep.status === 'ok' && ep.startBy && ep.startBy <= today && ep.progress < 0.05) {
      out.push({
        id: `exam-start:${ep.exam.id}`,
        level: 'warn',
        title: L(`ابدأ مذاكرة ${ep.course.name} اليوم`, `Start studying ${ep.course.name} today`),
        detail: L(`اليوم هو آخر يوم مريح للبدء حتى تنهي المنهج قبل ${ep.exam.title}.`, `Today is the last comfortable day to start and finish before ${ep.exam.title}.`),
        actions: [{ label: L('افتح الخطة', "Open plan"), act: 'open-exam', arg: ep.exam.id }],
      });
    }
    if (ep.status !== 'unknown' && ep.pace.source === 'default' && ep.pace.n === 0) {
      out.push({
        id: `pace:${ep.course.id}`,
        level: 'ask',
        title: L(`كم تحتاج تقريبًا لكل ${ep.course.sizeLabel} في ${ep.course.name}؟`, `Roughly how long do you need per ${sz(ep.course.sizeLabel)} in ${ep.course.name}?`),
        detail: L('إجابة تقريبية تحسّن التقدير حتى تتجمع بيانات من جلساتك الفعلية.', "A rough answer improves the estimate until real session data builds up."),
        actions: [2, 4, 7, 12].map((v) => ({ label: L(`${v} د`, `${v} min`), act: 'set-pace', arg: ep.course.id, value: v })),
      });
    }
  }

  // --- today doesn't fit: offer one-tap rescheduling ---
  if (plan.overloaded) {
    const moves = suggestDeferrals(plan, state);
    const freed = moves.reduce((a, i) => a + i.minutes, 0);
    const names = moves.slice(0, 3).map((i) => `«${i.title}»`).join(L('، ', ", ")) + (moves.length > 3 ? L(` و${moves.length - 3} غيرها`, ` and ${moves.length - 3} more`) : '');
    out.push({
      id: `overload:${today}:${plan.items.length}`,
      level: 'warn',
      title: L(`وقتك اليوم لا يكفي — الخطة أكبر بـ ${fmtMinutes(plan.overBy)}`, `Not enough time today — the plan is ${fmtMinutes(plan.overBy)} over`),
      detail: moves.length
        ? L(`أقدر أرحّل ${moves.length === 1 ? 'عنصرًا غير عاجل' : moves.length === 2 ? 'عنصرين غير عاجلين' : `${moves.length} عناصر غير عاجلة`} إلى الغد (${names}) فيتوفر ${fmtMinutes(freed)}.${freed < plan.overBy ? ' الباقي عاجل أو لا يتأجل.' : ''}`, `I can move ${moves.length === 1 ? 'one non-urgent item' : `${moves.length} non-urgent items`} to tomorrow (${names}), freeing ${fmtMinutes(freed)}.${freed < plan.overBy ? ' The rest is urgent or can’t be postponed.' : ''}`)
        : L('كل ما في خطتك عاجل أو لا يتأجل. قلّل مذاكرة اليوم أو حدّث وقتك المتاح.', "Everything in your plan is urgent or can't be postponed. Study less today or update your available time."),
      actions: moves.length
        ? [{ label: L('أعد الجدولة تلقائيًا', "Reschedule automatically"), act: 'auto-replan' }, { label: L('أختار بنفسي', "I'll choose"), act: 'replan' }]
        : [{ label: L('راجع الخطة', "Review plan"), act: 'replan' }],
    });
  }

  // --- overdue tasks ---
  const overdue = openTasks(state).filter((t) => t.due && t.due < today);
  if (overdue.length) {
    out.push({
      id: `overdue:${today}:${overdue.length}`,
      level: overdue.some((t) => t.hard || t.priority >= 2) ? 'critical' : 'warn',
      title: overdue.length === 1 ? L(`مهمة متأخرة: ${overdue[0].title}`, `Overdue task: ${overdue[0].title}`) : L(`${overdue.length} مهام فات موعدها`, `${overdue.length} tasks past due`),
      detail: L('أنجزها، أو حدد موعدًا جديدًا واقعيًا، أو احذفها إن لم تعد مهمة.', "Do it, set a realistic new date, or delete it if it no longer matters."),
      actions: overdue.length === 1 ? [{ label: L('افتح', "Open"), act: 'open-task', arg: overdue[0].id }] : [{ label: L('اعرضها', "Show them"), act: 'go', arg: 'tasks?f=overdue' }],
    });
  }

  // --- deadlines at risk (not enough hours before due date) ---
  for (const r of deadlineRisks(state, now, study).filter((x) => (x.task.due as string) > today).slice(0, 3)) {
    out.push({
      id: `risk:${r.task.id}:${r.task.due}`,
      level: 'warn',
      title: L(`${r.task.title}: قد لا يكفي الوقت قبل ${fmtDate(r.task.due as string, false)}`, `${r.task.title}: time may run out before ${fmtDate(r.task.due as string, false)}`),
      detail: L(`تحتاج ${fmtMinutes(r.need)} من العمل حتى ذلك اليوم ومتاح لك ${fmtMinutes(r.have)} بعد المذاكرة.`, `You need ${fmtMinutes(r.need)} of work by then and have ${fmtMinutes(r.have)} after studying.`),
      actions: [{ label: L('افتح', "Open"), act: 'open-task', arg: r.task.id }],
    });
  }

  // --- week ahead overload ---
  const week = weekLoad(state, now, 7, study).slice(1);
  const heavy = week.filter((d) => d.overloaded);
  if (heavy.length) {
    out.push({
      id: `week-heavy:${heavy.map((d) => d.day).join(',')}`,
      level: 'info',
      title: L(`أيام مزدحمة قادمة: ${heavy.map((d) => fmtDate(d.day)).join('، ')}`, `Busy days ahead: ${heavy.map((d) => fmtDate(d.day)).join(', ')}`),
      detail: L('انقل بعض المهام لأيام أخف من الآن حتى لا تتفاجأ.', "Move some tasks to lighter days now so it doesn't catch you off guard."),
      actions: [{ label: L('عرض الأسبوع', "View week"), act: 'go', arg: 'week' }],
    });
  }

  // --- procedures: half-done, waiting replies ---
  for (const p of state.procedures) {
    if (p.archived || p.completedAt) continue;
    const stage = procStage(p);
    const idle = (now - lastActivity(p)) / DAY;
    const next = nextStep(p);
    if (!next) continue;
    if (stage === 'partial' && idle >= 1) {
      out.push({
        id: `proc-partial:${p.id}:${next.id}`,
        level: idle >= 3 ? 'warn' : 'info',
        title: L(`${p.title}: باقي «${next.title}»`, `${p.title}: “${next.title}” remains`),
        detail: L(`${kindInfo(next.kind).waiting}${next.target ? ` — ${next.target}` : ''}. آخر حركة ${idle < 2 ? 'أمس' : `قبل ${daysWord(Math.floor(idle))}`}.`, `${kindInfo(next.kind).waiting}${next.target ? ` — ${next.target}` : ''}. Last activity ${idle < 2 ? 'yesterday' : `${daysWord(Math.floor(idle))} ago`}.`),
        actions: [
          { label: L('افتح', "Open"), act: 'open-proc', arg: p.id },
          { label: L('تم', "Done"), act: 'step-done', arg: `${p.id}:${next.id}` },
        ],
      });
    } else if (stage === 'waiting' && idle >= 2) {
      out.push({
        id: `proc-wait:${p.id}:${next.id}:${Math.floor(idle / 2)}`,
        level: 'info',
        title: L(`تابع الرد: ${p.title}`, `Follow up: ${p.title}`),
        detail: L(`${next.target ? `من ${next.target} ` : ''}منذ ${daysWord(Math.floor(idle))}. هل وصل الرد؟`, `${next.target ? `From ${next.target}, ` : ''}waiting ${daysWord(Math.floor(idle))}. Has the reply arrived?`),
        actions: [
          { label: L('وصل الرد', "Reply received"), act: 'step-done', arg: `${p.id}:${next.id}` },
          { label: L('سجّل متابعة', "Log follow-up"), act: 'proc-followup', arg: p.id },
        ],
      });
    } else if (p.due && p.due < today) {
      out.push({
        id: `proc-overdue:${p.id}`,
        level: 'warn',
        title: L(`إجراء متأخر: ${p.title}`, `Overdue procedure: ${p.title}`),
        detail: L(`كان موعده ${fmtDate(p.due)}. الخطوة التالية: ${next.title}.`, `It was due ${fmtDate(p.due)}. Next step: ${next.title}.`),
        actions: [{ label: L('افتح', "Open"), act: 'open-proc', arg: p.id }],
      });
    }
  }

  // --- waiting-on tasks ---
  for (const t of openTasks(state)) {
    if (!t.waitingOn) continue;
    const idle = (now - t.updatedAt) / DAY;
    if (idle >= 3)
      out.push({
        id: `task-wait:${t.id}:${Math.floor(idle / 3)}`,
        level: 'info',
        title: L(`تنتظر «${t.waitingOn}» منذ ${daysWord(Math.floor(idle))}`, `Waiting on “${t.waitingOn}” for ${daysWord(Math.floor(idle))}`),
        detail: t.title,
        actions: [{ label: L('افتح', "Open"), act: 'open-task', arg: t.id }],
      });
  }

  // --- chronic deferrals ---
  for (const t of openTasks(state)) {
    if (t.deferrals >= 3)
      out.push({
        id: `deferred:${t.id}:${t.deferrals}`,
        level: 'info',
        title: L(`«${t.title}» تأجلت ${t.deferrals} مرات`, `“${t.title}” postponed ${t.deferrals} times`),
        detail: L('غالبًا تحتاج تقسيمها لخطوة أصغر، أو تحديد يوم ثابت لها، أو حذفها بصراحة.', "It probably needs a smaller first step, a fixed day, or an honest delete."),
        actions: [
          { label: L('قسّمها', "Split it"), act: 'open-task', arg: t.id },
          { label: L('احذفها', "Delete it"), act: 'drop-task', arg: t.id },
        ],
      });
  }

  // --- quick questions that improve estimates ---
  const noEst = plan.items.filter((i) => i.kind === 'task' && i.guessed).slice(0, 2);
  for (const i of noEst)
    out.push({
      id: `est:${i.id}`,
      level: 'ask',
      title: L(`كم تأخذ «${i.title}» تقريبًا؟`, `How long does “${i.title}” take, roughly?`),
      actions: [15, 30, 60, 120].map((v) => ({ label: fmtMinutes(v), act: 'set-estimate', arg: i.id, value: v })),
    });

  // --- backup ---
  const lastExport = state.meta.lastExportAt;
  const hasData = state.tasks.length + state.procedures.length + state.courses.length > 0;
  if (hasData && (!lastExport || now - lastExport > 7 * DAY) && now - state.meta.createdAt > 2 * DAY) {
    out.push({
      id: `backup:${today}`,
      level: 'info',
      title: lastExport ? L(`آخر نسخة احتياطية قبل ${daysWord(diffDays(todayKey(lastExport), today))}`, `Last backup ${daysWord(diffDays(todayKey(lastExport), today))} ago`) : L('لم تحفظ نسخة احتياطية بعد', "You haven't saved a backup yet"),
      detail: L('بياناتك محفوظة في هذا المتصفح فقط. نزّل نسخة واحفظها في مكان آمن.', "Your data lives only in this browser. Download a copy and keep it somewhere safe."),
      actions: [{ label: L('نزّل نسخة', "Download backup"), act: 'export' }],
    });
  }

  const rank: Record<Level, number> = { critical: 0, warn: 1, ask: 2, info: 3 };
  return out
    .filter((i) => !(state.snoozed[i.id] && state.snoozed[i.id] > now))
    .sort((a, b) => rank[a.level] - rank[b.level]);
}
