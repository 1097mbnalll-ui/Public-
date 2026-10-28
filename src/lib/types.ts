// Core data model. Everything lives in one AppState document saved locally.

export type Area = 'study' | 'work' | 'life';
/** 0 منخفضة · 1 عادية · 2 مهمة · 3 عاجلة */
export type Priority = 0 | 1 | 2 | 3;

export interface Reminder {
  at: number; // epoch ms
  fired?: boolean;
  note?: string;
}

export type RemindRepeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/** «ذكّرني»: a reminder for anything, on its own or tied to a page */
export interface Remind {
  id: string;
  title: string;
  note?: string;
  /** the next time it alerts (epoch ms); for a repeat it moves forward after each alert */
  at: number;
  repeat: RemindRepeat;
  /** weekly: the weekdays (0 = Sunday); empty means the weekday of `at` */
  days?: number[];
  /** the page it opens */
  ref?: string;
  done?: boolean;
  lastAt?: number;
  createdAt: number;
  updatedAt?: number;
}

export interface Recurrence {
  every: number;
  unit: 'day' | 'week' | 'month';
}

export interface CheckItem {
  id: string;
  title: string;
  done: boolean;
  /** optional classification of the step (print, send, file…) */
  kind?: StepKind;
  /** optional person / place for the step */
  target?: string;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  area: Area;
  /** your own category on top of the area (e.g. «البيت», «السيارة») */
  label?: string;
  priority: Priority;
  due?: string; // YYYY-MM-DD
  dueTime?: string; // HH:MM
  /** موعد لا يحتمل التأجيل */
  hard: boolean;
  /** user estimate in minutes */
  estimate?: number;
  /** minutes actually tracked (timer or manual) */
  spent: number;
  /** pinned to a specific day by the user */
  plannedFor?: string;
  status: 'open' | 'done' | 'dropped';
  /** blocked waiting on someone / something */
  waitingOn?: string;
  checklist: CheckItem[];
  goalId?: string;
  recurrence?: Recurrence;
  reminder?: Reminder;
  deferrals: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  /** the next occurrence created when this recurring task was completed (removed again if it's reopened) */
  nextId?: string;
}

export interface Goal {
  id: string;
  title: string;
  area: Area;
  why: string;
  target?: string; // YYYY-MM-DD
  createdAt: number;
  doneAt?: number;
}

// ---------- Work procedures ----------

export type StepKind = 'action' | 'print' | 'file' | 'certify' | 'send' | 'reply' | 'followup';

export interface Step {
  id: string;
  title: string;
  kind: StepKind;
  /** person, group or place involved (e.g. المدير، قسم الحسابات، ملف الأرشيف) */
  target?: string;
  done: boolean;
  doneAt?: number;
  note?: string;
}

export interface Field {
  key: string;
  value: string;
}

export interface LogEntry {
  at: number;
  text: string;
}

export interface Procedure {
  id: string;
  title: string;
  templateId?: string;
  notes: string;
  fields: Field[];
  steps: Step[];
  priority: Priority;
  due?: string;
  /** pushed to a later day (عادي / منخفض only) */
  plannedFor?: string;
  deferrals?: number;
  reminder?: Reminder;
  log: LogEntry[];
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  /** the next occurrence created when this recurring task was completed (removed again if it's reopened) */
  nextId?: string;
}

export interface TemplateStep {
  title: string;
  /** required for procedures; optional for task templates */
  kind?: StepKind;
  target?: string;
}

export interface Template {
  id: string;
  /** 'task' → a reusable task with steps; absent → a work-procedure template */
  for?: 'task';
  area?: Area;
  estimate?: number;
  name: string;
  steps: TemplateStep[];
  fields: Field[];
  notes: string;
  uses: number;
}

// ---------- Study ----------

export interface Course {
  id: string;
  name: string;
  color: string;
  /** 1 سهلة … 5 صعبة جدًا */
  difficulty: number;
  /** unit of material size: صفحة / محاضرة / شريحة ... */
  sizeLabel: string;
  /** user's own guess: minutes per size unit (optional, used until real data exists) */
  paceGuess?: number;
  notes: string;
  archived: boolean;
  createdAt: number;
}

