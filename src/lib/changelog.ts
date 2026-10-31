// What changed in each version, newest first. Every update gets a number (major.minor.patch):
// the app shows it in settings, compares it with the one on the site to tell you an update is out,
// and after updating shows what's new. Kept free of imports: the build reads it too (version.json).

export interface Release {
  v: string;
  day: string;
  /** each change: [Arabic, English] */
  items: [string, string][];
}

export const CHANGES: Release[] = [
  {
    v: '1.6.0',
    day: '2026-10-31',
    items: [
      ['أندرويد: رسائل الشراء من البنك تنضاف كمصاريف لحالها (تفعّلها من «مصاريفي»)', 'Android: bank purchase texts become expenses by themselves (switch it on in Spending)'],
      ['أندرويد: اضغط مطوّل على أيقونة «مدار» ← «مصروف جديد» يفتح المصروف على طول', 'Android: long-press the Madar icon › «New expense» opens the form straight away'],
    ],
  },
  {
    v: '1.5.0',
    day: '2026-10-31',
    items: [
      ['تنبيه لما ينزل تحديث جديد، ولكل تحديث رقم وقائمة باللي تغيّر', 'A notice when an update is out; every update has a number and a list of changes'],
      ['بطاقة هدف التوفير بشكل جديد، وتقدر تخفي الاسم أو المبالغ وتخلي النسبة بس', 'A new savings-goal card; hide the name or amounts and keep just the percentage'],
    ],
  },
  {
    v: '1.4.3',
    day: '2026-10-31',
    items: [['استيراد كل موادك ودروسها ومواعيد اختباراتها من أي ذكاء اصطناعي مرة وحدة', 'Import all your courses, lessons and exam dates from any AI at once']],
  },
  {
    v: '1.4.2',
    day: '2026-10-31',
    items: [
      ['مقادير الأكل بكف اليد: كف، كف مقعّر، قبضة، إبهام', 'Food amounts by hand: palm, cupped hand, fist, thumb'],
      ['تختار تاريخ توصل فيه لوزنك، والنظام يحسب السرعة الآمنة', 'Pick the date to reach your weight; the safe pace follows'],
    ],
  },
  {
    v: '1.4.1',
    day: '2026-10-31',
    items: [['حجم الشاشة ثابت ما يكبر ولا يصغر، وتختاره من الإعدادات', 'One fixed screen size, chosen in settings']],
  },
  {
    v: '1.4.0',
    day: '2026-10-31',
    items: [
      ['«صحتي» و«أكلي»: جدول أكل لنزول الوزن يتعدل كل أسبوع', '«Health» and «Food»: a weight-loss meal plan adjusted weekly'],
      ['النادي صار اختياري من «الأقسام» في الإعدادات', 'The gym is now optional, under Settings › Sections'],
    ],
  },
  {
    v: '1.3.0',
    day: '2026-10-30',
    items: [
      ['«صقل»: ١٥ دقيقة كل يوم على مهمة حقيقية، وقياس كل ٢٨ يوم', '«Sharpen»: 15 minutes a day on a real task, measured every 28 days'],
      ['أوقات الصلاة في جلسات المذاكرة، والجلسة ما تبدأ من جديد', 'Prayer times in study sessions; a session no longer restarts'],
    ],
  },
];

export const VERSION = CHANGES[0].v;

/** compares «1.4.2» with «1.10» part by part: < 0 older, 0 same, > 0 newer */
export function cmpVersion(a: string, b: string): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** the releases after `since` (exclusive), up to `upto` (inclusive) */
export const releasesBetween = (since: string, upto = VERSION) => CHANGES.filter((r) => cmpVersion(r.v, since) > 0 && cmpVersion(r.v, upto) <= 0);
