// «النادي»: a program cut to your goal, level, days and place; every exercise tells you what to lift
// today from what you lifted last time (add weight once you hit the top of the range, else one more
// rep), and the week counts sessions, not dates — miss a day and the next workout simply waits for you.

import type { AppState, GymCustom, GymProfile, GymSession, GymGoal } from '../types';
import { addDays, todayKey, weekday } from '../dates';
import { L } from '../i18n';

export type Muscle = 'chest' | 'back' | 'legs' | 'glutes' | 'shoulders' | 'arms' | 'core' | 'cardio';
export type Kind = 'bar' | 'db' | 'machine' | 'body' | 'cardio';
type Unit = 'reps' | 'sec' | 'min';

export interface Exercise {
  id: string;
  ar: string;
  en: string;
  muscle: Muscle;
  kind: Kind;
  /** an isolation move: lighter, more reps */
  iso?: boolean;
  unit?: Unit;
  /** what to do at home instead */
  home?: string;
  /** one line on how */
  tip: [string, string];
  /** the muscles it works: mainly, and also */
  hits: Part[];
  also: Part[];
  /** one you wrote yourself */
  custom?: boolean;
}

const X = (id: string, ar: string, en: string, muscle: Muscle, kind: Kind, tip: [string, string], o: Partial<Exercise> = {}): Exercise => ({ id, ar, en, muscle, kind, tip, hits: [], also: [], ...o });

export const EXERCISES: Exercise[] = [
  X('bench', 'بنش برس بالبار', 'Barbell bench press', 'chest', 'bar', ['الكتف ورا، البار ينزل لمنتصف الصدر', 'Shoulders back, bar to mid-chest'], { home: 'pushup' }),
  X('incline_db', 'بنش مائل بالدمبل', 'Incline dumbbell press', 'chest', 'db', ['الكرسي على 30°، انزل ببطء', 'Bench at 30°, lower slowly'], { home: 'decline_push' }),
  X('chest_press', 'جهاز ضغط الصدر', 'Machine chest press', 'chest', 'machine', ['المقابض بمستوى الصدر', 'Handles at chest height'], { home: 'pushup' }),
  X('db_fly', 'تفتيح بالدمبل', 'Dumbbell fly', 'chest', 'db', ['الكوع مثني شوي، حس بالشد', 'Soft elbows, feel the stretch'], { iso: true, home: 'dips' }),
  X('pushup', 'ضغط', 'Push-up', 'chest', 'body', ['الجسم خط واحد، الصدر يلمس الأرض تقريبًا', 'One straight line, chest near the floor']),
  X('decline_push', 'ضغط ورجولك فوق', 'Feet-up push-up', 'chest', 'body', ['رجولك على كنبة أو كرسي', 'Feet on a sofa or chair']),
  X('dips', 'متوازي', 'Dips', 'chest', 'body', ['بين كرسيين ثابتين بالبيت', 'Between two sturdy chairs at home']),

  X('deadlift', 'رفعة ميتة', 'Deadlift', 'back', 'bar', ['ظهرك مستقيم، ادفع الأرض برجولك', 'Flat back, push the floor away'], { home: 'sl_rdl' }),
  X('row', 'تجديف بالبار', 'Barbell row', 'back', 'bar', ['انحني 45°، اسحب للسرة', 'Hinge 45°, pull to the belly'], { home: 'inv_row' }),
  X('pulldown', 'سحب أمامي', 'Lat pulldown', 'back', 'machine', ['اسحب للصدر الأعلى، لا تتمرجح', 'Pull to upper chest, no swinging'], { home: 'pullup' }),
  X('pullup', 'عقلة', 'Pull-up', 'back', 'body', ['من تعليق كامل لين الذقن فوق البار', 'Dead hang to chin over the bar']),
  X('cable_row', 'تجديف كيبل جالس', 'Seated cable row', 'back', 'machine', ['صدرك مرفوع، اعصر لوحات الكتف', 'Chest up, squeeze the shoulder blades'], { home: 'inv_row' }),
  X('db_row', 'تجديف دمبل بيد وحدة', 'One-arm dumbbell row', 'back', 'db', ['اسحب الكوع لجنبك', 'Drive the elbow to your hip'], { home: 'inv_row' }),
  X('inv_row', 'تجديف مقلوب تحت الطاولة', 'Inverted row (under a table)', 'back', 'body', ['جسمك مستقيم، اسحب صدرك للحافة', 'Body straight, chest to the edge']),
  X('face_pull', 'فيس بول', 'Face pull', 'shoulders', 'machine', ['اسحب الحبل لوجهك والكوع عالي', 'Rope to your face, elbows high'], { iso: true, home: 'pike' }),

  X('squat', 'سكوات بالبار', 'Barbell squat', 'legs', 'bar', ['انزل لين الفخذ موازي للأرض', 'Down until thighs are parallel'], { home: 'bw_squat' }),
  X('leg_press', 'جهاز دفع الأرجل', 'Leg press', 'legs', 'machine', ['لا تقفل الركبة فوق', 'Don’t lock the knees at the top'], { home: 'bw_lunge' }),
  X('rdl', 'رفعة رومانية', 'Romanian deadlift', 'legs', 'bar', ['الوسط ورا، البار قريب من الساق', 'Hips back, bar close to the legs'], { home: 'sl_rdl' }),
  X('lunge', 'طعنات بالدمبل', 'Dumbbell lunge', 'legs', 'db', ['خطوة طويلة، الركبة الخلفية تقرّب للأرض', 'Long step, back knee toward the floor'], { home: 'bw_lunge' }),
  X('goblet', 'سكوات جوبلت', 'Goblet squat', 'legs', 'db', ['الدمبل عند صدرك', 'Dumbbell at your chest'], { home: 'bw_squat' }),
  X('leg_curl', 'جهاز الخلفية', 'Leg curl', 'legs', 'machine', ['ببطء في النزول', 'Slow on the way down'], { iso: true, home: 'glute_bridge' }),
  X('leg_ext', 'جهاز الأمامية', 'Leg extension', 'legs', 'machine', ['اعصر فوق ثانية', 'Squeeze a second at the top'], { iso: true, home: 'wall_sit' }),
  X('calf', 'سمانة واقف', 'Standing calf raise', 'legs', 'machine', ['من أسفل لأعلى نطاق', 'Full range, bottom to top'], { iso: true, home: 'bw_calf' }),
  X('hip_thrust', 'هيب ثرست', 'Hip thrust', 'glutes', 'bar', ['ظهرك على البنش، ارفع الوسط واعصر', 'Back on the bench, drive the hips, squeeze'], { home: 'glute_bridge' }),
  X('bw_squat', 'سكوات بوزن الجسم', 'Bodyweight squat', 'legs', 'body', ['الكعب على الأرض', 'Heels down']),
  X('bw_lunge', 'طعنات', 'Lunges', 'legs', 'body', ['رجل بعد رجل', 'Alternate legs']),
  X('sl_rdl', 'رفعة رومانية برجل وحدة', 'Single-leg RDL', 'legs', 'body', ['ثبّت الوسط، الرجل الثانية ورا', 'Square hips, other leg back']),
  X('glute_bridge', 'جسر الأرداف', 'Glute bridge', 'glutes', 'body', ['ارفع الوسط واعصر ثانيتين', 'Lift the hips, squeeze two seconds']),
  X('wall_sit', 'جلسة الجدار', 'Wall sit', 'legs', 'body', ['الفخذ موازي للأرض', 'Thighs parallel'], { unit: 'sec', iso: true }),
  X('bw_calf', 'سمانة على درجة', 'Calf raise on a step', 'legs', 'body', ['على طرف الدرج', 'On the edge of a step'], { iso: true }),

  X('ohp', 'ضغط كتف بالبار واقف', 'Overhead press', 'shoulders', 'bar', ['شد بطنك، البار فوق راسك', 'Brace, bar over your head'], { home: 'pike' }),
  X('db_press', 'ضغط كتف بالدمبل', 'Dumbbell shoulder press', 'shoulders', 'db', ['جالس وظهرك مسنود', 'Seated, back supported'], { home: 'pike' }),
  X('lateral', 'رفرفة جانبي', 'Lateral raise', 'shoulders', 'db', ['لين مستوى الكتف بس', 'Up to shoulder height only'], { iso: true, home: 'pike' }),
  X('pike', 'ضغط بايك للكتف', 'Pike push-up', 'shoulders', 'body', ['وسطك عالي، راسك ينزل بين يديك', 'Hips high, head between hands']),

  X('curl', 'بايسبس بالبار', 'Barbell curl', 'arms', 'bar', ['الكوع ثابت جنبك', 'Elbows pinned'], { iso: true, home: 'chin_curl' }),
  X('db_curl', 'هامر بالدمبل', 'Hammer curl', 'arms', 'db', ['قبضة مثل المطرقة', 'Neutral grip'], { iso: true, home: 'chin_curl' }),
  X('pushdown', 'ترايسبس كيبل', 'Triceps pushdown', 'arms', 'machine', ['افرد يدك لتحت كامل', 'Full lockout'], { iso: true, home: 'diamond' }),
  X('skull', 'ترايسبس فرنسي', 'Skull crusher', 'arms', 'bar', ['الكوع يأشر للسقف', 'Elbows to the ceiling'], { iso: true, home: 'diamond' }),
  X('diamond', 'ضغط ماسي', 'Diamond push-up', 'arms', 'body', ['اليدين قريبة تحت صدرك', 'Hands close under the chest'], { iso: true }),
  X('chin_curl', 'عقلة بقبضة معكوسة', 'Chin-up', 'arms', 'body', ['الكف لوجهك', 'Palms facing you']),

  X('plank', 'بلانك', 'Plank', 'core', 'body', ['الجسم خط واحد، لا ينزل الوسط', 'Straight line, hips level'], { unit: 'sec', iso: true }),
  X('leg_raise', 'رفع الرجلين', 'Leg raise', 'core', 'body', ['ببطء، بدون تمرجح', 'Slow, no swinging'], { iso: true }),

  X('treadmill', 'جري على السير', 'Treadmill run', 'cardio', 'cardio', ['سرعة تقدر تتكلم فيها بصعوبة', 'A pace you can barely talk at'], { unit: 'min', home: 'jumprope' }),
  X('bike', 'دراجة ثابتة', 'Stationary bike', 'cardio', 'cardio', ['مقاومة متوسطة، ثابت', 'Moderate resistance, steady'], { unit: 'min', home: 'jumprope' }),
  X('jumprope', 'نط حبل أو جري بالمكان', 'Jump rope / run in place', 'cardio', 'cardio', ['دقيقة شغل ونص دقيقة راحة', 'One minute on, thirty seconds off'], { unit: 'min' }),
];

