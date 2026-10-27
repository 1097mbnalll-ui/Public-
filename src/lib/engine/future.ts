// «مستقبلي»: your long goal, the stages to it, the skills and projects that build it, and the
// evidence that you got there. The adviser here is rules over your own data — no model, no network:
// every recommendation names the facts it came from and marks what's an estimate.

import type { AppState, FutureSkill, FutureStage, FutureVision, SkillCat, SkillStep, Task } from '../types';
import { addDays, diffDays, todayKey, weekday } from '../dates';
import { L } from '../i18n';

// ---------------- words ----------------

export const LEVELS = (): string[] => [L('ما بدأت', 'None'), L('مبتدئ', 'Beginner'), L('أساسيات', 'Basics'), L('متمكّن', 'Capable'), L('قوي', 'Strong')];

export const CATS: { v: SkillCat; t: [string, string] }[] = [
  { v: 'core', t: ['أساسيات التخصص', 'Core of your field'] },
  { v: 'tech', t: ['تقنية مكمّلة', 'Complementary tech'] },
  { v: 'pro', t: ['مهنية مشتركة', 'Professional'] },
  { v: 'lang', t: ['لغة وتواصل', 'Language & communication'] },
  { v: 'advanced', t: ['متقدمة لمسار', 'Advanced, for a track'] },
  { v: 'personal', t: ['شخصية', 'Personal'] },
];
export const catName = (c: SkillCat) => L(...CATS.find((x) => x.v === c)!.t);

export const STEPS: { v: SkillStep; t: [string, string]; d: [string, string] }[] = [
  { v: 'none', t: ['ما بدأت', 'Not started'], d: ['', ''] },
  { v: 'learning', t: ['اطّلعت', 'Studied'], d: ['قريت أو شفت المحتوى', 'Read or watched the material'] },
  { v: 'practicing', t: ['تدرّبت', 'Practised'], d: ['حليت تمارين بنفسي', 'Did exercises myself'] },
  { v: 'applied', t: ['طبّقت', 'Applied'], d: ['استخدمتها على مشكلة حقيقية أو مشروع', 'Used it on a real problem or project'] },
  { v: 'proven', t: ['أثبتّ', 'Proven'], d: ['عندي دليل يقدر غيري يشوفه', 'I have evidence others can see'] },
];
export const stepIndex = (s: SkillStep) => STEPS.findIndex((x) => x.v === s);

// ---------------- starting points ----------------

interface Starter {
  key: string;
  name: [string, string];
  cat: SkillCat;
  why: [string, string];
  hours: number;
  target: number;
  after?: string;
  for: Array<FutureVision['kind']>;
}

/**
 * general skills most fields ask for — a starting point to edit, not a verdict on your field. The
 * skills of your own major are yours to add: we don't pretend to know every field.
 */
export const STARTERS: Starter[] = [
  { key: 'english', name: ['الإنجليزية المهنية', 'Professional English'], cat: 'lang', why: ['أغلب المراجع والوظائف المتقدمة تطلبها', 'Most references and senior roles ask for it'], hours: 120, target: 3, for: ['student', 'career', 'skills'] },
  { key: 'writing', name: ['الكتابة الواضحة', 'Clear writing'], cat: 'lang', why: ['إيميلات وتقارير — تظهر في كل شغل', 'Emails and reports — part of every job'], hours: 40, target: 3, for: ['student', 'career', 'skills', 'project'] },
  { key: 'present', name: ['العرض والإلقاء', 'Presenting'], cat: 'lang', why: ['تعرض شغلك فيُعرف', 'Show your work so it gets seen'], hours: 30, target: 3, for: ['student', 'career', 'project'] },
  { key: 'excel', name: ['Excel / جداول البيانات', 'Excel / spreadsheets'], cat: 'tech', why: ['أداة يومية في أغلب المجالات', 'A daily tool in most fields'], hours: 40, target: 3, for: ['student', 'career', 'skills'] },
  { key: 'data', name: ['تحليل البيانات الأساسي', 'Basic data analysis'], cat: 'tech', why: ['قرارات مبنية على أرقام', 'Decisions from numbers'], hours: 60, target: 2, after: 'excel', for: ['student', 'career', 'skills'] },
  { key: 'pm', name: ['إدارة المشاريع', 'Project management'], cat: 'pro', why: ['تسلّم شغل كامل في وقته', 'Deliver whole pieces of work on time'], hours: 30, target: 2, for: ['student', 'career', 'project'] },
  { key: 'team', name: ['العمل مع فريق', 'Teamwork'], cat: 'pro', why: ['أغلب الشغل جماعي', 'Most work is done with others'], hours: 20, target: 3, for: ['student', 'career'] },
  { key: 'research', name: ['البحث والتعلم الذاتي', 'Research & self-learning'], cat: 'pro', why: ['تتعلم أي شي جديد بنفسك', 'Learn anything new on your own'], hours: 25, target: 3, for: ['student', 'career', 'skills', 'personal'] },
  { key: 'portfolio', name: ['ملف أعمال وحساب مهني', 'Portfolio & professional profile'], cat: 'pro', why: ['يخلي شغلك يُرى', 'Makes your work visible'], hours: 15, target: 3, after: 'writing', for: ['student', 'career', 'project'] },
  { key: 'time', name: ['إدارة الوقت والطاقة', 'Time & energy'], cat: 'personal', why: ['كل شي ثاني يعتمد عليها', 'Everything else depends on it'], hours: 15, target: 3, for: ['student', 'career', 'skills', 'project', 'personal'] },
];

