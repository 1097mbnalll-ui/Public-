// Study planner. Per exam it splits what's left into learning (lessons not studied yet) and a
// review pass, and plans both day by day:
//  - the daily quota is what's needed: lessons spread evenly over the days before the review
//    days, review over the days before the exam. Skip a day and what you missed spreads evenly
//    over the days left — re-planned every day from where you actually are
//  - a second run checks it against the study time you really have each day, across all exams
//    together (nearest deadline first): what doesn't fit is the shortfall and sets the status
// The quota you see today is the same number the plan gives today, so every screen agrees.

import type { AppState, Course, Exam, Unit } from '../types';
import { addDays, atTime, diffDays, fmtMinutes, todayKey } from '../dates';
import { coursePace, diffFactor, type Pace } from './learning';
import { availableFor, dayRecord, minutesLeftToday, studyCapFor } from './capacity';
import { freeMinutes } from './schedule';
import { L, szn } from '../i18n';

export type ExamStatus = 'unknown' | 'done' | 'ok' | 'tight' | 'behind' | 'past';

export interface UnitWork {
  unit: Unit;
  /** remaining minutes incl. review */
  minutes: number;
  /** of which: learning the part not studied yet */
  learn: number;
  /** of which: the review pass before the exam */
  review: number;
}

export interface ExamPlan {
  exam: Exam;
  course: Course;
  status: ExamStatus;
  pace: Pace;
  /** remaining minutes (learning + review): optimistic / expected / pessimistic */
  low: number;
  mid: number;
  high: number;
  /** of `mid`: learning still to do, and the review pass */
  learnLeft: number;
  reviewLeft: number;
  /** total material minutes (done + remaining), for progress */
  total: number;
  progress: number; // 0..1
  daysLeft: number; // until exam day
  /** finish the lessons by this day; the days after it are for review */
  lastStudyDay: string;
  /** last day you can study at all (the day before the exam, or its morning for an afternoon exam) */
  lastDay: string;
  studyDays: number; // days left to learn in, incl. today
  /** average daily study the plan asks for until the lessons are done */
  requiredDaily: number;
  /** latest day to start and still finish with the pessimistic estimate */
  startBy?: string;
  /** day the lessons are done at the expected pace */
  finishDay?: string;
  shortfall: number; // minutes that won't fit (expected)
  shortfallHigh: number;
  /** today's share of the plan, including what you've already studied today */
  quota: number;
  /** minutes already studied today for this exam's course */
  doneToday: number;
  /** what's still left of today's quota (quota − doneToday) */
  todayMinutes: number;
  todayUnits: UnitWork[];
  /** today's quota translated into material: which lessons / how much of each */
  portion: Portion[];
  /** inside the review days with the lessons done: today is review */
  inReview: boolean;
  /** yesterday's quota (as recorded) and what was actually studied */
  yesterday?: { quota: number; done: number };
  unreachable: Unit[];
  work: UnitWork[];
  /** the review days are being used to finish lessons */
  reviewCompressed: boolean;
  suggestions: string[];
  /** planned minutes per day (expected pace) */
  alloc: Record<string, number>;
  /** nothing planned today: the next day this exam gets study time */
  nextDay?: string;
  /** smart mode gave this exam a final-review day of its own */
  safetyDay?: boolean;
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
  /** when your study time isn't enough: the daily study until `until` that would be — or, if even
   *  all your free time falls short, the most you can do and how much is still missing */
  boost?: { minutes: number; until: string; enough: boolean; short: number };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function unitWork(u: Unit, course: Course, pace: number, reviewFactor: number): UnitWork {
  const per = pace * diffFactor(u.difficulty || course.difficulty);
  const learn = u.size * (1 - clamp01(u.progress)) * per;
  const review = u.reviewed ? 0 : u.size * per * reviewFactor;
  return { unit: u, minutes: learn + review, learn, review };
}

export function unitMinutes(u: Unit, course: Course, pace: number, reviewFactor: number): number {
  return unitWork(u, course, pace, reviewFactor).minutes;
}

/** minutes of study logged for a course on a day */
export function studiedOn(state: AppState, courseId: string, day: string): number {
  return state.sessions.filter((x) => x.courseId === courseId && x.date === day).reduce((a, x) => a + x.minutes, 0);
}

/** cut `minutes` out of the work: lessons in course order first, then their review */
export function portionOf(work: UnitWork[], minutes: number): Portion[] {
  const out: Portion[] = [];
  let left = minutes;
  const take = (w: UnitWork, m: number, review: boolean) => {
    const u = w.unit;
    const size = review ? u.size : u.size * (1 - clamp01(u.progress));
    if (left >= m - 3) {
      out.push({ unit: u, minutes: Math.round(m), amount: Math.round(size), whole: true, review });
      left -= m;
    } else {
      out.push({ unit: u, minutes: Math.round(left), amount: Math.max(1, Math.round((size * left) / m)), whole: false, review });
      left = 0;
    }
  };
  for (const w of work) {
    if (left < 1) break;
    if (w.learn >= 1) take(w, w.learn, false);
  }
  for (const w of work) {
    if (left < 1) break;
    if (w.review >= 1) take(w, w.review, true);
  }
  return out;
}

const round5 = (m: number) => Math.round(m / 5) * 5;

interface Job {
  p: ExamPlan;
  learn: number;
  review: number;
  learnEnd: string;
  lastDay: string;
}

interface SimResult {
  learn: Map<string, number>;
  review: Map<string, number>;
  alloc: Map<string, Record<string, number>>;
  learnDone: Map<string, string>;
}

/**
 * Lay the jobs out day by day. Each day every job takes its share of what it has left:
 * left × (this day's weight ÷ the weight of all days until its deadline). Lessons are measured
 * against the start of the review days, everything against the exam; the larger of the two wins.
 *
 * Two runs use it:
 *  - the quota: every study day weighs the same and nothing is cut, so 9 h over 3 days is 3 h a
 *    day, and a day you skip spreads evenly over the days left (4.5 h + 4.5 h)
 *  - the check: days weigh by their study time and can't hold more than it, nearest deadline
 *    first — what doesn't fit is the shortfall
 */
function simulate(jobs: Job[], from: string, weightOf: (day: string) => number, capOf?: (day: string) => number): SimResult {
  const learn = new Map(jobs.map((j) => [j.p.exam.id, j.learn]));
  const review = new Map(jobs.map((j) => [j.p.exam.id, j.review]));
  const alloc = new Map<string, Record<string, number>>(jobs.map((j) => [j.p.exam.id, {}]));
  const learnDone = new Map<string, string>();
  const end = jobs.reduce((m, j) => (j.lastDay > m ? j.lastDay : m), from);
  const days: string[] = [];
  for (let d = from; d <= end; d = addDays(d, 1)) days.push(d);
  const weights = days.map(weightOf);
  const caps = days.map(capOf || (() => Infinity));
  // weight from each day to the end, so "all the days until a deadline" is a subtraction
  const tail = new Map<string, number>();
  let acc = 0;
  for (let i = days.length - 1; i >= 0; i--) tail.set(days[i], (acc += weights[i]));
  const between = (a: string, b: string) => (tail.get(a) || 0) - (tail.get(addDays(b, 1)) || 0);
  // with no study day left before a deadline, what's left lands on its last day
  const share = (left: number, day: string, w: number, until: string) => {
    const all = between(day, until);
    return all > 0 ? (left * w) / all : day === until ? left : 0;
  };

  days.forEach((day, i) => {
    let cap = caps[i];
    if (cap <= 0) return;
    const asks = jobs
      .filter((j) => day <= j.lastDay && (learn.get(j.p.exam.id)! + review.get(j.p.exam.id)!) > 0.5)
      .map((j) => {
        const id = j.p.exam.id;
        const l = learn.get(id)!;
        const r = review.get(id)!;
        const learning = l > 0.5 && day <= j.learnEnd;
        const want = Math.max(share(l + r, day, weights[i], j.lastDay), learning ? share(l, day, weights[i], j.learnEnd) : 0);
        return { j, want: Math.min(l + r, want), due: learning ? j.learnEnd : j.lastDay };
      })
      .filter((x) => x.want > 0);
    if (asks.reduce((a, x) => a + x.want, 0) > cap) asks.sort((a, b) => a.due.localeCompare(b.due) || b.want - a.want);
    for (const x of asks) {
      if (cap <= 0.5) break;
      const id = x.j.p.exam.id;
      let m = Math.min(cap, x.want);
      const l = learn.get(id)!;
      const g = Math.min(l, m);
      learn.set(id, l - g);
      m -= g;
      const r = review.get(id)!;
      const rv = Math.min(r, m);
      review.set(id, r - rv);
      const a = alloc.get(id)!;
      a[day] = (a[day] || 0) + g + rv;
      cap -= g + rv;
      if (l - g <= 0.5 && !learnDone.has(id)) learnDone.set(id, day);
    }
  });
  return { learn, review, alloc, learnDone };
}

/**
 * The smart quota. Each day takes a share in proportion to its study time (a day with a skipped
 * lecture carries more, a crowded one less), and on days where the exams together ask
 * for more than the lowest daily load that still meets every deadline: then the exams whose
 * deadline is furthest away are eased a little (at most 40%, never to zero) and catch up on
 * lighter days — every subject is studied every day, a heavy week just weighs a bit less.
 * Deadlines are the same as the even split's — lessons by the review days, everything by the exam.
 */
/** how much of a far exam's daily share a crowded day may hold back */
const MAX_EASE = 0.4;

function level(jobs: Job[], from: string, weightOf: (day: string) => number, capOf: (day: string) => number): SimResult {
  const learn = new Map(jobs.map((j) => [j.p.exam.id, j.learn]));
  const review = new Map(jobs.map((j) => [j.p.exam.id, j.review]));
  const alloc = new Map<string, Record<string, number>>(jobs.map((j) => [j.p.exam.id, {}]));
  const learnDone = new Map<string, string>();
  const end = jobs.reduce((m, j) => (j.lastDay > m ? j.lastDay : m), from);
  const days: string[] = [];
  for (let d = from; d <= end; d = addDays(d, 1)) days.push(d);
  const tail = new Map<string, number>();
  let acc = 0;
  const w = new Map(days.map((d) => [d, Math.max(0, weightOf(d))]));
  for (let i = days.length - 1; i >= 0; i--) tail.set(days[i], (acc += w.get(days[i])!));
  const between = (a: string, b: string) => (tail.get(a) || 0) - (tail.get(addDays(b, 1)) || 0);
  const share = (left: number, day: string, until: string) => {
    const all = between(day, until);
    return all > 0 ? (left * w.get(day)!) / all : day === until ? left : 0;
  };

  for (const day of days) {
    const asks = jobs
      .filter((j) => day <= j.lastDay && (learn.get(j.p.exam.id)! + review.get(j.p.exam.id)!) > 0.5)
      .map((j) => {
        const id = j.p.exam.id;
        const l = learn.get(id)!;
        const r = review.get(id)!;
        const learning = l > 0.5 && day <= j.learnEnd;
        const want = Math.max(share(l + r, day, j.lastDay), learning ? share(l, day, j.learnEnd) : 0);
        return { j, l, r, learning, want: Math.min(l + r, want), due: learning ? j.learnEnd : j.lastDay };
      })
      .filter((x) => x.want > 0);
    if (asks.length > 1 && w.get(day)! > 0) {
      // the lowest load that meets every deadline: the most that's due by some day ÷ study days until then
      const ends = [...new Set(asks.flatMap((x) => [x.j.learnEnd, x.j.lastDay]))].filter((d) => d >= day);
      let lv = 0;
      for (const D of ends) {
        const due = asks.reduce((a, x) => a + (D >= x.j.lastDay ? x.l + x.r : x.learning && D >= x.j.learnEnd ? x.l : 0), 0);
        lv = Math.max(lv, between(day, D) > 0 ? (due * w.get(day)!) / between(day, D) : due);
      }
      // ease the furthest exams a little — never more than 40% of their share, never to zero, and
      // never an exam within 3 days: every subject keeps moving every day
      let over = asks.reduce((a, x) => a + x.want, 0) - lv;
      for (const x of [...asks].sort((a, b) => b.due.localeCompare(a.due))) {
        if (over <= 0.5) break;
        if (diffDays(day, x.due) < 3) continue;
        const cut = Math.min(x.want * MAX_EASE, over);
        x.want -= cut;
        over -= cut;
      }
    }
    // never ask for more than the day's study time. Every subject first gets one short session
    // (15 min, nearest exam first) so nothing stalls; the rest goes nearest deadline first, and what
    // doesn't fit carries over to the next days
    const cap = Math.max(0, capOf(day));
    if (asks.reduce((a, x) => a + x.want, 0) > cap) {
      const order = asks.map((_, i) => i).sort((a, b) => asks[a].due.localeCompare(asks[b].due) || asks[b].want - asks[a].want);
      const give = asks.map(() => 0);
      let first = cap;
      for (const i of order) {
        const f = Math.min(asks[i].want, 15, first);
        give[i] = f;
        first -= f;
      }
      let room = cap - give.reduce((a, b) => a + b, 0);
      for (const i of order) {
        const g = Math.min(asks[i].want - give[i], Math.max(0, room));
        give[i] += g;
        room -= g;
      }
      asks.forEach((x, i) => (x.want = give[i]));
    }
    for (const x of asks) {
      const id = x.j.p.exam.id;
      let m = x.want;
      const g = Math.min(x.l, m);
      learn.set(id, x.l - g);
      m -= g;
      const rv = Math.min(x.r, m);
      review.set(id, x.r - rv);
      if (g + rv > 0) {
        const a = alloc.get(id)!;
        a[day] = (a[day] || 0) + g + rv;
      }
      if (x.l - g <= 0.5 && x.l > 0.5 && !learnDone.has(id)) learnDone.set(id, day);
    }
  }
  return { learn, review, alloc, learnDone };
}

export function planStudy(state: AppState, now = Date.now()): StudyPlan {
  const smart = state.settings.studyMode !== 'even';
  const today = todayKey(now);
  const exams = state.exams
    .filter((e) => e.score == null && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));

