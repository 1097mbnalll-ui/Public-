// The food base for «أكلي». Every food has a household unit (spoon, piece, cup…) and its grams,
// so an amount reads «٥ ملاعق رز (١٥٠ جم)». Values per 100 g: ingredients from standard food
// tables (USDA-style); home dishes are estimates from typical recipes — the weekly check-in on
// your real weight corrects what they get wrong.

import type { FoodKind, MealSlot } from '../types';

export interface Food {
  id: string;
  t: [string, string];
  kind: FoodKind;
  /** the household unit: Arabic singular, Arabic plural, English */
  unit: [string, string, string];
  /** grams (or ml) in one unit */
  g: number;
  /** per 100 g */
  k: number;
  p: number;
  c: number;
  f: number;
  /** smallest change of amount, in units */
  step?: number;
  /** what it contains, for «what you don't eat» */
  tags?: string[];
  /** eaten freely — no limit needed (salad, cucumber) */
  free?: boolean;
}

const F = (id: string, t: [string, string], kind: FoodKind, unit: [string, string, string], g: number, k: number, p: number, c: number, f: number, o: Partial<Food> = {}): Food => ({ id, t, kind, unit, g, k, p, c, f, ...([CUPPED, FIST, THUMB].includes(unit) && o.step == null ? { step: 0.5 } : {}), ...o });
const LADLE: [string, string, string] = ['مغرفة', 'مغارف', 'ladle'];
const CUP: [string, string, string] = ['كوب', 'أكواب', 'cup'];
// amounts by your own hand, which grows with your body: a palm of protein, a cupped hand of
// starch, a fist of vegetables, a thumb of fat (the hand-portion method)
const PALM: [string, string, string] = ['كف', 'كفوف', 'palm'];
const CUPPED: [string, string, string] = ['كف مقعّر', 'كفوف مقعّرة', 'cupped hand'];
const FIST: [string, string, string] = ['قبضة', 'قبضات', 'fist'];
const THUMB: [string, string, string] = ['إبهام', 'إبهام', 'thumb'];

