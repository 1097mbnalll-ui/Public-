import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { parseQuick, parseSteps } from '../src/lib/parse';
import { addDays, atTime, todayKey } from '../src/lib/dates';
import { planStudy } from '../src/lib/engine/study';
import { planDay, scoreItem, suggestDeferrals } from '../src/lib/engine/planner';
import { calibration, coursePace } from '../src/lib/engine/learning';
import { buildInsights } from '../src/lib/engine/insights';
import { procStage } from '../src/lib/engine/procedures';
import { pomodoro } from '../src/lib/engine/focus';
import { readCoursePack } from '../src/lib/actions';
import type { AppState, Task } from '../src/lib/types';

// Fixed "now": Tuesday 2026-10-20, 9:00 local
const NOW = atTime('2026-10-20', '09:00');
const TODAY = todayKey(NOW);

function task(p: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'مهمة',
    notes: '',
    area: 'life',
    priority: 1,
    hard: false,
    spent: 0,
    status: 'open',
    checklist: [],
    deferrals: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...p,
  };
}

function withCourse(s: AppState, pages: number[], examInDays: number, reviewDays = 1) {
  s.courses.push({ id: 'c1', name: 'إحصاء', color: '#f00', difficulty: 3, sizeLabel: 'صفحة', notes: '', archived: false, createdAt: NOW });
  pages.forEach((size, i) =>
    s.units.push({ id: `u${i}`, courseId: 'c1', title: `فصل ${i + 1}`, size, progress: 0, reviewed: false, spent: 0, order: i }),
  );
  s.exams.push({
    id: 'e1',
    courseId: 'c1',
    title: 'الميد',
    date: addDays(TODAY, examInDays),
    unitIds: pages.map((_, i) => `u${i}`),
    reviewDays,
    createdAt: NOW,
  });
}

describe('quick add parser', () => {
  it('extracts date, time, priority, area and duration', () => {
    const p = parseQuick('اطبع ملف العقد بكرة الساعة 10 ص !عاجل #عمل 30د', [], NOW);
    expect(p.title).toBe('اطبع ملف العقد');
    expect(p.due).toBe(addDays(TODAY, 1));
    expect(p.dueTime).toBe('10:00');
    expect(p.priority).toBe(3);
    expect(p.area).toBe('work');
    expect(p.estimate).toBe(30);
  });

  it('understands PM times, weekday names and hour durations', () => {
    const p = parseQuick('مذاكرة إحصاء الخميس 5م ساعتين', [], NOW);
    expect(p.dueTime).toBe('17:00');
    expect(p.due).toBe('2026-10-22');
    expect(p.estimate).toBe(120);
    expect(p.area).toBe('study');
    expect(p.areaGuessed).toBe(true);
  });

  it('handles "بعد 3 أيام" and Arabic-Indic digits', () => {
    expect(parseQuick('تجديد الهوية بعد ٣ أيام', [], NOW).due).toBe(addDays(TODAY, 3));
  });

  it('matches a saved procedure template by prefix', () => {
    const s = initialState();
    const p = parseQuick('معاملة مؤسسة الأمل', s.templates, NOW);
    expect(p.template?.name).toBe('معاملة');
    expect(p.templateRest).toBe('مؤسسة الأمل');
  });

  it('«مهمة» as a noun stays in the title; as the last word it is the priority', () => {
    const a = parseQuick('مهمة من اللابتوب', [], NOW);
    expect(a.title).toBe('مهمة من اللابتوب');
    expect(a.priority).toBeUndefined();
    const b = parseQuick('تسليم البحث بكرة 30د مهم', [], NOW);
    expect(b.title).toBe('تسليم البحث');
    expect(b.priority).toBe(2);
    expect(parseQuick('!مهم اتصل بالبنك', [], NOW).priority).toBe(2);
  });

  it('keeps plain text untouched', () => {
    expect(parseQuick('شراء هدية لأمي', [], NOW).title).toBe('شراء هدية لأمي');
  });
});

