// «سيرتي»: start from the CV you want on a target day (graduation, or any date), item by item.
// Each item breaks into small steps (20–45 min); on the days you choose, the next step shows up in
// «اليوم». The catalog is a starting point anyone can edit — common items everyone needs, then a few
// for each field. Nothing here claims what a particular employer wants: where it depends, a step
// sends you to check real job ads.

import type { AppState, CvItem, CvPlan, CvSection, CvStep } from '../types';
import { addDays, todayKey } from '../dates';
import { L } from '../i18n';

type T = [string, string];
interface Seed { key: string; sec: CvSection; title: T; target?: T; why?: T; steps: [T, number][] }

export const SECTIONS: { v: CvSection; t: T }[] = [
  { v: 'academic', t: ['الدراسة', 'Education'] },
  { v: 'lang', t: ['اللغات', 'Languages'] },
  { v: 'tools', t: ['المهارات والأدوات', 'Skills & tools'] },
  { v: 'cert', t: ['الشهادات', 'Certificates'] },
  { v: 'exp', t: ['الخبرة', 'Experience'] },
  { v: 'proj', t: ['المشاريع', 'Projects'] },
  { v: 'activity', t: ['الأنشطة والتطوع', 'Activities & volunteering'] },
  { v: 'profile', t: ['حضورك المهني', 'Professional presence'] },
];
export const secName = (v: CvSection) => L(...SECTIONS.find((x) => x.v === v)!.t);

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

// ---------- the catalog ----------

