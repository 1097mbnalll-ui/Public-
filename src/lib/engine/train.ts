// «صقل»: daily training on real tasks, measured honestly.
// A task is a situation and something to produce; you compare your work with an expert's answer
// criterion by criterion, and anyone you trust can score it too (their score outranks yours).
// The level of each skill adjusts by itself; every 28 days a fixed-difficulty «اختبار قياس» draws
// the real progress curve. Finishing tasks is not progress — only scores are.

import type { AppState, DrillAttempt, DrillTask, Mark, SkillId } from '../types';
import { addDays, todayKey } from '../dates';
import { L } from '../i18n';
import { BUILTIN_TASKS } from './drills';

type T = [string, string];
export interface SkillMeta { id: SkillId; t: T; short: T; emoji: string; color: string; what: T }
export const SKILLS: SkillMeta[] = [
  { id: 'write', t: ['القراءة والكتابة', 'Reading & writing'], short: ['الكتابة', 'Writing'], emoji: '✍️', color: '#7E62F0', what: ['تكتب واضح ومقنع، وتفهم المكتوب بدقة', 'Write clearly and persuasively; read precisely'] },
  { id: 'think', t: ['التفكير التحليلي', 'Analytical thinking'], short: ['التحليل', 'Analysis'], emoji: '🧠', color: '#E0692F', what: ['تفكك المشكلة وتسأل الصح قبل ما تقرر', 'Break problems down; ask the right questions before deciding'] },
  { id: 'data', t: ['الأرقام والبيانات', 'Numbers & data'], short: ['الأرقام', 'Numbers'], emoji: '📊', color: '#1F8FD6', what: ['تحسب وتقرأ البيانات وتطلع منها بقرار', 'Calculate, read data and turn it into a decision'] },
  { id: 'talk', t: ['التواصل والعمل مع الناس', 'Communication & people'], short: ['التواصل', 'Communication'], emoji: '🗣️', color: '#14A06B', what: ['تشرح وتقنع وتتعامل مع المواقف الصعبة', 'Explain, persuade and handle hard conversations'] },
  { id: 'english', t: ['الإنجليزي', 'English'], short: ['الإنجليزي', 'English'], emoji: '🇬🇧', color: '#C2410C', what: ['تكتب وتتكلم إنجليزي في مواقف العمل', 'Write and speak English at work'] },
  { id: 'self', t: ['إدارة النفس', 'Self-management'], short: ['إدارة النفس', 'Self-management'], emoji: '🧭', color: '#B45309', what: ['تخطط وتلتزم وتراجع نفسك', 'Plan, follow through and review yourself'] },
  { id: 'field', t: ['مهارة تخصصك', 'Your field'], short: ['التخصص', 'Field'], emoji: '🎯', color: '#DB2777', what: ['مهام من تخصصك نفسه', 'Tasks from your own field'] },
];
export const skillMeta = (id: SkillId) => SKILLS.find((x) => x.id === id)!;
export const skillName = (id: SkillId) => L(...skillMeta(id).t);