/** stages to begin with — a student gets one per year; anyone else three phases over the time */
export function defaultStages(v: FutureVision): Omit<FutureStage, 'id' | 'createdAt'>[] {
  if (v.kind === 'student' && v.years) {
    const focus: [string, string][] = [
      ['تأسيس وعادات: أساسيات التخصص، الإنجليزية، ومهارة مكمّلة وحدة', 'Foundations & habits: your core, English, one complementary skill'],
      ['أول مشروع حقيقي وأول تجربة عملية صغيرة', 'A first real project and a first small work experience'],
      ['تدريب أو عمل جزئي، وتعمّق في مسار', 'An internship or part-time work, and a track to go deep in'],
      ['مشروع تخرج قوي، ملف أعمال، والتقديم على وظائف', 'A strong capstone, a portfolio, and applications'],
      ['تخصص أعمق وعلاقات في المجال', 'Deeper specialisation and people in the field'],
      ['جاهزية كاملة للانتقال', 'Ready for what comes next'],
    ];
    const out: Omit<FutureStage, 'id' | 'createdAt'>[] = [];
    // the years already behind you aren't planned; the current one starts today
    for (let y = v.year || 1; y <= v.years; y++) {
      const from = y === (v.year || 1) ? v.start : addDays(v.start, Math.round((y - (v.year || 1)) * 365.25));
      const to = y === v.years ? v.target : addDays(v.start, Math.round((y - (v.year || 1) + 1) * 365.25) - 1);
      const f = focus[Math.min(focus.length - 1, Math.max(0, y - 1 + (y === v.years && v.years < 4 ? 4 - v.years : 0)))];
      out.push({ title: L(`السنة ${y}`, `Year ${y}`), focus: L(...f), from, to });
    }
    return out;
  }
  const total = Math.max(30, diffDays(v.start, v.target));
  const cut = (k: number) => addDays(v.start, Math.round((total * k) / 3));
  return [
    { title: L('التأسيس', 'Foundations'), focus: L('الأساسيات والعادات', 'The basics and the habits'), from: v.start, to: addDays(cut(1), -1) },
    { title: L('البناء', 'Building'), focus: L('مشاريع وتطبيق', 'Projects and practice'), from: cut(1), to: addDays(cut(2), -1) },
    { title: L('الإثبات', 'Proving'), focus: L('نتائج تُعرض وتُقاس', 'Results others can see'), from: cut(2), to: v.target },
  ];
}

export const currentStage = (stages: FutureStage[], today: string) => [...stages].sort((a, b) => a.from.localeCompare(b.from)).find((x) => x.from <= today && today <= x.to);

// ---------------- the numbers ----------------

const weekStart = (day: string) => addDays(day, -weekday(day));

export const skillMinutes = (k: FutureSkill, from = '0000-00-00', to = '9999-99-99') => k.log.filter((x) => x.day >= from && x.day <= to).reduce((a, x) => a + x.min, 0);

/** hours still to go on a skill: your estimate if you gave one, else ~25 per level, minus time put in */
export function hoursLeft(k: FutureSkill): number {
  if (k.step === 'proven' || k.level >= k.target) return 0;
  const est = k.hours ?? Math.max(0, k.target - k.level) * 25;
  return Math.max(0, Math.round(est - skillMinutes(k) / 60));
}

/** your tasks sent from «مستقبلي» (they carry its label) */
const FUTURE_LABEL = 'مستقبلي';
export const isFutureTask = (t: Task) => t.label === FUTURE_LABEL;
export const futureLabel = () => FUTURE_LABEL;

export interface WeekNumbers {
  minutes: number;
  target: number;
  steps: number;
  tasks: number;
}

/** this week's practice time and steps done, against what you said you have */
export function thisWeek(s: AppState, now = Date.now()): WeekNumbers {
  const today = todayKey(now);
  const from = weekStart(today);
  const f = s.future;
  const minutes = f.skills.reduce((a, k) => a + skillMinutes(k, from, today), 0);
  const tasks = s.tasks.filter((t) => isFutureTask(t) && t.status === 'done' && t.completedAt && todayKey(t.completedAt) >= from).length;
  const steps = f.projects.reduce((a, p) => a + p.steps.filter((x) => x.done && !x.taskId).length, 0);
  return { minutes, target: (f.vision?.weeklyHours || 0) * 60, steps, tasks };
}

