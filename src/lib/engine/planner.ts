// Prioritization and day/week planning. Each score carries human-readable reasons so the
// plan can always explain itself.

import type { AppState, Area, Priority, Procedure, Task } from '../types';
import { addDays, diffDays, daysWord, todayKey } from '../dates';
import { calibration, taskTime } from './learning';
import { availableFor, dayRecord, minutesLeftToday } from './capacity';
import { planStudy, portionText, type StudyPlan } from './study';
import { kindInfo, nextStep, procMinutes, procStage } from './procedures';

export const PRIORITY_LABEL: Record<Priority, string> = { 0: 'منخفضة', 1: 'عادية', 2: 'مهمة', 3: 'عاجلة' };
export const AREA_LABEL: Record<Area, string> = { study: 'دراسة', work: 'عمل', life: 'شخصي' };

export interface Scored {
  score: number;
  reasons: string[];
}

export function scoreItem(
  item: { priority: Priority; due?: string; hard?: boolean; createdAt: number; deferrals?: number },
  today: string,
  now: number,
): Scored {
  const reasons: string[] = [];
  let score = [8, 20, 38, 60][item.priority];
  if (item.priority >= 2) reasons.push(item.priority === 3 ? 'عاجلة' : 'مهمة');
  if (item.due) {
    const d = diffDays(today, item.due);
    let u: number;
    if (d < 0) {
      u = 55 + Math.min(25, -d * 5);
      reasons.push(`متأخرة ${daysWord(-d)}`);
    } else if (d === 0) {
      u = 48;
      reasons.push('موعدها اليوم');
    } else if (d === 1) {
      u = 34;
      reasons.push('موعدها غدًا');
    } else if (d <= 3) {
      u = 22;
      reasons.push(`موعدها بعد ${daysWord(d)}`);
    } else if (d <= 7) u = 12;
    else u = 4;
    if (item.hard) {
      u *= 1.3;
      if (d <= 3) reasons.push('لا تحتمل التأجيل');
    }
    score += u;
  }
  const age = (now - item.createdAt) / 86_400_000;
  score += Math.min(8, age / 3);
  const def = item.deferrals || 0;
  if (def) {
    score += Math.min(12, def * 4);
    if (def >= 2) reasons.push(`أُجّلت ${def} مرات`);
  }
  return { score: Math.round(score), reasons };
}

export interface PlanItem {
  kind: 'task' | 'procedure' | 'study';
  id: string;
  title: string;
  sub?: string;
  area: Area;
  minutes: number;
  guessed?: boolean;
  score: number;
  reasons: string[];
  must: boolean;
  courseColor?: string;
  dueTime?: string;
  /** عاجلة = today, no matter what · مهمة = today or tomorrow at the latest */
  level?: 'urgent' | 'important';
}

export interface DayPlan {
  today: string;
  capacity: number; // available today (setting or override)
  remaining: number; // capacity still usable now
  doneMinutes: number;
  items: PlanItem[];
  later: PlanItem[]; // candidates that don't fit today
  load: number; // minutes of items in plan
  mustLoad: number;
  overloaded: boolean;
  overBy: number;
  study: StudyPlan;
}

function procPriorityItem(p: Procedure) {
  return { priority: p.priority, due: p.due, hard: false, createdAt: p.createdAt, deferrals: 0 };
}

export function openTasks(state: AppState): Task[] {
  return state.tasks.filter((t) => t.status === 'open');
}