/** fields and branches (for your field's tasks) */
export interface Field { v: string; t: T; branches?: { v: string; t: T }[] }
export const FIELDS: Field[] = [
  { v: 'eng', t: ['هندسة', 'Engineering'], branches: [
    { v: 'mech', t: ['ميكانيكية', 'Mechanical'] }, { v: 'elec', t: ['كهربائية', 'Electrical'] }, { v: 'civil', t: ['مدنية', 'Civil'] },
    { v: 'chem', t: ['كيميائية', 'Chemical'] }, { v: 'ind', t: ['صناعية', 'Industrial'] }, { v: 'undecided', t: ['لسا ما حددت', 'Not decided'] } ] },
  { v: 'cs', t: ['حاسب وتقنية', 'Computing & tech'], branches: [
    { v: 'cs', t: ['علوم حاسب', 'Computer science'] }, { v: 'se', t: ['هندسة برمجيات', 'Software engineering'] }, { v: 'is', t: ['نظم معلومات', 'Information systems'] },
    { v: 'cyber', t: ['أمن سيبراني', 'Cybersecurity'] }, { v: 'data', t: ['بيانات وذكاء اصطناعي', 'Data & AI'] } ] },
  { v: 'health', t: ['صحة', 'Health'], branches: [
    { v: 'med', t: ['طب', 'Medicine'] }, { v: 'pharm', t: ['صيدلة', 'Pharmacy'] }, { v: 'nurse', t: ['تمريض', 'Nursing'] },
    { v: 'dent', t: ['أسنان', 'Dentistry'] }, { v: 'applied', t: ['علوم طبية تطبيقية', 'Applied medical sciences'] } ] },
  { v: 'biz', t: ['أعمال وإدارة', 'Business'], branches: [
    { v: 'acc', t: ['محاسبة', 'Accounting'] }, { v: 'fin', t: ['مالية', 'Finance'] }, { v: 'mkt', t: ['تسويق', 'Marketing'] },
    { v: 'hr', t: ['موارد بشرية', 'HR'] }, { v: 'mgmt', t: ['إدارة', 'Management'] } ] },
  { v: 'sci', t: ['علوم', 'Sciences'] },
  { v: 'law', t: ['قانون', 'Law'] },
  { v: 'design', t: ['تصميم وإعلام', 'Design & media'] },
  { v: 'edu', t: ['تعليم', 'Education'] },
  { v: 'other', t: ['غيره', 'Other'] },
];


export const START_LEVEL = 2;
export const MAX_LEVEL = 5;
const DAY = 86_400_000;
export const BENCH_EVERY = 28;

export const allTasks = (s: AppState): DrillTask[] => [...BUILTIN_TASKS, ...(s.train?.custom || [])];
export const taskById = (s: AppState, id: string) => allTasks(s).find((t) => t.id === id);

// ---------- scores ----------

export const pctOf = (task: DrillTask, marks: Record<string, Mark>) => {
  const n = task.criteria.length;
  if (!n) return 0;
  const sum = task.criteria.reduce((a, c) => a + (marks[c.id] ?? 0), 0);
  return Math.round((sum / (n * 2)) * 100);
};

export interface Score {
  self?: number;
  peer?: number;
  /** the strongest evidence: someone else's score when there is one */
  best: number;
  source: 'peer' | 'self';
}

export function scoreOf(task: DrillTask | undefined, a: DrillAttempt): Score | undefined {
  if (!task) return undefined;
  const hasSelf = Object.keys(a.self || {}).length > 0;
  const self = hasSelf ? pctOf(task, a.self) : undefined;
  const peers = a.peers.map((p) => pctOf(task, p.scores));
  const peer = peers.length ? Math.round(peers.reduce((x, y) => x + y, 0) / peers.length) : undefined;
  if (peer == null && self == null) return undefined;
  return { self, peer, best: peer ?? self!, source: peer != null ? 'peer' : 'self' };
}

export const levelOf = (s: AppState, skill: SkillId) => s.train?.levels?.[skill] ?? START_LEVEL;

/** after an attempt is scored: two in a row ≥ 80% (or one ≥ 80% scored by someone else) → up; two ≤ 45% → down */
export function nextLevel(s: AppState, skill: SkillId): number {
  const cur = levelOf(s, skill);
  const done = s.train.attempts
    .filter((a) => a.skill === skill && !a.retry && !a.benchmark && a.level === cur)
    .map((a) => ({ a, sc: scoreOf(taskById(s, a.taskId), a) }))
    .filter((x) => x.sc)
    .sort((x, y) => y.a.at - x.a.at);
  const last2 = done.slice(0, 2);
  if (last2[0]?.sc!.source === 'peer' && last2[0].sc!.best >= 80) return Math.min(MAX_LEVEL, cur + 1);
  if (last2.length === 2 && last2.every((x) => x.sc!.best >= 80)) return Math.min(MAX_LEVEL, cur + 1);
  if (last2.length === 2 && last2.every((x) => x.sc!.best <= 45)) return Math.max(1, cur - 1);
  return cur;
}