  // each unit belongs to the earliest upcoming exam that includes it (midterm before final)
  const owner = new Map<string, string>();
  for (const e of exams) for (const uid of e.unitIds) if (!owner.has(uid)) owner.set(uid, e.id);
  for (const e of exams) if (e.unitIds.length && !owner.has(`course:${e.courseId}`)) owner.set(`course:${e.courseId}`, e.id);

  const rf = state.settings.reviewFactor;
  const plans: ExamPlan[] = [];
  const jobs: Job[] = [];
  for (const exam of exams) {
    const course = state.courses.find((c) => c.id === exam.courseId);
    if (!course) continue;
    const pace = coursePace(state, course);
    const units = state.units.filter((u) => exam.unitIds.includes(u.id) && owner.get(u.id) === exam.id).sort((a, b) => a.order - b.order);
    const allUnits = state.units.filter((u) => exam.unitIds.includes(u.id));
    const work = units.map((u) => unitWork(u, course, pace.pace, rf));

    // an afternoon exam (12:00 or later) leaves its morning for study
    const studyOnExamDay = !!exam.time && exam.time >= '12:00';
    const lastDay = studyOnExamDay ? exam.date : addDays(exam.date, -1);
    // smart: with no review days set, the last day before the exam is kept for review anyway
    const safety = smart && !(exam.reviewDays || 0) && diffDays(today, lastDay) >= 2;
    const learnEnd = addDays(lastDay, -((exam.reviewDays || 0) || (safety ? 1 : 0)));
    const daysLeft = diffDays(today, exam.date);

    // review logged without a lesson ("general / review") during the review days counts against the review pass
    let general = state.sessions
      .filter((x) => x.courseId === course.id && !x.unitId && x.date > learnEnd && x.date <= today)
      .reduce((a, x) => a + x.minutes, 0);
    for (const w of work) {
      if (general <= 0) break;
      const cut = Math.min(w.review, general);
      w.review -= cut;
      w.minutes -= cut;
      general -= cut;
    }

    const learnLeft = work.reduce((a, w) => a + w.learn, 0);
    const reviewLeft = work.reduce((a, w) => a + w.review, 0);
    const mid = learnLeft + reviewLeft;
    const total = allUnits.reduce((a, u) => a + u.size * pace.pace * diffFactor(u.difficulty || course.difficulty) * (1 + rf), 0);
    const remainingAll = allUnits.reduce((a, u) => a + unitMinutes(u, course, pace.pace, rf), 0);
    const isCourseOwner = owner.get(`course:${course.id}`) === exam.id;
    const doneToday = isCourseOwner ? studiedOn(state, course.id, today) : 0;
    const over = daysLeft === 0 && (!studyOnExamDay || now >= atTime(exam.date, exam.time as string) - 3600_000);
    const lastStudyDay = learnEnd >= today ? learnEnd : lastDay;

    const p: ExamPlan = {
      exam,
      course,
      status: exam.unitIds.length === 0 ? 'unknown' : over ? 'past' : mid <= 0.5 ? 'done' : 'ok',
      pace,
      low: mid * (1 - pace.spread),
      mid,
      high: mid * (1 + pace.spread),
      learnLeft,
      reviewLeft,
      total,
      progress: total > 0 ? clamp01(1 - remainingAll / total) : 0,
      daysLeft,
      lastStudyDay,
      lastDay,
      studyDays: Math.max(0, diffDays(today, lastStudyDay) + 1),
      requiredDaily: 0,
      shortfall: 0,
      shortfallHigh: 0,
      quota: 0,
      doneToday,
      todayMinutes: 0,
      todayUnits: [],
      portion: [],
      inReview: false,
      unreachable: [],
      work,
      reviewCompressed: false,
      suggestions: [],
      alloc: {},
      safetyDay: safety,
    };
    const logged = state.quotaLog?.[addDays(today, -1)]?.[exam.id];
    if (logged != null) p.yesterday = { quota: logged, done: isCourseOwner ? studiedOn(state, course.id, addDays(today, -1)) : 0 };
    plans.push(p);
    if (p.status === 'unknown' || p.status === 'past' || p.status === 'done' || lastDay < today) continue;
    // today is planned from where the day started: what you studied today goes back in, so the
    // quota holds still while you work through it
    const learning = learnLeft > 0.5 && today <= learnEnd;
    jobs.push({ p, learn: learnLeft + (learning ? doneToday : 0), review: reviewLeft + (learning ? 0 : doneToday), learnEnd, lastDay });
  }

