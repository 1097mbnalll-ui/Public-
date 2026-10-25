// Study planner: estimates remaining work per exam from material size, difficulty and your
// measured pace, then simulates the days until each exam against your real study capacity.

import type { AppState, Course, Exam, Unit } from '../types';
import { addDays, atTime, diffDays, fmtMinutes, todayKey } from '../dates';
import { coursePace, diffFactor, type Pace } from './learning';
import { availableFor, studyCapFor, studyCapToday } from './capacity';
import { L, sz } from '../i18n';

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
  /** smart mode: today is the final-review day before the exam */
  reviewToday?: boolean;
  /** smart mode: new material is planned to be finished by this day */
  learnEnd?: string;
  /** with nothing planned today: the next day this exam gets study time */
  nextDay?: string;
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
    // an afternoon exam (12:00 or later) leaves its morning for study
    const studyOnExamDay = !!exam.time && exam.time >= '12:00';
    const latest = studyOnExamDay ? exam.date : addDays(exam.date, -1);
    let lastStudyDay = addDays(latest, -(exam.reviewDays || 0));
    let reviewCompressed = false;
    if (lastStudyDay < today && latest >= today) {
      lastStudyDay = latest;
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
      p.suggestions.push(L('أضف الفصول أو الموضوعات المطلوبة لهذا الاختبار حتى أستطيع حساب الوقت.', "Add the chapters or topics for this exam so I can work out the time."));
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
    const logged = state.quotaLog?.[yday]?.[p.exam.id];
    if (logged != null) p.yesterday = { quota: logged, done: isCourseOwner ? studiedOn(state, p.course.id, yday) : 0 };
    if (p.status === 'done') {
      p.todayMinutes = 0;
      continue;
    }
    // an exam today is over once it starts; a morning one (or one without a time) leaves nothing to plan
    if (p.daysLeft === 0 && !(p.exam.time && p.exam.time >= '12:00' && now < atTime(p.exam.date, p.exam.time))) {
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
        p.suggestions.push(L(`زد مذاكرة ${p.course.name} بحوالي ${extra} دقيقة يوميًا من وقتك المخصص للمهام، حتى ${p.lastStudyDay === today ? 'نهاية اليوم' : 'موعد المراجعة'}.`, `Add about ${extra} minutes of ${p.course.name} a day from your task time, until ${p.lastStudyDay === today ? 'the end of today' : 'the review days'}.`));
      else
        p.suggestions.push(L(`حتى لو خصصت كل وقتك المتاح للمذاكرة لن يكفي (ينقص ~${fmtMinutes(p.shortfall - headroom)}). الحل: اختصار بعض الفصول أو زيادة وقتك المتاح فعليًا في هذه الأيام.`, `Even all of your free time won't be enough (about ${fmtMinutes(p.shortfall - headroom)} short). Cut some chapters or genuinely free up more time on these days.`));
      if ((p.exam.reviewDays || 0) > 0 && !p.reviewCompressed)
        p.suggestions.push(L(`استخدم ${p.exam.reviewDays === 1 ? 'يوم المراجعة' : 'أيام المراجعة'} للمذاكرة بدل المراجعة فقط.`, `Use ${p.exam.reviewDays === 1 ? 'the review day' : 'the review days'} to study, not only to review.`));
      if (p.unreachable.length)
        p.suggestions.push(L(`بالوتيرة الحالية لن تصل إلى: ${p.unreachable.map((u) => u.title).join('، ')}. قرر أيها الأهم أو اختصر مذاكرتها.`, `At this pace you won't reach: ${p.unreachable.map((u) => u.title).join(', ')}. Decide which matter most or study them more briefly.`));
      p.suggestions.push(L('خفّف المهام غير العاجلة في الأيام القادمة، أو زد وقتك المتاح من الإعدادات.', "Lighten non-urgent tasks over the next days, or raise your available time in settings."));
    } else if (p.status === 'tight') {
      p.suggestions.push(L('الخطة ممكنة لكن بلا هامش أمان؛ ابدأ اليوم ولا تؤجل.', "The plan works but has no safety margin; start today and don't postpone."));
    }
  }

  // daily shares — independent of your free time: this is what each exam needs
  const byDay = allocate(plans, today, state.settings.studyMode !== 'even');
  for (const p of plans) {
    if (p.status === 'unknown' || p.status === 'done' || p.status === 'past' || p.studyDays <= 0) continue;
    p.quota = round5(byDay[today]?.find((x) => x.examId === p.exam.id)?.minutes || 0);
    p.todayMinutes = p.quota > 0 ? round5(Math.max(0, p.quota - p.doneToday)) : 0;
    // today's quota as concrete material, in course order
    p.portion = portionOf(p.work, p.todayMinutes);
    p.todayUnits = p.portion.map((x) => p.work.find((w) => w.unit.id === x.unit.id)!);
  }
  if (byDay[today]) byDay[today] = plans.filter((p) => p.todayMinutes > 0).map((p) => ({ examId: p.exam.id, minutes: p.todayMinutes }));
  for (const p of plans)
    if (!p.todayMinutes) p.nextDay = Object.keys(byDay).filter((d) => d > today && byDay[d].some((x) => x.examId === p.exam.id)).sort()[0];

  return { exams: plans, byDay };
}