describe('priority scoring', () => {
  it('ranks overdue + urgent above far-away + low', () => {
    const a = scoreItem({ priority: 3, due: addDays(TODAY, -1), createdAt: NOW }, TODAY, NOW);
    const b = scoreItem({ priority: 0, due: addDays(TODAY, 20), createdAt: NOW }, TODAY, NOW);
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.reasons.join(' ')).toContain('متأخرة');
  });
});

describe('study planner', () => {
  it('is on track when material fits comfortably', () => {
    const s = initialState();
    withCourse(s, [10, 10], 10); // 20 pages * 5 min * 1.2 review = 120 min over ~9 days
    const plan = planStudy(s, NOW);
    expect(plan.exams[0].status).toBe('ok');
    expect(plan.exams[0].mid).toBeCloseTo(120, 0);
    expect(plan.exams[0].todayMinutes).toBeGreaterThan(0);
  });

  it('flags behind and lists unreachable units when time is short', () => {
    const s = initialState();
    s.settings.studyCap = [60, 60, 60, 60, 60, 60, 60];
    withCourse(s, [60, 60, 60], 3); // 180 pages ≈ 1080 min, only ~2 study days
    const ep = planStudy(s, NOW).exams[0];
    expect(ep.status).toBe('behind');
    expect(ep.shortfall).toBeGreaterThan(0);
    expect(ep.unreachable.length).toBeGreaterThan(0);
    expect(ep.suggestions.length).toBeGreaterThan(0);
  });

  it('asks for units when an exam has none', () => {
    const s = initialState();
    withCourse(s, [], 5);
    expect(planStudy(s, NOW).exams[0].status).toBe('unknown');
  });

  it('learns pace from real sessions', () => {
    const s = initialState();
    withCourse(s, [10], 10);
    const before = coursePace(s, s.courses[0]);
    for (let i = 0; i < 4; i++)
      s.sessions.push({ id: `s${i}`, courseId: 'c1', unitId: 'u0', date: TODAY, minutes: 20, amount: 10, at: NOW });
    const after = coursePace(s, s.courses[0]);
    expect(before.source).toBe('default');
    expect(after.source).toBe('data');
    expect(after.pace).toBeLessThan(before.pace); // 2 min/page is faster than the 5 min default
    expect(after.spread).toBeLessThan(before.spread);
  });

  it('ignores implausible study sessions when learning pace', () => {
    const s = initialState();
    withCourse(s, [10], 10);
    s.sessions.push({ id: 'bad', courseId: 'c1', unitId: 'u0', date: TODAY, minutes: 1, amount: 20, at: NOW });
    expect(coursePace(s, s.courses[0]).source).toBe('default');
  });

  it('assigns shared units to the earliest exam only', () => {
    const s = initialState();
    withCourse(s, [10, 10], 5);
    s.exams.push({ id: 'e2', courseId: 'c1', title: 'النهائي', date: addDays(TODAY, 20), unitIds: ['u0', 'u1'], reviewDays: 1, createdAt: NOW });
    const plan = planStudy(s, NOW);
    expect(plan.exams[1].mid).toBe(0);
  });

  it('studies on the morning of an afternoon exam, not of a morning one', () => {
    const s = initialState();
    withCourse(s, [10, 10], 1, 0);
    s.exams[0].time = '17:00';
    expect(planStudy(s, NOW).exams[0].lastStudyDay).toBe(addDays(TODAY, 1));
    s.exams[0].time = '08:00';
    expect(planStudy(s, NOW).exams[0].lastStudyDay).toBe(TODAY);
  });
});