/** exams in the next week — growth work steps back then */
export function examsSoon(s: AppState, now = Date.now()) {
  const today = todayKey(now);
  const until = addDays(today, 7);
  return s.exams.filter((e) => e.score == null && !e.finished && e.date >= today && e.date <= until).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * does the plan fit the time? hours the skills still need (an estimate) against the hours you have
 * until the target date — with a 30% margin for weeks that don't go to plan.
 */
export function realism(s: AppState, now = Date.now()) {
  const v = s.future.vision;
  const today = todayKey(now);
  const need = s.future.skills.filter((k) => !k.paused).reduce((a, k) => a + hoursLeft(k), 0);
  const weeks = v ? Math.max(0, diffDays(today, v.target) / 7) : 0;
  const have = Math.round((v?.weeklyHours || 0) * weeks * 0.7);
  return { need, have, weeks: Math.round(weeks), ratio: have ? need / have : need ? Infinity : 0 };
}

/** how far along, from the levels you set (not a test score) */
export function progress(s: AppState) {
  const ks = s.future.skills.filter((k) => !k.paused);
  const want = ks.reduce((a, k) => a + Math.max(k.target, 1), 0);
  const got = ks.reduce((a, k) => a + Math.min(k.level, k.target), 0);
  const proven = ks.filter((k) => k.step === 'proven').length;
  return { pct: want ? got / want : 0, proven, total: ks.length };
}

/** how much of the time has gone */
export function timeGone(v: FutureVision | undefined, now = Date.now()) {
  if (!v) return 0;
  const all = Math.max(1, diffDays(v.start, v.target));
  return Math.min(1, Math.max(0, diffDays(v.start, todayKey(now)) / all));
}

/** spent on growth this year, against the budget (if you set one) */
export function budget(s: AppState, now = Date.now()) {
  const year = todayKey(now).slice(0, 4);
  const spent = s.expenses.filter((e) => e.growth && e.day.startsWith(year)).reduce((a, e) => a + e.amount, 0);
  return { spent: Math.round(spent), budget: s.future.vision?.budget };
}

// ---------------- the adviser ----------------

/** a reason: a fact from your data, or an estimate */
export interface Reason {
  text: string;
  kind: 'fact' | 'estimate';
}

export type ActionRef =
  | { type: 'setup' }
  | { type: 'skill'; id?: string }
  | { type: 'project'; id?: string; skillId?: string }
  | { type: 'win'; skillId?: string; projectId?: string }
  | { type: 'review'; kind: 'week' | 'month' }
  | { type: 'log'; id: string }
  | { type: 'starters' }
  | { type: 'tab'; tab: string };

export interface Rec {
  id: string;
  title: string;
  reasons: Reason[];
  action?: { label: string; ref: ActionRef };
  weight: number;
}

const F = (text: string): Reason => ({ text, kind: 'fact' });
const E = (text: string): Reason => ({ text, kind: 'estimate' });

const hrs = (m: number) => (m >= 60 ? L(`${Math.round((m / 60) * 10) / 10} ساعة`, `${Math.round((m / 60) * 10) / 10}h`) : L(`${m} دقيقة`, `${m} min`));

/** the skill to work on now, with why — prerequisites first, then priority, gap and neglect */
export function focusSkill(s: AppState, now = Date.now()): { k: FutureSkill; reasons: Reason[] } | null {
  const today = todayKey(now);
  const f = s.future;
  const stage = currentStage(f.stages, today);
  const by = new Map(f.skills.map((k) => [k.id, k]));
  const open = f.skills.filter((k) => !k.paused && k.step !== 'proven' && k.level < k.target);
  if (!open.length) return null;
  const blocked = (k: FutureSkill) => k.prereqs.map((id) => by.get(id)).filter((p): p is FutureSkill => !!p && p.level < 2 && p.step !== 'proven');
  const score = (k: FutureSkill) => {
    const last = k.log.length ? k.log.reduce((m, x) => (x.day > m ? x.day : m), '') : '';
    const idle = last ? diffDays(last, today) : 30;
    return (4 - k.priority) * 10 + (k.target - k.level) * 4 + (stage && k.stageId === stage.id ? 8 : 0) + Math.min(idle, 21) / 3 + (k.step !== 'none' ? 5 : 0);
  };
  const ranked = [...open].sort((a, b) => score(b) - score(a));
  for (const k of ranked) {
    const b = blocked(k);
    // a skill waiting on another sends you to the other first
    const pick = b.length ? b.sort((x, y) => score(y) - score(x))[0] : k;
    const reasons: Reason[] = [];
    if (b.length) reasons.push(F(L(`«${k.name}» تحتاج قبلها «${pick.name}» (مستواك فيها ${LEVELS()[pick.level]})`, `“${k.name}” needs “${pick.name}” first (you're at ${LEVELS()[pick.level]})`)));
    if (pick.priority === 1) reasons.push(F(L('حطيتها أولوية عالية', 'You set it as high priority')));
    reasons.push(F(L(`مستواك ${LEVELS()[pick.level]} والهدف ${LEVELS()[pick.target]}`, `You're at ${LEVELS()[pick.level]}, aiming for ${LEVELS()[pick.target]}`)));
    if (stage && pick.stageId === stage.id) reasons.push(F(L(`من مرحلتك الحالية: ${stage.title}`, `Part of your current stage: ${stage.title}`)));
    const last = pick.log.length ? pick.log.reduce((m, x) => (x.day > m ? x.day : m), '') : '';
    if (last && diffDays(last, today) >= 7) reasons.push(F(L(`ما تدرّبت عليها من ${diffDays(last, today)} يوم`, `Not practised for ${diffDays(last, today)} days`)));
    if (pick.why) reasons.push(F(L(`سببك: ${pick.why}`, `Your reason: ${pick.why}`)));
    reasons.push(E(L(`باقي لها تقريبًا ${hoursLeft(pick)} ساعة`, `About ${hoursLeft(pick)} hours to go`)));
    return { k: pick, reasons };
  }
  return null;
}

/** everything worth doing now, most important first — the first is «الخطوة التالية» */
export function recommendations(s: AppState, now = Date.now()): Rec[] {
  const f = s.future;
  const v = f.vision;
  const today = todayKey(now);
  const out: Rec[] = [];
  if (!v) return [{ id: 'setup', title: L('حدّد هدفك الكبير', 'Set your big goal'), reasons: [F(L('ما حددت هدف بعد — كل شي بعده يُبنى عليه', 'No goal yet — everything else is built on it'))], action: { label: L('ابدأ', 'Start'), ref: { type: 'setup' } }, weight: 100 }];

  const exams = examsSoon(s, now);
  const wk = thisWeek(s, now);
  const r = realism(s, now);
  const active = f.skills.filter((k) => !k.paused && k.step !== 'none' && k.step !== 'proven' && k.level < k.target);

  if (exams.length) {
    const c = s.courses.find((x) => x.id === exams[0].courseId);
    out.push({
      id: 'exams',
      title: L('أسبوع اختبارات: خفّف التطوير مؤقتًا', 'Exam week: ease off growth for now'),
      reasons: [F(L(`عندك ${exams.length === 1 ? 'اختبار' : `${exams.length} اختبارات`} خلال أسبوع، أقربها ${c?.name || ''} ${exams[0].date}`, `${exams.length} exam(s) within a week — the nearest is ${c?.name || ''} on ${exams[0].date}`)), E(L(`اكتفِ بـ ${Math.max(1, Math.round((v.weeklyHours || 0) / 3))} ساعة تطوير هالأسبوع، وارجع لخطتك بعدها`, `Keep growth to ${Math.max(1, Math.round((v.weeklyHours || 0) / 3))}h this week, then back to plan`))],
      action: { label: L('افتح الدراسة', 'Open Study'), ref: { type: 'tab', tab: 'study' } },
      weight: 90,
    });
  }

  if (!f.skills.length) out.push({ id: 'starters', title: L('اختر المهارات اللي تبنيها', 'Pick the skills you will build'), reasons: [F(L('ما فيه مهارات في خطتك', 'Your plan has no skills yet')), E(L('عندي قائمة عامة تبدأ منها، وتضيف مهارات تخصصك بنفسك', 'There is a general list to start from; add your own field’s skills'))], action: { label: L('اختر', 'Pick'), ref: { type: 'starters' } }, weight: 80 });

  if (active.length > 3)
    out.push({ id: 'focus', title: L(`ركّز: ${active.length} مهارات شغّالة بنفس الوقت`, `Focus: ${active.length} skills going at once`), reasons: [F(L(`${active.map((k) => k.name).join('، ')}`, active.map((k) => k.name).join(', '))), E(L('٣ بالكثير تتقدم فيها فعلًا — أوقف الأقل أولوية مؤقتًا', 'Three at most really move — pause the lowest priority for now'))], action: { label: L('رتّب المهارات', 'Sort skills'), ref: { type: 'tab', tab: 'plan' } }, weight: 70 });

  const fk = focusSkill(s, now);
  if (fk && !exams.length) out.push({ id: `skill:${fk.k.id}`, title: L(`اشتغل على: ${fk.k.name}`, `Work on: ${fk.k.name}`), reasons: fk.reasons, action: { label: L('سجّل وقت', 'Log time'), ref: { type: 'log', id: fk.k.id } }, weight: 65 });

  // learned or practised, never used: a project beats another course
  const unused = f.skills.find((k) => !k.paused && (k.step === 'practicing' || (k.step === 'learning' && k.level >= 2)) && !f.projects.some((p) => p.status !== 'done' && p.skillIds.includes(k.id)));
  if (unused)
    out.push({ id: `apply:${unused.id}`, title: L(`طبّق «${unused.name}» في مشروع صغير`, `Use “${unused.name}” in a small project`), reasons: [F(L(`وصلت «${STEPS[stepIndex(unused.step)].t[0]}» وما فيه مشروع يستخدمها`, `You're at “${STEPS[stepIndex(unused.step)].t[1]}” and no project uses it`)), E(L('التطبيق يثبّت المهارة ويعطيك دليل — أنفع من دورة جديدة', 'Applying makes it stick and gives you evidence — worth more than another course'))], action: { label: L('مشروع جديد', 'New project'), ref: { type: 'project', skillId: unused.id } }, weight: 60 });

  // projects that stopped moving
  for (const p of f.projects.filter((x) => x.status === 'active')) {
    const idle = diffDays(todayKey(p.updatedAt || p.createdAt), today);
    const next = p.steps.find((x) => !x.done && !(x.taskId && s.tasks.find((t) => t.id === x.taskId)?.status === 'done'));
    if (idle >= 10)
      out.push({ id: `stall:${p.id}`, title: L(`حرّك «${p.title}»`, `Move “${p.title}” forward`), reasons: [F(L(`ما تحرّك من ${idle} يوم`, `No change for ${idle} days`)), ...(next ? [F(L(`الخطوة الجاية: ${next.title}`, `Next step: ${next.title}`))] : [E(L('ما له خطوات — قسّمه لخطوات صغيرة', 'No steps — split it into small ones'))])], action: { label: L('افتح المشروع', 'Open project'), ref: { type: 'project', id: p.id } }, weight: 55 });
    if (p.due && p.due < today) out.push({ id: `late:${p.id}`, title: L(`«${p.title}» فات موعده`, `“${p.title}” is past its date`), reasons: [F(L(`موعده ${p.due}`, `It was due ${p.due}`)), E(L('مدّ الموعد أو صغّر المشروع — بدون جلد ذات', 'Move the date or shrink it — no guilt'))], action: { label: L('عدّله', 'Edit it'), ref: { type: 'project', id: p.id } }, weight: 50 });
  }

  // realism
  if (r.ratio > 1.15 && r.have > 0)
    out.push({ id: 'realism', title: L('خطتك أكبر من وقتك', 'Your plan is bigger than your time'), reasons: [E(L(`المهارات تحتاج تقريبًا ${r.need} ساعة`, `The skills need about ${r.need}h`)), E(L(`وعندك تقريبًا ${r.have} ساعة لين ${v.target} (${v.weeklyHours} س/أسبوع، مع هامش ٣٠٪)`, `You have about ${r.have}h until ${v.target} (${v.weeklyHours}h/week, 30% margin)`)), E(L('قلّل المهارات الأقل أولوية، أو نزّل أهدافها مستوى، أو زِد ساعاتك', 'Drop low-priority skills, lower their targets a level, or add hours'))], action: { label: L('جرّب سيناريو', 'Try a scenario'), ref: { type: 'tab', tab: 'plan' } }, weight: 58 });

  // the week, kindly
  const dow = weekday(today);
  if (!exams.length && wk.target && dow >= 3 && wk.minutes < wk.target * 0.3)
    out.push({ id: 'week', title: L('أسبوعك خفيف — ابدأ بـ ٣٠ دقيقة', 'A light week — start with 30 minutes'), reasons: [F(L(`سجّلت ${hrs(wk.minutes)} من ${hrs(wk.target)} هالأسبوع`, `Logged ${hrs(wk.minutes)} of ${hrs(wk.target)} this week`)), E(L('جلسة قصيرة اليوم أسهل من تعويض كبير آخر الأسبوع', 'A short session today beats a big catch-up later'))], action: fk ? { label: L('سجّل وقت', 'Log time'), ref: { type: 'log', id: fk.k.id } } : undefined, weight: 52 });

  // evidence
  const proofless = f.skills.find((k) => k.step === 'applied' && !k.evidence);
  if (proofless) out.push({ id: `prove:${proofless.id}`, title: L(`ثبّت «${proofless.name}» بدليل`, `Back “${proofless.name}” with evidence`), reasons: [F(L('طبّقتها، وما فيه دليل مسجّل', 'Applied, with no evidence recorded')), E(L('رابط مشروع أو شهادة أو نتيجة — هذا اللي يشوفه غيرك', 'A project link, certificate or result — what others can see'))], action: { label: L('سجّل إنجاز', 'Record a win'), ref: { type: 'win', skillId: proofless.id } }, weight: 45 });
  const doneNoWin = f.projects.find((p) => p.status === 'done' && !f.wins.some((w) => w.title === p.title));
  if (doneNoWin) out.push({ id: `pwin:${doneNoWin.id}`, title: L(`سجّل «${doneNoWin.title}» في إنجازاتك`, `Add “${doneNoWin.title}” to your wins`), reasons: [F(L('مشروع مكتمل وما هو في سجل الإنجازات', 'A finished project not in your wins'))], action: { label: L('سجّله', 'Record'), ref: { type: 'win', projectId: doneNoWin.id } }, weight: 44 });

  // reviews
  const lastWeek = f.reviews.filter((x) => x.kind === 'week').sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!lastWeek || diffDays(todayKey(lastWeek.createdAt), today) >= 7)
    out.push({ id: 'review', title: L('مراجعة الأسبوع (دقيقتين)', 'Weekly review (two minutes)'), reasons: [F(lastWeek ? L(`آخر مراجعة قبل ${diffDays(todayKey(lastWeek.createdAt), today)} يوم`, `Last review ${diffDays(todayKey(lastWeek.createdAt), today)} days ago`) : L('ما سويت مراجعة بعد', 'No review yet'))], action: { label: L('راجع', 'Review'), ref: { type: 'review', kind: 'week' } }, weight: 40 });
  const lastMonth = f.reviews.filter((x) => x.kind === 'month').sort((a, b) => b.createdAt - a.createdAt)[0];
  if (f.skills.length && (!lastMonth || diffDays(todayKey(lastMonth.createdAt), today) >= 30) && new Date(now).getDate() >= 25)
    out.push({ id: 'month', title: L('مراجعة الشهر', 'Monthly review'), reasons: [F(L('آخر الشهر: وقت تعدّل مستوياتك وخطتك', 'Month end: time to update levels and plan'))], action: { label: L('راجع', 'Review'), ref: { type: 'review', kind: 'month' } }, weight: 38 });

  // the gap: a high-priority skill not started
  const gap = f.skills.find((k) => !k.paused && k.priority === 1 && k.step === 'none' && (!fk || fk.k.id !== k.id));
  if (gap) out.push({ id: `gap:${gap.id}`, title: L(`ابدأ «${gap.name}»`, `Start “${gap.name}”`), reasons: [F(L('أولوية عالية وما بدأتها', 'High priority, not started'))], action: { label: L('افتحها', 'Open'), ref: { type: 'skill', id: gap.id } }, weight: 35 });

  return out.sort((a, b) => b.weight - a.weight);
}

