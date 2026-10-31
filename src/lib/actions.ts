// All state changes go through these functions.

import type { AppState, Area, BodyLog, GymCustom, GymProfile, GymSession, GymSet, GymState, ClassBlock, Course, Exam, Expense, ExpenseCat, MoneyState, Priority, Procedure, Remind, Step, DietDay, DietFood, DietMeal, DietSetup, DrillAttempt, DrillTask, Mark, SkillId, StepKind, Subscription, Task, Template, Timer, Unit } from './types';
import { getState, mutate } from './store';
import { uid } from './text';
import { addDays, addMonths, atTime, todayKey } from './dates';
import { taskTime } from './engine/learning';
import { markLessonIn } from './engine/study';
import { isProcDone, kindInfo } from './engine/procedures';
import { pomodoro, rhythmOf, splitWorked } from './engine/focus';
import { L } from './i18n';
import { dayPlan, exercise, liveSession, nextWorkout, registerCustom, scheme, slotGroups, target, type GroupId } from './engine/gym';
import { CAT_ORDER, guessCat } from './engine/money';
import { readSchedule } from './engine/schedule';
import { nextAfter } from './engine/remind';
import { nextLevel } from './engine/train';
import { startTargets as dietStartTargets, trendNow as dietTrendNow } from './engine/diet';

const now = () => Date.now();

function bumpDay(s: AppState, patch: { done?: number; minutes?: number; study?: number }, day = todayKey()) {
  const d = (s.days[day] ||= { done: 0, minutes: 0, study: 0 });
  d.done += patch.done || 0;
  d.minutes = Math.max(0, d.minutes + (patch.minutes || 0));
  d.study = Math.max(0, d.study + (patch.study || 0));
}

// ---------------- Tasks ----------------

export function addTask(p: Partial<Task> & { title: string }): string {
  const id = uid();
  mutate((s) => {
    s.tasks.push({
      notes: '',
      area: 'life',
      priority: 1,
      hard: false,
      spent: 0,
      status: 'open',
      checklist: [],
      deferrals: 0,
      ...p,
      id,
      createdAt: now(),
      updatedAt: now(),
    });
  });
  return id;
}

export function updateTask(id: string, patch: Partial<Task>) {
  mutate((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (t) Object.assign(t, patch, { updatedAt: now() });
  });
}

export function completeTask(id: string) {
  mutate((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t || t.status !== 'open') return;
    // credit the realistic time if you didn't track it with the timer
    const credited = t.spent > 0 ? 0 : taskTime(s, t).minutes;
    t.status = 'done';
    t.completedAt = now();
    t.updatedAt = now();
    bumpDay(s, { done: 1, minutes: credited });
    if (t.recurrence) {
      const base = t.due || todayKey();
      const { every, unit } = t.recurrence;
      const step = (k: string) => (unit === 'month' ? addMonths(k, every) : addDays(k, unit === 'week' ? every * 7 : every));
      // an overdue repeat comes back on its next date from today, not already late
      let next = step(base);
      for (let i = 0; next < todayKey() && i < 10_000; i++) next = step(next);
      t.nextId = uid();
      s.tasks.push({
        ...structuredClone(t),
        id: t.nextId,
        nextId: undefined,
        status: 'open',
        due: next,
        plannedFor: undefined,
        spent: 0,
        deferrals: 0,
        completedAt: undefined,
        reminder: t.reminder ? { at: t.reminder.at + (Date.parse(next) - Date.parse(base)) } : undefined,
        checklist: t.checklist.map((c) => ({ ...c, done: false })),
        createdAt: now(),
        updatedAt: now(),
      });
    }
  }, L('إنجاز مهمة', "Complete task"));
}

/** record how long a finished task really took (feeds the estimate calibration) */
export function setActual(id: string, minutes: number) {
  mutate((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t) return;
    const day = todayKey(t.completedAt || now());
    const before = t.spent > 0 ? t.spent : taskTime(s, { ...t, spent: 0 }).minutes;
    t.spent = minutes;
    bumpDay(s, { minutes: minutes - before }, day);
  });
}

export function reopenTask(id: string) {
  mutate((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t) return;
    // undo what completing did: the day's count and the next occurrence (if it wasn't touched yet)
    if (t.status === 'done' && t.completedAt) bumpDay(s, { done: -1 }, todayKey(t.completedAt));
    const next = t.nextId ? s.tasks.find((x) => x.id === t.nextId) : undefined;
    if (next && next.status === 'open' && !next.spent) s.tasks = s.tasks.filter((x) => x !== next);
    Object.assign(t, { status: 'open', completedAt: undefined, nextId: undefined, updatedAt: now() });
  });
}

export function dropTask(id: string) {
  mutate((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (t) Object.assign(t, { status: 'dropped', updatedAt: now(), completedAt: now() });
  }, L('إلغاء مهمة', "Cancel task"));
}

export function deleteTask(id: string) {
  mutate((s) => {
    s.tasks = s.tasks.filter((t) => t.id !== id);
  }, L('حذف مهمة', "Delete task"));
}

export function deferTask(id: string, day = addDays(todayKey(), 1)) {
  mutate((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t) return;
    t.plannedFor = day;
    t.deferrals += 1;
    t.updatedAt = now();
  }, L('تأجيل', "Postpone"));
}

export function deferMany(ids: string[], day = addDays(todayKey(), 1)) {
  mutate((s) => {
    for (const t of s.tasks)
      if (ids.includes(t.id)) {
        t.plannedFor = day;
        t.deferrals += 1;
        t.updatedAt = now();
      }
    for (const p of s.procedures)
      if (ids.includes(p.id) && p.priority < 3) {
        p.plannedFor = day;
        p.deferrals = (p.deferrals || 0) + 1;
        p.log.push({ at: now(), text: L('رُحّل إلى الغد', "Moved to tomorrow") });
        p.updatedAt = now();
      }
  }, L('نقل للغد', "Move to tomorrow"));
}

export function planToday(id: string) {
  updateTask(id, { plannedFor: todayKey() });
}

// ---------------- Goals ----------------

export function addGoal(title: string, area: Task['area'], target?: string): string {
  const id = uid();
  mutate((s) => {
    s.goals.push({ id, title, area, why: '', target, createdAt: now() });
  });
  return id;
}

export function updateGoal(id: string, patch: Partial<AppState['goals'][number]>) {
  mutate((s) => {
    const g = s.goals.find((x) => x.id === id);
    if (g) Object.assign(g, patch);
  });
}

export function deleteGoal(id: string) {
  mutate((s) => {
    s.goals = s.goals.filter((g) => g.id !== id);
    for (const t of s.tasks) if (t.goalId === id) t.goalId = undefined;
  }, L('حذف هدف', "Delete goal"));
}

// ---------------- Procedures ----------------

export function addProcedure(title: string, template?: Template, extra?: Partial<Procedure>): string {
  const id = uid();
  mutate((s) => {
    const tpl = template && s.templates.find((t) => t.id === template.id);
    if (tpl) tpl.uses += 1;
    s.procedures.unshift({
      id,
      title,
      templateId: tpl?.id,
      notes: tpl?.notes || '',
      fields: tpl ? structuredClone(tpl.fields) : [],
      steps: (tpl?.steps || []).map((st) => ({ ...st, kind: st.kind || 'action', id: uid(), done: false })),
      priority: 1,
      log: [{ at: now(), text: tpl ? L(`أُنشئ من قالب «${tpl.name}»`, `Created from template “${tpl.name}”`) : L('أُنشئ', "Created") }],
      archived: false,
      createdAt: now(),
      updatedAt: now(),
      ...extra,
    });
  });
  return id;
}