// ---------------- the muscles ----------------

/** the muscles on the body map */
export type Part =
  | 'chest' | 'front_delt' | 'side_delt' | 'rear_delt' | 'biceps' | 'triceps' | 'forearm' | 'abs' | 'obliques'
  | 'traps' | 'lats' | 'upper_back' | 'lower_back' | 'glutes' | 'quads' | 'hamstrings' | 'adductors' | 'calves';

export const PARTS: { id: Part; ar: string; en: string; side: 'front' | 'back' | 'both'; about: [string, string] }[] = [
  { id: 'chest', ar: 'الصدر', en: 'Chest', side: 'front', about: ['يدفع يديك لقدّام: البنش والضغط.', 'Pushes your arms forward: bench and push-ups.'] },
  { id: 'front_delt', ar: 'الكتف الأمامي', en: 'Front delts', side: 'front', about: ['يرفع يدك لقدّام وفوق راسك.', 'Raises the arm forward and overhead.'] },
  { id: 'side_delt', ar: 'الكتف الجانبي', en: 'Side delts', side: 'both', about: ['يعطي الكتف العرض — الرفرفة الجانبية.', 'Gives the shoulders width — lateral raises.'] },
  { id: 'rear_delt', ar: 'الكتف الخلفي', en: 'Rear delts', side: 'back', about: ['يسحب الذراع لورا، يعدّل وقفة الكتف.', 'Pulls the arm back; balances posture.'] },
  { id: 'biceps', ar: 'الباي', en: 'Biceps', side: 'front', about: ['يثني الكوع ويساعد في السحب.', 'Bends the elbow; helps every pull.'] },
  { id: 'triceps', ar: 'التراي', en: 'Triceps', side: 'back', about: ['يفرد الكوع — ثلثين حجم الذراع.', 'Straightens the elbow — two thirds of the arm.'] },
  { id: 'forearm', ar: 'الساعد', en: 'Forearms', side: 'both', about: ['قوة القبضة: تمسك البار أطول.', 'Grip: you hold the bar longer.'] },
  { id: 'abs', ar: 'البطن', en: 'Abs', side: 'front', about: ['يثبّت جذعك في كل رفعة.', 'Holds your trunk steady in every lift.'] },
  { id: 'obliques', ar: 'الخواصر', en: 'Obliques', side: 'front', about: ['اللف والميلان، وثبات الجنب.', 'Twisting and side bending; side stability.'] },
  { id: 'traps', ar: 'الترابيس', en: 'Traps', side: 'back', about: ['يرفع الكتفين ويثبّت لوح الكتف.', 'Shrugs and steadies the shoulder blades.'] },
  { id: 'lats', ar: 'المجنص', en: 'Lats', side: 'back', about: ['أعرض عضلة بالظهر — تعطيك شكل V.', 'The widest back muscle — the V shape.'] },
  { id: 'upper_back', ar: 'وسط الظهر', en: 'Mid back', side: 'back', about: ['يقرّب لوحَي الكتف: التجديف.', 'Pulls the shoulder blades together: rows.'] },
  { id: 'lower_back', ar: 'أسفل الظهر', en: 'Lower back', side: 'back', about: ['يحمي ظهرك وأنت تنحني وترفع.', 'Protects your spine when you hinge and lift.'] },
  { id: 'glutes', ar: 'الأرداف', en: 'Glutes', side: 'back', about: ['أقوى عضلة بالجسم: تدفع الوسط لقدّام.', 'The strongest muscle: drives the hips.'] },
  { id: 'quads', ar: 'الفخذ الأمامي', en: 'Quads', side: 'front', about: ['يفرد الركبة: السكوات والدفع.', 'Straightens the knee: squats and presses.'] },
  { id: 'hamstrings', ar: 'الفخذ الخلفي', en: 'Hamstrings', side: 'back', about: ['يثني الركبة ويمد الوسط: الرومانية.', 'Bends the knee, extends the hip: RDLs.'] },
  { id: 'adductors', ar: 'الفخذ الداخلي', en: 'Adductors', side: 'front', about: ['يضم الرجلين ويثبّت السكوات.', 'Brings the legs together; steadies squats.'] },
  { id: 'calves', ar: 'السمانة', en: 'Calves', side: 'both', about: ['ترفعك على أطراف أصابعك.', 'Lifts you onto your toes.'] },
];
/** in Arabic with the English name beside it — «الصدر (Chest)» — as gyms and videos use both */
export const partName = (p: Part) => {
  const x = PARTS.find((y) => y.id === p);
  return x ? L(`${x.ar} (${x.en})`, x.en) : p;
};