const COMMON: Seed[] = [
  { key: 'english', sec: 'lang', title: ['الإنجليزية بشهادة', 'English, certified'], target: ['IELTS أو TOEFL أو STEP بالدرجة اللي تطلبها الجهات اللي تبيها', 'IELTS, TOEFL or STEP at the score your target employers ask for'], why: ['أغلب إعلانات الوظائف والتدريب تطلب إنجليزي — والشهادة تثبته بدل ما تقوله.', 'Most job and internship ads ask for English — a certificate proves it.'], steps: [
    [['سوّ اختبار تجريبي مجاني واعرف مستواك', 'Take a free practice test to see your level'], 45],
    [['شوف ٥ إعلانات في مجالك: أي اختبار وكم درجة يطلبون؟', 'Check 5 ads in your field: which test and what score?'], 30],
    [['تدرّب على أضعف مهارة عندك (قراءة/كتابة/استماع/محادثة)', 'Practise your weakest skill (reading/writing/listening/speaking)'], 30],
    [['تدرّب على ثاني أضعف مهارة', 'Practise your second-weakest skill'], 30],
    [['اختبار تجريبي ثاني وقارن', 'Second practice test — compare'], 45],
    [['احجز موعد الاختبار', 'Book the test'], 20],
  ] },
  { key: 'resume', sec: 'profile', title: ['سيرة ذاتية بصفحة وحدة', 'A one-page CV'], target: ['جاهزة بالعربي والإنجليزي، PDF', 'Ready in Arabic and English, as PDF'], why: ['أول شي يُطلب في أي تقديم.', 'The first thing any application asks for.'], steps: [
    [['اكتب كل شي سويته: دراسة، أنشطة، مهارات، أعمال', 'List everything you’ve done: study, activities, skills, work'], 30],
    [['اكتب المسودة على قالب بسيط بدون ألوان', 'Draft it on a plain template'], 45],
    [['خل شخص يراجعها (دكتور، قريب يشتغل، مركز التوظيف)', 'Have someone review it (a professor, a relative at work, the career centre)'], 20],
    [['عدّلها وصدّرها PDF بالعربي والإنجليزي', 'Fix it and export PDFs in Arabic and English'], 30],
  ] },
  { key: 'linkedin', sec: 'profile', title: ['حساب LinkedIn مكتمل', 'A complete LinkedIn'], target: ['صورة وعنوان ونبذة، وفيه تعليمك ومشاريعك', 'Photo, headline, summary, education and projects'], why: ['جهات التوظيف تبحث عن الناس فيه قبل ما يقدّمون.', 'Recruiters search it before people even apply.'], steps: [
    [['صورة واضحة وعنوان يقول وش تدرس ووش تبي', 'A clear photo and a headline: what you study and want'], 20],
    [['اكتب النبذة بأربع أسطر', 'Write a 4-line summary'], 30],
    [['أضف تعليمك ومشاريعك وأنشطتك', 'Add your education, projects and activities'], 30],
    [['تابع ١٠ جهات في مجالك وتواصل مع ٥ أشخاص يشتغلون فيه', 'Follow 10 employers in your field and connect with 5 people in it'], 30],
  ] },
  { key: 'excel', sec: 'tools', title: ['Excel', 'Excel'], target: ['الدوال، الجداول المحورية، الرسوم البيانية', 'Formulas, pivot tables, charts'], why: ['يُطلب تقريبًا في كل المجالات، وتقدر تثبته بمشروع صغير.', 'Asked for in almost every field — prove it with a small project.'], steps: [
    [['الدوال الأساسية: IF و SUMIFS و XLOOKUP', 'Core formulas: IF, SUMIFS, XLOOKUP'], 45],
    [['الجداول المحورية (Pivot Tables)', 'Pivot tables'], 45],
    [['الرسوم البيانية ولوحة بسيطة', 'Charts and a simple dashboard'], 30],
    [['حلّل بيانات حقيقية (مصاريفك مثلًا) واحفظ الملف كدليل', 'Analyse real data (your spending, say) and keep the file as proof'], 45],
  ] },
  { key: 'internship', sec: 'exp', title: ['تدريب صيفي أو تعاوني', 'A summer or co-op internship'], target: ['تدريب في جهة في مجالك، مع شهادة أو خطاب', 'At an employer in your field, with a letter or certificate'], why: ['الخبرة العملية أكثر شي يفرّقك عن غيرك من نفس الدفعة.', 'Real experience is what sets you apart from your classmates.'], steps: [
    [['اكتب قائمة ١٠ جهات تقدّم تدريب في مجالك', 'List 10 employers that take interns in your field'], 30],
    [['اعرف مواعيد التقديم وحطها تذكيرات', 'Find their application dates and set reminders'], 20],
    [['جهّز السيرة وخطاب تقديم قصير', 'Prepare your CV and a short cover letter'], 30],
    [['قدّم على ٥ جهات', 'Apply to 5'], 45],
    [['تدرّب على أسئلة المقابلة الشائعة بصوت عالي', 'Practise common interview questions out loud'], 30],
  ] },
  { key: 'project', sec: 'proj', title: ['مشروع تقدر تعرضه', 'A project you can show'], target: ['مشروع صغير حقيقي له صفحة تشرحه بالصور', 'A small real project with a page that shows it'], why: ['المشروع يثبت إنك تطبّق، مو بس تدرس.', 'A project proves you can apply, not just study.'], steps: [
    [['اختر مشكلة صغيرة حقيقية تقدر تحلها بشهر', 'Pick a small real problem you can solve in a month'], 30],
    [['اكتب خطة بأربع خطوات', 'Write a four-step plan'], 30],
    [['نفّذ الخطوة الأولى', 'Do the first step'], 45],
    [['نفّذ الخطوة الثانية', 'Do the second step'], 45],
    [['كمّل الباقي', 'Finish the rest'], 45],
    [['اكتب صفحة تشرحه: المشكلة، وش سويت، النتيجة، بالصور', 'Write it up: the problem, what you did, the result — with pictures'], 30],
  ] },
  { key: 'volunteer', sec: 'activity', title: ['نشاط أو تطوع موثّق', 'A documented activity or volunteering'], target: ['ساعات موثّقة أو دور في نادي طلابي', 'Documented hours or a role in a student club'], why: ['يبيّن إنك تشتغل مع ناس وتتحمل مسؤولية.', 'Shows you work with people and take responsibility.'], steps: [
    [['اختر نادي طلابي أو فرصة تطوع لها علاقة بمجالك', 'Pick a student club or volunteering related to your field'], 20],
    [['سجّل وتواصل معهم', 'Sign up and get in touch'], 20],
    [['شارك في أول فعالية', 'Take part in a first event'], 45],
    [['وثّق ساعاتك أو خذ شهادة مشاركة', 'Get your hours documented or a participation certificate'], 15],
  ] },
  { key: 'present', sec: 'tools', title: ['العرض والتقديم', 'Presenting'], target: ['تعرض عمل ٥ دقايق بثقة', 'Present your work for 5 minutes with confidence'], steps: [
    [['جهّز عرض ٥ دقايق عن مشروع أو موضوع من تخصصك', 'Prepare a 5-minute talk on a project or topic'], 30],
    [['صوّر نفسك وأنت تعرضه وشوف وش تعدّل', 'Record yourself and see what to fix'], 20],
    [['اعرضه قدام ناس (زملاء، نادي، عائلة)', 'Give it to real people (classmates, a club, family)'], 20],
  ] },
];