function withProc(id: string, fn: (p: Procedure, s: AppState) => void, undoLabel?: string) {
  mutate((s) => {
    const p = s.procedures.find((x) => x.id === id);
    if (!p) return;
    fn(p, s);
    p.updatedAt = now();
  }, undoLabel);
}

export function updateProcedure(id: string, patch: Partial<Procedure>) {
  withProc(id, (p) => Object.assign(p, patch));
}

export function toggleStep(procId: string, stepId: string, note?: string) {
  withProc(
    procId,
    (p, s) => {
      const st = p.steps.find((x) => x.id === stepId);
      if (!st) return;
      st.done = !st.done;
      st.doneAt = st.done ? now() : undefined;
      if (note) st.note = note;
      const info = kindInfo(st.kind);
      if (st.done) {
        const verb = st.kind === 'send' ? L(`أكدت الإرسال${st.target ? ` إلى ${st.target}` : ''}`, `Confirmed sent${st.target ? ` to ${st.target}` : ''}`) : st.kind === 'reply' ? L(`وصل الرد${st.target ? ` من ${st.target}` : ''}`, `Reply received${st.target ? ` from ${st.target}` : ''}`) : L(`تم: ${st.title}`, `Done: ${st.title}`);
        p.log.push({ at: now(), text: verb + (note ? ` — ${note}` : '') });
        bumpDay(s, { minutes: st.kind === 'reply' ? 0 : 10 });
      } else {
        p.log.push({ at: now(), text: L(`أُعيد فتح خطوة (${info.label}): ${st.title}`, `Step reopened (${info.label}): ${st.title}`) });
      }
      if (isProcDone(p) && !p.completedAt) {
        p.completedAt = now();
        p.log.push({ at: now(), text: L('اكتمل الإجراء', "Procedure completed") });
        bumpDay(s, { done: 1 });
      } else if (!isProcDone(p) && p.completedAt) {
        p.completedAt = undefined;
      }
    },
    L('تغيير خطوة', "Step change"),
  );
}

export function addStep(procId: string, step: { title: string; kind: StepKind; target?: string }) {
  withProc(procId, (p) => {
    p.steps.push({ ...step, id: uid(), done: false });
    if (p.completedAt) p.completedAt = undefined;
  });
}

export function addSteps(procId: string, steps: { title: string; kind: StepKind; target?: string }[]) {
  if (!steps.length) return;
  withProc(procId, (p) => {
    for (const st of steps) p.steps.push({ ...st, id: uid(), done: false });
    if (p.completedAt) p.completedAt = undefined;
    p.log.push({ at: now(), text: L(`أُضيفت ${steps.length} خطوات`, `Added ${steps.length} steps`) });
  });
}

export function updateStep(procId: string, stepId: string, patch: Partial<Step>) {
  withProc(procId, (p) => {
    const st = p.steps.find((x) => x.id === stepId);
    if (st) Object.assign(st, patch);
  });
}

export function removeStep(procId: string, stepId: string) {
  withProc(procId, (p) => (p.steps = p.steps.filter((x) => x.id !== stepId)), L('حذف خطوة', "Delete step"));
}

export function moveStep(procId: string, stepId: string, dir: -1 | 1) {
  withProc(procId, (p) => {
    const i = p.steps.findIndex((x) => x.id === stepId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.steps.length) return;
    [p.steps[i], p.steps[j]] = [p.steps[j], p.steps[i]];
  });
}

export function addLog(procId: string, text: string) {
  withProc(procId, (p) => p.log.push({ at: now(), text }));
}

/** finish a procedure as a whole (one with no steps, or when you're simply done with it) */
export function completeProcedure(id: string) {
  mutate((s) => {
    const p = s.procedures.find((x) => x.id === id);
    if (!p || p.completedAt) return;
    for (const st of p.steps) if (!st.done) Object.assign(st, { done: true, doneAt: now() });
    p.completedAt = now();
    p.log.push({ at: now(), text: L('اكتمل الإجراء', 'Procedure completed') });
    bumpDay(s, { done: 1 });
  }, L('إنجاز إجراء', 'Complete procedure'));
}

export function archiveProcedure(id: string, archived = true) {
  withProc(id, (p) => {
    p.archived = archived;
    p.log.push({ at: now(), text: archived ? L('نُقل للأرشيف', "Moved to archive") : L('أُعيد من الأرشيف', "Restored from archive") });
  }, archived ? L('أرشفة', "Archive") : undefined);
}

export function deleteProcedure(id: string) {
  mutate((s) => {
    s.procedures = s.procedures.filter((p) => p.id !== id);
  }, L('حذف إجراء', "Delete procedure"));
}

export function duplicateProcedure(id: string): string {
  const src = getState().procedures.find((p) => p.id === id);
  if (!src) return '';
  const nid = uid();
  mutate((s) => {
    s.procedures.unshift({
      ...structuredClone(src),
      id: nid,
      title: src.title + L(' (نسخة)', " (copy)"),
      steps: src.steps.map((st) => ({ ...st, id: uid(), done: false, doneAt: undefined, note: undefined })),
      log: [{ at: now(), text: L(`نُسخ من «${src.title}»`, `Copied from “${src.title}”`) }],
      archived: false,
      completedAt: undefined,
      reminder: undefined,
      createdAt: now(),
      updatedAt: now(),
    });
  });
  return nid;
}

// ---------------- Templates ----------------

export function saveTemplate(t: Omit<Template, 'id' | 'uses'> & { id?: string }): string {
  const id = t.id || uid();
  mutate((s) => {
    const ex = s.templates.find((x) => x.id === id);
    if (ex) Object.assign(ex, t);
    else s.templates.push({ ...t, id, uses: 0 });
  });
  return id;
}

/** a new task from a task template: its steps, area and estimate */
export function addTaskFromTemplate(tpl: Template, extra: Partial<Task> = {}): string {
  const id = addTask({
    title: tpl.name,
    area: tpl.area || 'life',
    estimate: tpl.estimate,
    notes: tpl.notes || '',
    ...extra,
    checklist: tpl.steps.filter((x) => x.title.trim()).map((x) => ({ id: uid(), title: x.title, done: false, ...(x.kind ? { kind: x.kind } : {}), ...(x.target ? { target: x.target } : {}) })),
  });
  mutate((s) => {
    const t = s.templates.find((x) => x.id === tpl.id);
    if (t) t.uses += 1;
  });
  return id;
}

export function deleteTemplate(id: string) {
  mutate((s) => {
    s.templates = s.templates.filter((t) => t.id !== id);
  }, L('حذف قالب', "Delete template"));
}

// ---------------- Study ----------------

const COLORS = ['#5e9cff', '#ff8a5c', '#5fd4a0', '#c58cff', '#ffcb47', '#ff6b9a', '#4fd1e0', '#a3d65c'];

export function addCourse(p: Partial<Course> & { name: string }): string {
  const id = uid();
  mutate((s) => {
    s.courses.push({
      difficulty: 3,
      sizeLabel: 'صفحة',
      notes: '',
      archived: false,
      color: COLORS[s.courses.length % COLORS.length],
      ...p,
      id,
      createdAt: now(),
    });
  });
  return id;
}