// ---------------- questions the adviser answers ----------------

export type Question = 'start' | 'skill' | 'realistic' | 'late' | 'project' | 'gaps' | 'change';

export const QUESTIONS: { q: Question; t: [string, string] }[] = [
  { q: 'start', t: ['وش أفضل خطوة أبدأ فيها الحين؟', 'What should I start with now?'] },
  { q: 'skill', t: ['وش أهم مهارة لهدفي؟', 'Which skill matters most for my goal?'] },
  { q: 'realistic', t: ['هل خطتي واقعية؟', 'Is my plan realistic?'] },
  { q: 'late', t: ['تأخرت، وش أسوي؟', 'I fell behind — now what?'] },
  { q: 'project', t: ['أركّز على مشروع ولا دورة جديدة؟', 'A project or another course?'] },
  { q: 'gaps', t: ['وش الفجوات اللي لازم أسدّها؟', 'Which gaps should I close?'] },
  { q: 'change', t: ['تغيّر وقتي أو هدفي، كيف أعدّل؟', 'My time or goal changed — how do I adjust?'] },
];

export interface Answer {
  title: string;
  reasons: Reason[];
  action?: { label: string; ref: ActionRef };
}

export interface Adviser {
  id: string;
  /** shown to the user: what is answering */
  label: () => string;
  answer: (q: Question, s: AppState, now: number) => Answer;
}