const GPA: Seed = { key: 'gpa', sec: 'academic', title: ['المعدل اللي تبيه', 'The GPA you want'], target: ['حدده: مثلًا ٤ من ٥ أو أعلى', 'Set it: e.g. 3.5 of 4 or above'], why: ['كثير من برامج التدريب والابتعاث تحط حد أدنى للمعدل.', 'Many internships and scholarships set a minimum GPA.'], steps: [
  [['حدد المعدل اللي تبيه وكم تحتاج في هالترم توصل له', 'Set your target and what you need this term to reach it'], 20],
  [['حط مواعيد اختباراتك في «الدراسة» عشان تنظم مذاكرتك', 'Put your exams in Study so your revision is planned'], 20],
] };

const CERT: Seed = { key: 'cert', sec: 'cert', title: ['شهادة مهنية في مجالك', 'A professional certificate in your field'], target: ['وحدة من الشهادات اللي تتكرر في إعلانات مجالك', 'One that keeps appearing in your field’s job ads'], why: ['الشهادة الصح تختصر عليك — والإعلانات هي اللي تقول أي وحدة.', 'The right certificate is a shortcut — job ads tell you which one.'], steps: [
  [['اقرأ ١٠ إعلانات وظائف في مجالك واكتب الشهادات اللي تتكرر', 'Read 10 job ads in your field and note the certificates that repeat'], 30],
  [['اختر وحدة مناسبة لمستواك واعرف تكلفتها ومتطلباتها', 'Pick one that fits your level; check its cost and requirements'], 20],
  [['اكتب خطة مذاكرة لها بالأسابيع', 'Write a week-by-week study plan for it'], 30],
  [['ابدأ أول وحدة منها', 'Start its first unit'], 45],
  [['سجّل موعد الاختبار', 'Book the exam'], 20],
] };

const tool = (key: string, title: T, target: T, steps: [T, number][], why?: T): Seed => ({ key, sec: 'tools', title, target, why, steps });
const learnSteps = (name: string, nameEn: string, proof: T): [T, number][] => [
  [[`ثبّت ${name} أو افتح النسخة المجانية/الطلابية`, `Install ${nameEn} or open its free/student version`], 20],
  [['اتبع درس مبتدئين كامل (مجاني على يوتيوب أو موقعها)', 'Follow one full beginner tutorial (free on YouTube or its site)'], 45],
  [['طبّق تمرين ثاني لحالك بدون شرح', 'Do a second exercise on your own'], 45],
  [proof, 45],
];

