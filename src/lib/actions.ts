// All state changes go through these functions.

import type { AppState, Area, ClassBlock, Course, Exam, Expense, ExpenseCat, MoneyState, Priority, Procedure, Step, StepKind, Subscription, Task, Template, Unit } from './types';
import { getState, mutate } from './store';
import { uid } from './text';
import { addDays, addMonths, todayKey } from './dates';
import { taskTime } from './engine/learning';
import { isProcDone, kindInfo } from './engine/procedures';
import { pomodoro } from './engine/focus';
import { L } from './i18n';
import { CAT_ORDER, guessCat } from './engine/money';
import { readSchedule } from './engine/schedule';

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

export function templateFromProcedure(procId: string, name: string): string {
  const p = getState().procedures.find((x) => x.id === procId);
  if (!p) return '';
  return saveTemplate({
    name,
    notes: p.notes,
    fields: p.fields.map((f) => ({ key: f.key, value: '' })),
    steps: p.steps.map((st) => ({ title: st.title, kind: st.kind, target: st.target })),
  });
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

export function templateFromTask(taskId: string, name: string): string {
  const t = getState().tasks.find((x) => x.id === taskId);
  if (!t) return '';
  return saveTemplate({
    for: 'task',
    name,
    area: t.area,
    estimate: t.estimate,
    notes: t.notes,
    fields: [],
    steps: t.checklist.map((c) => ({ title: c.title, ...(c.kind ? { kind: c.kind } : {}), ...(c.target ? { target: c.target } : {}) })),
  });
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

export function deleteExam(id: string) {
  mutate((s) => {
    s.exams = s.exams.filter((e) => e.id !== id);
  }, L('حذف اختبار', "Delete exam"));
}

/** log real study: feeds progress, pace learning and today's capacity */
export function logStudy(courseId: string, unitId: string | undefined, minutes: number, amount: number) {
  mutate((s) => {
    s.sessions.push({ id: uid(), courseId, unitId, date: todayKey(), minutes, amount, at: now() });
    const u = unitId ? s.units.find((x) => x.id === unitId) : undefined;
    if (u) {
      u.spent += minutes;
      if (amount > 0 && u.size > 0) u.progress = Math.min(1, u.progress + amount / u.size);
    }
    bumpDay(s, { minutes, study: minutes });
  }, L('تسجيل مذاكرة', "Log study"));
}

// ---------------- Timer ----------------

export function startTimer(t: { kind: 'task' | 'study' | 'procedure'; refId: string; label: string; courseId?: string; unitId?: string }) {
  mutate((s) => {
    s.timer = { ...t, startedAt: now(), acc: 0, running: true, focus: true };
  });
}

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

export function resumeTimer() {
  mutate((s) => {
    if (!s.timer || s.timer.running) return;
    s.timer.startedAt = now();
    s.timer.running = true;
  });
}

/** stops the timer; tasks get the minutes immediately, study returns them for the amount prompt */
export function stopTimer(): { minutes: number; timer: NonNullable<AppState['timer']> } | null {
  const t = getState().timer;
  if (!t) return null;
  // credit work blocks only — Pomodoro breaks are not work time
  const { pomodoroWork, pomodoroBreak } = getState().settings;
  const minutes = Math.max(1, Math.round(pomodoro(timerElapsed(t), pomodoroWork, pomodoroBreak).workMs / 60000));
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
  return { minutes, timer: t };
}

export function setFocus(open: boolean) {
  mutate((s) => {
    if (s.timer) s.timer.focus = open;
  });
}

export function addThought(text: string, during?: string) {
  mutate((s) => {
    s.thoughts.push({ id: uid(), text, at: now(), during });
  });
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
      return { title, amount: Math.round(Number(e.amount) * 100) / 100, day: day.test(e.date || e.day) ? e.date || e.day : todayKey(), cat: CAT_ORDER.includes(e.cat) ? e.cat : guessCat(title) };
    });
  const schedule = readSchedule(raw?.schedule || []);
  const hasCourse = !!raw?.course?.name && Array.isArray(raw.units);
  if (!raw || !['masar-course', 'masar'].includes(raw.app) || (!hasCourse && !tasks.length && !expenses.length && !schedule.length))
    throw new Error(L('هذا ليس ملف مادة أو مهام من «مسار».', "This is not a Masar course or task file."));
  const extra = { ...(tasks.length ? { tasks } : {}), ...(expenses.length ? { expenses } : {}), ...(schedule.length ? { schedule } : {}) };
  if (!hasCourse) return { ...extra, units: [] };
  // a pack can come from any link: keep only well-typed, bounded values
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
  const diff = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5 ? (v as number) : undefined);
  const c = raw.course;
  const name = str(c.name, 120);
  if (!name) throw new Error(L('هذا ليس ملف مادة أو مهام من «مسار».', "This is not a Masar course or task file."));
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

export function setGoal(goal: MoneyState['goal']) {
  mutate((s) => {
    s.money.goal = goal && goal.name.trim() && goal.target > 0 ? goal : undefined;
  });
}

export function addToGoal(amount: number) {
  mutate((s) => {
    if (s.money.goal) s.money.goal.saved = Math.max(0, s.money.goal.saved + amount);
  });
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

export function deleteBlock(id: string) {
  mutate((s) => {
    s.schedule = s.schedule.filter((x) => x.id !== id);
  }, L('حذف من الجدول', 'Remove from timetable'));
}