export function updateCourse(id: string, patch: Partial<Course>) {
  mutate((s) => {
    const c = s.courses.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
  });
}

export function deleteCourse(id: string) {
  mutate((s) => {
    s.courses = s.courses.filter((c) => c.id !== id);
    const unitIds = new Set(s.units.filter((u) => u.courseId === id).map((u) => u.id));
    s.units = s.units.filter((u) => u.courseId !== id);
    s.exams = s.exams.filter((e) => e.courseId !== id);
    s.sessions = s.sessions.filter((x) => x.courseId !== id);
    for (const e of s.exams) e.unitIds = e.unitIds.filter((u) => !unitIds.has(u));
  }, L('حذف مادة', "Delete course"));
}

export function addUnits(courseId: string, units: { title: string; size: number; difficulty?: number; notes?: string }[]): string[] {
  const ids: string[] = [];
  mutate((s) => {
    let order = Math.max(-1, ...s.units.filter((u) => u.courseId === courseId).map((u) => u.order)) + 1;
    for (const u of units) {
      const id = uid();
      ids.push(id);
      s.units.push({ id, courseId, title: u.title, size: u.size, difficulty: u.difficulty, ...(u.notes ? { notes: u.notes } : {}), progress: 0, reviewed: false, spent: 0, order: order++ });
    }
  });
  return ids;
}

export function updateUnit(id: string, patch: Partial<Unit>) {
  mutate((s) => {
    const u = s.units.find((x) => x.id === id);
    if (u) Object.assign(u, patch);
  });
}

export function deleteUnit(id: string) {
  mutate((s) => {
    s.units = s.units.filter((u) => u.id !== id);
    for (const e of s.exams) e.unitIds = e.unitIds.filter((u) => u !== id);
  }, L('حذف فصل', "Delete chapter"));
}

export function moveUnit(id: string, dir: -1 | 1) {
  mutate((s) => {
    const u = s.units.find((x) => x.id === id);
    if (!u) return;
    const list = s.units.filter((x) => x.courseId === u.courseId).sort((a, b) => a.order - b.order);
    const i = list.indexOf(u);
    const other = list[i + dir];
    if (!other) return;
    [u.order, other.order] = [other.order, u.order];
  });
}

export function saveExam(e: Omit<Exam, 'id' | 'createdAt'> & { id?: string }): string {
  const id = e.id || uid();
  mutate((s) => {
    const ex = s.exams.find((x) => x.id === id);
    if (ex) Object.assign(ex, e);
    else s.exams.push({ ...e, id, createdAt: now() });
  });
  return id;
}

/** you sat the exam: it leaves the plan (a grade can still be added later) */
export function finishExam(id: string, finished = true) {
  mutate((s) => {
    const e = s.exams.find((x) => x.id === id);
    if (e) e.finished = finished || undefined;
  }, finished ? L('إنهاء اختبار', 'Finish exam') : undefined);
}

export function deleteExam(id: string) {
  mutate((s) => {
    s.exams = s.exams.filter((e) => e.id !== id);
  }, L('حذف اختبار', "Delete exam"));
}

/** tick a lesson done, part-done or reviewed — today's study counts it, your pace doesn't */
export function markLesson(unitId: string, patch: { progress?: number; reviewed?: boolean }) {
  mutate((s) => markLessonIn(s, unitId, patch, todayKey(), now()), L('تحديث الدرس', 'Update lesson'));
}

/** log real study: feeds progress, pace learning and today's capacity */
export function logStudy(courseId: string, unitId: string | undefined, minutes: number, amount: number) {
  mutate((s) => {
    const u = unitId ? s.units.find((x) => x.id === unitId) : undefined;
    // a session on a lesson you'd already finished is its review; otherwise count only the new
    // material it could still cover, so pace isn't inflated by "40 pages" on a 10-page remainder
    const left = u ? u.size * (1 - Math.min(1, u.progress)) : amount;
    const review = !!u && left <= 0.01;
    const learned = review ? 0 : Math.max(0, Math.min(amount, left));
    s.sessions.push({ id: uid(), courseId, unitId, date: todayKey(), minutes, amount: learned, ...(review ? { review: true } : {}), at: now() });
    if (u) {
      u.spent += minutes;
      if (review) u.reviewed = true;
      else if (learned > 0 && u.size > 0) u.progress = Math.min(1, u.progress + learned / u.size);
    }
    bumpDay(s, { minutes, study: minutes });
  }, L('تسجيل مذاكرة', "Log study"));
}

// ---------------- Timer ----------------

type TimerStart = { kind: 'task' | 'study' | 'procedure'; refId: string; label: string; courseId?: string; unitId?: string; plan?: Timer['plan'] };

/** the running timer is this same thing (same task / lesson / planned session) */
export function sameTimer(t: TimerStart, cur = getState().timer): boolean {
  if (!cur || cur.kind !== t.kind || !!cur.plan !== !!t.plan) return false;
  if (t.plan) return JSON.stringify(cur.plan?.parts?.map((x) => x.label) ?? []) === JSON.stringify(t.plan.parts?.map((x) => x.label) ?? []) && cur.plan!.total === t.plan.total;
  return cur.refId === t.refId && (cur.unitId ?? '') === (t.unitId ?? '');
}

/** starts a timer — or, for the one already running, goes back into it where you left it */
export function startTimer(t: TimerStart) {
  mutate((s) => {
    if (s.timer && sameTimer(t, s.timer)) {
      if (!s.timer.running) {
        s.timer.startedAt = now();
        s.timer.running = true;
      }
      s.timer.focus = true;
      return;
    }
    s.timer = { ...t, startedAt: now(), acc: 0, running: true, focus: true };
  });
}

export { rhythmOf };

export function timerElapsed(t = getState().timer, at = now()): number {
  if (!t) return 0;
  return t.acc + (t.running ? at - t.startedAt : 0);
}

export function pauseTimer() {
  mutate((s) => {
    if (!s.timer || !s.timer.running) return;
    s.timer.acc += now() - s.timer.startedAt;
    s.timer.running = false;
  });
}

/** pause as of a moment that already passed (the adhan, noticed a little later) */
export function pauseTimerAt(at: number) {
  mutate((s) => {
    if (!s.timer || !s.timer.running) return;
    s.timer.acc += Math.max(0, Math.min(now(), at) - s.timer.startedAt);
    s.timer.running = false;
  });
}

export function resumeTimer() {
  mutate((s) => {
    if (!s.timer || s.timer.running) return;
    s.timer.startedAt = now();
    s.timer.running = true;
  });
}