const FIELD_SEEDS: Record<string, (branch?: string) => Seed[]> = {
  eng: (b) => {
    const draw: Record<string, [string, string]> = { mech: ['SolidWorks', 'SolidWorks'], civil: ['AutoCAD و Revit', 'AutoCAD and Revit'], elec: ['MATLAB و Simulink', 'MATLAB and Simulink'], chem: ['Aspen HYSYS (أساسيات)', 'Aspen HYSYS (basics)'], ind: ['Minitab وأدوات Lean', 'Minitab and Lean tools'] };
    const [ar, en] = draw[b || ''] || ['AutoCAD', 'AutoCAD'];
    return [
      GPA,
      tool('eng-tool', [`برنامج تخصصك: ${ar}`, `Your field’s software: ${en}`], ['تصمم/تحلل فيه شي كامل لحالك', 'Design or analyse something complete on your own'], learnSteps(ar, en, ['سوّ قطعة/رسمة/نموذج كامل واحفظ صورته كدليل', 'Make one full part/drawing/model and keep a picture as proof']), ['أدوات التخصص تتكرر في إعلانات الهندسة.', 'Field software keeps showing up in engineering ads.']),
      tool('eng-code', ['برمجة للحسابات الهندسية (Python أو MATLAB)', 'Programming for engineering (Python or MATLAB)'], ['تكتب سكربت يحل مسألة من موادك', 'Write a script that solves a problem from your courses'], learnSteps('Python', 'Python', ['اكتب سكربت يحل مسألة من مادة هندسية واحفظه', 'Write a script that solves a problem from an engineering course'])),
      { ...CERT },
      { key: 'eng-member', sec: 'activity', title: ['عضوية مهنية للطلاب', 'A student professional membership'], target: ['الهيئة السعودية للمهندسين أو جمعية مثل IEEE / ASME', 'The Saudi Council of Engineers or a society like IEEE / ASME'], steps: [
        [['شوف شروط عضوية الطلاب في الهيئة السعودية للمهندسين أو جمعية تخصصك', 'Check student membership at the Saudi Council of Engineers or your field’s society'], 20],
        [['سجّل', 'Sign up'], 20],
        [['احضر فعالية أو ورشة من فعالياتهم', 'Attend one of their events or workshops'], 45],
      ] },
      { key: 'eng-comp', sec: 'proj', title: ['مسابقة أو مشروع هندسي عملي', 'An engineering competition or hands-on project'], target: ['شاركت فيه مع فريق، وعندك صور أو تقرير', 'Done with a team, with photos or a report'], steps: [
        [['دوّر على مسابقات أو أندية هندسية في جامعتك', 'Look for engineering competitions or clubs at your university'], 30],
        [['انضم لفريق', 'Join a team'], 20],
        [['خذ مهمة محددة في الفريق', 'Take on a specific job in the team'], 45],
        [['وثّق شغلك بصور وتقرير قصير', 'Document your part with photos and a short report'], 30],
      ] },
    ];
  },
  cs: (b) => {
    const certs: Record<string, [T, T]> = { cyber: [['Security+ أو شهادة أمن مبتدئة', 'Security+ or an entry security certificate'], ['أكثر شهادة مبتدئة تتكرر في إعلانات الأمن', 'A common entry certificate in security ads']], data: [['شهادة تحليل بيانات مبتدئة', 'An entry data-analytics certificate'], ['مثل شهادات Google أو Microsoft في البيانات', 'e.g. Google or Microsoft data certificates']], se: [['أساسيات السحابة (AWS أو Azure)', 'Cloud fundamentals (AWS or Azure)'], ['السحابة تتكرر في إعلانات تطوير البرمجيات', 'Cloud keeps appearing in software ads']] };
    const c = certs[b || ''];
    return [
      GPA,
      tool('cs-lang', ['لغة برمجة بعمق', 'One programming language in depth'], ['Python أو Java أو JavaScript — تبني فيها شي كامل', 'Python, Java or JavaScript — build something complete'], learnSteps('بيئة البرمجة', 'your dev setup', ['ابنِ برنامج صغير كامل وارفعه على GitHub', 'Build a small complete program and push it to GitHub'])),
      tool('cs-git', ['Git و GitHub', 'Git & GitHub'], ['كل مشاريعك عليه مع README', 'All your projects on it with a README'], [[['تعلّم الأوامر الأساسية: commit و branch و push', 'Learn the basics: commit, branch, push'], 45], [['ارفع مشروع بـ README يشرح وش يسوي', 'Push a project with a README'], 30]]),
      tool('cs-sql', ['قواعد البيانات و SQL', 'Databases & SQL'], ['تكتب استعلامات بـ JOIN و GROUP BY', 'Write queries with JOIN and GROUP BY'], [[['SELECT و WHERE', 'SELECT and WHERE'], 45], [['JOIN و GROUP BY', 'JOIN and GROUP BY'], 45], [['صمم قاعدة بيانات لمشروع صغير', 'Design a database for a small project'], 45]]),
      { key: 'cs-portfolio', sec: 'proj', title: ['٣ مشاريع على GitHub', '3 projects on GitHub'], target: ['مشاريع تشتغل، مع شرح وصور', 'Working projects, with write-ups and screenshots'], steps: [
        [['اختر ٣ أفكار صغيرة تحل مشاكل حقيقية', 'Pick 3 small ideas that solve real problems'], 30], [['المشروع الأول', 'Project one'], 45], [['المشروع الثاني', 'Project two'], 45], [['المشروع الثالث', 'Project three'], 45], [['README وصور لكل مشروع', 'README and screenshots for each'], 30],
      ] },
      { key: 'cs-hack', sec: 'activity', title: ['هاكاثون أو مسابقة برمجة', 'A hackathon or coding contest'], target: ['شاركت مع فريق وسلّمتوا شي', 'Took part with a team and shipped something'], steps: [[['دوّر على هاكاثون قريب (جامعتك أو منصات الفعاليات)', 'Find an upcoming hackathon'], 20], [['سجّل مع فريق', 'Sign up with a team'], 20], [['شارك ووثّق مشروعكم', 'Take part and document your project'], 45]] },
      c ? { ...CERT, key: 'cs-cert', title: c[0], target: c[1] } : { ...CERT },
    ];
  },
  health: (b) => [
    GPA,
    { key: 'bls', sec: 'cert', title: ['شهادة BLS (دعم الحياة الأساسي)', 'BLS certificate'], target: ['سارية المفعول', 'Current'], why: ['تُطلب كثيرًا في التدريب والعمل الصحي.', 'Often required for clinical training and work.'], steps: [[['شوف الجهات المعتمدة اللي تقدمها قريب منك وتكلفتها', 'Find accredited providers near you and the cost'], 20], [['سجّل في دورة', 'Book a course'], 20], [['احضر الدورة وخذ الشهادة', 'Attend and get certified'], 45]] },
    { key: 'h-shadow', sec: 'exp', title: ['خبرة عملية في بيئة صحية', 'Hands-on time in a health setting'], target: ['تطوع أو تدريب أو ظل (shadowing) موثّق', 'Volunteering, training or shadowing — documented'], steps: [[['اسأل كليتك أو مستشفى قريب عن برامج التطوع أو الظل', 'Ask your college or a nearby hospital about volunteering or shadowing'], 30], [['قدّم', 'Apply'], 20], [['احضر وسجّل ساعاتك', 'Attend and log your hours'], 45], [['خذ خطاب أو شهادة', 'Get a letter or certificate'], 15]] },
    { key: 'h-research', sec: 'proj', title: ['مشاركة بحثية أو ملصق علمي', 'A research contribution or poster'], target: ['اسمك على بحث أو ملصق في مؤتمر طلابي', 'Your name on a paper or a student-conference poster'], steps: [[['اسأل دكتور في قسمك إذا عنده بحث يحتاج مساعدة', 'Ask a professor if their research needs help'], 20], [['خذ مهمة محددة (جمع بيانات، مراجعة أدبيات)', 'Take a specific task (data collection, literature review)'], 45], [['كمّل مهمتك', 'Finish your task'], 45], [['قدّم ملصق في مؤتمر طلابي', 'Present a poster at a student conference'], 45]] },
    { key: 'h-license', sec: 'academic', title: ['متطلبات الترخيص المهني', 'Professional licensing requirements'], target: ['تعرف وش تحتاج للتسجيل المهني بعد التخرج ومتى', 'Know what you need to register after graduating, and when'], steps: [[['اقرأ متطلبات التصنيف والتسجيل في الهيئة السعودية للتخصصات الصحية لتخصصك', 'Read the Saudi Commission for Health Specialties requirements for your field'], 30], [['اكتب المواعيد والاختبارات المطلوبة وحطها في خطتك', 'Note the required dates and exams'], 20]] },
    tool('h-terms', ['المصطلحات الطبية بالإنجليزي', 'Medical terminology in English'], [b === 'pharm' ? 'أسماء الأدوية وتصنيفاتها' : 'مصطلحات تخصصك بثقة', b === 'pharm' ? 'Drug names and classes' : 'Your field’s terms, confidently'], [[['اجمع ١٠٠ مصطلح من موادك في بطاقات', 'Collect 100 terms from your courses into flashcards'], 30], [['راجع البطاقات أسبوعين', 'Review them for two weeks'], 20]]),
  ],
  biz: (b) => [
    GPA,
    tool('b-bi', ['أداة تحليل ولوحات (Power BI أو Tableau)', 'A BI tool (Power BI or Tableau)'], ['لوحة من بيانات حقيقية', 'A dashboard from real data'], learnSteps('Power BI', 'Power BI', ['ابنِ لوحة من بيانات حقيقية واحفظ صورتها', 'Build a dashboard from real data and keep a screenshot'])),
    { key: 'b-case', sec: 'proj', title: [b === 'mkt' ? 'خطة تسويق لمشروع حقيقي' : b === 'acc' || b === 'fin' ? 'تحليل مالي لشركة مدرجة' : 'دراسة حالة أو خطة عمل', b === 'mkt' ? 'A marketing plan for a real business' : b === 'acc' || b === 'fin' ? 'A financial analysis of a listed company' : 'A case study or business plan'], target: ['ملف تقدر تعرضه في المقابلة', 'A file you can show in an interview'], steps: [[['اختر الشركة أو المشروع', 'Pick the company or business'], 20], [['اجمع البيانات (التقارير المنشورة، السوق)', 'Gather the data (published reports, the market)'], 45], [['حلّل واكتب النتائج', 'Analyse and write up'], 45], [['سوّه عرض ٥ شرائح', 'Turn it into 5 slides'], 30]] },
    { ...CERT },
  ],
  sci: () => [
    GPA,
    { key: 's-lab', sec: 'exp', title: ['مساعد بحث أو مختبر', 'Research or lab assistant'], target: ['تشتغل مع دكتور على بحث حقيقي', 'Working with a professor on real research'], steps: [[['اقرأ عن أبحاث ٣ دكاترة في قسمك', 'Read about three professors’ research in your department'], 30], [['راسل واحد منهم وقل وش تقدر تساعد فيه', 'Email one and say how you could help'], 20], [['خذ مهمة وكمّلها', 'Take a task and finish it'], 45]] },
    tool('s-data', ['تحليل البيانات (Python أو R)', 'Data analysis (Python or R)'], ['تحلل بيانات تجربة وترسمها', 'Analyse and plot an experiment’s data'], learnSteps('Python', 'Python', ['حلّل بيانات تجربة من مختبرك وارسمها', 'Analyse and plot data from one of your labs'])),
    { ...CERT },
  ],
  law: () => [
    GPA,
    { key: 'l-draft', sec: 'tools', title: ['صياغة المذكرات والعقود', 'Drafting memos and contracts'], target: ['نماذج كتبتها بنفسك وراجعها مختص', 'Samples you wrote, reviewed by a practitioner'], steps: [[['اقرأ نماذج حقيقية منشورة', 'Read real published samples'], 30], [['اكتب مذكرة لقضية افتراضية', 'Draft a memo for a mock case'], 45], [['اكتب عقد بسيط', 'Draft a simple contract'], 45], [['خل مختص يراجعها', 'Have a practitioner review them'], 20]] },
    { key: 'l-office', sec: 'exp', title: ['تدريب في مكتب محاماة أو إدارة قانونية', 'Training at a law firm or legal department'], target: ['خطاب تدريب', 'A training letter'], steps: [[['قائمة ١٠ مكاتب أو إدارات قانونية', 'List 10 firms or legal departments'], 30], [['قدّم على ٥', 'Apply to 5'], 45]] },
    { key: 'l-moot', sec: 'activity', title: ['محكمة صورية أو مسابقة قانونية', 'A moot court or legal competition'], steps: [[['اسأل كليتك عن المسابقات القادمة', 'Ask your college about upcoming competitions'], 20], [['سجّل مع فريق', 'Sign up with a team'], 20]] },
  ],
  design: () => [
    tool('d-tools', ['أدوات التصميم (Figma أو Adobe)', 'Design tools (Figma or Adobe)'], ['تنفذ فكرة كاملة من الصفر', 'Take an idea from scratch to finished'], learnSteps('Figma', 'Figma', ['صمم مشروع كامل واحفظه', 'Design one complete piece and keep it'])),
    { key: 'd-portfolio', sec: 'proj', title: ['ملف أعمال (Portfolio)', 'A portfolio'], target: ['٥ أعمال قوية على Behance أو موقع شخصي', '5 strong pieces on Behance or your own site'], steps: [[['اختر أقوى ٥ أعمال أو سوّ الناقص', 'Pick your best 5 or make what’s missing'], 30], [['اكتب لكل عمل: المشكلة والحل', 'For each: the problem and your solution'], 30], [['ارفعها', 'Publish them'], 30]] },
    { key: 'd-client', sec: 'exp', title: ['عمل لعميل حقيقي', 'Work for a real client'], target: ['ولو صغير أو تطوعي، مع رأي العميل', 'Even small or pro bono, with their feedback'], steps: [[['اعرض خدمتك على جهة أو مشروع صغير تعرفه', 'Offer your work to a small business or group you know'], 20], [['نفّذ وسلّم', 'Do it and deliver'], 45], [['خذ رأيهم المكتوب', 'Get their written feedback'], 15]] },
  ],
  edu: () => [
    GPA,
    { key: 'e-license', sec: 'cert', title: ['الرخصة المهنية للمعلمين', 'The teaching license'], target: ['تعرف متطلباتها وتستعد لها', 'Know its requirements and prepare'], steps: [[['اقرأ متطلبات الرخصة المهنية من الجهة الرسمية', 'Read the license requirements from the official body'], 30], [['حدد موعد الاختبار وخطة مذاكرة', 'Set a test date and a study plan'], 30]] },
    { key: 'e-practice', sec: 'exp', title: ['تجربة تدريس عملية', 'Real teaching experience'], target: ['دروس قدمتها بنفسك وتقييم عليها', 'Lessons you gave, with feedback'], steps: [[['تطوع لتدريس (مدرسة، جمعية، دروس تقوية)', 'Volunteer to teach (a school, a charity, tutoring)'], 30], [['حضّر وقدّم درس', 'Prepare and give a lesson'], 45], [['اطلب تقييم مكتوب', 'Ask for written feedback'], 15]] },
    tool('e-digital', ['أدوات التعليم الرقمي', 'Digital teaching tools'], ['درس كامل بأداة تفاعلية', 'A full lesson with an interactive tool'], [[['جرّب أداتين تفاعليتين', 'Try two interactive tools'], 30], [['صمم درس فيها', 'Build a lesson with one'], 45]]),
  ],
  other: () => [GPA, { ...CERT }],
};

