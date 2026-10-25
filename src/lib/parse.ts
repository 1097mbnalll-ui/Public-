// Quick-add parser: understands short Arabic phrases like
// "اطبع ملف العقد بكرة الساعة 10 ص !عاجل #عمل 30د"

import type { Area, Priority, Template } from './types';
import { addDays, dateKey, todayKey, weekday } from './dates';
import { normalize, toWestern } from './text';

export interface Parsed {
  title: string;
  area?: Area;
  areaGuessed?: boolean;
  priority?: Priority;
  due?: string;
  dueTime?: string;
  estimate?: number;
  hard?: boolean;
  template?: Template;
  templateRest?: string;
}

// Arabic letters aren't \w, so build explicit word boundaries
const B = '(?:^|\\s)';
const E = '(?=\\s|$|[،,.!؟?])';

const DAYS: [RegExp, number][] = [
  [/الاحد|الأحد/, 0],
  [/الاثنين|الإثنين|الاثنين|الأثنين/, 1],
  [/الثلاثاء|الثلاثا|الثلاثا/, 2],
  [/الاربعاء|الأربعاء|الاربعا|الأربعا/, 3],
  [/الخميس/, 4],
  [/الجمعة|الجمعه/, 5],
  [/السبت/, 6],
];


export function parseQuick(input: string, templates: Template[] = [], now = Date.now()): Parsed {
  let s = ' ' + toWestern(input).replace(/٫/g, '.') + ' ';
  const out: Parsed = { title: '' };
  const today = todayKey(now);
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = s.match(re);
    if (m) {
      fn(m);
      s = s.replace(m[0], ' ');
      return true;
    }
    return false;
  };

  // area tags
  take(new RegExp(`${B}#(عمل|دراسة|دراسه|جامعة|جامعه|شخصي|حياة|حياه|بيت|work|study|uni|life|home|personal)${E}`, 'i'), (m) => {
    const t = m[1].toLowerCase();
    out.area = /عمل|work/.test(t) ? 'work' : /دراس|جامع|study|uni/.test(t) ? 'study' : 'life';
  });

  // priority: «عاجل» anywhere. «مهم/مهمة» is also a noun ("task"), so it only counts with "!" or as the
  // last word (checked below, after dates and durations are taken out)
  take(new RegExp(`${B}(!!+|!?عاجل(?:ة|ه)?|ضروري(?:ة|ه)?|!?urgent|asap)${E}`, 'i'), () => (out.priority = 3)) ||
    take(new RegExp(`${B}(!|!مهم(?:ة|ه)?|!?important)${E}`, 'i'), () => (out.priority = 2));
  // «لازم» alone is everyday speech ("لازم أشتري…"), so only explicit phrases mark a hard deadline
  take(new RegExp(`${B}(!لازم|موعد نهائي|ما يتأجل|مايتأجل|لا يتأجل|ما ينأجل)${E}`), () => (out.hard = true));

  // durations (before times so "ساعتين" isn't a clock)
  take(new RegExp(`${B}(\\d+(?:\\.\\d+)?)\\s*(د|دق|دقيقة|دقيقه|دقايق|دقائق)${E}`), (m) => (out.estimate = Math.round(+m[1])));
  take(new RegExp(`${B}(\\d+(?:\\.\\d+)?)\\s*(س|ساعة|ساعه|ساعات)${E}`), (m) => (out.estimate = Math.round(+m[1] * 60)));
  take(new RegExp(`${B}(ساعتين|ساعتان)${E}`), () => (out.estimate = 120));
  take(new RegExp(`${B}(ساعة ونص|ساعه ونص|ساعة ونصف|ساعه ونصف)${E}`), () => (out.estimate = 90));
  take(new RegExp(`${B}(نص ساعة|نص ساعه|نصف ساعة|نصف ساعه)${E}`), () => (out.estimate = 30));
  take(new RegExp(`${B}(ربع ساعة|ربع ساعه)${E}`), () => (out.estimate = 15));

  // dates
  const dateHit =
    take(new RegExp(`${B}(بعد بكرة|بعد بكره|بعد غد|بعد الغد)${E}`), () => (out.due = addDays(today, 2))) ||
    take(new RegExp(`${B}(بكرة|بكره|غدا|غدًا|غداً|الغد|tomorrow)${E}`, 'i'), () => (out.due = addDays(today, 1))) ||
    take(new RegExp(`${B}(اليوم|الليلة|الليله|الحين|today|tonight)${E}`, 'i'), () => (out.due = today)) ||
    take(new RegExp(`${B}بعد\\s+(\\d+)\\s*(يوم|ايام|أيام)${E}`), (m) => (out.due = addDays(today, +m[1]))) ||
    take(new RegExp(`${B}بعد\\s+(يومين)${E}`), () => (out.due = addDays(today, 2))) ||
    take(new RegExp(`${B}بعد\\s+(اسبوع|أسبوع)${E}`), () => (out.due = addDays(today, 7))) ||
    take(new RegExp(`${B}(\\d{1,2})[/\\-](\\d{1,2})(?:[/\\-](\\d{2,4}))?${E}`), (m) => {
      const d = new Date(now);
      let y = m[3] ? +m[3] : d.getFullYear();
      if (y < 100) y += 2000;
      let k = dateKey(new Date(y, +m[2] - 1, +m[1]));
      if (!m[3] && k < today) k = dateKey(new Date(y + 1, +m[2] - 1, +m[1]));
      out.due = k;
    });
  if (!dateHit) {
    for (const [re, wd] of DAYS) {
      const hit = take(new RegExp(`${B}(?:يوم\\s+)?(?:${re.source})${E}`), () => {
        let diff = (wd - weekday(today) + 7) % 7;
        if (diff === 0) diff = 7;
        out.due = addDays(today, diff);
      });
      if (hit) break;
    }
  }

  // clock time
  take(
    new RegExp(`${B}(?:الساعة|الساعه|ساعة|الساعة)?\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(ص|م|صباحا|صباحًا|صباحاً|الصبح|مساء|مساءً|مساءا|العصر|الظهر|الليل|بالليل)${E}`),
    (m) => (out.dueTime = clock(+m[1], m[2] ? +m[2] : 0, m[3])),
  ) ||
    take(new RegExp(`${B}(?:الساعة|الساعه)\\s*(\\d{1,2})(?::(\\d{2}))?${E}`), (m) => (out.dueTime = clock(+m[1], m[2] ? +m[2] : 0))) ||
    take(new RegExp(`${B}(\\d{1,2}):(\\d{2})${E}`), (m) => (out.dueTime = clock(+m[1], +m[2], undefined, true)));
  if (out.dueTime && !out.due) out.due = today;
  if (out.priority == null) take(new RegExp(`${B}مهم(?:ة|ه)?\\s*$`), () => (out.priority = 2));

  out.title = s.replace(/\s+/g, ' ').trim();

  // area guess from keywords when not tagged
  if (!out.area) {
    const n = normalize(out.title);
    if (/(اختبار|امتحان|مذاكره|مذاكرة|كويز|واجب|محاضره|محاضرة|مشروع التخرج|بحث|تكليف|مقرر|دكتور|جامعه)/.test(n)) {
      out.area = 'study';
      out.areaGuessed = true;
    } else if (/(شركه|شركة|فاتوره|فاتورة|مورد|طباعه|طباعة|تصديق|الغرفه التجاريه|مشتريات|عرض سعر|عقد|تحويل|معامله|ايميل|العميل)/.test(n)) {
      out.area = 'work';
      out.areaGuessed = true;
    }
  }

  // reusable procedure match: "معاملة مؤسسة الأمل" → template "معاملة"
  const nt = normalize(out.title);
  for (const t of [...templates].sort((a, b) => b.name.length - a.name.length)) {
    const nn = normalize(t.name);
    if (nn && (nt === nn || nt.startsWith(nn + ' '))) {
      out.template = t;
      out.templateRest = out.title.split(/\s+/).slice(t.name.trim().split(/\s+/).length).join(' ');
      break;
    }
  }
  return out;
}