/** stops the timer; tasks get the minutes immediately, study returns them for the amount prompt */
export function stopTimer(): { minutes: number; timer: NonNullable<AppState['timer']>; parts?: { courseId?: string; unitId?: string; minutes: number }[] } | null {
  const t = getState().timer;
  if (!t) return null;
  // credit work blocks only — Pomodoro breaks are not work time
  const r = rhythmOf(t, getState().settings);
  // a planned session left running past its end counts only what was planned
  const minutes = Math.max(1, Math.min(t.plan?.total ?? Infinity, Math.round(pomodoro(timerElapsed(t), r.work, r.brk, r.longEvery, r.longBrk).workMs / 60000)));
  mutate((s) => {
    s.timer = undefined;
    if (t.kind === 'task') {
      const task = s.tasks.find((x) => x.id === t.refId);
      if (task) task.spent += minutes;
      bumpDay(s, { minutes });
    } else if (t.kind === 'procedure') {
      const p = s.procedures.find((x) => x.id === t.refId);
      if (p) p.log.push({ at: now(), text: L(`جلسة عمل ${minutes} د`, `Work session ${minutes} min`) });
      bumpDay(s, { minutes });
    }
  });
  // a session over several subjects: each gets the focus time spent on it, in order
  const ps = t.plan?.parts;
  if (ps && ps.length > 1) {
    const split = splitWorked(ps, minutes);
    const parts = ps.map((p, i) => ({ courseId: p.courseId, unitId: p.unitId, minutes: split[i] })).filter((p) => p.minutes > 0);
    return { minutes, timer: t, parts };
  }
  return { minutes, timer: t };
}

export function setFocus(open: boolean) {
  mutate((s) => {
    if (s.timer) s.timer.focus = open;
  });
}

export function addThought(text: string, during?: string): string {
  const id = uid();
  mutate((s) => {
    s.thoughts.push({ id, text: text.trim().slice(0, 2000), at: now(), ...(during ? { during } : {}) });
  }, L('حفظ فكرة', 'Save a thought'));
  return id;
}

export function updateThought(id: string, patch: { text?: string; pinned?: boolean }) {
  mutate((s) => {
    const t = s.thoughts.find((x) => x.id === id);
    if (!t) return;
    if (patch.text !== undefined) t.text = patch.text.trim().slice(0, 2000);
    if (patch.pinned !== undefined) {
      if (patch.pinned) t.pinned = true;
      else delete t.pinned;
    }
    t.updatedAt = now();
  }, L('تعديل فكرة', 'Edit thought'));
}

export function removeThought(id: string) {
  mutate((s) => {
    s.thoughts = s.thoughts.filter((x) => x.id !== id);
  }, L('حذف فكرة', "Delete thought"));
}

export function cancelTimer() {
  mutate((s) => {
    s.timer = undefined;
  });
}

// ---------------- Misc ----------------

export function setDayOverride(day: string, minutes: number | null) {
  mutate((s) => {
    if (minutes == null) delete s.dayOverrides[day];
    else s.dayOverrides[day] = minutes;
  });
}

/** move today's share of an exam to tomorrow (minutes null = put it back) */
export function postponeStudy(examId: string, minutes: number | null) {
  const day = todayKey();
  mutate((s) => {
    s.studyDefer ||= {};
    const d = { ...(s.studyDefer[day] || {}) };
    if (minutes == null) delete d[examId];
    else d[examId] = minutes;
    s.studyDefer[day] = d;
  }, minutes == null ? L('إلغاء التأجيل', 'Undo postpone') : L('تأجيل مادة لبكرة', 'Postpone to tomorrow'));
}

/** the days you won't study each subject (from «جرّب يومك») */
export function setStudyOff(off: Record<string, string[]>) {
  mutate((s) => {
    s.studyOff = Object.fromEntries(Object.entries(off).filter(([, days]) => days.length));
  }, L('أيام بدون مذاكرة', 'Days off'));
}

export function snooze(id: string, ms: number) {
  mutate((s) => {
    s.snoozed[id] = now() + ms;
    for (const [k, v] of Object.entries(s.snoozed)) if (v < now()) delete s.snoozed[k];
  });
}

export function updateSettings(patch: Partial<AppState['settings']>) {
  mutate((s) => Object.assign(s.settings, patch));
}

export function setMeta(patch: Partial<AppState['meta']>) {
  mutate((s) => Object.assign(s.meta, patch));
}

export function clearMissed() {
  mutate((s) => {
    s.missed = [];
  });
}

// ---------------- Course packages ----------------

export interface PackTask {
  title: string;
  due?: string;
  dueTime?: string;
  priority?: Priority;
  area?: Area;
  estimate?: number;
  notes?: string;
  steps?: string[];
}

/** a course (lessons + exam) and/or a list of tasks, from a link or an AI's reply */
export interface PackExpense {
  title: string;
  amount: number;
  day: string;
  cat: ExpenseCat;
}

export interface CoursePack {
  /** weekly lectures / shifts */
  schedule?: Omit<ClassBlock, 'id' | 'createdAt'>[];
  tasks?: PackTask[];
  expenses?: PackExpense[];
  course?: { name: string; difficulty?: number; sizeLabel?: string; paceGuess?: number; notes?: string; color?: string };
  units: { title: string; size: number; difficulty?: number; notes?: string }[];
  exam?: { title: string; date: string; time?: string; reviewDays?: number };
}

export function readCoursePack(raw: any): CoursePack {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const tasks: PackTask[] = (Array.isArray(raw?.tasks) ? raw.tasks : [])
    .filter((t: any) => t && typeof t.title === 'string' && t.title.trim())
    .slice(0, 300)
    .map((t: any) => ({
      title: t.title.trim().slice(0, 300),
      ...(day.test(t.due) ? { due: t.due } : {}),
      ...(/^\d{2}:\d{2}$/.test(t.dueTime) ? { dueTime: t.dueTime } : {}),
      ...([0, 1, 2, 3].includes(t.priority) ? { priority: t.priority } : {}),
      ...(['study', 'work', 'life'].includes(t.area) ? { area: t.area } : {}),
      ...(Number(t.estimate) > 0 ? { estimate: Math.round(Number(t.estimate)) } : {}),
      ...(typeof t.notes === 'string' ? { notes: t.notes.slice(0, 5000) } : {}),
      ...(Array.isArray(t.steps) ? { steps: t.steps.filter((x: any) => typeof x === 'string' && x.trim()).slice(0, 50) } : {}),
    }));
  const expenses: PackExpense[] = (Array.isArray(raw?.expenses) ? raw.expenses : [])
    .filter((e: any) => e && Number(e.amount) > 0)
    .slice(0, 1000)
    .map((e: any) => {
      const title = typeof e.title === 'string' ? e.title.trim().slice(0, 100) : '';
      return { title, amount: Math.round(Number(e.amount) * 100) / 100, day: day.test(e.date || e.day) ? e.date || e.day : todayKey(), cat: (CAT_ORDER as string[]).includes(e.cat) ? e.cat : guessCat(title) };
    });
  const schedule = readSchedule(raw?.schedule || []);
  const hasCourse = !!raw?.course?.name && Array.isArray(raw.units);
  if (!raw || !['masar-course', 'masar'].includes(raw.app) || (!hasCourse && !tasks.length && !expenses.length && !schedule.length))
    throw new Error(L('هذا ليس ملف مادة أو مهام من «مدار».', "This is not a Madar course or task file."));
  const extra = { ...(tasks.length ? { tasks } : {}), ...(expenses.length ? { expenses } : {}), ...(schedule.length ? { schedule } : {}) };
  if (!hasCourse) return { ...extra, units: [] };
  // a pack can come from any link: keep only well-typed, bounded values
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
  const diff = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5 ? (v as number) : undefined);
  const c = raw.course;
  const name = str(c.name, 120);
  if (!name) throw new Error(L('هذا ليس ملف مادة أو مهام من «مدار».', "This is not a Madar course or task file."));
  const course: CoursePack['course'] = {
    name,
    ...(diff(c.difficulty) ? { difficulty: diff(c.difficulty) } : {}),
    ...(str(c.sizeLabel, 30) ? { sizeLabel: str(c.sizeLabel, 30) } : {}),
    ...(Number(c.paceGuess) > 0 && Number(c.paceGuess) < 1000 ? { paceGuess: Number(c.paceGuess) } : {}),
    ...(str(c.notes, 40_000) ? { notes: str(c.notes, 40_000) } : {}),
    ...(typeof c.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(c.color) ? { color: c.color } : {}),
  };
  const units = raw.units
    .filter((u: any) => u && str(u.title, 300) && Number(u.size) > 0 && Number(u.size) < 100_000)
    .slice(0, 500)
    .map((u: any) => ({ title: str(u.title, 300)!, size: Number(u.size), difficulty: diff(u.difficulty), ...(str(u.notes, 40_000) ? { notes: str(u.notes, 40_000) } : {}) }));
  const e = raw.exam;
  const exam: CoursePack['exam'] =
    e && day.test(e.date)
      ? {
          title: str(e.title, 200) || name,
          date: e.date,
          ...(/^\d{2}:\d{2}$/.test(e.time) ? { time: e.time } : {}),
          ...(Number.isInteger(e.reviewDays) && e.reviewDays >= 0 && e.reviewDays <= 30 ? { reviewDays: e.reviewDays } : {}),
        }
      : undefined;
  return { course, units, exam, ...extra };
}