describe('daily study quota', () => {
  it('shares the lessons out by each day’s study time and names them', () => {
    const s = initialState();
    withCourse(s, [20, 20, 20], 12, 2); // 300 min of lessons + 60 of review; lessons by the Thursday after next
    const ep = planStudy(s, NOW).exams[0];
    expect(ep.studyDays).toBe(10);
    expect(ep.learnLeft).toBeCloseTo(300, 0);
    expect(ep.reviewLeft).toBeCloseTo(60, 0);
    // 300 min over 10 learning days holding 1620 min of study time → today (150) gets ~28, +10% margin
    expect(ep.quota).toBe(30);
    expect(ep.todayMinutes).toBe(30);
    expect(ep.portion[0].unit.title).toBe('فصل 1');
    expect(ep.portion.every((x) => !x.review)).toBe(true);
  });

  it('stays about the same during the day while today’s remainder shrinks', () => {
    const s = initialState();
    withCourse(s, [20, 20, 20], 12, 2);
    const before = planStudy(s, NOW).exams[0].quota;
    s.sessions.push({ id: 's', courseId: 'c1', unitId: 'u0', date: TODAY, minutes: 30, amount: 5, at: NOW });
    s.units[0].progress = 0.25;
    s.days[TODAY] = { done: 0, minutes: 30, study: 30 };
    const ep = planStudy(s, NOW).exams[0];
    expect(Math.abs(ep.quota - before)).toBeLessThanOrEqual(5);
    expect(ep.doneToday).toBe(30);
    expect(ep.todayMinutes).toBe(ep.quota - 30 >= 10 ? ep.quota - 30 : 0);
  });

  it('grows the next day when yesterday’s quota was not studied', () => {
    const s = initialState();
    withCourse(s, [30, 30, 30], 12, 2); // 540 min: 55/day today, 60/day tomorrow if nothing is studied
    const q1 = planStudy(s, NOW).exams[0].quota;
    s.quotaLog[TODAY] = { e1: q1 };
    const tomorrow = NOW + 86_400_000;
    const ep = planStudy(s, tomorrow).exams[0];
    expect(ep.quota).toBeGreaterThan(q1);
    expect(ep.yesterday).toEqual({ quota: q1, done: 0 });
  });

  it('spends the review days on review, with real minutes', () => {
    const s = initialState();
    withCourse(s, [20, 20], 3, 2); // exam Friday, review Wednesday + Thursday
    s.units.forEach((u) => (u.progress = 1));
    const now = NOW + 86_400_000; // Wednesday: first review day
    const ep = planStudy(s, now).exams[0];
    expect(ep.inReview).toBe(true);
    expect(ep.reviewCompressed).toBe(false);
    expect(ep.status).toBe('ok');
    expect(ep.todayMinutes).toBeGreaterThan(0);
    expect(ep.portion.every((x) => x.review)).toBe(true);
  });

  it('finishes late lessons in the review days and says so', () => {
    const s = initialState();
    withCourse(s, [20, 20], 3, 2);
    const ep = planStudy(s, NOW + 86_400_000).exams[0];
    expect(ep.inReview).toBe(false);
    expect(ep.reviewCompressed).toBe(true);
    expect(ep.portion[0].review).toBe(false);
  });
});