export const FOODS: Food[] = [
  // ---- starches
  F('rice_kabsa', ['رز كبسة', 'Kabsa rice'], 'starch', CUPPED, 90, 160, 3.2, 28, 4),
  F('rice_white', ['رز أبيض', 'White rice'], 'starch', CUPPED, 90, 130, 2.7, 28, 0.3),
  F('bread_brown', ['خبز بر', 'Wholewheat bread'], 'starch', ['رغيف', 'أرغفة', 'loaf'], 90, 250, 9, 46, 3.5, { step: 0.5 }),
  F('bread_white', ['خبز أبيض', 'White bread'], 'starch', ['رغيف', 'أرغفة', 'loaf'], 90, 270, 9, 52, 3, { step: 0.5 }),
  F('tamees', ['تميس', 'Tamees'], 'starch', ['قطعة', 'قطع', 'piece'], 100, 275, 8, 55, 2, { step: 0.5 }),
  F('oats', ['شوفان', 'Oats'], 'starch', CUPPED, 30, 389, 17, 66, 7),
  F('pasta', ['مكرونة مسلوقة', 'Cooked pasta'], 'starch', CUPPED, 80, 158, 5.8, 31, 0.9, { step: 0.5 }),
  F('potato', ['بطاطس مسلوقة', 'Boiled potato'], 'starch', ['حبة', 'حبات', 'potato'], 170, 87, 1.9, 20, 0.1, { step: 0.5 }),
  // ---- home dishes (estimates)
  F('marqooq', ['مرقوق', 'Marqooq'], 'mixed', LADLE, 250, 95, 5, 12, 3, { step: 0.5, tags: ['redmeat'] }),
  F('jareesh', ['جريش', 'Jareesh'], 'mixed', LADLE, 200, 110, 4, 16, 3.5, { step: 0.5, tags: ['dairy'] }),
  F('saleeg', ['سليق', 'Saleeg'], 'mixed', LADLE, 200, 140, 6, 18, 5, { step: 0.5, tags: ['dairy'] }),
  F('edam_meat', ['إيدام لحم', 'Meat stew'], 'mixed', LADLE, 200, 90, 7, 5, 5, { step: 0.5, tags: ['redmeat'] }),
  F('edam_chicken', ['إيدام دجاج', 'Chicken stew'], 'mixed', LADLE, 200, 80, 8, 5, 3, { step: 0.5 }),
  F('molokhia', ['ملوخية بالدجاج', 'Molokhia with chicken'], 'mixed', LADLE, 200, 65, 6, 3, 3.5, { step: 0.5 }),
  F('lentils', ['شوربة عدس', 'Lentil soup'], 'mixed', CUP, 240, 70, 4.5, 11, 1.2, { step: 0.5 }),
  F('foul', ['فول مدمس', 'Foul medames'], 'mixed', CUP, 170, 110, 7.6, 19, 0.4, { step: 0.5 }),
  // ---- protein
  F('chicken_kabsa', ['دجاج كبسة بدون جلد', 'Kabsa chicken, no skin'], 'protein', PALM, 120, 190, 27, 0, 9, { step: 0.5 }),
  F('meat_kabsa', ['لحم كبسة', 'Kabsa meat'], 'protein', PALM, 100, 250, 26, 0, 16, { step: 0.5, tags: ['redmeat'] }),
  F('chicken_breast', ['صدر دجاج مشوي', 'Grilled chicken breast'], 'protein', PALM, 120, 165, 31, 0, 3.6, { step: 0.5 }),
  F('fish', ['سمك مشوي', 'Grilled fish'], 'protein', PALM, 130, 130, 26, 0, 3, { step: 0.5, tags: ['fish'] }),
  F('tuna', ['تونة بالماء', 'Tuna in water'], 'protein', ['علبة', 'علب', 'can'], 85, 116, 26, 0, 1, { step: 0.5, tags: ['fish'] }),
  F('egg', ['بيض', 'Egg'], 'protein', ['بيضة', 'بيضات', 'egg'], 50, 143, 12.6, 0.7, 9.5, { tags: ['egg'] }),
  // ---- dairy
  F('laban', ['لبن قليل الدسم', 'Low-fat laban'], 'dairy', CUP, 240, 40, 3.3, 4.8, 1, { step: 0.5, tags: ['dairy'] }),
  F('milk', ['حليب قليل الدسم', 'Low-fat milk'], 'dairy', CUP, 240, 42, 3.4, 5, 1, { step: 0.5, tags: ['dairy'] }),
  F('greek_yogurt', ['زبادي يوناني', 'Greek yogurt'], 'dairy', ['علبة', 'علب', 'pot'], 170, 73, 10, 3.6, 2, { tags: ['dairy'] }),
  F('yogurt', ['زبادي', 'Yogurt'], 'dairy', ['علبة', 'علب', 'pot'], 170, 63, 5, 7, 1.5, { tags: ['dairy'] }),
  F('labneh', ['لبنة', 'Labneh'], 'dairy', THUMB, 20, 155, 8, 4, 12, { tags: ['dairy'] }),
  F('cheese', ['جبن أبيض خفيف', 'Light white cheese'], 'dairy', ['شريحة', 'شرائح', 'slice'], 20, 180, 18, 3, 11, { tags: ['dairy'] }),
  // ---- vegetables
  F('salad', ['سلطة خضار', 'Green salad'], 'veg', FIST, 100, 20, 1, 4, 0.2, { free: true }),
  F('cucumber', ['خيار', 'Cucumber'], 'veg', ['حبة', 'حبات', 'cucumber'], 100, 15, 0.7, 3.6, 0.1, { free: true }),
  F('tomato', ['طماطم', 'Tomato'], 'veg', ['حبة', 'حبات', 'tomato'], 120, 18, 0.9, 3.9, 0.2),
  F('veg_mix', ['خضار مشكلة مطبوخة', 'Cooked mixed vegetables'], 'veg', FIST, 150, 50, 2.5, 9, 0.5, { step: 0.5 }),
  // ---- fats
  F('olive_oil', ['زيت زيتون', 'Olive oil'], 'fat', THUMB, 10, 884, 0, 0, 100),
  F('tahini', ['طحينة', 'Tahini'], 'fat', THUMB, 15, 595, 17, 21, 54),
  F('nuts', ['مكسرات', 'Nuts'], 'fat', ['حفنة', 'حفنات', 'handful'], 28, 600, 20, 20, 52, { step: 0.5, tags: ['nuts'] }),
  F('peanut_butter', ['زبدة فول سوداني', 'Peanut butter'], 'fat', THUMB, 16, 588, 25, 20, 50, { tags: ['nuts'] }),
  // ---- fruit
  F('apple', ['تفاح', 'Apple'], 'fruit', ['حبة', 'حبات', 'apple'], 180, 52, 0.3, 14, 0.2),
  F('banana', ['موز', 'Banana'], 'fruit', ['حبة', 'حبات', 'banana'], 120, 89, 1.1, 23, 0.3, { step: 0.5 }),
  F('orange', ['برتقال', 'Orange'], 'fruit', ['حبة', 'حبات', 'orange'], 150, 47, 0.9, 12, 0.1),
  F('dates', ['تمر', 'Dates'], 'fruit', ['حبة', 'حبات', 'date'], 8, 282, 2.5, 75, 0.4),
  // ---- sweets & drinks
  F('honey', ['عسل', 'Honey'], 'sweet', ['ملعقة صغيرة', 'ملاعق صغيرة', 'tsp'], 7, 304, 0.3, 82, 0),
  F('kunafa', ['كنافة', 'Kunafa'], 'sweet', ['قطعة', 'قطع', 'piece'], 100, 380, 6, 45, 20, { step: 0.5, tags: ['dairy'] }),
  F('juice', ['عصير برتقال', 'Orange juice'], 'drink', CUP, 240, 45, 0.7, 10, 0.2, { step: 0.5 }),
  F('soda', ['مشروب غازي', 'Soft drink'], 'drink', ['علبة', 'علب', 'can'], 330, 42, 0, 10.6, 0),
  F('tea_sugar', ['شاي بسكر', 'Tea with sugar'], 'drink', ['كوب', 'أكواب', 'cup'], 250, 16, 0, 4, 0),
];