export interface Unit {
  id: string;
  courseId: string;
  title: string;
  size: number;
  difficulty?: number;
  /** 0..1 portion studied */
  progress: number;
  reviewed: boolean;
  spent: number;
  order: number;
  /** study notes / summary for this lesson */
  notes?: string;
}

export interface Exam {
  id: string;
  courseId: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string;
  unitIds: string[];
  /** days before the exam reserved for review only */
  reviewDays: number;
  weight?: number; // % of course grade
  score?: number; // result % once known
  /** you sat it (with or without a grade): it leaves the plan and stops asking */
  finished?: boolean;
  createdAt: number;
}

export interface StudySession {
  id: string;
  courseId: string;
  unitId?: string;
  date: string;
  minutes: number;
  /** new material covered in this session, in the course's size units (0 for review) */
  amount: number;
  /** went over a lesson that was already studied */
  review?: boolean;
  /** ticked as done (no time recorded): counts toward the day, never toward your pace */
  tick?: boolean;
  at: number;
}

// ---------- Settings & state ----------

export type CoachTone = 'gentle' | 'firm' | 'harsh';

export interface CoachSettings {
  enabled: boolean;
  tone: CoachTone;
  /** what you want the coach to know about you */
  about: string;
}

export interface CoachAction {
  label: string;
  /** defer: move the given task/procedure ids to tomorrow · go: open a page */
  kind: 'defer' | 'go';
  ids?: string[];
  path?: string;
}

export interface CoachMessage {
  role: 'user' | 'assistant';
  text: string;
  at: number;
  /** buttons under an assistant reply (e.g. «أجّلها لبكرة») */
  actions?: CoachAction[];
  /** set once an action was used, so it can't be applied twice */
  used?: boolean;
}

export interface CoachState {
  /** last daily message (cached so it isn't regenerated on every visit) */
  last?: { day: string; key: string; text: string; level: number; ai: boolean; at: number };
  /** daily lateness score — lets the coach see trends ("third day in a row") */
  history: Record<string, number>;
  chat: CoachMessage[];
}

export interface Settings {
  name: string;
  /** free minutes for planned work (tasks + study) per weekday, Sunday = 0 */
  available: number[];
  /** max study minutes per weekday */
  studyCap: number[];
  dayEnd: string; // HH:MM
  /** interface language */
  lang: 'ar' | 'en';
  theme: string;
  /** the coach: tone and what you told it about yourself */
  coach: CoachSettings;
  /** focus session lengths, minutes */
  pomodoroWork: number;
  pomodoroBreak: number;
  morningBrief: string; // HH:MM or ''
  notifications: boolean;
  nudges: boolean;
  /** extra share of time added for review when estimating study load */
  reviewFactor: number;
  /** default minutes per size unit at difficulty 3, before any data */
  defaultPace: number;
  /** minutes to get there before a lecture / shift, and to get home after */
  commuteMin?: number;
  /** minutes of rest once you're home from campus / work */
  restMin?: number;
}

export interface Timer {
  kind: 'task' | 'study' | 'procedure';
  refId: string;
  courseId?: string;
  unitId?: string;
  label: string;
  startedAt: number;
  /** ms accumulated before the current run */
  acc: number;
  running: boolean;
  /** full-screen focus view is open (the timer keeps running when minimised) */
  focus?: boolean;
}

/** a thought jotted down during focus, to deal with later */
export interface Thought {
  id: string;
  text: string;
  at: number;
  /** what you were working on when it came up */
  during?: string;
}

export interface DayRecord {
  done: number; // items completed
  minutes: number; // tracked minutes
  study: number; // study minutes
}

// ---------------- Schedule ----------------

/** a weekly fixed block: a lecture or a work shift */
export interface ClassBlock {
  id: string;
  title: string;
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  start: string; // HH:MM
  end: string; // HH:MM
  kind: 'class' | 'work';
  place?: string;
  /** online (عن بعد): no going out and coming back */
  remote?: boolean;
  createdAt: number;
  updatedAt?: number;
}

// ---------------- Money ----------------

export type BuiltinCat = 'food' | 'coffee' | 'delivery' | 'transport' | 'shopping' | 'subs' | 'bills' | 'fun' | 'study' | 'health' | 'other';
/** a built-in category, or the id of one you made */
export type ExpenseCat = BuiltinCat | (string & {});