describe('study planner across exams', () => {
  function twoExams(daysA: number, daysB: number, pagesA: number[], pagesB: number[]) {
    const s = initialState();
    withCourse(s, pagesA, daysA, 0);
    s.courses.push({ id: 'c2', name: 'محاسبة', color: '#0f0', difficulty: 3, sizeLabel: 'صفحة', notes: '', archived: false, createdAt: NOW });
    pagesB.forEach((size, i) => s.units.push({ id: `v${i}`, courseId: 'c2', title: `محاضرة ${i + 1}`, size, progress: 0, reviewed: false, spent: 0, order: i }));
    s.exams.push({ id: 'e2', courseId: 'c2', title: 'كويز', date: addDays(TODAY, daysB), unitIds: pagesB.map((_, i) => `v${i}`), reviewDays: 0, createdAt: NOW });
    return s;
  }

  it('9 hours over 3 days is 3 a day; skip today and it’s 4.5 + 4.5', () => {
    const s = initialState();
    s.settings.studyMode = 'even';
    s.settings.reviewFactor = 0;
    withCourse(s, [108], 3, 0); // 108 pages × 5 min = 540 min; study today, tomorrow and the day after
    const plan = planStudy(s, NOW);
    const ep = plan.exams[0];
    expect(ep.quota).toBe(180);
    expect(plan.byDay[addDays(TODAY, 1)][0].minutes).toBe(180);
    expect(plan.byDay[addDays(TODAY, 2)][0].minutes).toBe(180);
    // nothing studied today → the next morning
    const next = planStudy(s, atTime(addDays(TODAY, 1), '09:00'));
    expect(next.exams[0].quota).toBe(270);
    expect(next.byDay[addDays(TODAY, 2)][0].minutes).toBe(270);
  });

  it('shows what’s needed even when it’s more than your study time, and flags it', () => {
    const s = twoExams(3, 4, [60, 60], [60, 60]);
    const plan = planStudy(s, NOW);
    const total = plan.exams.reduce((a, ep) => a + ep.quota, 0);
    expect(total).toBeGreaterThan(150);
    expect(plan.exams.some((ep) => ep.status === 'behind')).toBe(true);
  });

  it('skips days with no study time and spreads over the rest', () => {
    const s = initialState();
    s.settings.studyMode = 'even';
    s.settings.reviewFactor = 0;
    s.settings.studyCap = [150, 150, 150, 0, 150, 150, 150]; // no study on Wednesdays
    withCourse(s, [36], 3, 0); // 180 min, today (Tue), Wed (none), Thu
    const ep = planStudy(s, NOW).exams[0];
    expect(ep.quota).toBe(90);
    expect(ep.alloc[addDays(TODAY, 1)] || 0).toBe(0);
  });

  it('the days ahead show the same plan as the quota', () => {
    const s = initialState();
    withCourse(s, [30, 30, 30], 8, 1);
    const plan = planStudy(s, NOW);
    const ep = plan.exams[0];
    expect(plan.byDay[TODAY][0].minutes).toBe(ep.todayMinutes);
    const tomorrow = plan.byDay[addDays(TODAY, 1)][0].minutes;
    expect(Math.abs(tomorrow - ep.alloc[addDays(TODAY, 1)])).toBeLessThanOrEqual(3);
  });

  it('studies on the morning of an afternoon exam', () => {
    const s = initialState();
    withCourse(s, [10, 10], 0, 0);
    s.exams[0].time = '17:00';
    s.units.forEach((u) => (u.progress = 1));
    const ep = planStudy(s, NOW).exams[0];
    expect(ep.status).not.toBe('past');
    expect(ep.todayMinutes).toBeGreaterThan(0);
    s.exams[0].time = '10:00';
    expect(planStudy(s, NOW).exams[0].status).toBe('past');
  });

  it('review sessions don’t count as learning speed', () => {
    const s = initialState();
    withCourse(s, [10], 10);
    for (let i = 0; i < 4; i++) s.sessions.push({ id: `r${i}`, courseId: 'c1', unitId: 'u0', date: TODAY, minutes: 5, amount: 10, review: true, at: NOW });
    s.sessions.push({ id: 'g', courseId: 'c1', date: TODAY, minutes: 10, amount: 10, at: NOW });
    expect(coursePace(s, s.courses[0]).source).toBe('default');
  });
});