const seedOf = (k: string, branch?: string) => [...COMMON, ...(FIELD_SEEDS[k] || FIELD_SEEDS.other)(branch)];

/** what to suggest for this field: everything not on your CV yet */
export function suggestions(plan: CvPlan, items: CvItem[]): Seed[] {
  const have = new Set(items.map((x) => x.key).filter(Boolean));
  return seedOf(plan.field, plan.branch).filter((x) => !have.has(x.key));
}

export function toItem(seed: Seed, id: () => string, now: number): CvItem {
  return {
    id: id(),
    key: seed.key,
    sec: seed.sec,
    title: L(...seed.title),
    ...(seed.target ? { target: L(...seed.target) } : {}),
    ...(seed.why ? { why: L(...seed.why) } : {}),
    steps: seed.steps.map(([t, min]) => ({ id: id(), title: L(...t), min })),
    createdAt: now,
  };
}

/** the starting CV for a field: the common items plus the field's own */
export function starterItems(plan: CvPlan, id: () => string, now: number): CvItem[] {
  return seedOf(plan.field, plan.branch).map((s) => toItem(s, id, now));
}

// ---------- reading it ----------

export const itemDone = (x: CvItem) => !!x.doneAt || (x.steps.length > 0 && x.steps.every((s) => s.doneAt));
export const stepsDone = (x: CvItem) => x.steps.filter((s) => s.doneAt).length;