/**
 * the adviser that ships: rules over your data, no network. Another adviser (a real model, when
 * one is available) can implement the same `Adviser` and be offered beside it — this one stays.
 */
export const localAdviser: Adviser = {
  id: 'local',
  label: () => L('قواعد محلية من بياناتك — مو ذكاء اصطناعي', 'Local rules over your data — not AI'),
  answer(q, s, now) {
    const recs = recommendations(s, now);
    const f = s.future;
    const r = realism(s, now);
    const wk = thisWeek(s, now);
    switch (q) {
      case 'start': {
        const top = recs[0];
        return top ? { title: top.title, reasons: top.reasons, action: top.action } : { title: L('كل شي ماشي — كمّل', 'All on track — keep going'), reasons: [] };
      }
      case 'skill': {
        const fk = focusSkill(s, now);
        if (!fk) return { title: f.skills.length ? L('كل مهاراتك وصلت هدفها 👏', 'Every skill reached its target 👏') : L('ما فيه مهارات بعد', 'No skills yet'), reasons: [], action: { label: L('أضف مهارة', 'Add a skill'), ref: f.skills.length ? { type: 'skill' } : { type: 'starters' } } };
        return { title: fk.k.name, reasons: [...fk.reasons, E(L('الترتيب من: أولويتك، الفجوة، المتطلبات السابقة، المرحلة الحالية، والإهمال', 'Ranked by: your priority, the gap, prerequisites, current stage, neglect'))], action: { label: L('افتحها', 'Open it'), ref: { type: 'skill', id: fk.k.id } } };
      }
      case 'realistic': {
        if (!f.vision) return { title: L('حدّد هدفك أول', 'Set your goal first'), reasons: [], action: { label: L('ابدأ', 'Start'), ref: { type: 'setup' } } };
        const ok = r.ratio <= 1;
        return {
          title: !f.skills.length ? L('ما أقدر أحكم بدون مهارات', 'No skills to judge yet') : ok ? L('نعم، تتسع في وقتك', 'Yes, it fits your time') : r.ratio <= 1.3 ? L('على الحد — أي تأخير يضغطها', 'Borderline — any slip squeezes it') : L('لا، أكبر من وقتك', 'No, it is bigger than your time'),
          reasons: [E(L(`تحتاج تقريبًا ${r.need} ساعة`, `Needs about ${r.need}h`)), E(L(`عندك تقريبًا ${r.have} ساعة خلال ${r.weeks} أسبوع (مع هامش ٣٠٪)`, `You have about ${r.have}h over ${r.weeks} weeks (30% margin)`)), F(L(`هالأسبوع سجّلت ${hrs(wk.minutes)} من ${hrs(wk.target)}`, `This week: ${hrs(wk.minutes)} of ${hrs(wk.target)}`)), E(L('الساعات تقديرية: ٢٥ ساعة لكل مستوى إذا ما حددت غيرها', 'Hours are estimates: 25h per level unless you set your own'))],
          action: ok ? undefined : { label: L('جرّب سيناريو', 'Try a scenario'), ref: { type: 'tab', tab: 'plan' } },
        };
      }
      case 'late': {
        const lowest = [...f.skills].filter((k) => !k.paused && k.step !== 'proven').sort((a, b) => b.priority - a.priority)[0];
        return {
          title: L('التأخير جزء طبيعي — عدّل، لا تبدأ من الصفر', 'Slipping is normal — adjust, don’t restart'),
          reasons: [
            F(L(`هالأسبوع: ${hrs(wk.minutes)} من ${hrs(wk.target)}`, `This week: ${hrs(wk.minutes)} of ${hrs(wk.target)}`)),
            E(L('١) ارجع بجلسة ٣٠ دقيقة اليوم على أهم مهارة', '1) Come back with 30 minutes today on the top skill')),
            E(L('٢) لا تعوّض كل اللي فات — كمّل من هنا', '2) Don’t make up everything — continue from here')),
            ...(lowest ? [E(L(`٣) إذا تكرر: أوقف «${lowest.name}» مؤقتًا (أقل أولوية)`, `3) If it repeats: pause “${lowest.name}” (lowest priority)`))] : []),
            ...(r.ratio > 1 ? [E(L('٤) خطتك أكبر من وقتك أصلًا — صغّرها', '4) The plan is bigger than your time anyway — shrink it'))] : []),
          ],
          action: { label: L('راجع الأسبوع', 'Review the week'), ref: { type: 'review', kind: 'week' } },
        };
      }
      case 'project': {
        const learned = f.skills.filter((k) => k.step === 'learning' || k.step === 'practicing');
        const projs = f.projects.filter((p) => p.status === 'active');
        if (learned.length && !projs.length) return { title: L('مشروع', 'A project'), reasons: [F(L(`عندك ${learned.length} مهارات تعلمتها وما طبّقتها: ${learned.map((k) => k.name).join('، ')}`, `${learned.length} skills learned, not applied: ${learned.map((k) => k.name).join(', ')}`)), F(L('وما عندك مشروع شغّال', 'And no active project')), E(L('دورة ثانية تزيد المعرفة، المشروع يحوّلها لدليل', 'Another course adds knowledge; a project turns it into evidence'))], action: { label: L('مشروع جديد', 'New project'), ref: { type: 'project', skillId: learned[0].id } } };
        if (projs.length >= 2) return { title: L('كمّل مشاريعك أول', 'Finish your projects first'), reasons: [F(L(`عندك ${projs.length} مشاريع شغّالة`, `${projs.length} active projects`)), E(L('مشروع مكتمل أقوى من ثلاثة نص', 'One finished beats three halfway'))] };
        return { title: L('دورة قصيرة، ثم مشروع مباشرة', 'A short course, then straight into a project'), reasons: [F(L('ما فيه مهارة متعلّمة تنتظر التطبيق', 'No learned skill is waiting to be applied')), E(L('تعلّم الأساسيات بسرعة، وطبّق قبل ما تكمل الدورة', 'Learn the basics fast, apply before the course ends'))] };
      }
      case 'gaps': {
        const gaps = f.skills.filter((k) => !k.paused && k.level < k.target).sort((a, b) => a.priority - b.priority || b.target - b.level - (a.target - a.level)).slice(0, 4);
        const market = analyzePostings(s);
        const missing = market.rows.filter((x) => !x.have).slice(0, 3);
        return {
          title: gaps.length || missing.length ? L('فجواتك حسب خطتك', 'Your gaps, from your plan') : L('ما فيه فجوات مسجلة', 'No gaps recorded'),
          reasons: [
            ...gaps.map((k) => F(L(`${k.name}: ${LEVELS()[k.level]} ← ${LEVELS()[k.target]}`, `${k.name}: ${LEVELS()[k.level]} → ${LEVELS()[k.target]}`))),
            ...missing.map((m) => F(L(`«${m.term}» تكرر في ${m.count} من ${market.total} إعلان، وما هو في مهاراتك`, `“${m.term}” in ${m.count} of ${market.total} ads, not in your skills`))),
            ...(market.total ? [E(L('الإعلانات عيّنة جمعتها أنت، مو السوق كله', 'The ads are your sample, not the whole market'))] : [E(L('ألصق إعلانات وظائف حقيقية في «السوق» وأقارنها بمهاراتك', 'Paste real job ads under “Market” to compare'))]),
          ],
          action: { label: L('افتح السوق', 'Open Market'), ref: { type: 'tab', tab: 'market' } },
        };
      }
      case 'change':
        return {
          title: L('عدّل الأساس، والباقي يتبعه', 'Change the base; the rest follows'),
          reasons: [
            E(L('وقتك تغيّر: عدّل «ساعاتك بالأسبوع» في هدفك، وشوف «هل خطتي واقعية؟»', 'Time changed: edit weekly hours in your goal, then check “Is my plan realistic?”')),
            E(L('هدفك تغيّر: المهارات تبقى — عدّل أولوياتها وأهدافها، وأوقف اللي ما تخدمه', 'Goal changed: keep skills — re-prioritise, pause what no longer serves it')),
            E(L('المراحل: أخّر المرحلة وشوف وش يتأثر بعدها قبل ما تحفظ', 'Stages: move one and see what it affects before saving')),
            F(L('ما ينحذف شي من إنجازاتك — هي لك أي كان هدفك', 'Nothing is removed from your wins — they’re yours whatever the goal')),
          ],
          action: { label: L('عدّل هدفي', 'Edit my goal'), ref: { type: 'setup' } },
        };
    }
  },
};

