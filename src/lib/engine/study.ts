// Study planner: estimates remaining work per exam from material size, difficulty and your
// measured pace, then simulates the days until each exam against your real study capacity.

import type { AppState, Course, Exam, Unit } from '../types';
import { addDays, diffDays, fmtMinutes, todayKey } from '../dates';
import { coursePace, diffFactor, type Pace } from './learning';
import { availableFor, studyCapFor, studyCapToday } from './capacity';

export type ExamStatus = 'unknown' | 'done' | 'ok' | 'tight' | 'behind' | 'past';

export interface UnitWork {
  unit: Unit;
  minutes: number; // remaining incl. review
}

export interface ExamPlan {
  exam: Exam;
  course: Course;
  status: ExamStatus;
  pace: Pace;
  /** remaining minutes: optimistic / expected / pessimistic */
  low: number;
  mid: number;
  high: number;
  /** total material minutes (done + remaining), for progress */
  total: number;
  progress: number; // 0..1
  daysLeft: number; // until exam day
  lastStudyDay: string;
  studyDays: number; // days you can still study before lastStudyDay (incl. today)
  /** capacity reachable for this exam until lastStudyDay (shared with other exams) */
  requiredDaily: number;
  /** latest day to start and still finish with the pessimistic estimate */
  startBy?: string;
  finishDay?: string;
  shortfall: number; // minutes that won't fit (expected)
  shortfallHigh: number;
  /** today's share so the material is done by lastStudyDay: (left + studied today) ÷ study days left */
  quota: number;
  /** minutes already studied today for this exam's course */
  doneToday: number;
  /** what's still left of today's quota (quota − doneToday) */
  todayMinutes: number;
  todayUnits: UnitWork[];
  /** today's quota translated into material: which lessons / how much of each */
  portion: Portion[];
  /** inside the review days before the exam: no new material */
  inReview: boolean;
  /** yesterday's quota (as recorded) and what was actually studied */
  yesterday?: { quota: number; done: number };
  unreachable: Unit[];
  work: UnitWork[];
  reviewCompressed: boolean;
  suggestions: string[];
  alloc: Record<string, number>;
}

export interface Portion {
  unit: Unit;
  minutes: number;
  /** material amount (course size units) */
  amount: number;
  whole: boolean;
  review: boolean;
}

export interface StudyPlan {
  exams: ExamPlan[];
  byDay: Record<string, { examId: string; minutes: number }[]>;
}

export function unitMinutes(u: Unit, course: Course, pace: number, reviewFactor: number): number {
  const per = pace * diffFactor(u.difficulty || course.difficulty);
  const learn = u.size * (1 - Math.min(1, Math.max(0, u.progress))) * per;
  const review = u.reviewed ? 0 : u.size * per * reviewFactor;
  return learn + review;
}

/** minutes of study logged for a course on a day */
export function studiedOn(state: AppState, courseId: string, day: string): number {
  return state.sessions.filter((x) => x.courseId === courseId && x.date === day).reduce((a, x) => a + x.minutes, 0);
}

/** walk the remaining lessons in order and cut `minutes` of work out of them */
export function portionOf(work: UnitWork[], minutes: number): Portion[] {
  const out: Portion[] = [];
  let left = minutes;
  for (const w of work) {
    if (w.minutes < 1) continue;
    if (left <= 0) break;
    const u = w.unit;
    const remSize = u.size * (1 - Math.min(1, u.progress));
    const review = remSize <= 0.01;
    if (left >= w.minutes - 3) {
      out.push({ unit: u, minutes: Math.round(w.minutes), amount: Math.round(review ? u.size : remSize), whole: true, review });
      left -= w.minutes;
    } else {
      const f = left / w.minutes;
      out.push({ unit: u, minutes: Math.round(left), amount: Math.max(1, Math.round((review ? u.size : remSize) * f)), whole: false, review });
      left = 0;
    }
  }
  return out;
}

function round5(m: number) {
  return Math.ceil(m / 5) * 5;
}