describe('day planner', () => {
  it('always includes must-do items and detects overload', () => {
    const s = initialState();
    s.dayOverrides[TODAY] = 60;
    s.tasks.push(task({ title: 'أ', due: TODAY, hard: true, estimate: 50, priority: 2 }));
    s.tasks.push(task({ title: 'ب', due: TODAY, estimate: 40, priority: 2 }));
    s.tasks.push(task({ title: 'ج', estimate: 30, priority: 0 }));
    const plan = planDay(s, NOW);
    const titles = plan.items.map((i) => i.title);
    expect(titles).toContain('أ');
    expect(titles).toContain('ب');
    expect(titles).not.toContain('ج');
    expect(plan.overloaded).toBe(true);
    const defer = suggestDeferrals(plan, s);
    expect(defer.map((d) => d.title)).toEqual(['ب']); // never the hard deadline
  });

  it('starts urgent work due tomorrow today, even when the day is full', () => {
    const s = initialState();
    s.dayOverrides[TODAY] = 30;
    s.tasks.push(task({ title: 'واجب', due: addDays(TODAY, 1), priority: 3, estimate: 120 }));
    const plan = planDay(s, NOW);
    expect(plan.items.map((i) => i.title)).toContain('واجب');
    expect(plan.overloaded).toBe(true);
  });

  it('puts عاجلة tasks in today no matter their date, and never suggests deferring them', () => {
    const s = initialState();
    s.dayOverrides[TODAY] = 30;
    s.tasks.push(task({ title: 'عاجل', priority: 3, estimate: 60, due: addDays(TODAY, 10) }));
    s.tasks.push(task({ title: 'عادي', priority: 1, estimate: 20, due: TODAY }));
    const plan = planDay(s, NOW);
    const u = plan.items.find((i) => i.title === 'عاجل')!;
    expect(u.must).toBe(true);
    expect(u.level).toBe('urgent');
    expect(plan.items[0].title).toBe('عاجل');
    expect(suggestDeferrals(plan, s).map((i) => i.title)).not.toContain('عاجل');
  });

  it('مهمة: flexible on day one, must-do from the next day', () => {
    const s = initialState();
    s.tasks.push(task({ title: 'جديدة', priority: 2, estimate: 20 }));
    s.tasks.push(task({ title: 'من أمس', priority: 2, estimate: 20, createdAt: NOW - 86_400_000 }));
    const plan = planDay(s, NOW);
    const fresh = [...plan.items, ...plan.later].find((i) => i.title === 'جديدة')!;
    const old = plan.items.find((i) => i.title === 'من أمس')!;
    expect(fresh.must).toBe(false);
    expect(fresh.reasons[0]).toContain('اليوم أو بكرة');
    expect(old.must).toBe(true);
  });

  it('skips tasks deferred to a later day and waiting tasks', () => {
    const s = initialState();
    s.tasks.push(task({ title: 'لاحقًا', plannedFor: addDays(TODAY, 1), priority: 3 }));
    s.tasks.push(task({ title: 'معلقة', waitingOn: 'المدير', priority: 3 }));
    expect(planDay(s, NOW).items).toHaveLength(0);
  });

  it('applies the learned estimate correction', () => {
    const s = initialState();
    for (let i = 0; i < 4; i++)
      s.tasks.push(task({ status: 'done', estimate: 30, spent: 60, completedAt: NOW, area: 'work' }));
    expect(calibration(s, 'work').factor).toBe(2);
    s.tasks.push(task({ title: 'جديدة', estimate: 30, area: 'work', due: TODAY, priority: 2 }));
    const item = planDay(s, NOW).items.find((i) => i.title === 'جديدة');
    expect(item?.minutes).toBe(60);
  });
});

describe('procedures & insights', () => {
  it('derives stage and surfaces forgotten steps', () => {
    const s = initialState();
    const old = NOW - 4 * 86_400_000;
    s.procedures.push({
      id: 'p1',
      title: 'معاملة مؤسسة الأمل',
      notes: '',
      fields: [],
      priority: 1,
      log: [],
      archived: false,
      createdAt: old,
      updatedAt: old,
      steps: [
        { id: 'a', title: 'تنفيذ', kind: 'action', done: true, doneAt: old },
        { id: 'b', title: 'إرسال للمدير', kind: 'send', target: 'المدير', done: false },
      ],
    });
    expect(procStage(s.procedures[0])).toBe('partial');
    const study = planStudy(s, NOW);
    const ins = buildInsights(s, planDay(s, NOW, study), study, NOW);
    const hit = ins.find((i) => i.id.startsWith('proc-partial'));
    expect(hit?.title).toContain('إرسال للمدير');
  });
});