// ---------------- what-if ----------------

/**
 * a scenario: with this many hours a week, working the skills in priority order (prerequisites
 * first), when would each be done — and what fits before the target date. An estimate.
 */
export function simulate(s: AppState, weeklyHours: number, mode: 'all' | 'top', now = Date.now()) {
  const v = s.future.vision;
  const today = todayKey(now);
  const by = new Map(s.future.skills.map((k) => [k.id, k]));
  const list = s.future.skills.filter((k) => !k.paused && hoursLeft(k) > 0 && (mode === 'all' || k.priority === 1));
  const order: FutureSkill[] = [];
  const add = (k: FutureSkill, seen = new Set<string>()) => {
    if (order.includes(k) || seen.has(k.id)) return;
    seen.add(k.id);
    for (const p of k.prereqs.map((id) => by.get(id)).filter((x): x is FutureSkill => !!x && list.includes(x))) add(p, seen);
    order.push(k);
  };
  [...list].sort((a, b) => a.priority - b.priority).forEach((k) => add(k));
  const perWeek = Math.max(0.5, weeklyHours * 0.7);
  let h = 0;
  const rows = order.map((k) => {
    h += hoursLeft(k);
    const done = addDays(today, Math.ceil((h / perWeek) * 7));
    return { k, done, fits: !!v && done <= v.target };
  });
  return { rows, fits: rows.filter((r) => r.fits).length, total: rows.length };
}