export function planStudy(state: AppState, now = Date.now()): StudyPlan {
  const today = todayKey(now);
  const exams = state.exams
    .filter((e) => e.score == null && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));

  // each unit belongs to the earliest upcoming exam that includes it (midterm before final)
  const owner = new Map<string, string>();
  for (const e of exams) for (const uid of e.unitIds) if (!owner.has(uid)) owner.set(uid, e.id);
  for (const e of exams) if (e.unitIds.length && !owner.has(`course:${e.courseId}`)) owner.set(`course:${e.courseId}`, e.id);

  const plans: ExamPlan[] = [];
  for (const exam of exams) {
    const course = state.courses.find((c) => c.id === exam.courseId);
    if (!course) continue;
    const pace = coursePace(state, course);
    const units = state.units
      .filter((u) => exam.unitIds.includes(u.id) && owner.get(u.id) === exam.id)
      .sort((a, b) => a.order - b.order);
    const allUnits = state.units.filter((u) => exam.unitIds.includes(u.id));
    const work = units.map((unit) => ({ unit, minutes: unitMinutes(unit, course, pace.pace, state.settings.reviewFactor) }));
    const mid = work.reduce((s, w) => s + w.minutes, 0);
    const total = allUnits.reduce(
      (s, u) => s + u.size * pace.pace * diffFactor(u.difficulty || course.difficulty) * (1 + state.settings.reviewFactor),
      0,
    );
    const remainingAll = allUnits.reduce((s, u) => s + unitMinutes(u, course, pace.pace, state.settings.reviewFactor), 0);
    const daysLeft = diffDays(today, exam.date);
    let lastStudyDay = addDays(exam.date, -(exam.reviewDays || 0) - 1);
    let reviewCompressed = false;
    if (lastStudyDay < today && exam.date > today) {
      lastStudyDay = addDays(exam.date, -1);
      reviewCompressed = (exam.reviewDays || 0) > 0;
    }
    plans.push({
      exam,
      course,
      status: exam.unitIds.length === 0 ? 'unknown' : mid <= 0.5 ? 'done' : 'ok',
      pace,
      low: mid * (1 - pace.spread),
      mid,
      high: mid * (1 + pace.spread),
      total,
      progress: total > 0 ? Math.max(0, Math.min(1, 1 - remainingAll / total)) : 0,
      daysLeft,
      lastStudyDay,
      studyDays: Math.max(0, diffDays(today, lastStudyDay) + 1),
      requiredDaily: 0,
      shortfall: 0,
      shortfallHigh: 0,
      quota: 0,
      doneToday: 0,
      todayMinutes: 0,
      todayUnits: [],
      portion: [],
      inReview: false,
      unreachable: [],
      work,
      reviewCompressed,
      suggestions: [],
      alloc: {},
    });
  }

  const capFor = (day: string) => (day === today ? studyCapToday(state, now) : studyCapFor(state, day));

  const simulate = (key: 'mid' | 'high') => {
    const rem = new Map(plans.map((p) => [p.exam.id, p[key]]));
    const alloc = new Map<string, Record<string, number>>(plans.map((p) => [p.exam.id, {}]));
    const finish = new Map<string, string>();
    const lastDay = plans.reduce((m, p) => (p.lastStudyDay > m ? p.lastStudyDay : m), today);
    for (let day = today; day <= lastDay; day = addDays(day, 1)) {
      let cap = capFor(day);
      const active = plans.filter((p) => (rem.get(p.exam.id) || 0) > 0.5 && p.lastStudyDay >= day);
      if (!active.length || cap <= 0) continue;
      // even pacing: each exam asks for remaining / days left
      const want = active.map((p) => {
        const daysLeft = diffDays(day, p.lastStudyDay) + 1;
        return { p, rate: (rem.get(p.exam.id) || 0) / daysLeft };
      });
      const totalRate = want.reduce((s, w) => s + w.rate, 0);
      const give = (p: ExamPlan, m: number) => {
        if (m <= 0) return;
        const r = rem.get(p.exam.id) || 0;
        const g = Math.min(r, m);
        rem.set(p.exam.id, r - g);
        const a = alloc.get(p.exam.id)!;
        a[day] = (a[day] || 0) + g;
        cap -= g;
        if (r - g <= 0.5 && !finish.has(p.exam.id)) finish.set(p.exam.id, day);
      };
      if (totalRate * 1.1 <= cap) {
        for (const w of want) give(w.p, Math.min(cap, w.rate * 1.1));
      } else {
        // not enough time: earliest deadline first (maximizes what gets finished)
        want.sort((a, b) => a.p.lastStudyDay.localeCompare(b.p.lastStudyDay));
        for (const w of want) give(w.p, cap);
      }
    }
    return { rem, alloc, finish };
  };

  const midSim = simulate('mid');
  const highSim = simulate('high');

  for (const p of plans) {
    if (p.status === 'unknown') {
      p.suggestions.push('أضف الفصول أو الموضوعات المطلوبة لهذا الاختبار حتى أستطيع حساب الوقت.');
      continue;
    }
    p.alloc = midSim.alloc.get(p.exam.id) || {};
    p.shortfall = Math.max(0, midSim.rem.get(p.exam.id) || 0);
    p.shortfallHigh = Math.max(0, highSim.rem.get(p.exam.id) || 0);
    p.finishDay = midSim.finish.get(p.exam.id);
    p.requiredDaily = p.studyDays > 0 ? p.mid / p.studyDays : p.mid;
    // daily quota: spread what's left evenly over the remaining study days (review days excluded).
    // Studying less today pushes the rest onto the following days, so tomorrow's quota grows.
    const yday = addDays(today, -1);
    const isCourseOwner = owner.get(`course:${p.course.id}`) === p.exam.id;
    p.doneToday = isCourseOwner ? studiedOn(state, p.course.id, today) : 0;
    p.inReview = p.studyDays === 0 && p.daysLeft > 0;
    p.quota = p.studyDays > 0 ? round5((p.mid + p.doneToday) / p.studyDays) : 0;
    p.todayMinutes = p.quota > 0 ? round5(Math.max(0, p.quota - p.doneToday)) : 0;
    const logged = state.quotaLog?.[yday]?.[p.exam.id];
    if (logged != null) p.yesterday = { quota: logged, done: isCourseOwner ? studiedOn(state, p.course.id, yday) : 0 };
    if (p.status === 'done') {
      p.todayMinutes = 0;
      continue;
    }
    if (p.daysLeft === 0) {
      p.status = 'past';
      p.todayMinutes = 0;
      continue;
    }
    p.status = p.shortfall > 15 ? 'behind' : p.shortfallHigh > 15 ? 'tight' : 'ok';

    // latest start day for the pessimistic estimate, walking back from the deadline
    let acc = 0;
    let d = p.lastStudyDay;
    while (d >= today) {
      acc += studyCapFor(state, d);
      if (acc >= p.high) break;
      d = addDays(d, -1);
    }
    p.startBy = acc >= p.high ? d : undefined;

    // today's quota as concrete material, in course order
    p.portion = portionOf(p.work, p.todayMinutes);
    p.todayUnits = p.portion.map((x) => p.work.find((w) => w.unit.id === x.unit.id)!);
    // units that won't be reached at the expected pace
    if (p.shortfall > 15) {
      let reach = p.mid - p.shortfall;
      for (const w of p.work) {
        if (w.minutes < 1) continue;
        if (reach >= w.minutes) reach -= w.minutes;
        else p.unreachable.push(w.unit);
      }
      const extra = round5(p.shortfall / Math.max(1, p.studyDays));
      // is there really that much free time on those days (beyond the study cap)?
      let headroom = 0;
      for (let d = today; d <= p.lastStudyDay; d = addDays(d, 1))
        headroom += Math.max(0, availableFor(state, d) - studyCapFor(state, d));
      if (headroom >= p.shortfall)
        p.suggestions.push(`زد مذاكرة ${p.course.name} بحوالي ${extra} دقيقة يوميًا من وقتك المخصص للمهام، حتى ${p.lastStudyDay === today ? 'نهاية اليوم' : 'موعد المراجعة'}.`);
      else
        p.suggestions.push(`حتى لو خصصت كل وقتك المتاح للمذاكرة لن يكفي (ينقص ~${fmtMinutes(p.shortfall - headroom)}). الحل: اختصار بعض الفصول أو زيادة وقتك المتاح فعليًا في هذه الأيام.`);
      if ((p.exam.reviewDays || 0) > 0 && !p.reviewCompressed)
        p.suggestions.push(`استخدم ${p.exam.reviewDays === 1 ? 'يوم المراجعة' : 'أيام المراجعة'} للمذاكرة بدل المراجعة فقط.`);
      if (p.unreachable.length)
        p.suggestions.push(`بالوتيرة الحالية لن تصل إلى: ${p.unreachable.map((u) => u.title).join('، ')}. قرر أيها الأهم أو اختصر مذاكرتها.`);
      p.suggestions.push('خفّف المهام غير العاجلة في الأيام القادمة، أو زد وقتك المتاح من الإعدادات.');
    } else if (p.status === 'tight') {
      p.suggestions.push('الخطة ممكنة لكن بلا هامش أمان؛ ابدأ اليوم ولا تؤجل.');
    }
  }

  // the days ahead follow the same quota model as today, so every screen shows the same numbers
  const byDay: StudyPlan['byDay'] = {};
  for (const p of plans) {
    if (p.quota <= 0 || p.status === 'done' || p.status === 'past' || p.status === 'unknown') continue;
    if (p.todayMinutes > 0) (byDay[today] ||= []).push({ examId: p.exam.id, minutes: p.todayMinutes });
    const rest = p.studyDays > 1 ? round5(Math.max(0, p.mid - p.todayMinutes) / (p.studyDays - 1)) : 0;
    if (rest > 0) for (let d = addDays(today, 1); d <= p.lastStudyDay; d = addDays(d, 1)) (byDay[d] ||= []).push({ examId: p.exam.id, minutes: rest });
  }

  return { exams: plans, byDay };
}

export const EXAM_STATUS_LABEL: Record<ExamStatus, string> = {
  unknown: 'ينقصه معلومات',
  done: 'أنهيت المنهج',
  ok: 'على المسار',
  tight: 'ضيّق',
  behind: 'متأخر',
  past: 'اليوم',
};

/** "ش1 · الدرس 3 (كامل)" or "ش1 · الدرس 4: 12 من 34 دقيقة فيديو" */
export function portionText(x: Portion, sizeLabel: string): string {
  if (x.review) return `${x.unit.title} (مراجعة)`;
  if (x.whole) return x.unit.progress > 0 ? `${x.unit.title} (الباقي)` : `${x.unit.title} (كامل)`;
  return `${x.unit.title}: ${x.amount} ${sizeLabel}`;
}