function clock(h: number, m: number, mark?: string, is24 = false): string {
  if (mark) {
    if (/^ص|صباح|الصبح/.test(mark)) {
      if (h === 12) h = 0;
    } else if (/الظهر/.test(mark)) {
      if (h <= 5) h += 12;
    } else if (h < 12) h += 12; // م، مساء، العصر، الليل
  } else if (!is24 && h >= 1 && h <= 6) {
    h += 12; // "الساعة 5" most likely means 5 PM
  }
  h = Math.min(23, Math.max(0, h));
  return `${String(h).padStart(2, '0')}:${String(Math.min(59, m)).padStart(2, '0')}`;
}


// ---------- step lists ----------
// "طباعة الملف، حفظ في ملف مشتريات، إرسال إلى نجيب" → 3 typed steps with targets

import type { StepKind, TemplateStep } from './types';

const KIND_WORDS: [StepKind, RegExp][] = [
  ['reply', /(انتظار|انتظر|ننتظر|رد من|الرد|يرد|اعتماد|موافق)/],
  ['followup', /(متابع|تابع|ذكر|ذكّر|اسال عن|اسأل عن)/],
  ['certify', /(تصديق|صدق|توثيق|وثق|ختم|اختم)/],
  ['print', /(طباع|اطبع|طبع|print)/],
  ['send', /(ارسال|ارسل|بعث|ابعث|رفع|ارفع|شارك|مشارك)/],
  ['file', /(حفظ|احفظ|ارشف|أرشف|ارشفه|تخزين|خزن|ملف)/],
];

/** the person / group / place after "إلى / في / من / عند / مع / لـ" (kept exactly as written) */
function targetOf(text: string): string | undefined {
  const m =
    text.match(/(?:^|\s)(?:الى|إلى|الي|لـ|في|فى|من|عند|مع|على)\s+(.+)$/) ||
    text.match(/(?:^|\s)ل((?:قروب|مجموعه|مجموعة|مكتب|قسم|بنك|شركه|شركة|مؤسسه|مؤسسة)\s*.*)$/);
  const t = m?.[1].replace(/[،,.؛]+$/, '').trim();
  return t || undefined;
}

export function parseSteps(input: string): TemplateStep[] {
  return input
    .split(/\n|،|;|؛|\sثم\s|\sبعدها\s/)
    .map((x) => x.replace(/^[\s\-–•*\d.)(]+/, '').trim())
    .filter(Boolean)
    .map((title) => {
      const n = normalize(title);
      const kind = KIND_WORDS.find(([, re]) => re.test(n))?.[0] ?? 'action';
      const target = kind === 'action' || kind === 'print' ? undefined : targetOf(title);
      return { title, kind, target };
    });
}