/** what each built-in exercise works: [mainly, also] */
const HITS: Record<string, [Part[], Part[]]> = {
  bench: [['chest'], ['front_delt', 'triceps']],
  incline_db: [['chest', 'front_delt'], ['triceps']],
  chest_press: [['chest'], ['front_delt', 'triceps']],
  db_fly: [['chest'], ['front_delt']],
  pushup: [['chest'], ['front_delt', 'triceps', 'abs']],
  decline_push: [['chest', 'front_delt'], ['triceps']],
  dips: [['chest', 'triceps'], ['front_delt']],
  deadlift: [['lower_back', 'glutes', 'hamstrings'], ['traps', 'lats', 'quads', 'forearm']],
  row: [['upper_back', 'lats'], ['rear_delt', 'biceps', 'lower_back']],
  pulldown: [['lats'], ['biceps', 'upper_back']],
  pullup: [['lats'], ['biceps', 'upper_back', 'forearm']],
  cable_row: [['upper_back', 'lats'], ['rear_delt', 'biceps']],
  db_row: [['lats', 'upper_back'], ['rear_delt', 'biceps']],
  inv_row: [['upper_back', 'lats'], ['biceps', 'rear_delt']],
  face_pull: [['rear_delt'], ['traps', 'upper_back']],
  squat: [['quads', 'glutes'], ['adductors', 'hamstrings', 'lower_back', 'abs']],
  leg_press: [['quads'], ['glutes', 'adductors']],
  rdl: [['hamstrings', 'glutes'], ['lower_back']],
  lunge: [['quads', 'glutes'], ['hamstrings', 'adductors']],
  goblet: [['quads', 'glutes'], ['abs', 'adductors']],
  leg_curl: [['hamstrings'], ['calves']],
  leg_ext: [['quads'], []],
  calf: [['calves'], []],
  hip_thrust: [['glutes'], ['hamstrings']],
  bw_squat: [['quads', 'glutes'], ['adductors']],
  bw_lunge: [['quads', 'glutes'], ['hamstrings']],
  sl_rdl: [['hamstrings', 'glutes'], ['lower_back']],
  glute_bridge: [['glutes'], ['hamstrings']],
  wall_sit: [['quads'], ['glutes']],
  bw_calf: [['calves'], []],
  ohp: [['front_delt'], ['side_delt', 'triceps', 'traps', 'abs']],
  db_press: [['front_delt'], ['side_delt', 'triceps']],
  lateral: [['side_delt'], ['traps']],
  pike: [['front_delt'], ['triceps', 'side_delt']],
  curl: [['biceps'], ['forearm']],
  db_curl: [['biceps', 'forearm'], []],
  pushdown: [['triceps'], []],
  skull: [['triceps'], []],
  diamond: [['triceps'], ['chest', 'front_delt']],
  chin_curl: [['biceps', 'lats'], ['forearm']],
  plank: [['abs'], ['obliques', 'front_delt']],
  leg_raise: [['abs'], ['obliques', 'forearm']],
  treadmill: [['quads', 'calves'], ['hamstrings', 'glutes']],
  bike: [['quads'], ['calves', 'glutes']],
  jumprope: [['calves'], ['quads', 'forearm']],
};
for (const e of EXERCISES) [e.hits, e.also] = HITS[e.id] || [[], []];