export const FOOD = new Map(FOODS.map((f) => [f.id, f]));

/** how an item may be scaled to fit a meal: starch and protein carry the meal's size */
export type Scale = 'starch' | 'protein';

export interface Dish {
  id: string;
  t: [string, string];
  slots: MealSlot[];
  /** taken from the family's pot, not cooked by you */
  family?: boolean;
  items: { food: string; qty: number; scale?: Scale }[];
  /** a short recipe for what you cook yourself */
  cook?: { min: number; steps: [string, string][] };
}

const D = (id: string, t: [string, string], slots: MealSlot[], items: Dish['items'], o: Partial<Dish> = {}): Dish => ({ id, t, slots, items, ...o });
const L = (food: string, qty: number, scale?: Scale) => ({ food, qty, ...(scale ? { scale } : {}) });

export const DISHES: Dish[] = [
  // ---- breakfast
  D('oats_milk', ['شوفان بالحليب والموز', 'Oats with milk and banana'], ['breakfast', 'meal'], [L('oats', 1.5, 'starch'), L('milk', 1, 'protein'), L('banana', 0.5)], { cook: { min: 5, steps: [['اخلط الشوفان مع الحليب', 'Mix the oats with the milk'], ['سخّنه دقيقتين في المايكرويف أو على النار', 'Heat for 2 minutes'], ['قطّع الموز فوقه', 'Slice the banana on top']] } }),
  D('eggs_bread', ['بيض مسلوق مع خبز بر', 'Boiled eggs with wholewheat bread'], ['breakfast', 'dinner', 'meal'], [L('egg', 2, 'protein'), L('bread_brown', 0.5, 'starch'), L('cucumber', 1), L('tomato', 1)], { cook: { min: 10, steps: [['اسلق البيض ١٠ دقايق', 'Boil the eggs 10 minutes'], ['قطّع الخيار والطماطم', 'Slice the cucumber and tomato']] } }),
  D('shakshuka', ['شكشوكة', 'Shakshuka'], ['breakfast', 'dinner'], [L('egg', 2, 'protein'), L('tomato', 1.5), L('olive_oil', 0.5), L('bread_brown', 0.5, 'starch')], { cook: { min: 12, steps: [['قطّع الطماطم واطبخها بملعقة الزيت ٥ دقايق', 'Cook the chopped tomato in the oil 5 minutes'], ['اكسر البيض فوقها وغطّها لين يستوي', 'Crack the eggs on top, cover until set']] } }),
  D('foul_bread', ['فول مع خبز بر', 'Foul with wholewheat bread'], ['breakfast', 'dinner'], [L('foul', 1, 'protein'), L('bread_brown', 0.5, 'starch'), L('olive_oil', 0.5), L('tomato', 1)], { cook: { min: 5, steps: [['سخّن الفول وحط عليه الزيت والليمون', 'Warm the foul, add the oil and lemon']] } }),
  D('labneh_eggs', ['لبنة وبيضة مع خبز بر', 'Labneh, an egg and bread'], ['breakfast', 'dinner'], [L('labneh', 2), L('egg', 1, 'protein'), L('bread_brown', 0.5, 'starch'), L('cucumber', 1)]),
  D('yogurt_oats', ['زبادي يوناني بالشوفان والعسل', 'Greek yogurt, oats and honey'], ['breakfast', 'snack', 'meal'], [L('greek_yogurt', 1, 'protein'), L('oats', 1, 'starch'), L('honey', 1)]),
  D('cheese_bread', ['جبن خفيف مع خبز بر وخيار', 'Light cheese, bread and cucumber'], ['breakfast', 'dinner'], [L('cheese', 3, 'protein'), L('bread_brown', 0.5, 'starch'), L('cucumber', 1), L('tomato', 1)]),
  // ---- lunch from the family's pot
  D('kabsa_chicken', ['من صحن كبسة الدجاج', 'From the chicken kabsa'], ['lunch', 'dinner'], [L('rice_kabsa', 1.5, 'starch'), L('chicken_kabsa', 1.25, 'protein'), L('salad', 1), L('laban', 1)], { family: true }),
  D('kabsa_meat', ['من صحن كبسة اللحم', 'From the meat kabsa'], ['lunch', 'dinner'], [L('rice_kabsa', 1.5, 'starch'), L('meat_kabsa', 1, 'protein'), L('salad', 1), L('laban', 1)], { family: true }),
  D('edam_meat_rice', ['من صحن الإيدام مع رز', 'From the meat stew, with rice'], ['lunch', 'dinner'], [L('rice_white', 1.5, 'starch'), L('edam_meat', 1.5, 'protein'), L('salad', 1)], { family: true }),
  D('edam_chicken_rice', ['من صحن إيدام الدجاج مع رز', 'From the chicken stew, with rice'], ['lunch', 'dinner'], [L('rice_white', 1.5, 'starch'), L('edam_chicken', 1.5, 'protein'), L('salad', 1)], { family: true }),
  D('molokhia_rice', ['من صحن الملوخية مع رز', 'From the molokhia, with rice'], ['lunch', 'dinner'], [L('rice_white', 1.5, 'starch'), L('molokhia', 1.5, 'protein'), L('chicken_breast', 0.5, 'protein'), L('salad', 1)], { family: true }),
  D('marqooq', ['من صحن المرقوق', 'From the marqooq'], ['lunch'], [L('marqooq', 1.5, 'starch'), L('salad', 1), L('laban', 1, 'protein')], { family: true }),
  D('jareesh', ['من صحن الجريش', 'From the jareesh'], ['lunch', 'dinner'], [L('jareesh', 1.5, 'starch'), L('chicken_breast', 0.5, 'protein'), L('salad', 1)], { family: true }),
  D('saleeg', ['من صحن السليق', 'From the saleeg'], ['lunch'], [L('saleeg', 1.5, 'starch'), L('chicken_breast', 0.75, 'protein'), L('salad', 1)], { family: true }),
  // ---- lunch / dinner you cook
  D('chicken_rice', ['صدر دجاج مشوي مع رز وسلطة', 'Grilled chicken, rice and salad'], ['lunch', 'dinner'], [L('chicken_breast', 1.25, 'protein'), L('rice_white', 1.5, 'starch'), L('salad', 1), L('olive_oil', 0.5)], { cook: { min: 25, steps: [['تبّل الصدر بملح وبهارات وليمون', 'Season the breast with salt, spices, lemon'], ['اشوه في المقلاة أو الفرن ٧ دقايق كل جهة', 'Grill 7 minutes a side'], ['رز أبيض: كوب رز لكوبين موية، ١٥ دقيقة', 'Rice: 1 cup to 2 of water, 15 minutes']] } }),
  D('fish_rice', ['سمك مشوي مع رز وسلطة', 'Grilled fish, rice and salad'], ['lunch', 'dinner'], [L('fish', 1.25, 'protein'), L('rice_white', 1.5, 'starch'), L('salad', 1), L('olive_oil', 0.5)], { cook: { min: 20, steps: [['تبّل السمك بالكمون والليمون', 'Season the fish with cumin and lemon'], ['اشوه في الفرن ١٥ دقيقة', 'Bake 15 minutes']] } }),
  D('tuna_pasta', ['مكرونة بالتونة والطماطم', 'Pasta with tuna and tomato'], ['lunch', 'dinner'], [L('pasta', 1.5, 'starch'), L('tuna', 1, 'protein'), L('tomato', 1), L('olive_oil', 0.5)], { cook: { min: 15, steps: [['اسلق المكرونة ١٠ دقايق', 'Boil the pasta 10 minutes'], ['قلّب الطماطم بالزيت وأضف التونة والمكرونة', 'Toss the tomato in the oil, add the tuna and pasta']] } }),
  D('chicken_potato', ['صدر دجاج مع بطاطس وخضار', 'Chicken with potato and vegetables'], ['lunch', 'dinner'], [L('chicken_breast', 1.25, 'protein'), L('potato', 1, 'starch'), L('veg_mix', 1), L('olive_oil', 0.5)], { cook: { min: 30, steps: [['قطّع البطاطس والخضار وحطها بالفرن مع الزيت ٢٠ دقيقة', 'Roast the potato and vegetables with the oil 20 minutes'], ['اشوِ الدجاج جنبها', 'Grill the chicken alongside']] } }),
  D('lentil_bread', ['شوربة عدس مع خبز بر', 'Lentil soup with bread'], ['dinner', 'lunch'], [L('lentils', 1.5, 'protein'), L('bread_brown', 0.5, 'starch'), L('salad', 1)], { cook: { min: 30, steps: [['كوب عدس لـ٤ أكواب موية مع بصلة وكمون', '1 cup lentils, 4 cups water, an onion, cumin'], ['اطبخه ٢٥ دقيقة واخلطه', 'Cook 25 minutes and blend']] } }),
  // ---- dinner
  D('tuna_salad', ['سلطة تونة مع خبز بر', 'Tuna salad with bread'], ['dinner', 'meal'], [L('tuna', 1, 'protein'), L('salad', 1), L('olive_oil', 0.5), L('bread_brown', 0.5, 'starch')], { cook: { min: 5, steps: [['صفّي التونة واخلطها مع السلطة والزيت والليمون', 'Drain the tuna, toss with the salad, oil and lemon']] } }),
  D('chicken_wrap', ['ساندويتش دجاج بخبز بر', 'Chicken wrap in wholewheat bread'], ['dinner', 'meal'], [L('chicken_breast', 1, 'protein'), L('bread_brown', 1, 'starch'), L('salad', 0.5)], { cook: { min: 15, steps: [['قطّع صدر الدجاج المشوي شرايح', 'Slice the grilled chicken'], ['لفّه بالخبز مع الخس والطماطم', 'Wrap with lettuce and tomato']] } }),
  D('yogurt_fruit', ['زبادي يوناني مع فاكهة', 'Greek yogurt with fruit'], ['dinner', 'snack', 'meal'], [L('greek_yogurt', 1, 'protein'), L('apple', 1, 'starch')]),
  // ---- snacks
  D('nuts_dates', ['حفنة مكسرات وتمرتين', 'A handful of nuts and two dates'], ['snack'], [L('nuts', 0.5), L('dates', 2, 'starch')]),
  D('laban_dates', ['كوب لبن مع ٣ تمرات', 'Laban with three dates'], ['snack'], [L('laban', 1, 'protein'), L('dates', 3, 'starch')]),
  D('banana_pb', ['موزة مع ملعقة زبدة فول سوداني', 'Banana with peanut butter'], ['snack'], [L('banana', 1, 'starch'), L('peanut_butter', 1)]),
  D('apple_cheese', ['تفاحة مع جبن خفيف', 'Apple with light cheese'], ['snack'], [L('apple', 1, 'starch'), L('cheese', 2, 'protein')]),
  D('milk_dates', ['كوب حليب مع تمرتين', 'Milk with two dates'], ['snack'], [L('milk', 1, 'protein'), L('dates', 2, 'starch')]),
];

export const DISH = new Map(DISHES.map((d) => [d.id, d]));