/** your own scores minus others' on the same attempts: + means you rate yourself higher */
export function calibration(s: AppState): { gap: number; n: number } | null {
  const pairs = s.train.attempts
    .map((a) => scoreOf(taskById(s, a.taskId), a))
    .filter((x): x is Score => !!x && x.self != null && x.peer != null);
  if (!pairs.length) return null;
  return { gap: Math.round(pairs.reduce((a, x) => a + (x.self! - x.peer!), 0) / pairs.length), n: pairs.length };
}

// ---------- the curve ----------

export interface Point { at: number; pct: number; source: 'peer' | 'self' | 'app'; benchmark: boolean; attemptId?: string }

/** measurement points (the curve) and practice points (dots around it) for one skill */
export function curve(s: AppState, skill: SkillId): { bench: Point[]; practice: Point[] } {
  const bench: Point[] = [];
  const practice: Point[] = [];
  for (const a of s.train.attempts) {
    if (a.skill !== skill || a.retry) continue;
    const sc = scoreOf(taskById(s, a.taskId), a);
    if (!sc) continue;
    (a.benchmark ? bench : practice).push({ at: a.at, pct: sc.best, source: sc.source, benchmark: !!a.benchmark, attemptId: a.id });
  }
  return { bench: bench.sort((x, y) => x.at - y.at), practice: practice.sort((x, y) => x.at - y.at) };
}

/** first measurement vs the latest: the honest «did it change?» */
export function change(s: AppState, skill: SkillId): { from: number; to: number; months: number } | null {
  const b = curve(s, skill).bench;
  if (b.length < 2) return null;
  return { from: b[0].pct, to: b[b.length - 1].pct, months: Math.max(1, Math.round((b[b.length - 1].at - b[0].at) / (30 * DAY))) };
}

// ---------- measurement every 28 days ----------

/** a skill's monthly measurement is due: 28 days after you started it, then every 28 days */
export function benchDue(s: AppState, skill: SkillId, now = Date.now()): boolean {
  const mine = s.train.attempts.filter((a) => a.skill === skill && !a.retry);
  if (!mine.length) return false;
  const benches = mine.filter((a) => a.benchmark).sort((a, b) => b.at - a.at);
  const since = benches[0]?.at ?? Math.min(...mine.map((a) => a.at));
  return now - since >= BENCH_EVERY * DAY && !!benchTask(s, skill);
}

/** the next measurement task for a skill: the one you've had least (all are the same difficulty) */
export function benchTask(s: AppState, skill: SkillId): DrillTask | undefined {
  const list = allTasks(s).filter((t) => t.skill === skill && t.benchmark);
  if (!list.length) return undefined;
  const used = (id: string) => s.train.attempts.filter((a) => a.taskId === id).length;
  return [...list].sort((a, b) => used(a.id) - used(b.id) || a.id.localeCompare(b.id))[0];
}

// ---------- today's task ----------

export function activeSkills(s: AppState): SkillId[] {
  const hasField = allTasks(s).some((t) => t.skill === 'field' && !t.benchmark);
  return SKILLS.map((x) => x.id).filter((id) => id !== 'field' || hasField);
}

const lastTrained = (s: AppState, skill: SkillId) => Math.max(0, ...s.train.attempts.filter((a) => a.skill === skill && !a.retry).map((a) => a.at));

/** the task for a skill at its level: not one you did in the last 60 days, nearest level if none left */
export function taskFor(s: AppState, skill: SkillId, now = Date.now()): DrillTask | undefined {
  const lvl = levelOf(s, skill);
  const recent = new Set(s.train.attempts.filter((a) => now - a.at < 60 * DAY).map((a) => a.taskId));
  const pool = allTasks(s).filter((t) => t.skill === skill && !t.benchmark);
  const fresh = pool.filter((t) => !recent.has(t.id));
  const pick = (list: DrillTask[]) => [...list].sort((a, b) => Math.abs(a.level - lvl) - Math.abs(b.level - lvl) || (a.level <= lvl ? -1 : 1) || a.id.localeCompare(b.id))[0];
  return pick(fresh) || pick(pool);
}