/**
 * a study pack with several courses at once ({ "app": "masar", "courses": [ { name, units, exam, … } ] }),
 * each read and checked like a single-course pack
 */
export function readStudyPack(raw: any): CoursePack[] {
  const list = Array.isArray(raw?.courses) ? raw.courses : raw?.course ? [{ ...raw.course, units: raw.units, exam: raw.exam }] : [];
  const out: CoursePack[] = [];
  for (const c of list.slice(0, 30)) {
    try {
      const { units, exam, ...course } = c || {};
      const p = readCoursePack({ app: 'masar', course, units: Array.isArray(units) ? units : [], ...(exam ? { exam } : {}) });
      if (p.course && p.units.length) out.push(p);
    } catch {
      /* a broken course is left out, the rest come in */
    }
  }
  if (!out.length) throw new Error(L('ما لقيت مواد بدروسها في الرد — انسخ الرد كامل (من { إلى }).', 'No courses with lessons in the reply — copy the whole reply (from { to }).'));
  return out;
}

/** adds a course with its units (and exam) without touching anything else */
export function importCoursePack(p: CoursePack, replaceSchedule = true): string {
  if (p.schedule?.length) setSchedule(p.schedule, replaceSchedule);
  for (const { steps, ...t } of p.tasks || [])
    addTask({ ...t, notes: t.notes || '', checklist: (steps || []).map((title) => ({ id: uid(), title, done: false })) });
  if (p.expenses?.length) addExpenses(p.expenses.map((e) => ({ ...e, source: 'import' as const })));
  if (!p.course) return '';
  const { name, difficulty, sizeLabel, paceGuess, notes, color } = p.course;
  const cid = addCourse({ name, difficulty: difficulty || 3, sizeLabel: sizeLabel || 'صفحة', paceGuess, notes: notes || '', ...(color ? { color } : {}) });
  const ids = addUnits(cid, p.units);
  if (p.exam) saveExam({ courseId: cid, title: p.exam.title, date: p.exam.date, time: p.exam.time, reviewDays: p.exam.reviewDays ?? 1, unitIds: ids });
  return cid;
}

// ---------------- Coach ----------------

export function setCoachScore(day: string, score: number) {
  if (getState().coach.history[day] === score) return;
  mutate((s) => {
    s.coach.history[day] = score;
    // keep a month of history
    for (const d of Object.keys(s.coach.history)) if (d < addDays(day, -30)) delete s.coach.history[d];
  });
}

export function setCoachLast(last: AppState['coach']['last']) {
  mutate((s) => {
    s.coach.last = last;
  });
}

export function addCoachMessage(role: 'user' | 'assistant', text: string, actions?: AppState['coach']['chat'][number]['actions']) {
  mutate((s) => {
    s.coach.chat.push({ role, text, at: now(), ...(actions?.length ? { actions } : {}) });
    s.coach.chat = s.coach.chat.slice(-40);
  });
}

export function markCoachActionUsed(index: number) {
  mutate((s) => {
    const m = s.coach.chat[index];
    if (m) m.used = true;
  });
}

export function clearCoachChat() {
  mutate((s) => {
    s.coach.chat = [];
  }, L('مُسحت المحادثة', 'Chat cleared'));
}

export function updateCoach(patch: Partial<AppState['settings']['coach']>) {
  mutate((s) => Object.assign(s.settings.coach, patch));
}

// ---------------- Money ----------------

export function addExpense(e: Omit<Expense, 'id' | 'createdAt'>): string {
  const id = uid();
  mutate((s) => {
    s.expenses.push({ ...e, amount: Math.round(e.amount * 100) / 100, id, createdAt: now() });
  });
  return id;
}

export function addExpenses(list: Omit<Expense, 'id' | 'createdAt'>[]) {
  if (!list.length) return;
  mutate((s) => {
    for (const e of list) s.expenses.push({ ...e, id: uid(), createdAt: now() });
  });
}

export function updateExpense(id: string, patch: Partial<Expense>) {
  mutate((s) => {
    const e = s.expenses.find((x) => x.id === id);
    if (e) Object.assign(e, patch, { updatedAt: now() });
  });
}

export function deleteExpense(id: string) {
  mutate((s) => {
    s.expenses = s.expenses.filter((x) => x.id !== id);
  });
}

export function setBudget(budget: number | undefined) {
  mutate((s) => {
    s.money.budget = budget && budget > 0 ? budget : undefined;
  });
}

export function updateMoney(patch: Partial<MoneyState>) {
  mutate((s) => {
    Object.assign(s.money, patch);
  });
}

/** a category of your own (name + emoji); returns its id */
export function addCat(name: string, emoji: string, color: string): string {
  const id = 'cat_' + uid();
  mutate((s) => {
    s.money.cats = [...(s.money.cats || []), { id, name: name.trim().slice(0, 24), emoji: emoji.trim() || '🏷️', color }];
  });
  return id;
}

/** remove your category — its expenses move to «أخرى» */
export function deleteCat(id: string) {
  mutate((s) => {
    s.money.cats = (s.money.cats || []).filter((c) => c.id !== id);
    for (const e of s.expenses) if (e.cat === id) e.cat = 'other';
    if (s.money.limits) delete s.money.limits[id];
  }, L('حذف تصنيف', 'Delete category'));
}

export function setGoal(goal: MoneyState['goal']) {
  mutate((s) => {
    s.money.goal = goal && goal.name.trim() && goal.target > 0 ? goal : undefined;
  });
}

/** hide the goal's name and/or amounts on screen, leaving the percentage */
export function hideGoal(patch: { name?: boolean; amount?: boolean }) {
  mutate((s) => {
    const g = s.money.goal;
    if (g) g.hide = { ...g.hide, ...patch };
  });
}