  // today's study time: the day's cap, but never more than what you've studied plus what's left of the day
  const todayCap = Math.min(studyCapFor(state, today), dayRecord(state, today).study + minutesLeftToday(state, now));
  const capOf = (day: string) => (day === today ? todayCap : studyCapFor(state, day));
  // the quota: what's needed, evenly over the days that have study time
  // smart weighs each day by its study time: a freer day (a skipped lecture) carries more, a busier one less
  const need = smart ? level(jobs, today, (d) => studyCapFor(state, d), (d) => studyCapFor(state, d)) : simulate(jobs, today, (d) => (studyCapFor(state, d) > 0 ? 1 : 0), (d) => studyCapFor(state, d));
  // the check: does it fit your study time? (expected and pessimistic pace)
  const fit = simulate(jobs, today, capOf, capOf);
  const high = simulate(jobs.map((j) => ({ ...j, learn: j.learn * (1 + j.p.pace.spread), review: j.review * (1 + j.p.pace.spread) })), today, capOf, capOf);

  const byDay: StudyPlan['byDay'] = {};
  for (const j of jobs) {
    const p = j.p;
    const id = p.exam.id;
    p.alloc = need.alloc.get(id) || {};
    p.shortfall = (fit.learn.get(id) || 0) + (fit.review.get(id) || 0);
    p.shortfallHigh = (high.learn.get(id) || 0) + (high.review.get(id) || 0);
    p.finishDay = fit.learnDone.get(id) || (p.learnLeft <= 0.5 ? today : undefined);
    const lessonsLate = p.learnLeft > 0.5 && (!p.finishDay || p.finishDay > j.learnEnd);

    p.quota = round5(p.alloc[today] || 0);
    // the last day before the exam asks for everything left, rounded up — rounding must not leave a lesson unreviewed
    const lastCall = today === j.lastDay && p.learnLeft + p.reviewLeft > 0.5;
    if (lastCall) p.quota = Math.max(p.quota, p.doneToday + Math.ceil((p.learnLeft + p.reviewLeft) / 5) * 5);
    const left = p.quota - p.doneToday;
    // under 10 minutes isn't a session worth starting: the share counts as done (except on the last day)
    p.todayMinutes = left >= 10 || (lastCall && left > 0) ? (lastCall ? Math.ceil(left / 5) * 5 : round5(left)) : 0;
    if (!p.todayMinutes) p.nextDay = Object.keys(p.alloc).filter((d) => d > today && round5(p.alloc[d]) > 0).sort()[0];
    p.inReview = today > j.learnEnd && p.learnLeft <= 5;
    p.reviewCompressed = today > j.learnEnd && p.learnLeft > 5 && (p.exam.reviewDays || 0) > 0;
    const learnDays = Object.entries(p.alloc).filter(([d, m]) => d <= p.lastStudyDay && m > 0);
    p.requiredDaily = learnDays.length ? round5(learnDays.reduce((a, [, m]) => a + m, 0) / learnDays.length) : p.quota;

    p.status = p.shortfall > 15 ? 'behind' : p.shortfallHigh > 15 || (lessonsLate && j.learnEnd >= today && (p.exam.reviewDays || 0) > 0) ? 'tight' : 'ok';

    // latest start day for the pessimistic estimate, walking back from the last day
    let acc = 0;
    let d = j.lastDay;
    while (d >= today) {
      acc += studyCapFor(state, d);
      if (acc >= p.high) break;
      d = addDays(d, -1);
    }
    p.startBy = acc >= p.high ? d : undefined;

    // today's quota as concrete material: lessons in order, then review
    p.portion = portionOf(p.work, p.todayMinutes);
    p.todayUnits = p.portion.map((x) => p.work.find((w) => w.unit.id === x.unit.id)!).filter((w, i, a) => a.indexOf(w) === i);

    if (p.todayMinutes > 0) (byDay[today] ||= []).push({ examId: id, minutes: p.todayMinutes });
    for (const [day, m] of Object.entries(p.alloc)) if (day > today && round5(m) > 0) (byDay[day] ||= []).push({ examId: id, minutes: round5(m) });

    if (p.status === 'behind') {
      // lessons that won't be reached: the last ones in course order, as much as is left over
      let notLearned = fit.learn.get(id) || 0;
      for (let i = p.work.length - 1; i >= 0 && notLearned > 1; i--) {
        const w = p.work[i];
        if (w.learn < 1) continue;
        p.unreachable.unshift(w.unit);
        notLearned -= w.learn;
      }
      const extra = round5(p.shortfall / Math.max(1, diffDays(today, j.lastDay) + 1));
      // is there really that much free time on those days (beyond the study cap)?
      let headroom = 0;
      for (let x = today; x <= j.lastDay; x = addDays(x, 1)) headroom += Math.max(0, availableFor(state, x) - studyCapFor(state, x));
      if (headroom >= p.shortfall)
        p.suggestions.push(L(`زد مذاكرة ${p.course.name} بحوالي ${extra} دقيقة يوميًا من وقتك المخصص للمهام حتى الاختبار — أو ارفع «وقت المذاكرة» لهذه الأيام من الإعدادات.`, `Add about ${extra} minutes of ${p.course.name} a day from your task time until the exam — or raise "study time" for these days in settings.`));
      else
        p.suggestions.push(L(`حتى لو خصصت كل وقتك المتاح للمذاكرة لن يكفي (ينقص ~${fmtMinutes(p.shortfall - headroom)}). الحل: اختصار بعض الدروس أو زيادة وقتك المتاح فعليًا في هذه الأيام.`, `Even all of your free time won't be enough (about ${fmtMinutes(p.shortfall - headroom)} short). Cut some lessons or genuinely free up more time on these days.`));
      if (p.unreachable.length)
        p.suggestions.push(L(`بالوتيرة الحالية لن تصل إلى: ${p.unreachable.map((u) => u.title).join('، ')}. قرر أيها الأهم أو اختصر مذاكرتها.`, `At this pace you won't reach: ${p.unreachable.map((u) => u.title).join(', ')}. Decide which matter most or study them more briefly.`));
      else if ((fit.review.get(id) || 0) > 15)
        p.suggestions.push(L('الدروس تخلص، لكن ما يبقى وقت كافي للمراجعة — راجع الأهم فقط.', "You'll get through the lessons, but there's not enough time left to review them all — review the most important ones."));
      const others = jobs.filter((o) => o !== j && o.lastDay <= j.lastDay && o.p.mid > 0);
      if (others.length)
        p.suggestions.push(L(`نفس الأيام يحتاجها ${others.map((o) => o.p.course.name).join('، ')} واختباره أقرب — لما يضيق الوقت يتقدّم.`, `${others.map((o) => o.p.course.name).join(', ')} needs the same days and comes first — when time is short it goes first.`));
    } else if (p.status === 'tight') {
      p.suggestions.push(
        lessonsLate
          ? L('الدروس تخلص بعد بداية أيام المراجعة — ابدأ اليوم والتزم بالحصة عشان يبقى لك وقت تراجع.', "The lessons finish after the review days begin — start today and keep to the quota so there's time to review.")
          : L('الخطة ممكنة لكن بلا هامش أمان؛ ابدأ اليوم ولا تؤجل.', "The plan works but has no safety margin; start today and don't postpone."),
      );
    }
  }
  for (const p of plans) if (p.status === 'unknown') p.suggestions.push(L('أضف الفصول أو الموضوعات المطلوبة لهذا الاختبار حتى أستطيع حساب الوقت.', "Add the chapters or topics for this exam so I can work out the time."));