// ---------------- the market, from ads you pasted ----------------

/** requirement words to look for, in Arabic and English (matched case-insensitively) */
const TERMS: { term: string; any: string[] }[] = [
  { term: 'English', any: ['english', 'إنجليزي', 'انجليزي', 'الإنجليزية', 'الانجليزية'] },
  { term: 'Excel', any: ['excel', 'اكسل', 'إكسل'] },
  { term: 'SQL', any: ['sql'] },
  { term: 'Python', any: ['python', 'بايثون'] },
  { term: 'Power BI', any: ['power bi', 'powerbi'] },
  { term: 'Tableau', any: ['tableau'] },
  { term: 'تحليل البيانات', any: ['data analysis', 'analytics', 'تحليل البيانات', 'تحليل بيانات'] },
  { term: 'التواصل', any: ['communication', 'التواصل', 'مهارات الاتصال'] },
  { term: 'العمل الجماعي', any: ['teamwork', 'team player', 'العمل الجماعي', 'العمل ضمن فريق'] },
  { term: 'العرض والإلقاء', any: ['presentation', 'العرض', 'الإلقاء'] },
  { term: 'الكتابة', any: ['writing', 'report writing', 'كتابة التقارير', 'الكتابة'] },
  { term: 'إدارة المشاريع', any: ['project management', 'pmp', 'إدارة المشاريع'] },
  { term: 'حل المشكلات', any: ['problem solving', 'problem-solving', 'حل المشكلات', 'حل المشاكل'] },
  { term: 'التفكير النقدي', any: ['critical thinking', 'التفكير النقدي'] },
  { term: 'القيادة', any: ['leadership', 'القيادة'] },
  { term: 'إدارة الوقت', any: ['time management', 'إدارة الوقت'] },
  { term: 'Microsoft Office', any: ['microsoft office', 'ms office', 'مايكروسوفت أوفيس'] },
  { term: 'البرمجة', any: ['programming', 'coding', 'البرمجة'] },
  { term: 'JavaScript', any: ['javascript', 'typescript', 'react'] },
  { term: 'التصميم', any: ['figma', 'photoshop', 'illustrator', 'التصميم'] },
  { term: 'المحاسبة', any: ['accounting', 'ifrs', 'المحاسبة'] },
  { term: 'خدمة العملاء', any: ['customer service', 'خدمة العملاء'] },
  { term: 'المبيعات', any: ['sales', 'المبيعات'] },
  { term: 'التسويق الرقمي', any: ['digital marketing', 'seo', 'التسويق الرقمي'] },
  { term: 'السلامة', any: ['safety', 'hse', 'السلامة'] },
  { term: 'شهادة مهنية', any: ['certification', 'certified', 'شهادة مهنية', 'رخصة مهنية'] },
  { term: 'خبرة سابقة', any: ['years of experience', 'experience required', 'سنوات خبرة', 'خبرة لا تقل'] },
  { term: 'تدريب تعاوني', any: ['internship', 'co-op', 'coop', 'تدريب تعاوني', 'تدريب صيفي'] },
];