/** put money in (+) or take it out (−); a withdrawal can't take more than what's saved */
export function moveGoal(amount: number, note?: string) {
  mutate((s) => {
    const g = s.money.goal;
    if (!g || !amount) return;
    const a = Math.round((amount < 0 ? Math.max(amount, -g.saved) : amount) * 100) / 100;
    if (!a) return;
    g.saved = Math.round((g.saved + a) * 100) / 100;
    g.log = [...(g.log || []), { id: uid(), amount: a, at: now(), ...(note?.trim() ? { note: note.trim() } : {}) }].slice(-200);
  }, amount > 0 ? L('إيداع في الهدف', 'Add to goal') : L('سحب من الهدف', 'Take from goal'));
}

/** remove one entry from the log and undo its effect on the total */
export function deleteGoalEntry(id: string) {
  mutate((s) => {
    const g = s.money.goal;
    const e = g?.log?.find((x) => x.id === id);
    if (!g || !e) return;
    g.saved = Math.max(0, Math.round((g.saved - e.amount) * 100) / 100);
    g.log = g.log!.filter((x) => x.id !== id);
  }, L('حذف حركة', 'Delete entry'));
}

/** start / stop trying a savings swap */
export function toggleSwap(id: string) {
  mutate((s) => {
    if (s.money.swaps[id]) delete s.money.swaps[id];
    else s.money.swaps[id] = todayKey();
  });
}

export function saveSub(sub: Omit<Subscription, 'id' | 'createdAt'> & { id?: string }): string {
  const id = sub.id || uid();
  mutate((s) => {
    const cur = s.subs.find((x) => x.id === id);
    if (cur) Object.assign(cur, sub, { updatedAt: now() });
    else s.subs.push({ ...sub, id, createdAt: now() });
  });
  return id;
}

export function deleteSub(id: string) {
  mutate((s) => {
    s.subs = s.subs.filter((x) => x.id !== id);
    delete s.money.swaps['sub:' + id];
  });
}

export function markSubUsed(id: string) {
  mutate((s) => {
    const sub = s.subs.find((x) => x.id === id);
    if (sub) Object.assign(sub, { lastUsed: todayKey(), updatedAt: now() });
  });
}

/** renewals that came due are logged as expenses and the next date moves on */
export function processSubs(today = todayKey()) {
  if (!getState().subs.some((x) => x.next <= today)) return;
  mutate((s) => {
    for (const sub of s.subs) {
      let guard = 0;
      while (sub.next <= today && guard++ < 36) {
        s.expenses.push({ id: uid(), title: sub.name, amount: sub.amount, cat: sub.kind === 'bill' ? 'bills' : 'subs', day: sub.next, source: 'sub', createdAt: now() });
        sub.next = sub.cycle === 'year' ? addMonths(sub.next, 12) : addMonths(sub.next, 1);
      }
    }
  });
}

/** remember imported bank messages (the newest 3000) */
export function markSmsSeen(keys: string[]) {
  if (!keys.length) return;
  mutate((s) => {
    const all = [...(s.money.smsSeen || []), ...keys.filter((k) => !s.money.smsSeen?.includes(k))];
    s.money.smsSeen = all.slice(-3000);
  });
}

// ---------------- Schedule ----------------

/** add lectures / shifts; `replace` swaps the whole timetable (a new term) */
export function setSchedule(list: Omit<ClassBlock, 'id' | 'createdAt'>[], replace = false) {
  mutate((s) => {
    if (replace) s.schedule = [];
    for (const b of list) s.schedule.push({ ...b, id: uid(), createdAt: now() });
  }, replace ? L('استبدال الجدول', 'Replace timetable') : undefined);
}

export function saveBlock(b: Omit<ClassBlock, 'id' | 'createdAt'> & { id?: string }) {
  mutate((s) => {
    const cur = b.id && s.schedule.find((x) => x.id === b.id);
    if (cur) Object.assign(cur, b, { updatedAt: now() });
    else s.schedule.push({ ...b, id: uid(), createdAt: now() });
  });
}

/** you won't attend this lecture / shift on that date (or you will after all) — the freed time goes to that day */
export function skipClass(day: string, id: string, skip: boolean) {
  mutate((s) => {
    s.skipClass ||= {};
    s.skipClass[`${day}|${id}`] = skip;
  }, skip ? L('إلغاء محاضرة', 'Skip a lecture') : undefined);
}

export function deleteBlock(id: string) {
  mutate((s) => {
    s.schedule = s.schedule.filter((x) => x.id !== id);
  }, L('حذف من الجدول', 'Remove from timetable'));
}

// ---------------- Gym (النادي) ----------------

export function setGymProfile(p: GymProfile) {
  mutate((s) => {
    const before = s.gym.profile;
    // a different program starts from its first day
    if (!before || before.days.length !== p.days.length || before.goal !== p.goal || before.level !== p.level) s.gym.rot = 0;
    s.gym.profile = p;
  });
}

export function setGymInfo(p: Partial<GymState['info']>) {
  mutate((s) => {
    s.gym.info = { ...s.gym.info, ...p };
  });
}

/** start today's workout: the muscles you picked (or the program's next day), each set filled with what to lift */
export function startWorkout(now = Date.now(), groups?: GroupId[], exIds?: string[]): string | null {
  const s = getState();
  registerCustom(s.gym.custom);
  const live = liveSession(s);
  if (live) return live.id;
  const next = nextWorkout(s, now);
  const gs = groups?.length ? groups : next ? slotGroups(next.slot.key) : null;
  if (!gs) return null;
  const plan = dayPlan(s, gs);
  const p = s.gym.profile;
  const items = exIds ? exIds.map((exId) => ({ exId, scheme: p ? scheme(p, exercise(exId)) : { sets: 3, lo: 10, hi: 12, rest: 60 } })) : plan.items;
  const id = uid();
  const entries = items.map((it) => {
    const t = target(s, it.exId, it.scheme);
    return { exId: it.exId, sets: Array.from({ length: it.scheme.sets }, () => ({ kg: t.kg, reps: t.reps, done: false })) };
  });
  mutate((st) => {
    st.gym.sessions.push({ id, day: todayKey(now), start: now, slot: next?.slot.key || plan.key, name: plan.name, groups: gs, entries, createdAt: now, updatedAt: now });
  });
  return id;
}

/** an exercise of your own, with the muscles you tapped */
export function addCustomExercise(c: Omit<GymCustom, 'id' | 'createdAt'>): string {
  const id = `c_${uid()}`;
  mutate((s) => {
    (s.gym.custom ||= []).push({ ...c, id, createdAt: Date.now() });
  });
  registerCustom(getState().gym.custom);
  return id;
}

export function deleteCustomExercise(id: string) {
  mutate((s) => {
    s.gym.custom = (s.gym.custom || []).filter((c) => c.id !== id);
  }, L('حذف التمرين', 'Delete exercise'));
  registerCustom(getState().gym.custom);
}

const withSession = (id: string, fn: (x: GymSession) => void) =>
  mutate((s) => {
    const x = s.gym.sessions.find((y) => y.id === id);
    if (!x) return;
    fn(x);
    x.updatedAt = Date.now();
  });

/** change a set; the sets after it that aren't done yet follow (change the weight once, not three times) */
export function setGymSet(sid: string, ei: number, si: number, patch: Partial<GymSet>) {
  withSession(sid, (x) => {
    const sets = x.entries[ei]?.sets;
    if (!sets?.[si]) return;
    Object.assign(sets[si], patch);
    const carry = { ...patch };
    delete carry.done;
    if (Object.keys(carry).length) for (let i = si + 1; i < sets.length; i++) if (!sets[i].done) Object.assign(sets[i], carry);
  });
}