// more built-ins, so everyone finds theirs
const MORE: Exercise[] = [
  X('shrug', 'هز الكتف بالدمبل', 'Dumbbell shrug', 'back', 'db', ['ارفع كتفك لأذنك وثبّت ثانية', 'Shoulders to ears, hold a second'], { iso: true, hits: ['traps'], also: ['forearm'] }),
  X('back_ext', 'تمديد الظهر', 'Back extension', 'back', 'body', ['انزل ببطء، لا تقوّس زيادة فوق', 'Lower slowly, don’t over-arch'], { iso: true, hits: ['lower_back'], also: ['glutes', 'hamstrings'] }),
  X('crunch', 'كرنش', 'Crunch', 'core', 'body', ['ارفع كتفك بس، لا تشد رقبتك', 'Lift the shoulders, not the neck'], { iso: true, hits: ['abs'], also: [] }),
  X('russian', 'لف روسي', 'Russian twist', 'core', 'body', ['اللف من الصدر مو من اليدين', 'Turn from the chest, not the hands'], { iso: true, hits: ['obliques'], also: ['abs'] }),
  X('side_plank', 'بلانك جانبي', 'Side plank', 'core', 'body', ['الوسط مرفوع، خط مستقيم', 'Hips up, one straight line'], { iso: true, unit: 'sec', hits: ['obliques'], also: ['abs', 'side_delt'] }),
  X('wrist_curl', 'ثني الرسغ', 'Wrist curl', 'arms', 'db', ['الساعد على الفخذ، الرسغ بس يتحرك', 'Forearm on the thigh, only the wrist moves'], { iso: true, hits: ['forearm'], also: [] }),
  X('preacher', 'باي على الكرسي (بريتشر)', 'Preacher curl', 'arms', 'machine', ['انزل لين قبل فرد اليد كامل', 'Down to just short of locked'], { iso: true, hits: ['biceps'], also: [] }),
  X('rear_fly', 'رفرفة خلفي', 'Reverse fly', 'shoulders', 'db', ['منحني، افتح يدينك للجنب', 'Bent over, open the arms out'], { iso: true, hits: ['rear_delt'], also: ['upper_back'] }),
  X('adductor', 'جهاز الفخذ الداخلي', 'Adductor machine', 'legs', 'machine', ['ضم ببطء ورجّع ببطء', 'Squeeze slowly, release slowly'], { iso: true, hits: ['adductors'], also: [] }),
  X('bulgarian', 'سكوات بلغاري', 'Bulgarian split squat', 'legs', 'db', ['رجلك الخلفية على كرسي', 'Back foot on a bench'], { hits: ['quads', 'glutes'], also: ['adductors', 'hamstrings'], home: 'bw_lunge' }),
  X('cable_fly', 'تفتيح كيبل', 'Cable fly', 'chest', 'machine', ['اضم يدينك قدّام صدرك واعصر', 'Bring hands together, squeeze'], { iso: true, hits: ['chest'], also: ['front_delt'], home: 'pushup' }),
  X('tbar_row', 'تجديف تي بار', 'T-bar row', 'back', 'bar', ['صدرك مرفوع، اسحب لبطنك', 'Chest up, pull to the belly'], { hits: ['upper_back', 'lats'], also: ['rear_delt', 'biceps'], home: 'inv_row' }),
];
EXERCISES.push(...MORE);

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

// exercises you wrote yourself (kept in the state; the app registers them as it loads)
let CUSTOM = new Map<string, Exercise>();
const COARSE: Record<Part, Muscle> = {
  chest: 'chest', front_delt: 'shoulders', side_delt: 'shoulders', rear_delt: 'shoulders', biceps: 'arms', triceps: 'arms', forearm: 'arms', abs: 'core', obliques: 'core',
  traps: 'back', lats: 'back', upper_back: 'back', lower_back: 'back', glutes: 'glutes', quads: 'legs', hamstrings: 'legs', adductors: 'legs', calves: 'legs',
};
export function registerCustom(list: GymCustom[] = []) {
  CUSTOM = new Map(list.map((c) => [c.id, X(c.id, c.name, c.name, c.kind === 'cardio' ? 'cardio' : COARSE[c.hits[0] as Part] || 'core', c.kind, ['تمرين من عندك', 'Your own exercise'], { hits: c.hits as Part[], also: (c.also || []) as Part[], custom: true, unit: c.kind === 'cardio' ? 'min' : c.unit })]));
}
export const allExercises = (): Exercise[] => [...EXERCISES, ...CUSTOM.values()];

const UNKNOWN = (id: string): Exercise => X(id, 'تمرين', 'Exercise', 'core', 'body', ['', ''], {});
export const exercise = (id: string): Exercise => BY_ID.get(id) || CUSTOM.get(id) || UNKNOWN(id);
export const exName = (id: string) => L(exercise(id).ar, exercise(id).en);
export const muscleName = (m: Muscle) =>
  ({ chest: L('صدر', 'Chest'), back: L('ظهر', 'Back'), legs: L('أرجل', 'Legs'), glutes: L('أرداف', 'Glutes'), shoulders: L('كتف', 'Shoulders'), arms: L('ذراع', 'Arms'), core: L('بطن', 'Core'), cardio: L('كارديو', 'Cardio') })[m];

// ---------------- the days of a program ----------------

interface SlotDef {
  key: string;
  name: [string, string];
  sub: [string, string];
  ex: string[];
}

const S = (key: string, name: [string, string], sub: [string, string], ex: string[]): SlotDef => ({ key, name, sub, ex });

const SLOTS: Record<string, SlotDef> = {
  fa: S('fa', ['جسم كامل أ', 'Full body A'], ['أرجل وصدر وظهر', 'Legs, chest, back'], ['squat', 'bench', 'row', 'lateral', 'curl', 'plank']),
  fb: S('fb', ['جسم كامل ب', 'Full body B'], ['ظهر وكتف وأرجل', 'Back, shoulders, legs'], ['deadlift', 'ohp', 'pulldown', 'lunge', 'pushdown', 'leg_raise']),
  fc: S('fc', ['جسم كامل ج', 'Full body C'], ['أرجل وصدر وظهر', 'Legs, chest, back'], ['leg_press', 'incline_db', 'cable_row', 'rdl', 'face_pull', 'plank']),
  ua: S('ua', ['علوي أ', 'Upper A'], ['صدر وظهر وكتف وذراع', 'Chest, back, shoulders, arms'], ['bench', 'row', 'ohp', 'pulldown', 'curl', 'pushdown']),
  ub: S('ub', ['علوي ب', 'Upper B'], ['صدر وظهر وكتف وذراع', 'Chest, back, shoulders, arms'], ['incline_db', 'pullup', 'db_press', 'cable_row', 'lateral', 'db_curl']),
  la: S('la', ['سفلي أ', 'Lower A'], ['أرجل وبطن', 'Legs and core'], ['squat', 'rdl', 'leg_curl', 'calf', 'plank', 'leg_ext']),
  lb: S('lb', ['سفلي ب', 'Lower B'], ['أرجل وأرداف', 'Legs and glutes'], ['deadlift', 'leg_press', 'lunge', 'hip_thrust', 'calf', 'leg_raise']),
  push: S('push', ['دفع', 'Push'], ['صدر وكتف وترايسبس', 'Chest, shoulders, triceps'], ['bench', 'ohp', 'incline_db', 'lateral', 'pushdown', 'dips']),
  pull: S('pull', ['سحب', 'Pull'], ['ظهر وبايسبس', 'Back and biceps'], ['deadlift', 'pulldown', 'row', 'face_pull', 'curl', 'db_curl']),
  legs: S('legs', ['أرجل', 'Legs'], ['أرجل وأرداف وبطن', 'Legs, glutes, core'], ['squat', 'rdl', 'leg_press', 'leg_curl', 'calf', 'leg_raise']),
  push2: S('push2', ['دفع ٢', 'Push 2'], ['كتف وصدر وترايسبس', 'Shoulders, chest, triceps'], ['ohp', 'incline_db', 'chest_press', 'lateral', 'skull', 'db_fly']),
  pull2: S('pull2', ['سحب ٢', 'Pull 2'], ['ظهر وبايسبس', 'Back and biceps'], ['pullup', 'cable_row', 'db_row', 'face_pull', 'db_curl', 'curl']),
  legs2: S('legs2', ['أرجل ٢', 'Legs 2'], ['أرداف وأرجل', 'Glutes and legs'], ['leg_press', 'hip_thrust', 'lunge', 'leg_ext', 'leg_curl', 'calf']),
};