describe('focus / pomodoro', () => {
  const M = 60000;
  it('counts work blocks only and tracks phases', () => {
    expect(pomodoro(10 * M).phase).toBe('work');
    expect(pomodoro(10 * M).left).toBe(15 * M);
    const br = pomodoro(27 * M);
    expect(br.phase).toBe('break');
    expect(br.left).toBe(3 * M);
    expect(br.done).toBe(1);
    expect(br.workMs).toBe(25 * M); // the 2 break minutes are not work
    const second = pomodoro(40 * M);
    expect(second.phase).toBe('work');
    expect(second.workMs).toBe(35 * M);
  });
});

describe('auto-rescheduling alert', () => {
  it('offers one-tap rescheduling only with movable tasks, never moving urgent ones', () => {
    const s = initialState();
    s.dayOverrides[TODAY] = 60;
    s.tasks.push(task({ title: 'عاجل', priority: 3, estimate: 50 }));
    s.tasks.push(task({ title: 'عادي', priority: 1, estimate: 40, due: TODAY }));
    const study = planStudy(s, NOW);
    const plan = planDay(s, NOW, study);
    const alert = buildInsights(s, plan, study, NOW).find((i) => i.id.startsWith('overload:'));
    expect(alert?.actions[0].act).toBe('auto-replan');
    expect(alert?.detail).toContain('«عادي»');
    expect(alert?.detail).not.toContain('«عاجل»');
  });
});

describe('step list parser', () => {
  it('turns a typed list into typed steps with their targets', () => {
    const st = parseSteps('طباعة الملف، حفظ في ملف مشتريات، إرسال إلى نجيب');
    expect(st.map((x) => x.kind)).toEqual(['print', 'file', 'send']);
    expect(st[1].target).toBe('ملف مشتريات');
    expect(st[2].target).toBe('نجيب');
  });
  it('understands groups, places and replies; supports lines and numbering', () => {
    const st = parseSteps('1. مراجعة الفاتورة\n2. إرسال لقروب فواتير الموردين\n3. تصديق من الغرفة التجارية\n4. انتظار الرد من الغرفة التجارية');
    expect(st.map((x) => x.kind)).toEqual(['action', 'send', 'certify', 'reply']);
    expect(st[1].target).toBe('قروب فواتير الموردين');
    expect(st[2].target).toBe('الغرفة التجارية');
    expect(st[3].target).toBe('الغرفة التجارية');
  });
  it('detects printing inside a longer phrase', () => {
    expect(parseSteps('تجهيز المستند وطباعته')[0].kind).toBe('print');
  });
});