/** how an exercise felt — easy, about right, hard — steers next time's weight */
export function setGymEffort(sid: string, ei: number, effort: 'easy' | 'ok' | 'hard' | undefined) {
  withSession(sid, (x) => {
    const e = x.entries[ei];
    if (e) e.effort = effort;
  });
}

/** tick a set; the rest before the next one starts counting */
export function tickGymSet(sid: string, ei: number, si: number, restSec: number) {
  withSession(sid, (x) => {
    const set = x.entries[ei]?.sets[si];
    if (!set) return;
    set.done = !set.done;
    x.restUntil = set.done && restSec > 0 ? Date.now() + restSec * 1000 : undefined;
  });
}

export function endRest(sid: string, addSec = 0) {
  withSession(sid, (x) => {
    x.restUntil = addSec && x.restUntil ? x.restUntil + addSec * 1000 : undefined;
  });
}

export function addGymSet(sid: string, ei: number) {
  withSession(sid, (x) => {
    const e = x.entries[ei];
    if (!e) return;
    const last = e.sets[e.sets.length - 1];
    e.sets.push({ kg: last?.kg, reps: last?.reps || 10, done: false });
  });
}

export function removeGymSet(sid: string, ei: number) {
  withSession(sid, (x) => {
    const e = x.entries[ei];
    if (e && e.sets.length > 1) e.sets.pop();
  });
}

/** do another exercise instead; `keep` makes the program use it from now on */
export function swapGymExercise(sid: string, ei: number, exId: string, keep: boolean) {
  const s = getState();
  const p = s.gym.profile;
  const x = s.gym.sessions.find((y) => y.id === sid);
  const from = x?.entries[ei]?.exId;
  if (!x || !from) return;
  const sc = p ? scheme(p, exercise(exId)) : { sets: 3, lo: 10, hi: 12, rest: 60 };
  const t = target(s, exId, sc);
  mutate((st) => {
    const y = st.gym.sessions.find((z) => z.id === sid)!;
    y.entries[ei] = { exId, sets: Array.from({ length: sc.sets }, () => ({ kg: t.kg, reps: t.reps, done: false })) };
    y.updatedAt = Date.now();
    if (keep && st.gym.profile) {
      const sw = (st.gym.profile.swaps ||= {});
      for (const k of Object.keys(sw)) if (sw[k] === from) sw[k] = exId;
      sw[from] = exId;
      delete sw[exId];
    }
  });
}

export function addGymExercise(sid: string, exId: string) {
  const s = getState();
  const p = s.gym.profile;
  const sc = p ? scheme(p, exercise(exId)) : { sets: 3, lo: 10, hi: 12, rest: 60 };
  const t = target(s, exId, sc);
  withSession(sid, (x) => {
    x.entries.push({ exId, sets: Array.from({ length: sc.sets }, () => ({ kg: t.kg, reps: t.reps, done: false })) });
  });
}

export function removeGymExercise(sid: string, ei: number) {
  withSession(sid, (x) => {
    x.entries.splice(ei, 1);
  });
}

export function finishWorkout(sid: string, now = Date.now()) {
  mutate((s) => {
    const x = s.gym.sessions.find((y) => y.id === sid);
    if (!x) return;
    x.end = now;
    x.restUntil = undefined;
    x.updatedAt = now;
    s.gym.rot = (s.gym.rot || 0) + 1;
  });
}

/** a workout you started by mistake (undo brings it back) */
export function cancelWorkout(sid: string) {
  mutate((s) => {
    s.gym.sessions = s.gym.sessions.filter((x) => x.id !== sid);
  }, L('إلغاء التمرين', 'Cancel workout'));
}

export function deleteGymSession(sid: string) {
  mutate((s) => {
    s.gym.sessions = s.gym.sessions.filter((x) => x.id !== sid);
  }, L('حذف التمرين', 'Delete workout'));
}

/** skip to the next day of the program */
export function skipGymSlot() {
  mutate((s) => {
    s.gym.rot = (s.gym.rot || 0) + 1;
  });
}

export function logBody(p: Omit<BodyLog, 'id' | 'createdAt'>) {
  mutate((s) => {
    // one entry a day: a second weigh-in the same day updates it
    const same = s.gym.body.find((b) => b.day === p.day);
    if (same) Object.assign(same, Object.fromEntries(Object.entries(p).filter(([, v]) => v != null)), { updatedAt: Date.now() });
    else s.gym.body.push({ ...p, id: uid(), createdAt: Date.now() });
  });
}

export function deleteBody(id: string) {
  mutate((s) => {
    s.gym.body = s.gym.body.filter((b) => b.id !== id);
  }, L('حذف القياس', 'Delete measurement'));
}

// ---------------- Future (مستقبلي) ----------------

/** after moving the old «مستقبلي» (skills, projects, wins…) into the CV, clear it */
export function clearOldFuture() {
  mutate((s) => {
    Object.assign(s.future, { stages: [], skills: [], projects: [], wins: [], postings: [], reviews: [] });
    delete s.future.vision;
  });
}

// ---------- «ذكّرني» ----------

export function saveRemind(r: Omit<Remind, 'id' | 'createdAt'> & { id?: string }): string {
  const id = r.id || uid();
  const now = Date.now();
  mutate((s) => {
    const old = s.reminds.find((x) => x.id === id);
    // a time set in the past for a repeat starts from its next turn
    const at = r.at <= now && r.repeat !== 'none' ? nextAfter(r, now) ?? r.at : r.at;
    const next: Remind = { ...old, ...r, id, at, done: false, createdAt: old?.createdAt ?? now, updatedAt: now };
    if (!next.note) delete next.note;
    if (!next.ref) delete next.ref;
    if (next.repeat !== 'weekly') delete next.days;
    if (old) Object.assign(old, next);
    else s.reminds.push(next);
  }, L('حفظ التذكير', 'Save reminder'));
  return id;
}

export function deleteRemind(id: string) {
  mutate((s) => {
    s.reminds = s.reminds.filter((x) => x.id !== id);
  }, L('حذف التذكير', 'Delete reminder'));
}

/** «أجّل»: the same reminder again in `minutes` (a repeat keeps its schedule afterwards) */
export function snoozeRemind(id: string, minutes: number, now = Date.now()) {
  mutate((s) => {
    const r = s.reminds.find((x) => x.id === id);
    if (!r) return;
    if (r.repeat === 'none') {
      r.at = now + minutes * 60000;
      r.done = false;
    } else {
      // a one-off copy, so the repeat isn't shifted
      s.reminds.push({ id: uid(), title: r.title, ...(r.note ? { note: r.note } : {}), ...(r.ref ? { ref: r.ref } : {}), at: now + minutes * 60000, repeat: 'none', createdAt: now, updatedAt: now });
    }
    r.updatedAt = now;
  }, L('تأجيل التذكير', 'Snooze reminder'));
}

// ---------- «صقل» ----------