/** which days make up the program, from how many days a week and the goal */
function slotKeys(p: GymProfile): { keys: string[]; name: [string, string] } {
  const n = Math.max(1, Math.min(6, p.days.length));
  if (n <= 2) return { keys: ['fa', 'fb'], name: ['جسم كامل', 'Full body'] };
  if (n === 3) {
    if (p.goal === 'muscle' && p.level !== 'new') return { keys: ['push', 'pull', 'legs'], name: ['دفع · سحب · أرجل', 'Push · Pull · Legs'] };
    if (p.goal === 'strength') return { keys: ['fa', 'fb'], name: ['جسم كامل للقوة', 'Full-body strength'] };
    return { keys: ['fa', 'fb', 'fc'], name: ['جسم كامل', 'Full body'] };
  }
  if (n === 4) return { keys: ['ua', 'la', 'ub', 'lb'], name: ['علوي · سفلي', 'Upper · Lower'] };
  if (n === 5) return { keys: ['ua', 'la', 'push', 'pull', 'legs'], name: ['علوي · سفلي · دفع · سحب · أرجل', 'Upper · Lower · Push · Pull · Legs'] };
  return { keys: ['push', 'pull', 'legs', 'push2', 'pull2', 'legs2'], name: ['دفع · سحب · أرجل ×٢', 'Push · Pull · Legs ×2'] };
}

export interface Scheme {
  sets: number;
  lo: number;
  hi: number;
  /** rest between sets, seconds */
  rest: number;
}

const GOALS: Record<GymGoal, { lo: number; hi: number; rest: number; cardio: number }> = {
  strength: { lo: 4, hi: 6, rest: 180, cardio: 0 },
  muscle: { lo: 8, hi: 12, rest: 90, cardio: 0 },
  fit: { lo: 10, hi: 12, rest: 60, cardio: 10 },
  fat: { lo: 12, hi: 15, rest: 45, cardio: 15 },
  endurance: { lo: 15, hi: 20, rest: 30, cardio: 20 },
};

export const GOAL_INFO: { v: GymGoal; t: [string, string]; d: [string, string] }[] = [
  { v: 'muscle', t: ['أبني عضل', 'Build muscle'], d: ['حجم وشكل: ٨–١٢ تكرار وراحة دقيقة ونص', 'Size and shape: 8–12 reps, 90s rest'] },
  { v: 'strength', t: ['أصير أقوى', 'Get stronger'], d: ['أوزان ثقيلة: ٤–٦ تكرار وراحة ٣ دقايق', 'Heavy weights: 4–6 reps, 3 min rest'] },
  { v: 'fat', t: ['أنزّل دهون', 'Lose fat'], d: ['حديد سريع وكارديو ربع ساعة بالآخر', 'Fast-paced weights and 15 min of cardio'] },
  { v: 'fit', t: ['لياقة وصحة', 'Fit and healthy'], d: ['شوي من كل شيء، بدون تعقيد', 'A bit of everything, nothing fancy'] },
  { v: 'endurance', t: ['تحمّل ونَفَس', 'Endurance'], d: ['تكرارات عالية وراحة قصيرة وكارديو أطول', 'High reps, short rest, longer cardio'] },
];

export function scheme(p: GymProfile, ex: Exercise): Scheme {
  const g = GOALS[p.goal];
  if (ex.unit === 'sec') return { sets: 3, lo: p.level === 'new' ? 30 : 45, hi: p.level === 'new' ? 45 : 60, rest: 45 };
  if (ex.unit === 'min') return { sets: 1, lo: g.cardio || 10, hi: g.cardio || 10, rest: 0 };
  const iso = !!ex.iso;
  const sets = iso ? 3 : p.level === 'new' ? 3 : p.goal === 'strength' ? 5 : p.level === 'pro' ? 4 : 3;
  const [lo, hi] = iso && p.goal === 'strength' ? [8, 12] : [g.lo, g.hi];
  return { sets, lo, hi, rest: iso ? Math.min(g.rest, 75) : g.rest };
}

/** about how long one exercise takes, in minutes */
function minutesOf(sc: Scheme, ex: Exercise): number {
  if (ex.unit === 'min') return sc.lo;
  return sc.sets * (0.8 + sc.rest / 60) + 1.5;
}

export interface SlotPlan {
  key: string;
  name: string;
  sub: string;
  items: { exId: string; scheme: Scheme }[];
  minutes: number;
}

export interface Program {
  name: string;
  slots: SlotPlan[];
}

/** what an exercise becomes in this profile: at home, or swapped by you */
export const resolve = (p: GymProfile, id: string): string => {
  let r = p.place === 'home' ? exercise(id).home || id : id;
  for (let i = 0; i < 6 && p.swaps?.[r] && p.swaps[r] !== r; i++) r = p.swaps[r];
  return r;
};

/** the other exercises for the same muscle you could do instead (at home: no machines or bars) */
export function alternatives(p: GymProfile | undefined, exId: string): Exercise[] {
  const ex = exercise(exId);
  const main = ex.hits[0];
  const ok = (e: Exercise) => e.id !== exId && (p?.place !== 'home' || e.kind === 'body' || e.kind === 'cardio');
  // the same main muscle first, then others for the same area
  const same = allExercises().filter((e) => ok(e) && main && e.hits.includes(main));
  const near = allExercises().filter((e) => ok(e) && !same.includes(e) && e.muscle === ex.muscle);
  return [...same, ...near];
}

// ---------------- what you train today ----------------

export type GroupId = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'glutes' | 'core' | 'cardio';

