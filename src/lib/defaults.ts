import type { AppState, Settings, Template } from './types';
import { uid } from './text';

export const STATE_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  //          الأحد الإثنين الثلاثاء الأربعاء الخميس الجمعة السبت
  available: [240, 240, 240, 240, 240, 360, 360],
  studyCap: [150, 150, 150, 150, 120, 240, 240],
  dayEnd: '23:30',
  lang: 'ar',
  theme: 'lavender',
  coach: { enabled: true, tone: 'firm', about: '' },
  pomodoroWork: 25,
  pomodoroBreak: 5,
  morningBrief: '07:30',
  notifications: false,
  nudges: true,
  reviewFactor: 0.2,
  defaultPace: 5,
  commuteMin: 60,
  restMin: 60,
};

export function seedTemplates(): Template[] {
  return [
    {
      id: uid(),
      name: 'معاملة',
      notes: 'مثال لإجراء متعدد الخطوات — عدّل الخطوات والجهات بما يناسب عملك.',
      fields: [{ key: 'الجهة', value: '' }],
      uses: 0,
      steps: [
        { title: 'تنفيذ المعاملة', kind: 'action' },
        { title: 'طباعة المستندات', kind: 'print' },
        { title: 'حفظ في الملف', kind: 'file' },
        { title: 'إرسال للمسؤول', kind: 'send' },
      ],
    },
    {
      id: uid(),
      name: 'فاتورة',
      notes: '',
      fields: [{ key: 'المورد', value: '' }, { key: 'رقم الفاتورة', value: '' }],
      uses: 0,
      steps: [
        { title: 'مراجعة الفاتورة', kind: 'action' },
        { title: 'إرسال للجهة المختصة', kind: 'send' },
      ],
    },
    {
      id: uid(),
      name: 'تصديق مستند',
      notes: '',
      fields: [{ key: 'المستند', value: '' }],
      uses: 0,
      steps: [
        { title: 'تجهيز المستند وطباعته', kind: 'print' },
        { title: 'التصديق من الجهة المختصة', kind: 'certify' },
        { title: 'انتظار اعتماد التصديق', kind: 'reply' },
        { title: 'حفظ النسخة المصدّقة', kind: 'file' },
      ],
    },
  ];
}

export function initialState(): AppState {
  return {
    version: STATE_VERSION,
    tasks: [],
    goals: [],
    procedures: [],
    templates: seedTemplates(),
    courses: [],
    units: [],
    exams: [],
    sessions: [],
    settings: { ...DEFAULT_SETTINGS },
    dayOverrides: {},
    skipClass: {},
    studyOverrides: {},
    studyDefer: {},
    studyOff: {},
    days: {},
    snoozed: {},
    fired: {},
    quotaLog: {},
    missed: [],
    thoughts: [],
    coach: { history: {}, chat: [] },
    schedule: [],
    expenses: [],
    subs: [],
    money: { swaps: {} },
    meta: { createdAt: Date.now(), onboarded: false },
  };
}

/** Fill gaps in older / imported data so the app never crashes on missing fields. */
export function migrate(raw: any): AppState {
  const base = initialState();
  if (!raw || typeof raw !== 'object') return base;
  const s: AppState = {
    ...base,
    ...raw,
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}), coach: { ...DEFAULT_SETTINGS.coach, ...(raw.settings?.coach || {}) } },
    coach: { history: {}, chat: [], ...(raw.coach || {}) },
    money: { swaps: {}, ...(raw.money || {}) },
    meta: { ...base.meta, ...(raw.meta || {}) },
  };
  for (const k of ['tasks', 'goals', 'procedures', 'templates', 'courses', 'units', 'exams', 'sessions', 'missed', 'thoughts', 'expenses', 'subs', 'schedule'] as const) {
    // a damaged entry (null, a number…) would crash every page that lists it
    (s as any)[k] = Array.isArray(s[k]) ? (s[k] as unknown[]).filter((x) => x && typeof x === 'object' && typeof (x as any).id === 'string') : [];
  }
  for (const k of ['available', 'studyCap'] as const) {
    const v = s.settings[k];
    if (!Array.isArray(v) || v.length !== 7 || v.some((m) => typeof m !== 'number' || !(m >= 0))) s.settings[k] = [...DEFAULT_SETTINGS[k]];
  }
  for (const k of ['dayOverrides', 'skipClass', 'studyOverrides', 'studyDefer', 'studyOff', 'days', 'snoozed', 'fired', 'quotaLog'] as const) {
    if (!s[k] || typeof s[k] !== 'object') (s as any)[k] = {};
  }
  s.tasks = s.tasks.map((t: any) => ({ checklist: [], notes: '', spent: 0, deferrals: 0, hard: false, priority: 1, area: 'life', status: 'open', ...t }));
  s.procedures = s.procedures.map((p: any) => ({ fields: [], steps: [], log: [], notes: '', archived: false, priority: 1, ...p }));
  s.units = s.units.map((u: any) => ({ progress: 0, reviewed: false, spent: 0, order: 0, size: 1, ...u }));
  s.exams = s.exams.map((e: any) => ({ unitIds: [], reviewDays: 1, ...e }));
  s.templates = s.templates.map((t: any) => ({ steps: [], fields: [], ...t }));
  s.courses = s.courses.map((c: any) => ({ difficulty: 3, sizeLabel: 'صفحة', notes: '', archived: false, color: '#5e9cff', ...c }));
  s.version = STATE_VERSION;
  return s;
}