export function setupTrain(p: { field?: string; branch?: string; time?: string; days: number[] }) {
  const t = now();
  mutate((s) => {
    const old = s.train.setup;
    const setup = { ...old, ...p, createdAt: old?.createdAt ?? t, updatedAt: t };
    if (!p.field) delete setup.field;
    if (!p.branch) delete setup.branch;
    // a daily reminder at your time, on your days
    if (p.time) {
      const first = nextAfter({ at: atTime(todayKey(t), p.time), repeat: 'weekly', days: p.days }, t - 60_000) ?? atTime(todayKey(t), p.time);
      const body = { title: L('صقل: مهمة اليوم (١٥ د)', 'Sharpen: today’s task (15 min)'), at: first, repeat: 'weekly' as const, days: p.days, ref: 'future', updatedAt: t };
      const r = old?.remindId && s.reminds.find((x) => x.id === old.remindId);
      if (r) Object.assign(r, body, { done: false });
      else {
        const id = uid();
        s.reminds.push({ id, ...body, createdAt: t });
        setup.remindId = id;
      }
    } else if (old?.remindId) {
      s.reminds = s.reminds.filter((x) => x.id !== old.remindId);
      delete setup.remindId;
    }
    s.train.setup = setup;
  }, L('إعداد صقل', 'Set up training'));
}

/** a finished attempt with your own marks; the skill's level adjusts right after */
export function saveAttempt(a: Omit<DrillAttempt, 'id' | 'peers'> & { id?: string }): string {
  const id = a.id || uid();
  mutate((s) => {
    const i = s.train.attempts.findIndex((x) => x.id === id);
    const next: DrillAttempt = { peers: i >= 0 ? s.train.attempts[i].peers : [], ...a, id, updatedAt: now() };
    if (i >= 0) s.train.attempts[i] = next;
    else s.train.attempts.push(next);
    if (!a.retry && !a.benchmark) s.train.levels[a.skill] = nextLevel(s, a.skill);
    bumpDay(s, { minutes: Math.round(a.secs / 60) });
  }, L('حفظ المحاولة', 'Save attempt'));
  return id;
}

/** someone else's marks, from a review link or scored on this phone */
export function addPeerReview(attemptId: string, review: { name: string; scores: Record<string, Mark>; note?: string }) {
  mutate((s) => {
    const a = s.train.attempts.find((x) => x.id === attemptId);
    if (!a) return;
    a.peers.push({ id: uid(), name: review.name.trim().slice(0, 60) || L('مقيّم', 'Reviewer'), scores: review.scores, ...(review.note?.trim() ? { note: review.note.trim().slice(0, 600) } : {}), at: now() });
    a.updatedAt = now();
    if (!a.retry && !a.benchmark) s.train.levels[a.skill] = nextLevel(s, a.skill);
  }, L('تقييم من شخص', 'A review'));
}

export function deleteAttempt(id: string) {
  mutate((s) => {
    s.train.attempts = s.train.attempts.filter((x) => x.id !== id && x.retry?.of !== id);
  }, L('حذف المحاولة', 'Delete attempt'));
}

/** «مهمة ثانية»: today's task from another skill (once a day) */
export function swapTrainToday(skill: SkillId) {
  mutate((s) => {
    s.train.swap = { day: todayKey(), skill };
  });
}

export function addFieldTasks(tasks: DrillTask[]) {
  mutate((s) => {
    s.train.custom = [...s.train.custom, ...tasks];
  }, L('مهام التخصص', 'Field tasks'));
}

export function deleteFieldTask(id: string) {
  mutate((s) => {
    s.train.custom = s.train.custom.filter((x) => x.id !== id);
  }, L('حذف مهمة', 'Delete task'));
}

// ---------------- «أكلي» and the optional sections ----------------

export function setSections(patch: { gym?: boolean; diet?: boolean }) {
  mutate((s) => {
    s.settings.sections = { ...s.settings.sections, ...patch };
  });
}

/** the first setup (or a change of it): your details, today's weight, and the starting targets */
export function setupDiet(p: { setup: Omit<DietSetup, 'start' | 'createdAt' | 'updatedAt'>; info?: { sex?: 'm' | 'f'; birthYear?: number; height?: number }; weight?: number }) {
  const t = now();
  mutate((s) => {
    if (p.info) s.gym.info = { ...s.gym.info, ...p.info };
    if (p.weight) {
      const day = todayKey(t);
      const same = s.gym.body.find((b) => b.day === day);
      if (same) Object.assign(same, { weight: p.weight, updatedAt: t });
      else s.gym.body.push({ id: uid(), day, weight: p.weight, createdAt: t });
    }
    const old = s.diet.setup;
    s.diet.setup = { ...p.setup, start: old?.start ?? todayKey(t), createdAt: old?.createdAt ?? t, updatedAt: t };
    const kg = dietTrendNow(s) ?? p.weight;
    const tg = kg ? dietStartTargets(s, s.diet.setup, kg, t) : null;
    if (tg && (!old || old.pace !== p.setup.pace || old.by !== p.setup.by || old.goalKg !== p.setup.goalKg || s.diet.kcal == null)) {
      s.diet.kcal = tg.kcal;
      s.diet.protein = tg.protein;
    }
    s.settings.sections = { ...s.settings.sections, diet: true };
  }, L('إعداد خطة الأكل', 'Set up the meal plan'));
}

/** keep a day as it is now (marking, swapping or building makes it yours) */
export function saveDietDay(d: DietDay) {
  mutate((s) => {
    s.diet.days[d.day] = { ...structuredClone(d), updatedAt: now() };
    // a long history isn't needed: keep the last 120 days
    const keys = Object.keys(s.diet.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 120))) delete s.diet.days[k];
  });
}

/** forget a day you changed: it goes back to the ready plan */
export function dropDietDay(day: string) {
  mutate((s) => {
    delete s.diet.days[day];
  });
}

export function addDietFood(f: Omit<DietFood, 'id' | 'createdAt'>): string {
  const id = `own_${uid()}`;
  mutate((s) => {
    s.diet.foods.push({ ...f, id, createdAt: now() });
  }, L('أكلة جديدة', 'New food'));
  return id;
}

export function deleteDietFood(id: string) {
  mutate((s) => {
    s.diet.foods = s.diet.foods.filter((x) => x.id !== id);
  }, L('حذف أكلة', 'Delete food'));
}

export function saveDietTemplate(name: string, meals: DietMeal[]) {
  mutate((s) => {
    s.diet.templates.push({ id: uid(), name: name.trim().slice(0, 60) || L('يومي', 'My day'), meals: structuredClone(meals).map((m) => ({ slot: m.slot, items: m.items })), createdAt: now() });
  }, L('حفظ قالب', 'Save template'));
}

export function deleteDietTemplate(id: string) {
  mutate((s) => {
    s.diet.templates = s.diet.templates.filter((x) => x.id !== id);
  });
}

/** the weekly check-in: the new targets take over from today */
export function applyCheckIn(c: { kcal: number; protein: number; expenditure?: number; from?: number; to?: number; adherence?: number }) {
  const t = now();
  mutate((s) => {
    s.diet.weeks.push({ id: uid(), day: todayKey(t), ...c, createdAt: t });
    s.diet.kcal = c.kcal;
    s.diet.protein = c.protein;
    // days ahead that you didn't touch follow the new numbers
    for (const k of Object.keys(s.diet.days)) if (k > todayKey(t) && !s.diet.days[k].built) delete s.diet.days[k];
  }, L('تعديل الأسبوع', 'Weekly check-in'));
}

export function toggleShop(week: string, food: string) {
  mutate((s) => {
    const cur = s.diet.shop?.week === week ? s.diet.shop.got : [];
    s.diet.shop = { week, got: cur.includes(food) ? cur.filter((x) => x !== food) : [...cur, food] };
  });
}