export function progress(items: CvItem[]) {
  const done = items.filter(itemDone).length;
  const steps = items.reduce((a, x) => a + x.steps.length, 0);
  const sd = items.reduce((a, x) => a + stepsDone(x), 0);
  return { done, total: items.length, steps, stepsDone: sd, pct: items.length ? done / items.length : 0 };
}

/** the item to work on next: one you've started first, otherwise the first in your order */
export function nextStep(items: CvItem[]): { item: CvItem; step: CvStep } | null {
  const open = items.filter((x) => !itemDone(x) && x.steps.some((s) => !s.doneAt));
  const started = open.find((x) => stepsDone(x) > 0);
  const item = started || open[0];
  if (!item) return null;
  return { item, step: item.steps.find((s) => !s.doneAt)! };
}

/** today in «سيرتي»: is it one of your days, did you already do a step, did you skip it */
export function today(s: AppState, now = Date.now()) {
  const cv = s.future.cv;
  const items = s.future.cvItems || [];
  const day = todayKey(now);
  if (!cv) return null;
  const isDay = cv.days.includes(new Date(`${day}T12:00:00`).getDay());
  const doneToday = items.flatMap((x) => x.steps).filter((st) => st.doneAt && todayKey(st.doneAt) === day);
  const skipped = (cv.skipped || []).includes(day);
  const next = nextStep(items);
  return { isDay, doneToday, skipped, next, show: !!next && isDay && !skipped && !doneToday.length };
}