  // not enough study time: find the daily study (in half hours, within your free time) that would be
  const late = jobs.filter((j) => j.p.status === 'behind');
  let boost: StudyPlan['boost'];
  if (late.length) {
    const until = late.reduce((m, j) => (j.lastDay > m ? j.lastDay : m), today);
    const room = (d: string) => (d === today ? Math.min(freeMinutes(state, d), dayRecord(state, d).study + minutesLeftToday(state, now)) : freeMinutes(state, d));
    const leftWith = (x: number) => {
      const c = (d: string) => (d <= until ? Math.max(capOf(d), Math.min(x, room(d))) : capOf(d));
      const r = simulate(jobs, today, c, c);
      return late.reduce((a, j) => a + (r.learn.get(j.p.exam.id) || 0) + (r.review.get(j.p.exam.id) || 0), 0);
    };
    const most = Math.max(...Array.from({ length: diffDays(today, until) + 1 }, (_, i) => room(addDays(today, i))));
    for (let x = 60; x <= 16 * 60; x += 30) {
      const short = leftWith(x);
      if (short <= 15) {
        boost = { minutes: x, until, enough: true, short: 0 };
        break;
      }
      if (x >= most) {
        boost = { minutes: Math.max(60, Math.floor(most / 30) * 30), until, enough: false, short: round5(short) };
        break;
      }
    }
  }
  return { exams: plans, byDay, ...(boost ? { boost } : {}) };
}

/** "ش1 · الدرس 3 (كامل)" or "ش1 · الدرس 4: 12 من 34 دقيقة فيديو" */
export function portionText(x: Portion, sizeLabel: string): string {
  if (x.review) return L(`${x.unit.title} (مراجعة)`, `${x.unit.title} (review)`);
  if (x.whole) return x.unit.progress > 0 ? L(`${x.unit.title} (الباقي)`, `${x.unit.title} (the rest)`) : L(`${x.unit.title} (كامل)`, `${x.unit.title} (whole)`);
  return `${x.unit.title} (${szn(x.amount, sizeLabel)})`;
}