export const GROUPS: { id: GroupId; ar: string; en: string; parts: Part[]; big?: boolean }[] = [
  { id: 'chest', ar: 'صدر', en: 'Chest', parts: ['chest'], big: true },
  { id: 'back', ar: 'ظهر', en: 'Back', parts: ['lats', 'upper_back', 'traps', 'lower_back'], big: true },
  { id: 'shoulders', ar: 'كتف', en: 'Shoulders', parts: ['front_delt', 'side_delt', 'rear_delt'] },
  { id: 'biceps', ar: 'باي', en: 'Biceps', parts: ['biceps', 'forearm'] },
  { id: 'triceps', ar: 'تراي', en: 'Triceps', parts: ['triceps'] },
  { id: 'legs', ar: 'أرجل', en: 'Legs', parts: ['quads', 'hamstrings', 'adductors', 'calves'], big: true },
  { id: 'glutes', ar: 'أرداف', en: 'Glutes', parts: ['glutes'] },
  { id: 'core', ar: 'بطن', en: 'Core', parts: ['abs', 'obliques'] },
  { id: 'cardio', ar: 'كارديو', en: 'Cardio', parts: [] },
];
export const groupName = (g: GroupId) => {
  const x = GROUPS.find((y) => y.id === g)!;
  return L(x.ar, x.en);
};
/** «صدر (Chest)» for the muscle buttons */
export const groupLabel = (g: GroupId) => {
  const x = GROUPS.find((y) => y.id === g)!;
  return L(`${x.ar} (${x.en})`, x.en);
};
export const groupsName = (gs: GroupId[]) => gs.map(groupName).join(L(' + ', ' + '));

/** the program day's muscles, to suggest for today */
export function slotGroups(slotKey: string): GroupId[] {
  const k = slotKey.replace(/\d+$/, '');
  return (
    {
      push: ['chest', 'shoulders', 'triceps'],
      pull: ['back', 'biceps'],
      legs: ['legs', 'glutes', 'core'],
      ua: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
      ub: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
      la: ['legs', 'glutes', 'core'],
      lb: ['legs', 'glutes', 'core'],
      fa: ['chest', 'back', 'legs', 'shoulders'],
      fb: ['back', 'shoulders', 'legs', 'triceps'],
      fc: ['legs', 'chest', 'back', 'core'],
    } as Record<string, GroupId[]>
  )[k] || ['chest', 'back', 'legs'];
}

/**
 * today's workout from the muscles you picked: for each, its exercises (the ones you've done before
 * first, so the weights keep climbing; heavy compound moves before isolation), shared out in turns
 * until the time runs out.
 */
export function dayPlan(s: AppState, groups: GroupId[], p: GymProfile | undefined = s.gym?.profile): SlotPlan {
  const prof: GymProfile = p || { goal: 'fit', level: 'mid', place: 'gym', days: [], minutes: 60 };
  const g = GOALS[prof.goal];
  const done = new Set(finished(s).flatMap((x) => x.entries.map((e) => e.exId)));
  const home = prof.place === 'home';
  const lists = groups
    .filter((id) => id !== 'cardio')
    .map((id) => {
      const grp = GROUPS.find((x) => x.id === id)!;
      const pool = [...new Set(allExercises().filter((e) => e.kind !== 'cardio' && e.hits.some((h) => grp.parts.includes(h)) && grp.parts.includes(e.hits[0])).map((e) => resolve(prof, e.id)))]
        .map(exercise)
        .filter((e) => !home || e.kind === 'body');
      const rank = (e: Exercise) => (e.iso ? 2 : 0) + (done.has(e.id) || e.custom ? 0 : 1) + (e.custom ? -0.5 : 0);
      return { grp, pool: pool.sort((a, b) => rank(a) - rank(b)) };
    });
  const cardio = groups.includes('cardio');
  const cardioMin = g.cardio || 15;
  let budget = prof.minutes - 8 - (cardio ? cardioMin : 0);
  const cap = (prof.level === 'new' ? 5 : prof.level === 'pro' ? 7 : 6) + (lists.length > 3 ? 1 : 0);
  const items: SlotPlan['items'] = [];
  const used = new Set<string>();
  const want = (i: number) => (lists[i].grp.big ? (lists.length === 1 ? 6 : 3) : lists.length === 1 ? 5 : 2);
  const took = lists.map(() => 0);
  for (let round = 0; items.length < cap; round++) {
    let added = false;
    for (let i = 0; i < lists.length && items.length < cap; i++) {
      if (took[i] >= want(i) || round >= want(i)) continue;
      const ex = lists[i].pool.find((e) => !used.has(e.id));
      if (!ex) continue;
      const sc = scheme(prof, ex);
      const m = minutesOf(sc, ex);
      if (items.length >= 2 && budget - m < -3) continue;
      items.push({ exId: ex.id, scheme: sc });
      used.add(ex.id);
      took[i]++;
      budget -= m;
      added = true;
    }
    if (!added) break;
  }
  if (cardio) {
    const c = home ? 'jumprope' : groups.includes('legs') ? 'bike' : 'treadmill';
    items.push({ exId: c, scheme: { ...scheme(prof, exercise(c)), lo: cardioMin, hi: cardioMin } });
  }
  const minutes = Math.round(8 + items.reduce((a, it) => a + minutesOf(it.scheme, exercise(it.exId)), 0));
  return { key: groups.join('+'), name: groupsName(groups), sub: '', items, minutes };
}

/** every muscle a workout's exercises work: mainly, and also (minus the main ones) */
export function partsOf(exIds: string[]): { main: Set<Part>; also: Set<Part> } {
  const main = new Set<Part>();
  const also = new Set<Part>();
  for (const id of exIds) {
    const e = exercise(id);
    e.hits.forEach((h) => main.add(h));
    e.also.forEach((h) => also.add(h));
  }
  main.forEach((m) => also.delete(m));
  return { main, also };
}

/** the exercises that work a muscle — mainly first */
export const exercisesFor = (part: Part) => {
  const all = allExercises();
  return [...all.filter((e) => e.hits.includes(part)), ...all.filter((e) => !e.hits.includes(part) && e.also.includes(part))];
};

export function program(p: GymProfile): Program {
  const { keys, name } = slotKeys(p);
  const g = GOALS[p.goal];
  const slots = keys.map((k): SlotPlan => {
    const def = SLOTS[k];
    const ids = [...new Set(def.ex.map((id) => resolve(p, id)))];
    const items: SlotPlan['items'] = [];
    // the warm-up and the cardio come out of the time first
    let budget = p.minutes - 8 - g.cardio;
    for (const id of ids) {
      const ex = exercise(id);
      const sc = scheme(p, ex);
      const m = minutesOf(sc, ex);
      if (items.length >= 3 && budget - m < 0) break;
      items.push({ exId: id, scheme: sc });
      budget -= m;
      if (items.length >= (p.level === 'new' ? 5 : 6)) break;
    }
    if (g.cardio) {
      const c = p.place === 'home' ? 'jumprope' : k.startsWith('l') || k.startsWith('legs') ? 'bike' : 'treadmill';
      items.push({ exId: c, scheme: scheme(p, exercise(c)) });
    }
    const minutes = Math.round(8 + items.reduce((a, it) => a + minutesOf(it.scheme, exercise(it.exId)), 0));
    return { key: k, name: L(...def.name), sub: L(...def.sub), items, minutes };
  });
  return { name: L(...name), slots };
}