const norm = (x: string) => x.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

/** what repeats across the ads you pasted, and whether a skill of yours covers it */
export function analyzePostings(s: AppState) {
  const ads = s.future.postings;
  const skills = s.future.skills;
  const counts = new Map<string, number>();
  for (const ad of ads) {
    const text = norm(`${ad.title} ${ad.text}`);
    for (const t of TERMS) if (t.any.some((w) => text.includes(norm(w)))) counts.set(t.term, (counts.get(t.term) || 0) + 1);
    // your own skills count too: words you track may be in the ads
    for (const k of skills) {
      if (TERMS.some((t) => norm(t.term) === norm(k.name))) continue;
      const words = norm(k.name).split(/[\s/،,]+/).filter((w) => w.length > 3);
      if (words.length && words.every((w) => text.includes(w))) counts.set(k.name, (counts.get(k.name) || 0) + 1);
    }
  }
  const has = (term: string) => {
    const t = TERMS.find((x) => x.term === term);
    const keys = [term, ...(t?.any || [])].map(norm);
    return skills.find((k) => norm(k.name).length >= 3 && keys.some((w) => norm(k.name).includes(w) || w.includes(norm(k.name))));
  };
  const rows = [...counts.entries()].map(([term, count]) => ({ term, count, have: has(term) })).sort((a, b) => b.count - a.count);
  return { rows, total: ads.length };
}