export interface TodayPlan {
  skill: SkillId;
  task: DrillTask;
  bench: boolean;
  /** why this one, in a line */
  why: string;
  /** today's main task is already done */
  done?: DrillAttempt;
  /** a 3-minute redo of the criterion you missed last time in this skill */
  redo?: { attempt: DrillAttempt; task: DrillTask; criterion: { id: string; text: string } };
}

/** what today's 15 minutes are: a due measurement first, then the skill that most needs it */
export function today(s: AppState, now = Date.now()): TodayPlan | null {
  const day = todayKey(now);
  const doneToday = s.train.attempts.find((a) => !a.retry && todayKey(a.at) === day);
  const skills = activeSkills(s);
  if (!skills.length) return null;
  let skill: SkillId;
  let bench = false;
  let why: string;
  if (doneToday) {
    skill = doneToday.skill;
    bench = !!doneToday.benchmark;
    why = L('خلصت مهمة اليوم', 'Today’s task is done');
  } else if (s.train.swap?.day === day && skills.includes(s.train.swap.skill)) {
    skill = s.train.swap.skill;
    why = L('اخترتها بدل مهمة اليوم', 'You picked it for today');
  } else {
    const due = skills.find((k) => benchDue(s, k, now));
    if (due) {
      skill = due;
      bench = true;
      why = L('صار لك ٤ أسابيع — هذا اختبار القياس الشهري', 'Four weeks on — this is the monthly measurement');
    } else {
      // never trained first, then the longest since you trained it
      skill = [...skills].sort((a, b) => lastTrained(s, a) - lastTrained(s, b))[0];
      why = lastTrained(s, skill) ? L(`أطول مهارة ما تدربت عليها`, 'The skill you trained longest ago') : L('ما جربتها للحين', 'You haven’t tried it yet');
    }
  }
  const task = doneToday ? taskById(s, doneToday.taskId) : bench ? benchTask(s, skill) : taskFor(s, skill, now);
  if (!task) return null;
  // the redo: last scored attempt in this skill, a criterion that got 0 (others' marks first)
  let redo: TodayPlan['redo'];
  const prev = s.train.attempts.filter((a) => a.skill === skill && !a.retry && todayKey(a.at) !== day).sort((a, b) => b.at - a.at)[0];
  if (prev && !s.train.attempts.some((a) => a.retry?.of === prev.id)) {
    const pt = taskById(s, prev.taskId);
    const marks = prev.peers[0]?.scores || prev.self;
    const miss = pt?.criteria.find((c) => marks[c.id] === 0);
    if (pt && miss) redo = { attempt: prev, task: pt, criterion: miss };
  }
  return { skill, task, bench, why, ...(doneToday ? { done: doneToday } : {}), ...(redo ? { redo } : {}) };
}

// ---------- إدارة النفس, from the app's own data ----------

/** the last 28 days: training days kept, and tasks finished by their day — numbers, not self-ratings */
export function selfData(s: AppState, now = Date.now()) {
  const today = todayKey(now);
  const from = addDays(today, -27);
  const days = s.train.setup?.days?.length ? s.train.setup.days : [0, 1, 2, 3, 4, 5, 6];
  let planned = 0;
  let kept = 0;
  const trained = new Set(s.train.attempts.filter((a) => !a.retry).map((a) => todayKey(a.at)));
  const start = s.train.setup?.createdAt ? todayKey(s.train.setup.createdAt) : from;
  for (let i = 0; i < 28; i++) {
    const d = addDays(from, i);
    if (d < start || d > today) continue;
    if (!days.includes(new Date(`${d}T12:00:00`).getDay())) continue;
    planned++;
    if (trained.has(d)) kept++;
  }
  const dueTasks = s.tasks.filter((t) => t.due && t.due >= from && t.due < today && t.status !== 'dropped');
  const onTime = dueTasks.filter((t) => t.status === 'done' && t.completedAt && todayKey(t.completedAt) <= t.due!).length;
  return {
    training: planned ? Math.round((kept / planned) * 100) : undefined,
    kept,
    planned,
    onTime: dueTasks.length ? Math.round((onTime / dueTasks.length) * 100) : undefined,
    tasks: dueTasks.length,
  };
}