// ---------------- what to lift today ----------------

export interface Target {
  kg?: number;
  reps: number;
  /** first: no history · up: add weight · more: one more rep · same: hold */
  tag: 'first' | 'up' | 'more' | 'same';
  last?: { kg?: number; reps: number[] };
}

const finished = (s: AppState) => (s.gym?.sessions || []).filter((x) => x.end);

/** the last finished session that did this exercise */
export function lastOf(s: AppState, exId: string, before = Infinity): { session: GymSession; sets: { kg?: number; reps: number }[] } | null {
  const list = finished(s)
    .filter((x) => x.start < before)
    .sort((a, b) => b.start - a.start);
  for (const ses of list) {
    const e = ses.entries.find((x) => x.exId === exId);
    const sets = e?.sets.filter((x) => x.done && x.reps > 0) || [];
    if (sets.length) return { session: ses, sets };
  }
  return null;
}

const step = (ex: Exercise) => (ex.kind === 'bar' ? 2.5 : ex.kind === 'machine' ? 5 : 2);
const round = (kg: number, ex: Exercise) => {
  const q = ex.kind === 'db' ? 1 : 2.5;
  return Math.round(kg / q) * q;
};

/** double progression: reach the top of the range on every set, then add weight and start again at the bottom */
export function target(s: AppState, exId: string, sc: Scheme, before = Infinity): Target {
  const ex = exercise(exId);
  const last = lastOf(s, exId, before);
  if (!last) return { reps: sc.lo, tag: 'first' };
  const reps = last.sets.map((x) => x.reps);
  const kgs = last.sets.map((x) => x.kg || 0);
  const kg = Math.max(...kgs) || undefined;
  const info = { kg, reps };
  if (ex.unit === 'min') return { reps: Math.max(sc.lo, reps[0]), tag: 'same', last: info };
  const top = last.sets.filter((x) => (x.kg || 0) >= (kg || 0)).map((x) => x.reps);
  const all = top.length >= Math.min(sc.sets, last.sets.length) && Math.min(...top) >= sc.hi;
  if (ex.unit === 'sec') return { reps: all ? sc.hi + 5 : Math.min(sc.hi, Math.min(...reps) + 5), tag: 'more', last: info };
  if (!kg) return { reps: all ? sc.hi + 1 : Math.min(...reps) + 1, tag: 'more', last: info };
  if (all) return { kg: round(kg + step(ex), ex), reps: sc.lo, tag: 'up', last: info };
  const low = Math.min(...top);
  if (low < sc.lo) return { kg, reps: sc.lo, tag: 'same', last: info };
  return { kg, reps: Math.min(sc.hi, low + 1), tag: 'more', last: info };
}

export function targetLine(t: Target, ex: Exercise): string {
  const u = ex.unit === 'sec' ? L('ث', 's') : ex.unit === 'min' ? L('د', 'min') : '';
  const w = (kg?: number) => (kg ? `${fmtKg(kg)} × ` : '');
  if (t.tag === 'first') return ex.unit === 'min' ? L(`${t.reps} دقيقة`, `${t.reps} min`) : ex.kind === 'body' ? L(`ابدأ بـ ${t.reps}${u}`, `Start with ${t.reps}${u}`) : L(`أول مرة: اختر وزن تقدر ترفعه ${t.reps} مرات بصعوبة`, `First time: pick a weight you can just lift ${t.reps} times`);
  if (t.tag === 'up') return L(`زِد الوزن: ${w(t.kg)}${t.reps}`, `Add weight: ${w(t.kg)}${t.reps}`);
  if (t.tag === 'more') return L(`تكرار زيادة: ${w(t.kg)}${t.reps}${u}`, `One more: ${w(t.kg)}${t.reps}${u}`);
  return ex.unit === 'min' ? L(`${t.reps} دقيقة`, `${t.reps} min`) : L(`ثبّت: ${w(t.kg)}${t.reps}`, `Hold: ${w(t.kg)}${t.reps}`);
}

export const fmtKg = (kg: number) => `${+kg.toFixed(2)}`;

// ---------------- the week, the streak, the records ----------------

export const weekStart = (day: string) => addDays(day, -weekday(day));

export interface GymWeek {
  days: { day: string; planned: boolean; done: boolean }[];
  done: number;
  target: number;
}

export function gymWeek(s: AppState, now = Date.now()): GymWeek {
  const today = todayKey(now);
  const from = weekStart(today);
  const p = s.gym?.profile;
  const doneDays = new Set(finished(s).map((x) => x.day));
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(from, i);
    return { day, planned: !!p?.days.includes(i), done: doneDays.has(day) };
  });
  const done = finished(s).filter((x) => x.day >= from && x.day <= addDays(from, 6)).length;
  return { days, done, target: p?.days.length || 0 };
}

/** weeks in a row that hit the target (this week counts once it's hit) */
export function streakWeeks(s: AppState, now = Date.now()): number {
  const p = s.gym?.profile;
  if (!p?.days.length) return 0;
  const list = finished(s);
  if (!list.length) return 0;
  const first = weekStart(list.reduce((m, x) => (x.day < m ? x.day : m), list[0].day));
  const count = (w: string) => list.filter((x) => x.day >= w && x.day <= addDays(w, 6)).length;
  let w = weekStart(todayKey(now));
  let n = 0;
  if (count(w) >= p.days.length) n++;
  w = addDays(w, -7);
  while (w >= first && count(w) >= p.days.length) {
    n++;
    w = addDays(w, -7);
  }
  return n;
}

/** estimated one-rep max — how records compare across different reps */
export const e1rm = (kg: number, reps: number) => kg * (1 + Math.min(reps, 12) / 30);

export interface Record1 {
  exId: string;
  kg: number;
  reps: number;
  day: string;
  /** e1rm a month before, to show the climb */
  monthAgo?: number;
  best: number;
}

export function records(s: AppState, now = Date.now()): Record1[] {
  const monthAgo = now - 30 * 86400_000;
  const map = new Map<string, Record1>();
  const old = new Map<string, number>();
  for (const ses of finished(s)) {
    for (const e of ses.entries) {
      const ex = exercise(e.exId);
      if (ex.kind === 'body' || ex.kind === 'cardio') continue;
      for (const st of e.sets) {
        if (!st.done || !st.kg || !st.reps) continue;
        const v = e1rm(st.kg, st.reps);
        const r = map.get(e.exId);
        if (!r || v > r.best) map.set(e.exId, { exId: e.exId, kg: st.kg, reps: st.reps, day: ses.day, best: v });
        if (ses.start < monthAgo) old.set(e.exId, Math.max(old.get(e.exId) || 0, v));
      }
    }
  }
  return [...map.values()].map((r) => ({ ...r, monthAgo: old.get(r.exId) })).sort((a, b) => b.best - a.best);
}

