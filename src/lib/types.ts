// Core data model. Everything lives in one AppState document saved locally.

export type Area = 'study' | 'work' | 'life';
/** 0 منخفضة · 1 عادية · 2 مهمة · 3 عاجلة */
export type Priority = 0 | 1 | 2 | 3;

export interface Reminder {
  at: number; // epoch ms
  fired?: boolean;
  note?: string;
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
  createdAt: number;
}

export interface StudySession {
  id: string;
  courseId: string;
  unitId?: string;
  date: string;
  minutes: number;
  /** material covered in this session, in the course's size units */
  amount: number;
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

// ---------------- Money ----------------

export type ExpenseCat = 'food' | 'coffee' | 'delivery' | 'transport' | 'shopping' | 'subs' | 'bills' | 'fun' | 'study' | 'health' | 'other';
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
  createdAt: number;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  cycle: 'month' | 'year';
  /** next renewal day — on that day the charge is logged as an expense */
  next: string;
  /** last day the user said they used it */
  lastUsed?: string;
  createdAt: number;
}

export interface MoneyState {
  /** monthly budget */
  budget?: number;
  goal?: { name: string; target: number; saved: number };
  /** savings swaps the user is trying (swap id → day started) */
  swaps: Record<string, string>;
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
  expenses: Expense[];
  subs: Subscription[];
  money: MoneyState;
  /** reminders that fired while you were away and haven't been seen */
  missed: { id: string; title: string; at: number; ref?: string }[];
  meta: {
    createdAt: number;
    onboarded: boolean;
    lastExportAt?: number;
    lastBriefDay?: string;
  };
}