/** this week (Sunday → Saturday): steps done vs the days you planned */
export function week(s: AppState, now = Date.now()) {
  const cv = s.future.cv;
  const day = todayKey(now);
  const start = addDays(day, -new Date(`${day}T12:00:00`).getDay());
  const items = s.future.cvItems || [];
  const done = items.flatMap((x) => x.steps).filter((st) => st.doneAt && todayKey(st.doneAt) >= start && todayKey(st.doneAt) <= addDays(start, 6));
  return { start, done: done.length, minutes: done.reduce((a, x) => a + x.min, 0), planned: cv?.days.length || 0 };
}

/** steps left and, at your pace, roughly when the whole CV is done */
export function eta(s: AppState, now = Date.now()) {
  const cv = s.future.cv;
  const items = s.future.cvItems || [];
  const left = items.filter((x) => !itemDone(x)).flatMap((x) => x.steps.filter((st) => !st.doneAt));
  const perWeek = Math.max(1, cv?.days.length || 1);
  const weeks = Math.ceil(left.length / perWeek);
  const day = addDays(todayKey(now), weeks * 7);
  return { left: left.length, weeks, day, onTime: !cv || day <= cv.target };
}

/** the finished items as plain text, by section — paste into a CV */
export function cvText(s: AppState): string {
  const items = (s.future.cvItems || []).filter(itemDone);
  const out: string[] = [];
  for (const sec of SECTIONS) {
    const list = items.filter((x) => x.sec === sec.v);
    if (!list.length) continue;
    out.push(L(...sec.t));
    for (const x of list) out.push(`- ${x.title}${x.target ? ` — ${x.target}` : ''}${x.evidence ? ` (${x.evidence})` : ''}`);
    out.push('');
  }
  return out.join('\n').trim();
}