export function planDay(state: AppState, now = Date.now(), study?: StudyPlan): DayPlan {
  const today = todayKey(now);
  const studyPlan = study || planStudy(state, now);
  const capacity = availableFor(state, today);
  const rec = dayRecord(state, today);
  const remaining = Math.max(0, Math.min(capacity - rec.minutes, minutesLeftToday(state, now)));

  const cals = { study: calibration(state, 'study'), work: calibration(state, 'work'), life: calibration(state, 'life') };
  const cands: PlanItem[] = [];

  // study blocks from the exam planner
  for (const ep of studyPlan.exams) {
    if (ep.todayMinutes <= 0) continue;
    const units = ep.portion.map((x) => portionText(x, ep.course.sizeLabel)).join('، ');
    const urgent = ep.status === 'behind' || ep.status === 'tight' || ep.daysLeft <= 3;
    cands.push({
      kind: 'study',
      id: ep.exam.id,
      title: `مذاكرة ${ep.course.name}`,
      sub: units ? `${units}` : undefined,
      area: 'study',
      minutes: ep.todayMinutes,
      score: urgent ? 90 : 55,
      reasons: [`${ep.exam.title} ${ep.daysLeft === 1 ? 'غدًا' : `بعد ${daysWord(ep.daysLeft)}`}`],
      must: urgent,
      courseColor: ep.course.color,
    });
  }

  for (const t of openTasks(state)) {
    if (t.waitingOn) continue;
    if (t.plannedFor && t.plannedFor > today) continue;
    const s = scoreItem(t, today, now);
    const time = taskTime(state, t, cals[t.area]);
    const pinned = t.plannedFor === today;
    const overdue = !!t.due && t.due < today;
    const dueToday = t.due === today;
    const dueTomorrow = t.due === addDays(today, 1);
    // عاجلة: always part of today. مهمة (with no later due date): today or tomorrow — from its
    // second day on, it becomes a must so it can't keep slipping.
    const urgent = t.priority === 3;
    const important = t.priority === 2 && (!t.due || t.due <= addDays(today, 1));
    const ageDays = diffDays(todayKey(t.createdAt), today);
    const importantDue = important && (ageDays >= 1 || t.deferrals >= 1);
    const must =
      urgent ||
      importantDue ||
      pinned ||
      (dueToday && (t.hard || t.priority >= 1)) ||
      (overdue && (t.hard || t.priority >= 2)) ||
      (dueToday && !!t.dueTime) ||
      (dueTomorrow && t.hard);
    // the priority explanation leads the reasons
    s.reasons = s.reasons.filter((r) => r !== 'عاجلة' && r !== 'مهمة');
    if (urgent) s.reasons.unshift('عاجلة — ضرورية جدًا اليوم');
    else if (importantDue) s.reasons.unshift(t.deferrals >= 2 ? `مهمة وأجّلتها ${t.deferrals} مرات — لا تؤجلها أكثر` : 'مهمة — اليوم آخر موعد مريح لها');
    else if (important) s.reasons.unshift('مهمة — خلّصها اليوم أو بكرة');
    if (dueTomorrow && must && !pinned && !urgent) s.reasons.push('ابدأ اليوم لتلحق غدًا');
    if (pinned) s.reasons.unshift('خططت لها اليوم');
    cands.push({
      kind: 'task',
      id: t.id,
      title: t.title,
      area: t.area,
      minutes: time.minutes,
      guessed: time.guessed,
      score: s.score + (pinned ? 30 : 0) + (urgent ? 40 : importantDue ? 15 : 0),
      reasons: s.reasons,
      must,
      dueTime: t.due === today ? t.dueTime : undefined,
      level: urgent ? 'urgent' : t.priority === 2 ? 'important' : undefined,
    });
  }

  for (const p of state.procedures) {
    if (p.archived || p.completedAt) continue;
    const stage = procStage(p);
    if (stage === 'waiting' || stage === 'done') continue;
    const s = scoreItem(procPriorityItem(p), today, now);
    const next = nextStep(p);
    if (stage === 'partial') {
      s.score += 10;
      s.reasons.push('بدأت فيه ولم يكتمل');
    }
    cands.push({
      kind: 'procedure',
      id: p.id,
      title: p.title,
      sub: next ? `${kindInfo(next.kind).label}: ${next.title}` : undefined,
      area: 'work',
      minutes: procMinutes(p),
      score: s.score,
      reasons: s.reasons,
      must: !!p.due && p.due <= today,
    });
  }

  cands.sort((a, b) => Number(b.must) - Number(a.must) || b.score - a.score);

  const items: PlanItem[] = [];
  const later: PlanItem[] = [];
  let load = 0;
  let mustLoad = 0;
  for (const c of cands) {
    if (c.must) {
      items.push(c);
      load += c.minutes;
      mustLoad += c.minutes;
      continue;
    }
    // optional items only when they are worth doing today and still fit
    const worth = c.score >= 30 || c.kind === 'study';
    if (worth && load + c.minutes <= remaining) {
      items.push(c);
      load += c.minutes;
    } else later.push(c);
  }
  // fill leftover time with the best remaining items, if any
  for (const c of [...later]) {
    if (load + c.minutes > remaining) continue;
    if (c.score < 15) continue;
    items.push(c);
    load += c.minutes;
    later.splice(later.indexOf(c), 1);
  }
  items.sort((a, b) => (a.dueTime || '99').localeCompare(b.dueTime || '99') || Number(b.must) - Number(a.must) || b.score - a.score);

  const overBy = Math.max(0, load - remaining);
  return {
    today,
    capacity,
    remaining,
    doneMinutes: rec.minutes,
    items,
    later,
    load,
    mustLoad,
    overloaded: overBy > 10,
    overBy,
    study: studyPlan,
  };
}