describe('work procedures priority', () => {
  const proc = (title: string, priority: 0 | 1 | 2 | 3, extra: any = {}) => ({
    id: title,
    title,
    notes: '',
    fields: [],
    priority,
    log: [],
    archived: false,
    createdAt: NOW,
    updatedAt: NOW,
    steps: [
      { id: title + '1', title: 'تنفيذ', kind: 'action' as const, done: false },
      { id: title + '2', title: 'إرسال', kind: 'send' as const, target: 'المدير', done: false },
    ],
    ...extra,
  });

  it('عاجل is always in today and ranked first; never suggested for postponing', () => {
    const s = initialState();
    s.dayOverrides[TODAY] = 20;
    s.procedures.push(proc('عاجل', 3), proc('عادي', 1, { due: TODAY }), proc('منخفض', 0, { due: TODAY }));
    const plan = planDay(s, NOW);
    expect(plan.items[0].title).toBe('عاجل');
    expect(plan.items[0].must).toBe(true);
    expect(plan.items[0].level).toBe('urgent');
    const moved = suggestDeferrals(plan, s).map((i) => i.title);
    expect(moved).not.toContain('عاجل');
    expect(moved).toContain('منخفض'); // lowest value goes first
  });

  it('عادي / منخفض are postponed (skipped today once pushed), عاجل ignores a postponement date', () => {
    const s = initialState();
    s.procedures.push(proc('عادي', 1, { plannedFor: addDays(TODAY, 1) }));
    s.procedures.push(proc('منخفض', 0, { plannedFor: addDays(TODAY, 1) }));
    expect(planDay(s, NOW).items.map((i) => i.title)).toEqual([]);
  });

  it('مهم: flexible on its first day, must-do from the next', () => {
    const s = initialState();
    s.procedures.push(proc('جديد', 2), proc('قديم', 2, { createdAt: NOW - 86_400_000 }));
    const plan = planDay(s, NOW);
    const all = [...plan.items, ...plan.later];
    expect(all.find((i) => i.title === 'جديد')!.must).toBe(false);
    expect(all.find((i) => i.title === 'قديم')!.must).toBe(true);
  });

  it('one-tap alert lists procedures it will move', () => {
    const s = initialState();
    s.dayOverrides[TODAY] = 20;
    s.procedures.push(proc('عاجل', 3), proc('عادي', 1, { due: TODAY }));
    const study = planStudy(s, NOW);
    const plan = planDay(s, NOW, study);
    const a = buildInsights(s, plan, study, NOW).find((i) => i.id.startsWith('overload:'));
    expect(a?.actions[0].act).toBe('auto-replan');
    expect(a?.detail).toContain('«عادي»');
    expect(a?.detail).not.toContain('«عاجل»');
  });
});

describe('quick add — English keywords', () => {
  it('reads urgent / important / tomorrow / #work', () => {
    const now = new Date(2026, 9, 22, 10).getTime();
    const a = parseQuick('Renew passport urgent tomorrow #work', [], now);
    expect(a.priority).toBe(3);
    expect(a.area).toBe('work');
    expect(a.due).toBe('2026-10-23');
    expect(a.title).toBe('Renew passport');
    expect(parseQuick('Send report important', [], now).priority).toBe(2);
  });
});

describe('coach — tone follows lateness', () => {
  it('on track → level 0; longer and more urgent delays → higher level', async () => {
    const { coachFacts, offlineMessage, toneLevel } = await import('../src/lib/engine/coach');
    const s = initialState();
    s.tasks.push(task({ title: 'ترتيب الغرفة', due: TODAY }));
    let f = coachFacts(s, planDay(s, NOW), NOW);
    expect(f.level).toBe(0);
    expect(offlineMessage(f, 'harsh').length).toBeGreaterThan(10);

    s.tasks.push(task({ title: 'تجديد الجواز', priority: 3, due: addDays(TODAY, -2) }));
    f = coachFacts(s, planDay(s, NOW), NOW);
    expect(f.overdue[0].title).toBe('تجديد الجواز');
    expect(f.level).toBe(2); // 2 days × urgent weight 3 = 6

    s.tasks.push(task({ title: 'تقرير', priority: 2, due: addDays(TODAY, -6), deferrals: 4 }));
    f = coachFacts(s, planDay(s, NOW), NOW);
    expect(f.level).toBe(4);
    expect(offlineMessage(f, 'harsh')).toContain('تقرير');

    // the chosen style caps the strength
    expect(toneLevel(4, 'gentle')).toBe(1);
    expect(toneLevel(4, 'firm')).toBe(3);
    expect(toneLevel(4, 'harsh')).toBe(4);
  });
});

