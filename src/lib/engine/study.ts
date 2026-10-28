// Study planner. For each exam on its own: what's left ÷ the days left, every day counted —
// whatever study time is set in settings. Lessons spread over the days before the exam's review
// days, everything over the days before the exam; the larger share wins. Re-planned every day from
// where you actually are, so a day you skip spreads over the days left. A subject you postpone
// moves its whole share to the next day (and can be put back).

import type { AppState, Course, Exam, Unit } from '../types';
import { addDays, atTime, diffDays, todayKey } from '../dates';
import { coursePace, diffFactor, type Pace } from './learning';
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
  /** minutes of today's share you moved to tomorrow (and can put back) */
  postponed?: number;
  /** today isn't the last day before the exam, so its share can move to tomorrow */
  canPostpone: boolean;
  /** minutes with no day left to go to (every day left is a day off) */
  unplanned?: number;
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

/**
 * What you studied on a day, measured the way the plan measures: the material covered, at your
 * current pace. Finish today's pages in half the time and today's share still reads as done (not
 * "10 minutes left"); take longer and it doesn't read as more than the share. Sessions with no
 * material (timer only, general review) count their minutes.
 */
export function coveredOn(state: AppState, course: Course, pace: number, reviewFactor: number, day: string): number {
  let m = 0;
  for (const x of state.sessions) {
    if (x.courseId !== course.id || x.date !== day) continue;
    const u = x.unitId ? state.units.find((v) => v.id === x.unitId) : undefined;
    const per = pace * diffFactor(u?.difficulty || course.difficulty);
    if (u && x.review) m += u.size * per * reviewFactor;
    else if (u && x.amount > 0) m += x.amount * per;
    else m += x.minutes;
  }
  return m;
}

/**
 * Tick a lesson done (or part-done, or reviewed) on `day`, without a timer. The day has to know you
 * covered it today, or the share stays the same and hands you the next lesson; so a tick records a
 * session with the material and no minutes — today's share counts it (coveredOn), your pace doesn't
 * (it only learns from timed sessions). Changing the tick the same day replaces it; unticking
 * removes it, giving the lesson back to today.
 */