// ---------- tasks from an AI, for your field ----------

/** the instruction to paste into any AI chat, so it returns tasks in our shape */
export function fieldPrompt(field: string, n = 6): string {
  return `أنت خبير في «${field}» وتصمم مهام تدريب قصيرة لطالب أو موظف مبتدئ في هذا المجال.
اكتب ${n} مهام حقيقية من واقع العمل في «${field}»، كل مهمة تنحل في ١٠ دقائق كتابةً.
أرجع JSON فقط داخل كتلة \`\`\`json بدون أي كلام قبلها أو بعدها، بهذا الشكل:

{ "app": "masar-drills", "tasks": [ {
  "title": "عنوان قصير",
  "level": 2,
  "situation": "الموقف في ٢-٥ أسطر: مين، وين، وش صار، بأرقام أو تفاصيل محددة",
  "ask": "المطلوب بالضبط والمخرج (مثلاً: اكتب ٥ خطوات…، احسب…، اكتب رد في ١٢٠ كلمة…)",
  "minutes": 10,
  "criteria": ["معيار محدد يُحكم عليه بنعم/جزئيًا/لا", "…"],
  "exemplar": "إجابة نموذجية كاملة كما يكتبها خبير",
  "why": ["ليش النموذج ممتاز — نقطة", "…"]
} ] }

القواعد:
- level من 1 (مبتدئ) إلى 3 (متوسط). وزّع المهام على المستويات.
- criteria من 4 إلى 6، كل معيار ملموس وقابل للتحقق (مثل «ذكر الوحدة مع كل رقم») مو عام (مثل «إجابة جيدة»).
- exemplar لازم يحقق كل المعايير.
- لا تخترع أرقام أو أنظمة على أنها حقائق رسمية؛ إذا احتجت أرقام خلّها جزء من الموقف.
- عربي، والمصطلحات التقنية بالإنجليزي بين قوسين.`;
}

/** read an AI's reply into tasks; anything malformed is dropped, not guessed */
export function readFieldTasks(text: string, id: () => string): DrillTask[] {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error(L('ما لقيت JSON في الرد — انسخ الرد كامل.', 'No JSON found — copy the whole reply.'));
  const raw = JSON.parse(text.slice(a, b + 1));
  const list = Array.isArray(raw?.tasks) ? raw.tasks : Array.isArray(raw) ? raw : [];
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '');
  const out: DrillTask[] = [];
  for (const t of list.slice(0, 30)) {
    const title = str(t?.title, 120);
    const situation = str(t?.situation, 1500);
    const ask = str(t?.ask, 600);
    const exemplar = str(t?.exemplar, 4000);
    const criteria = (Array.isArray(t?.criteria) ? t.criteria : []).map((c: unknown) => str(c, 200)).filter(Boolean).slice(0, 8);
    if (!title || !situation || !ask || !exemplar || criteria.length < 3) continue;
    out.push({
      id: `ai_${id()}`,
      skill: 'field',
      level: Math.min(3, Math.max(1, Math.round(Number(t.level) || 2))),
      title,
      situation,
      ask,
      minutes: Math.min(15, Math.max(5, Math.round(Number(t.minutes) || 10))),
      kind: 'text',
      criteria: criteria.map((c: string, i: number) => ({ id: `c${i + 1}`, text: c })),
      exemplar,
      why: (Array.isArray(t?.why) ? t.why : []).map((w: unknown) => str(w, 200)).filter(Boolean).slice(0, 5),
      source: 'ai',
    });
  }
  if (!out.length) throw new Error(L('الرد ما فيه مهام كاملة (موقف، مطلوب، ٣ معايير على الأقل، ونموذج).', 'No complete tasks in the reply (situation, ask, 3+ criteria, exemplar).'));
  return out;
}