describe('today only holds what belongs to today', () => {
  it('a normal task with a far or no due date waits under «if there is time»', () => {
    const s = initialState();
    s.tasks.push(task({ title: 'ترتيب المكتبة', priority: 1 }));
    s.tasks.push(task({ title: 'شراء هدية', priority: 1, due: addDays(TODAY, 5) }));
    s.tasks.push(task({ title: 'دفع الفاتورة', priority: 1, due: addDays(TODAY, 1) }));
    const p = planDay(s, NOW);
    const ids = p.items.map((i) => i.title);
    expect(ids).toContain('دفع الفاتورة');
    expect(ids).not.toContain('ترتيب المكتبة');
    expect(ids).not.toContain('شراء هدية');
    expect(p.later.map((i) => i.title)).toContain('ترتيب المكتبة');
  });

  it('the study quota is always part of today, even on a full day', () => {
    const s = initialState();
    withCourse(s, [20, 20, 20], 10);
    s.settings.available = s.settings.available.map(() => 30);
    const p = planDay(s, NOW);
    expect(p.items.some((i) => i.kind === 'study')).toBe(true);
  });

  it('«لازم» alone does not make a task un-postponable', () => {
    expect(parseQuick('لازم أشتري خبز', [], NOW).hard).toBeFalsy();
    expect(parseQuick('تسليم البحث ما يتأجل', [], NOW).hard).toBe(true);
  });
});

describe('assistant — answers from your data', () => {
  it('understands everyday questions', async () => {
    const { detectIntent } = await import('../src/lib/engine/assistant');
    expect(detectIntent('وش عندي اليوم؟')).toBe('today');
    expect(detectIntent('عطني ملخص')).toBe('summary');
    expect(detectIntent('وش أأجل؟')).toBe('defer');
    expect(detectIntent('وش رأيك في أدائي')).toBe('performance');
    expect(detectIntent('وش أسوي الحين')).toBe('now');
    expect(detectIntent('What can I postpone?')).toBe('defer');
  });

  it('«what can wait» never offers urgent items, and offers a one-tap move', async () => {
    const { answer } = await import('../src/lib/engine/assistant');
    const s = initialState();
    s.tasks.push(task({ title: 'تجديد الجواز', priority: 3 }));
    s.tasks.push(task({ title: 'دفع الفاتورة', priority: 1, due: addDays(TODAY, 1) }));
    const r = answer('defer', s, 'firm', NOW);
    expect(r.text).toContain('دفع الفاتورة');
    const ids = r.actions?.[0].ids || [];
    expect(ids).toHaveLength(1);
    expect(s.tasks.find((t) => t.id === ids[0])?.title).toBe('دفع الفاتورة');
  });

  it('performance compares this week with last week', async () => {
    const { performance } = await import('../src/lib/engine/assistant');
    const s = initialState();
    s.days[TODAY] = { done: 4, minutes: 60, study: 30 };
    s.days[addDays(TODAY, -8)] = { done: 1, minutes: 10, study: 0 };
    const p = performance(s, NOW);
    expect(p.done7).toBe(4);
    expect(p.donePrev7).toBe(1);
  });
});

describe('course / task packs', () => {
  it('reads tasks without a course and drops invalid fields', () => {
    const p = readCoursePack({ app: 'masar', tasks: [{ title: ' تقرير ', due: 'بكرة', priority: 3, area: 'x', steps: ['أ', 2, ''] }, { title: '' }] });
    expect(p.course).toBeUndefined();
    expect(p.tasks).toEqual([{ title: 'تقرير', priority: 3, steps: ['أ'] }]);
  });
  it('reads expenses and guesses their category', () => {
    const p = readCoursePack({ app: 'masar', expenses: [{ title: 'قهوة', amount: '18', date: '2026-10-20' }, { title: 'x', amount: 0 }] });
    expect(p.expenses).toEqual([{ title: 'قهوة', amount: 18, day: '2026-10-20', cat: 'coffee' }]);
  });
  it('rejects anything that is not a pack', () => {
    expect(() => readCoursePack({ app: 'masar', tasks: [] })).toThrow();
    expect(() => readCoursePack({ hello: 1 })).toThrow();
  });
});
