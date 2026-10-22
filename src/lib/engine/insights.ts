// "Attention" feed: things that are late, at risk, forgotten, or need a quick answer from you.

import type { AppState } from '../types';
import { daysWord, diffDays, fmtDate, fmtMinutes, todayKey } from '../dates';
import { type DayPlan, deadlineRisks, openTasks, suggestDeferrals, weekLoad } from './planner';
import type { StudyPlan } from './study';
import { kindInfo, lastActivity, nextStep, procStage } from './procedures';

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
      title: `عاجلة: ${t.title}`,
      detail: 'ضرورية جدًا — خلّصها اليوم قبل أي شيء آخر.',
      actions: [
        { label: 'ابدأ الآن', act: 'start-task', arg: t.id },
        { label: 'أنجزتها', act: 'done-task', arg: t.id },
      ],
    });

  // --- exams ---
  for (const ep of study.exams) {
    const name = `${ep.course.name} — ${ep.exam.title}`;
    if (ep.status === 'unknown') {
      out.push({
        id: `exam-units:${ep.exam.id}`,
        level: 'ask',
        title: `ما الفصول المطلوبة في ${name}؟`,
        detail: 'بدونها لا أستطيع تقدير وقت المذاكرة أو تنبيهك إن كنت متأخرًا.',
        actions: [{ label: 'حدد الفصول', act: 'open-exam', arg: ep.exam.id }],
      });
    } else if (ep.status === 'behind') {
      out.push({
        id: `exam-behind:${ep.exam.id}`,
        level: 'critical',
        title: `${name}: الوقت المتاح لا يكفي`,
        detail: `ينقصك حوالي ${fmtMinutes(ep.shortfall)} من المذاكرة قبل ${fmtDate(ep.lastStudyDay)}. ${ep.suggestions[0] || ''}`,
        actions: [{ label: 'افتح الخطة', act: 'open-exam', arg: ep.exam.id }],
      });
    } else if (ep.status === 'tight') {
      out.push({
        id: `exam-tight:${ep.exam.id}`,
        level: 'warn',
        title: `${name}: الخطة ضيقة`,
        detail: `تكفي إذا التزمت بحوالي ${fmtMinutes(ep.requiredDaily)} يوميًا، لكن لا يوجد هامش لأي تأخير.`,
        actions: [{ label: 'افتح الخطة', act: 'open-exam', arg: ep.exam.id }],
      });
    } else if (ep.status === 'ok' && ep.startBy && ep.startBy <= today && ep.progress < 0.05) {
      out.push({
        id: `exam-start:${ep.exam.id}`,
        level: 'warn',
        title: `ابدأ مذاكرة ${ep.course.name} اليوم`,
        detail: `اليوم هو آخر يوم مريح للبدء حتى تنهي المنهج قبل ${ep.exam.title}.`,
        actions: [{ label: 'افتح الخطة', act: 'open-exam', arg: ep.exam.id }],
      });
    }
    if (ep.status !== 'unknown' && ep.pace.source === 'default' && ep.pace.n === 0) {
      out.push({
        id: `pace:${ep.course.id}`,
        level: 'ask',
        title: `كم تحتاج تقريبًا لكل ${ep.course.sizeLabel} في ${ep.course.name}؟`,
        detail: 'إجابة تقريبية تحسّن التقدير حتى تتجمع بيانات من جلساتك الفعلية.',
        actions: [2, 4, 7, 12].map((v) => ({ label: `${v} د`, act: 'set-pace', arg: ep.course.id, value: v })),
      });
    }
  }

  // --- today doesn't fit: offer one-tap rescheduling ---
  if (plan.overloaded) {
    const moves = suggestDeferrals(plan, state);
    const freed = moves.reduce((a, i) => a + i.minutes, 0);
    const names = moves.slice(0, 3).map((i) => `«${i.title}»`).join('، ') + (moves.length > 3 ? ` و${moves.length - 3} غيرها` : '');
    out.push({
      id: `overload:${today}:${plan.items.length}`,
      level: 'warn',
      title: `وقتك اليوم لا يكفي — الخطة أكبر بـ ${fmtMinutes(plan.overBy)}`,
      detail: moves.length
        ? `أقدر أرحّل ${moves.length === 1 ? 'مهمة غير عاجلة' : moves.length === 2 ? 'مهمتين غير عاجلتين' : `${moves.length} مهام غير عاجلة`} إلى الغد (${names}) فيتوفر ${fmtMinutes(freed)}.${freed < plan.overBy ? ' الباقي عاجل أو لا يتأجل.' : ''}`
        : 'كل ما في خطتك عاجل أو لا يتأجل. قلّل مذاكرة اليوم أو حدّث وقتك المتاح.',
      actions: moves.length
        ? [{ label: 'أعد الجدولة تلقائيًا', act: 'auto-replan' }, { label: 'أختار بنفسي', act: 'replan' }]
        : [{ label: 'راجع الخطة', act: 'replan' }],
    });
  }

  // --- overdue tasks ---
  const overdue = openTasks(state).filter((t) => t.due && t.due < today);
  if (overdue.length) {
    out.push({
      id: `overdue:${today}:${overdue.length}`,
      level: overdue.some((t) => t.hard || t.priority >= 2) ? 'critical' : 'warn',
      title: overdue.length === 1 ? `مهمة متأخرة: ${overdue[0].title}` : `${overdue.length} مهام فات موعدها`,
      detail: 'أنجزها، أو حدد موعدًا جديدًا واقعيًا، أو احذفها إن لم تعد مهمة.',
      actions: overdue.length === 1 ? [{ label: 'افتح', act: 'open-task', arg: overdue[0].id }] : [{ label: 'اعرضها', act: 'go', arg: 'tasks?f=overdue' }],
    });
  }

  // --- deadlines at risk (not enough hours before due date) ---
  for (const r of deadlineRisks(state, now, study).filter((x) => (x.task.due as string) > today).slice(0, 3)) {
    out.push({
      id: `risk:${r.task.id}:${r.task.due}`,
      level: 'warn',
      title: `${r.task.title}: قد لا يكفي الوقت قبل ${fmtDate(r.task.due as string, false)}`,
      detail: `تحتاج ${fmtMinutes(r.need)} من العمل حتى ذلك اليوم ومتاح لك ${fmtMinutes(r.have)} بعد المذاكرة.`,
      actions: [{ label: 'افتح', act: 'open-task', arg: r.task.id }],
    });
  }

  // --- week ahead overload ---
  const week = weekLoad(state, now, 7, study).slice(1);
  const heavy = week.filter((d) => d.overloaded);
  if (heavy.length) {
    out.push({
      id: `week-heavy:${heavy.map((d) => d.day).join(',')}`,
      level: 'info',
      title: `أيام مزدحمة قادمة: ${heavy.map((d) => fmtDate(d.day)).join('، ')}`,
      detail: 'انقل بعض المهام لأيام أخف من الآن حتى لا تتفاجأ.',
      actions: [{ label: 'عرض الأسبوع', act: 'go', arg: 'week' }],
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
        title: `${p.title}: باقي «${next.title}»`,
        detail: `${kindInfo(next.kind).waiting}${next.target ? ` — ${next.target}` : ''}. آخر حركة ${idle < 2 ? 'أمس' : `قبل ${daysWord(Math.floor(idle))}`}.`,
        actions: [
          { label: 'افتح', act: 'open-proc', arg: p.id },
          { label: 'تم', act: 'step-done', arg: `${p.id}:${next.id}` },
        ],
      });
    } else if (stage === 'waiting' && idle >= 2) {
      out.push({
        id: `proc-wait:${p.id}:${next.id}:${Math.floor(idle / 2)}`,
        level: 'info',
        title: `تابع الرد: ${p.title}`,
        detail: `${next.target ? `من ${next.target} ` : ''}منذ ${daysWord(Math.floor(idle))}. هل وصل الرد؟`,
        actions: [
          { label: 'وصل الرد', act: 'step-done', arg: `${p.id}:${next.id}` },
          { label: 'سجّل متابعة', act: 'proc-followup', arg: p.id },
        ],
      });
    } else if (p.due && p.due < today) {
      out.push({
        id: `proc-overdue:${p.id}`,
        level: 'warn',
        title: `إجراء متأخر: ${p.title}`,
        detail: `كان موعده ${fmtDate(p.due)}. الخطوة التالية: ${next.title}.`,
        actions: [{ label: 'افتح', act: 'open-proc', arg: p.id }],
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
        title: `تنتظر «${t.waitingOn}» منذ ${daysWord(Math.floor(idle))}`,
        detail: t.title,
        actions: [{ label: 'افتح', act: 'open-task', arg: t.id }],
      });
  }

  // --- chronic deferrals ---
  for (const t of openTasks(state)) {
    if (t.deferrals >= 3)
      out.push({
        id: `deferred:${t.id}:${t.deferrals}`,
        level: 'info',
        title: `«${t.title}» تأجلت ${t.deferrals} مرات`,
        detail: 'غالبًا تحتاج تقسيمها لخطوة أصغر، أو تحديد يوم ثابت لها، أو حذفها بصراحة.',
        actions: [
          { label: 'قسّمها', act: 'open-task', arg: t.id },
          { label: 'احذفها', act: 'drop-task', arg: t.id },
        ],
      });
  }

  // --- quick questions that improve estimates ---
  const noEst = plan.items.filter((i) => i.kind === 'task' && i.guessed).slice(0, 2);
  for (const i of noEst)
    out.push({
      id: `est:${i.id}`,
      level: 'ask',
      title: `كم تأخذ «${i.title}» تقريبًا؟`,
      actions: [15, 30, 60, 120].map((v) => ({ label: fmtMinutes(v), act: 'set-estimate', arg: i.id, value: v })),
    });

  // --- backup ---
  const lastExport = state.meta.lastExportAt;
  const hasData = state.tasks.length + state.procedures.length + state.courses.length > 0;
  if (hasData && (!lastExport || now - lastExport > 7 * DAY) && now - state.meta.createdAt > 2 * DAY) {
    out.push({
      id: `backup:${today}`,
      level: 'info',
      title: lastExport ? `آخر نسخة احتياطية قبل ${daysWord(diffDays(todayKey(lastExport), today))}` : 'لم تحفظ نسخة احتياطية بعد',
      detail: 'بياناتك محفوظة في هذا المتصفح فقط. نزّل نسخة واحفظها في مكان آمن.',
      actions: [{ label: 'نزّل نسخة', act: 'export' }],
    });
  }

  const rank: Record<Level, number> = { critical: 0, warn: 1, ask: 2, info: 3 };
  return out
    .filter((i) => !(state.snoozed[i.id] && state.snoozed[i.id] > now))
    .sort((a, b) => rank[a.level] - rank[b.level]);
}