/** a session's totals, and the records it broke */
export function sessionSummary(s: AppState, ses: GymSession) {
  let sets = 0;
  let volume = 0;
  const prs: { exId: string; kg: number; reps: number }[] = [];
  for (const e of ses.entries) {
    let best = 0;
    let bestSet: { kg: number; reps: number } | null = null;
    for (const st of e.sets) {
      if (!st.done) continue;
      sets++;
      volume += (st.kg || 0) * st.reps;
      if (st.kg && st.reps) {
        const v = e1rm(st.kg, st.reps);
        if (v > best) {
          best = v;
          bestSet = { kg: st.kg, reps: st.reps };
        }
      }
    }
    if (!bestSet) continue;
    let before = 0;
    for (const o of finished(s)) {
      if (o.id === ses.id || o.start >= ses.start) continue;
      for (const x of o.entries) if (x.exId === e.exId) for (const st of x.sets) if (st.done && st.kg) before = Math.max(before, e1rm(st.kg, st.reps));
    }
    if (before && best > before + 0.01) prs.push({ exId: e.exId, ...bestSet });
  }
  const minutes = Math.max(1, Math.round(((ses.end || Date.now()) - ses.start) / 60000));
  return { sets, volume: Math.round(volume), prs, minutes };
}

export interface NextWorkout {
  slot: SlotPlan;
  /** the day it's due: today, or the next of your gym days */
  day: string;
  index: number;
}

export function nextWorkout(s: AppState, now = Date.now()): NextWorkout | null {
  const p = s.gym?.profile;
  if (!p) return null;
  const prog = program(p);
  const index = (s.gym.rot || 0) % prog.slots.length;
  const today = todayKey(now);
  const doneToday = finished(s).some((x) => x.day === today);
  let day = today;
  for (let i = doneToday ? 1 : 0; i < 8; i++) {
    const d = addDays(today, i);
    if (p.days.includes(weekday(d))) {
      day = d;
      break;
    }
  }
  return { slot: prog.slots[index], day, index };
}

/** is today a gym day you haven't trained yet */
export function gymToday(s: AppState, now = Date.now()): NextWorkout | null {
  const n = nextWorkout(s, now);
  return n && n.day === todayKey(now) ? n : null;
}

export const liveSession = (s: AppState) => (s.gym?.sessions || []).find((x) => !x.end) || null;

// ---------------- the body ----------------

/** the latest value of each measurement, and what it was ~30 days earlier */
export function bodyNow(s: AppState) {
  const list = [...(s.gym?.body || [])].sort((a, b) => a.day.localeCompare(b.day) || a.createdAt - b.createdAt);
  const keys = ['weight', 'fat', 'waist', 'chest', 'arm', 'thigh'] as const;
  const out = {} as Record<(typeof keys)[number], { v: number; day: string; before?: number } | undefined>;
  for (const k of keys) {
    const has = list.filter((x) => x[k] != null);
    const last = has[has.length - 1];
    if (!last) continue;
    const ref = addDays(last.day, -30);
    const old = [...has].reverse().find((x) => x.day <= ref) || (has.length > 1 ? has[0] : undefined);
    out[k] = { v: last[k] as number, day: last.day, before: old && old !== last ? (old[k] as number) : undefined };
  }
  return out;
}

export const weightSeries = (s: AppState, days = 90, now = Date.now()) => {
  const from = addDays(todayKey(now), -days);
  const by = new Map<string, number>();
  for (const b of [...(s.gym?.body || [])].sort((a, x) => a.createdAt - x.createdAt)) if (b.weight != null && b.day >= from) by.set(b.day, b.weight);
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, kg]) => ({ day, kg }));
};

export function bmi(kg?: number, cm?: number): number | null {
  return kg && cm ? kg / (cm / 100) ** 2 : null;
}

export const ACTIVITY: { v: number; t: [string, string] }[] = [
  { v: 1.375, t: ['خفيف: تمرين ١–٣ أيام', 'Light: 1–3 days'] },
  { v: 1.55, t: ['متوسط: ٣–٥ أيام', 'Moderate: 3–5 days'] },
  { v: 1.725, t: ['عالي: ٦–٧ أيام', 'High: 6–7 days'] },
];

/**
 * daily calories and protein for the goal (Mifflin–St Jeor × activity): muscle and strength eat a
 * little over, fat loss ~20% under. null until weight, height, age and sex are known.
 */
export function nutrition(s: AppState, now = Date.now()): { maintain: number; kcal: number; protein: number; water: number } | null {
  const i = s.gym?.info || {};
  const kg = bodyNow(s).weight?.v;
  if (!kg || !i.height || !i.birthYear || !i.sex) return null;
  const age = new Date(now).getFullYear() - i.birthYear;
  const bmr = 10 * kg + 6.25 * i.height - 5 * age + (i.sex === 'm' ? 5 : -161);
  const act = i.activity || (s.gym.profile ? (s.gym.profile.days.length >= 5 ? 1.725 : s.gym.profile.days.length >= 3 ? 1.55 : 1.375) : 1.55);
  const maintain = Math.round(bmr * act / 10) * 10;
  const goal = s.gym.profile?.goal || 'fit';
  const kcal = Math.round((maintain * (goal === 'fat' ? 0.8 : goal === 'muscle' ? 1.1 : goal === 'strength' ? 1.05 : 1)) / 10) * 10;
  const protein = Math.round(kg * (goal === 'fat' ? 2.2 : goal === 'muscle' || goal === 'strength' ? 2 : 1.6));
  const water = Math.round(kg * 0.035 * 10) / 10;
  return { maintain, kcal, protein, water };
}

/** the plates on each side of the bar for a total weight (a 20 kg bar unless you say otherwise) */
export function plates(total: number, bar = 20): { each: number[]; left: number } {
  const set = [25, 20, 15, 10, 5, 2.5, 1.25];
  let side = Math.max(0, (total - bar) / 2);
  const each: number[] = [];
  for (const p of set)
    while (side >= p - 1e-9) {
      each.push(p);
      side = Math.round((side - p) * 100) / 100;
    }
  return { each, left: side * 2 };
}

/** all finished sessions, newest first */
export const history = (s: AppState) => finished(s).sort((a, b) => b.start - a.start);

/** what you did on one exercise, session by session (newest first) */
export function exerciseHistory(s: AppState, exId: string) {
  return history(s)
    .map((ses) => ({ ses, sets: ses.entries.find((e) => e.exId === exId)?.sets.filter((x) => x.done) || [] }))
    .filter((x) => x.sets.length);
}