/**
 * Day-by-day study minutes per exam, from today to the last study day.
 *  even  — what's left ÷ the days left, for every exam (the simple split).
 *  smart — the same, plus: new material ends a day early and that last day is a final review
 *          (for exams 3+ study days away), and on days where the exams together ask for more than
 *          the lowest daily load that still meets every deadline, the far-away exams wait.
 * Studying less today simply raises the following days (the split is redone from what's left).
 */
function allocate(plans: ExamPlan[], today: string, smart: boolean): StudyPlan['byDay'] {
  type Job = { p: ExamPlan; main: number; learnEnd: string; review: number; last: string };
  const jobs: Job[] = [];
  for (const p of plans) {
    if (p.status === 'unknown' || p.status === 'done' || p.status === 'past' || p.studyDays <= 0) continue;
    const start = p.mid + p.doneToday; // as the day began, so the quota doesn't shrink while you study
    let review = 0;
    let learnEnd = p.lastStudyDay;
    if (smart && p.studyDays >= 3) {
      review = Math.min(start / 2, Math.max(30, Math.min(180, p.total * 0.12)));
      learnEnd = addDays(p.lastStudyDay, -1);
    }
    p.learnEnd = smart ? learnEnd : undefined;
    p.reviewToday = smart && review > 0 && p.lastStudyDay === today;
    jobs.push({ p, main: start - review, learnEnd, review, last: p.lastStudyDay });
  }
  const out: StudyPlan['byDay'] = {};
  const end = jobs.reduce((m, j) => (j.last > m ? j.last : m), today);
  for (let d = today; d <= end; d = addDays(d, 1)) {
    const live = jobs.filter((j) => j.learnEnd >= d && j.main > 0.5);
    const share = new Map(live.map((j) => [j, j.main / (diffDays(d, j.learnEnd) + 1)]));
    if (smart && live.length > 1) {
      // the lowest daily load that still meets every deadline (earliest deadline first)
      const byEnd = [...live].sort((a, b) => a.learnEnd.localeCompare(b.learnEnd));
      let level = 0;
      let acc = 0;
      for (const j of byEnd) {
        acc += j.main;
        level = Math.max(level, acc / (diffDays(d, j.learnEnd) + 1));
      }
      let over = [...share.values()].reduce((a, x) => a + x, 0) - level;
      // trim the furthest exams first — they have room to catch up later
      for (const j of [...byEnd].reverse()) {
        if (over <= 0.5) break;
        const cut = Math.min(share.get(j)!, over);
        share.set(j, share.get(j)! - cut);
        over -= cut;
      }
    }
    for (const j of jobs) {
      let m = share.get(j) || 0;
      j.main -= m;
      // the final-review day: the review block plus anything not finished in time
      if (d === j.last) {
        m += j.review + Math.max(0, j.main);
        j.main = 0;
      }
      if (m > 0.5) (out[d] ||= []).push({ examId: j.p.exam.id, minutes: d === today ? m : round5(m) });
    }
  }
  return out;
}

export const EXAM_STATUS_LABEL: Record<ExamStatus, string> = {
  get unknown() { return L('ينقصه معلومات', "Needs info"); },
  get done() { return L('أنهيت المنهج', "Syllabus done"); },
  get ok() { return L('على المسار', "On track"); },
  get tight() { return L('ضيّق', "Tight"); },
  get behind() { return L('متأخر', "Behind"); },
  get past() { return L('اليوم', "Today"); },
};

/** "ش1 · الدرس 3 (كامل)" or "ش1 · الدرس 4: 12 من 34 دقيقة فيديو" */
export function portionText(x: Portion, sizeLabel: string): string {
  if (x.review) return L(`${x.unit.title} (مراجعة)`, `${x.unit.title} (review)`);
  if (x.whole) return x.unit.progress > 0 ? L(`${x.unit.title} (الباقي)`, `${x.unit.title} (the rest)`) : L(`${x.unit.title} (كامل)`, `${x.unit.title} (whole)`);
  return `${x.unit.title}: ${x.amount} ${sz(sizeLabel)}`;
}