export function markLessonIn(state: AppState, unitId: string, patch: { progress?: number; reviewed?: boolean }, day: string, at: number) {
  const u = state.units.find((x) => x.id === unitId);
  if (!u) return;
  const mine = (review: boolean) => (x: AppState['sessions'][number]) => x.unitId === unitId && x.date === day && !!x.tick && !!x.review === review;
  const drop = (review: boolean) => {
    state.sessions = state.sessions.filter((x) => !mine(review)(x));
  };
  if (patch.progress != null) {
    const p = clamp01(patch.progress);
    // where the lesson stood before today's ticks
    const ticked = state.sessions.filter(mine(false)).reduce((a, x) => a + x.amount, 0);
    const base = u.size > 0 ? clamp01(u.progress - ticked / u.size) : u.progress;
    drop(false);
    if (p > base + 1e-6 && u.size > 0) state.sessions.push({ id: `t${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`, courseId: u.courseId, unitId, date: day, minutes: 0, amount: (p - base) * u.size, tick: true, at });
    u.progress = p;
    if (p < 1 && patch.reviewed == null) {
      drop(true);
      u.reviewed = false;
    }
  }
  if (patch.reviewed != null) {
    const byTick = state.sessions.some(mine(true));
    drop(true);
    // reviewed before today by a real session: nothing new to count
    if (patch.reviewed && (byTick || !u.reviewed)) state.sessions.push({ id: `r${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`, courseId: u.courseId, unitId, date: day, minutes: 0, amount: 0, review: true, tick: true, at });
    u.reviewed = patch.reviewed;
  }
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

/**
 * Each exam on its own, day by day: its share is what's left ÷ the days left (lessons against the
 * review days, everything against the exam; the larger wins). A share postponed on a day moves whole
 * to the next one — tomorrow takes it on top of its own share, so the other days don't change.
 */
function spread(jobs: Job[], from: string, postponed: (day: string, examId: string) => number, off: (day: string, examId: string) => boolean = () => false) {
  // study days from `a` to `b`, leaving out the days you won't study this exam
  const count = (id: string, a: string, b: string) => {
    let n = 0;
    for (let d = a; d <= b; d = addDays(d, 1)) if (!off(d, id)) n++;
    return n;
  };
  const left = new Map<string, number>();
  const alloc = new Map<string, Record<string, number>>();
  const learnDone = new Map<string, string>();
  for (const j of jobs) {
    const id = j.p.exam.id;
    const a: Record<string, number> = {};
    let l = j.learn;
    let r = j.review;
    // postponed yesterday: it lands today, on top of today's share
    let carry = postponed(addDays(from, -1), id);
    for (let d = from; d <= j.lastDay && l + r > 0.5; d = addDays(d, 1)) {
      // a day off: nothing today; a share carried into it waits for the next study day
      if (off(d, id)) continue;
      const learning = l > 0.5 && d <= j.learnEnd;
      const nLast = count(id, d, j.lastDay);
      const nLearn = count(id, d, j.learnEnd);
      const base = Math.max(Math.max(0, l + r - carry) / Math.max(1, nLast), learning && nLearn > 0 ? Math.max(0, l - carry) / nLearn : 0);
      let want = Math.min(l + r, carry + base);
      // the last day has no tomorrow to move to
      const out = d < j.lastDay ? Math.min(want, postponed(d, id)) : 0;
      want -= out;
      carry = out;
      const g = Math.min(l, want);
      const rv = Math.min(r, want - g);
      l -= g;
      r -= rv;
      if (g + rv > 0) a[d] = g + rv;
      if (l <= 0.5 && g > 0 && !learnDone.has(id)) learnDone.set(id, d);
    }
    alloc.set(id, a);
    left.set(id, l + r);
  }
  return { alloc, learnDone, left };
}

export function planStudy(state: AppState, now = Date.now()): StudyPlan {
  const today = todayKey(now);
  const exams = state.exams
    .filter((e) => e.score == null && !e.finished && e.date >= today)
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
    const pace = coursePace(state, course, today);
    const units = state.units.filter((u) => exam.unitIds.includes(u.id) && owner.get(u.id) === exam.id).sort((a, b) => a.order - b.order);
    const allUnits = state.units.filter((u) => exam.unitIds.includes(u.id));
    const work = units.map((u) => unitWork(u, course, pace.pace, rf));

    // an afternoon exam (12:00 or later) leaves its morning for study
    const studyOnExamDay = !!exam.time && exam.time >= '12:00';
    const lastDay = studyOnExamDay ? exam.date : addDays(exam.date, -1);
    const learnEnd = addDays(lastDay, -(exam.reviewDays || 0));
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
    const doneToday = isCourseOwner ? coveredOn(state, course, pace.pace, rf, today) : 0;
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
      canPostpone: today < lastDay,
    };
    const logged = state.quotaLog?.[addDays(today, -1)]?.[exam.id];
    if (logged != null) p.yesterday = { quota: logged, done: isCourseOwner ? coveredOn(state, course, pace.pace, rf, addDays(today, -1)) : 0 };
    plans.push(p);
    // finished today: it still holds the time you gave it today — otherwise that time reads as free
    // and the other subjects' shares jump up the moment you finish this one
    if (p.status === 'unknown' || p.status === 'past' || (p.status === 'done' && doneToday <= 0.5) || lastDay < today) continue;
    // today is planned from where the day started: what you studied today goes back in, so the
    // quota holds still while you work through it
    const learning = learnLeft > 0.5 && today <= learnEnd;
    jobs.push({ p, learn: learnLeft + (learning ? doneToday : 0), review: reviewLeft + (learning ? 0 : doneToday), learnEnd, lastDay });
  }

  const postponed = (day: string, examId: string) => state.studyDefer?.[day]?.[examId] || 0;
  const need = spread(jobs, today, postponed, (day, examId) => !!state.studyOff?.[examId]?.includes(day));

  const byDay: StudyPlan['byDay'] = {};
  for (const j of jobs) {
    const p = j.p;
    const id = p.exam.id;
    p.alloc = need.alloc.get(id) || {};
    p.finishDay = need.learnDone.get(id) || (p.learnLeft <= 0.5 ? today : undefined);
    const unplanned = need.left.get(id) || 0;
    if (unplanned > 5) p.unplanned = unplanned;
    const moved = postponed(today, id);
    if (moved && p.canPostpone) p.postponed = moved;

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

    p.status = p.mid <= 0.5 ? 'done' : 'ok';

    // today's quota as concrete material: lessons in order, then review
    p.portion = portionOf(p.work, p.todayMinutes);
    p.todayUnits = p.portion.map((x) => p.work.find((w) => w.unit.id === x.unit.id)!).filter((w, i, a) => a.indexOf(w) === i);

    if (p.todayMinutes > 0) (byDay[today] ||= []).push({ examId: id, minutes: p.todayMinutes });
    for (const [day, m] of Object.entries(p.alloc)) if (day > today && round5(m) > 0) (byDay[day] ||= []).push({ examId: id, minutes: round5(m) });

  }
  for (const p of plans) if (p.status === 'unknown') p.suggestions.push(L('أضف الفصول أو الموضوعات المطلوبة لهذا الاختبار حتى أستطيع حساب الوقت.', "Add the chapters or topics for this exam so I can work out the time."));

  return { exams: plans, byDay };
}

/** what postponing an exam's share today would make tomorrow: that subject, and the whole day */
export function postponePreview(state: AppState, examId: string, now = Date.now()) {
  const today = todayKey(now);
  const tomorrow = addDays(today, 1);
  const ep = planStudy(state, now).exams.find((e) => e.exam.id === examId);
  const minutes = ep?.todayMinutes || 0;
  const after = planStudy({ ...state, studyDefer: { ...state.studyDefer, [today]: { ...state.studyDefer?.[today], [examId]: minutes } } }, now);
  const day = (p: StudyPlan) => (p.byDay[tomorrow] || []).reduce((a, x) => a + x.minutes, 0);
  const subject = (p: StudyPlan) => (p.byDay[tomorrow] || []).find((x) => x.examId === examId)?.minutes || 0;
  return { minutes, tomorrow, subjectBefore: subject(planStudy(state, now)), subjectAfter: subject(after), dayBefore: day(planStudy(state, now)), dayAfter: day(after) };
}

/** "ش1 · الدرس 3 (كامل)" or "ش1 · الدرس 4: 12 من 34 دقيقة فيديو" */
export function portionText(x: Portion, sizeLabel: string): string {
  if (x.review) return L(`${x.unit.title} (مراجعة)`, `${x.unit.title} (review)`);
  if (x.whole) return x.unit.progress > 0 ? L(`${x.unit.title} (الباقي)`, `${x.unit.title} (the rest)`) : L(`${x.unit.title} (كامل)`, `${x.unit.title} (whole)`);
  return `${x.unit.title} (${szn(x.amount, sizeLabel)})`;
}
