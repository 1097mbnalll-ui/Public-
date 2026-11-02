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
    v: '1.6.7',
    day: '2026-11-02',
    items: [
      ['«الدراسة»: دروس اليوم ظاهرة على طول، وجنب كل درس كم دقيقة منه', '«Study»: today’s lessons show straight away, each with its minutes'],
      ['«دروس الأيام الجاية»: اضغط أي يوم وتشوف دروس كل مادة فيه وكم دقيقة من كل درس', '«Lessons in the days ahead»: tap any day for each subject’s lessons and the minutes of each'],
    ],
  },
  {
    v: '1.6.6',
    day: '2026-11-02',
    items: [['زر «احذف المصاريف المستوردة» في إعدادات «مصاريفي»: يرجّعك مثل قبل الاستيراد، ويبقى اللي سجّلته أنت أو جاء من رسائل البنك', 'A «Delete imported expenses» button in Spending settings: back to before the import, keeping what you or the bank texts logged']],
  },
  {
    v: '1.6.5',
    day: '2026-11-02',
    items: [
      ['استيراد مصاريف من ملف: زر جديد في إعدادات «مصاريفي»، والعمليات المسجّلة عندك من قبل ما تتكرر', 'Import expenses from a file: a new button in Spending settings; what you already logged is never added twice'],
      ['المصاريف المستوردة تحتفظ بوقتها، وتقدر تجي بتصنيفات من عندك (مثل «بنزين» و«بقالة») تنضاف لحالها', 'Imported expenses keep their time and can bring categories of your own (like Fuel or Groceries), made for you'],
    ],
  },
  {
    v: '1.6.4',
    day: '2026-11-02',
    items: [
      ['رسائل البنك تدخل لحالها أول ما تفتح «مدار» بدون «زامن الحين»: المزامنة ما عاد تعلق لو نام الجوال في نصها، وصارت أسرع', 'Bank texts come in by themselves when you open Madar, no «Sync now» needed: sync no longer gets stuck if the phone slept mid-way, and it is faster'],
      ['«مصاريفي» يوضح لك لما يجيب رسائل البنك الجديدة', 'Spending shows when it is fetching new bank texts'],
    ],
  },
  {
    v: '1.6.3',
    day: '2026-11-02',
    items: [
      ['وقت العملية يظهر بنظام ١٢ ساعة (٥:٣٠ م) بجانب المبلغ', 'The time of each purchase shows in 12-hour format (5:30 pm) next to the amount'],
      ['«متاجر تكررت»: المتاجر اللي تكرّرت في رسائل البنك مرتين أو أكثر، تصنّف كل واحد مرة وحدة وأي عملية جاية منه تنحط في تصنيفه', '«Repeat merchants»: merchants that came up twice or more in bank texts; name a category once and every later purchase there follows it'],
    ],
  },
  {
    v: '1.6.2',
    day: '2026-11-02',
    items: [
      ['آيفون: خيار «أضفها تلقائيًا بدون ما تفتح شي» في «رسائل البنك»، يعرض حالته وآخر رسالة وصلت، ومعه خطوات الاختصار ورابطه جاهز للنسخ', 'iPhone: an «add them automatically» option in Bank texts, showing its status and the last text that came in, with the Shortcut steps and a ready link to copy'],
    ],
  },
  {
    v: '1.6.1',
    day: '2026-11-01',
    items: [
      ['مراجعة شاملة: صفحة «المهام» ما عاد تطلع أزرارها برا الشاشة، وصفحة «جدولي» أخف، و«التوفير» بدون بطاقات فاضية', 'Full review: Tasks no longer overflows, the timetable page is lighter, Savings has no empty cards'],
      ['«جسمي» يعرض أرقام خطة «أكلي» لو شغّالة بدل رقم ثاني مختلف', '«Body» shows the meal plan’s numbers when it’s on, instead of a second, different estimate'],
      ['حذف كود وتنسيقات ما لها داعي، والموقع أخف', 'Removed unused code and styles; the site is lighter'],
    ],
  },
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