/** items to push to tomorrow so the rest fits (lowest value first, never hard deadlines) */
export function suggestDeferrals(plan: DayPlan, state: AppState): PlanItem[] {
  let over = plan.load - plan.remaining;
  if (over <= 0) return [];
  const out: PlanItem[] = [];
  const movable = plan.items
    .filter((i) => i.kind === 'task')
    .filter((i) => {
      const t = state.tasks.find((x) => x.id === i.id);
      // never suggest pushing back urgent tasks, hard deadlines, or an important task that already waited
      if (!t || t.priority === 3 || (t.hard && t.due && t.due <= plan.today)) return false;
      const waited = diffDays(todayKey(t.createdAt), plan.today) >= 1 || t.deferrals >= 1;
      return !(t.priority === 2 && waited && (!t.due || t.due <= addDays(plan.today, 1)));
    })
    .sort((a, b) => a.score - b.score);
  for (const i of movable) {
    if (over <= 0) break;
    out.push(i);
    over -= i.minutes;
  }
  return out;
}

// ---------------- Week view & deadline risk ----------------

export interface DayLoad {
  day: string;
  capacity: number;
  study: number;
  tasks: number;
  exams: string[];
  items: { title: string; minutes: number; kind: 'task' | 'study' | 'procedure' }[];
  overloaded: boolean;
}

export function weekLoad(state: AppState, now = Date.now(), days = 7, study?: StudyPlan): DayLoad[] {
  const today = todayKey(now);
  const sp = study || planStudy(state, now);
  const out: DayLoad[] = [];
  const cals = { study: calibration(state, 'study'), work: calibration(state, 'work'), life: calibration(state, 'life') };
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i);
    const capacity = i === 0 ? Math.max(0, availableFor(state, day) - dayRecord(state, day).minutes) : availableFor(state, day);
    const items: DayLoad['items'] = [];
    let studyM = 0;
    for (const b of sp.byDay[day] || []) {
      const ep = sp.exams.find((e) => e.exam.id === b.examId);
      studyM += b.minutes;
      items.push({ title: `مذاكرة ${ep?.course.name || ''}`, minutes: b.minutes, kind: 'study' });
    }
    let tasksM = 0;
    for (const t of openTasks(state)) {
      const at = t.plannedFor || t.due;
      const hit = i === 0 ? !!at && at <= day : at === day;
      if (!hit) continue;
      const m = taskTime(state, t, cals[t.area]).minutes;
      tasksM += m;
      items.push({ title: t.title, minutes: m, kind: 'task' });
    }
    for (const p of state.procedures) {
      if (p.archived || p.completedAt || !p.due) continue;
      const hit = i === 0 ? p.due <= day : p.due === day;
      if (!hit || procStage(p) === 'waiting') continue;
      const m = procMinutes(p);
      tasksM += m;
      items.push({ title: p.title, minutes: m, kind: 'procedure' });
    }
    const exams = state.exams
      .filter((e) => e.date === day && e.score == null)
      .map((e) => `${state.courses.find((c) => c.id === e.courseId)?.name || ''} — ${e.title}`);
    out.push({ day, capacity, study: studyM, tasks: tasksM, exams, items, overloaded: studyM + tasksM > capacity + 10 });
  }
  return out;
}

export interface DeadlineRisk {
  task: Task;
  need: number; // minutes needed by the due date (this and earlier deadlines)
  have: number; // minutes available by the due date
}

/** earliest-deadline feasibility: is there enough time before each due date? */
export function deadlineRisks(state: AppState, now = Date.now(), study?: StudyPlan): DeadlineRisk[] {
  const today = todayKey(now);
  const sp = study || planStudy(state, now);
  const dated = openTasks(state)
    .filter((t) => t.due && t.due >= today && !t.waitingOn)
    .sort((a, b) => (a.due as string).localeCompare(b.due as string) || b.priority - a.priority);
  const risks: DeadlineRisk[] = [];
  let need = 0;
  const capUntil = (day: string) => {
    let have = 0;
    for (let d = today; d <= day; d = addDays(d, 1)) {
      const cap = d === today ? Math.min(availableFor(state, d) - dayRecord(state, d).minutes, minutesLeftToday(state, now)) : availableFor(state, d);
      const st = (sp.byDay[d] || []).reduce((s, b) => s + b.minutes, 0);
      have += Math.max(0, cap - st);
    }
    return have;
  };
  for (const t of dated) {
    need += taskTime(state, t).minutes;
    const have = capUntil(t.due as string);
    if (need > have + 10 && t.estimate) risks.push({ task: t, need, have });
  }
  return risks;
}