/** a category you made, with your own emoji */
export interface CustomCat {
  id: string;
  name: string;
  emoji: string;
  color: string;
}
/** «يستحق؟» — the user's own verdict on a purchase */
export type Worth = 'yes' | 'meh' | 'no';

export interface Expense {
  id: string;
  title: string;
  amount: number;
  cat: ExpenseCat;
  day: string; // YYYY-MM-DD
  time?: string; // HH:MM
  worth?: Worth;
  source?: 'sms' | 'sub' | 'import';
  /** spent on growing yourself (a course, an exam, a tool) — counted against «مستقبلي»'s budget */
  growth?: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  cycle: 'month' | 'year';
  /** next renewal day — on that day the charge is logged as an expense */
  next: string;
  /** a bill (phone, rent…) is never “unused” */
  kind?: 'sub' | 'bill';
  /** last day the user said they used it */
  lastUsed?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface MoneyState {
  /** monthly budget */
  budget?: number;
  goal?: { name: string; target: number; saved: number };
  /** savings swaps the user is trying (swap id → day started) */
  swaps: Record<string, string>;
  /** fingerprints of bank messages already imported */
  smsSeen?: string[];
  /** day of the month the salary comes in — the budget month runs payday to payday */
  payday?: number;
  /** monthly limit per category */
  limits?: Partial<Record<ExpenseCat, number>>;
  /** your own categories */
  cats?: CustomCat[];
}

// ---------------- Gym (النادي) ----------------

export type GymGoal = 'muscle' | 'strength' | 'fat' | 'fit' | 'endurance';
export type GymLevel = 'new' | 'mid' | 'pro';

export interface GymProfile {
  goal: GymGoal;
  level: GymLevel;
  place: 'gym' | 'home';
  /** weekdays you train (0 = Sunday) */
  days: number[];
  /** how long a session can be */
  minutes: number;
  /** usual start time, HH:MM — the day plans around it */
  time?: string;
  /** exercises you swapped for another: original id → yours */
  swaps?: Record<string, string>;
}

export interface GymSet {
  kg?: number;
  /** reps — or seconds / minutes for timed exercises */
  reps: number;
  done: boolean;
}

export interface GymSession {
  id: string;
  day: string;
  start: number;
  /** unset while the workout is going */
  end?: number;
  slot: string;
  name: string;
  /** the muscles you picked for it */
  groups?: string[];
  /** effort: how the exercise felt — it decides how fast the weight climbs */
  entries: { exId: string; sets: GymSet[]; effort?: 'easy' | 'ok' | 'hard' }[];
  /** the rest after the last set ends here */
  restUntil?: number;
  note?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface BodyLog {
  id: string;
  day: string;
  weight?: number;
  /** body fat % */
  fat?: number;
  waist?: number;
  chest?: number;
  arm?: number;
  thigh?: number;
  createdAt: number;
  updatedAt?: number;
}

/** an exercise you wrote yourself, with the muscles it works */
export interface GymCustom {
  id: string;
  name: string;
  hits: string[];
  also?: string[];
  kind: 'bar' | 'db' | 'machine' | 'body' | 'cardio';
  unit?: 'reps' | 'sec' | 'min';
  createdAt: number;
  updatedAt?: number;
}

export interface GymState {
  profile?: GymProfile;
  /** your own exercises */
  custom?: GymCustom[];
  /** which day of the program is next */
  rot: number;
  sessions: GymSession[];
  body: BodyLog[];
  /** for calories and protein */
  info: { sex?: 'm' | 'f'; birthYear?: number; height?: number; activity?: number };
}

// ---------------- Future (مستقبلي) ----------------

export type FutureKind = 'student' | 'career' | 'skills' | 'project' | 'personal';

export interface FutureVision {
  kind: FutureKind;
  title: string;
  why: string;
  /** what it looks like when you get there */
  outcome?: string;
  /** for a student: the major, the year you're in (1-based) and how many years in all */
  field?: string;
  year?: number;
  years?: number;
  start: string;
  target: string;
  weeklyHours: number;
  /** optional budget for growing yourself, per year */
  budget?: number;
  strengths?: string;
  growth?: string;
  commitments?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface FutureStage {
  id: string;
  title: string;
  focus?: string;
  from: string;
  to: string;
  createdAt: number;
  updatedAt?: number;
}

export type SkillCat = 'core' | 'tech' | 'pro' | 'lang' | 'advanced' | 'personal';
/** read about it → practised → used on a real problem → proven with evidence */
export type SkillStep = 'none' | 'learning' | 'practicing' | 'applied' | 'proven';

export interface FutureResource {
  id: string;
  title: string;
  url?: string;
  cost?: number;
  done?: boolean;
  /** the expense it was logged as, so it's never logged twice */
  expenseId?: string;
}

export interface FutureSkill {
  id: string;
  name: string;
  cat: SkillCat;
  why?: string;
  /** 0 none · 1 beginner · 2 basics · 3 capable · 4 strong */
  level: number;
  target: number;
  priority: 1 | 2 | 3;
  /** skills to have first (ids) */
  prereqs: string[];
  /** your estimate of the hours it takes from here */
  hours?: number;
  stageId?: string;
  step: SkillStep;
  resources: FutureResource[];
  /** practice time */
  log: { day: string; min: number }[];
  /** what proves it: a link, a certificate, a result */
  evidence?: string;
  notes?: string;
  paused?: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface FutureProject {
  id: string;
  title: string;
  goal?: string;
  skillIds: string[];
  /** a step sent to مهامي keeps its task's id — the task is the one source of truth then */
  steps: { id: string; title: string; done: boolean; taskId?: string }[];
  due?: string;
  stageId?: string;
  links: string[];
  result?: string;
  status: 'idea' | 'active' | 'done';
  createdAt: number;
  updatedAt?: number;
  doneAt?: number;
}

export type WinKind = 'skill' | 'project' | 'cert' | 'experience' | 'academic' | 'work' | 'other';

export interface FutureWin {
  id: string;
  kind: WinKind;
  title: string;
  day: string;
  evidence?: string;
  skillIds: string[];
  note?: string;
  createdAt: number;
  updatedAt?: number;
}

/** a job or internship ad you pasted, to see what's asked for */
export interface FuturePosting {
  id: string;
  title: string;
  text: string;
  day: string;
  createdAt: number;
  updatedAt?: number;
}

export interface FutureReview {
  id: string;
  kind: 'week' | 'month';
  /** the week's first day, or YYYY-MM */
  period: string;
  went?: string;
  blocked?: string;
  keep?: string;
  stop?: string;
  next?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface FutureState {
  vision?: FutureVision;
  stages: FutureStage[];
  skills: FutureSkill[];
  projects: FutureProject[];
  wins: FutureWin[];
  postings: FuturePosting[];
  reviews: FutureReview[];
}

export interface AppState {
  version: number;
  tasks: Task[];
  goals: Goal[];
  procedures: Procedure[];
  templates: Template[];
  courses: Course[];
  units: Unit[];
  exams: Exam[];
  sessions: StudySession[];
  settings: Settings;
  /** override of available minutes for a specific day */
  dayOverrides: Record<string, number>;
  /** a lecture / shift you won't attend on one date: `${day}|${blockId}` → true (false = back on) */
  skipClass: Record<string, boolean>;
  /** study time raised for particular days (exam crunch): day → minutes */
  studyOverrides: Record<string, number>;
  /** a subject's share moved to the next day: day → exam id → minutes moved */
  studyDefer: Record<string, Record<string, number>>;
  /** days you won't study a subject: exam id → days */
  studyOff: Record<string, string[]>;
  days: Record<string, DayRecord>;
  timer?: Timer;
  /** insight id → hidden until (epoch ms) */
  snoozed: Record<string, number>;
  /** study quota per exam as it stood each day (day → examId → minutes); lets the app explain changes */
  quotaLog: Record<string, Record<string, number>>;
  /** automatic reminders already delivered (id → when) */
  fired: Record<string, number>;
  /** brain-dump inbox from focus sessions */
  thoughts: Thought[];
  coach: CoachState;
  /** weekly lectures / work shifts — planning works around them */
  schedule: ClassBlock[];
  expenses: Expense[];
  subs: Subscription[];
  money: MoneyState;
  gym: GymState;
  future: FutureState;
  reminds: Remind[];
  /** reminders that fired while you were away and haven't been seen */
  missed: { id: string; title: string; at: number; ref?: string }[];
  meta: {
    createdAt: number;
    onboarded: boolean;
    lastExportAt?: number;
    lastBriefDay?: string;
  };
}
