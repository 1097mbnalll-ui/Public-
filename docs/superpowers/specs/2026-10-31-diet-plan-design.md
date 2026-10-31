# «أكلي»: a ready meal plan for losing weight, adjusted every week — and the Gym made optional

## Intent

The user wants Madar to help them lose weight with a meal plan that is professional and
evidence-based, not a side feature: a ready plan for each day (what to eat at each meal, how
much), which adjusts every week to how their weight actually moved. They've stopped eating fast
food; their food now comes from their family's home cooking or simple things they cook
themselves. They have a scale and will weigh in daily.

Like every Madar feature it must work for any user, not only them.

Second request: the Gym page should be opt-in. Someone who goes to the gym turns it on and
sees it; someone who doesn't never sees it.

## Goals

- A daily plan (breakfast, lunch, dinner, a snack) that lands on the day's calories and protein.
- Every amount in both a household measure and grams: «٤ ملاعق رز (١٢٠ جم)».
- Two kinds of meals mixed: portions taken from the family's dish («من صحن الكبسة: …») and
  simple meals you cook yourself (short recipe + amounts).
- Swap any meal for another of about the same calories (the family cooked something else).
- A weekly check-in that re-estimates real energy expenditure from the weight trend and what
  was eaten, and adjusts the plan — the step professional apps (MacroFactor) build on.
- A shopping list for the week's self-cooked meals.
- Add your own foods/meals (name, portion, calories, protein — e.g. from a label) and use them
  in the plan like built-in ones.
- «اصنع جدولك»: build the day yourself from foods you choose, inside budgets the system sets
  (meals per day, a budget per meal, a cap per item), with additions past the budget refused.
- Gym and the meal plan are each switched on in settings; the tab shows only what's on.

## Non-goals

- Logging arbitrary foods all day (a calorie-counter app). The plan is the primary object;
  logging is only «ate it / ate something else».
- Medical diets (diabetes, kidney disease, pregnancy). The app says so and points to a doctor.
- Restaurant meals (the user stopped them; can be added as own meals if needed).
- AI-generated plans (approach 2, rejected). An AI «suggest a meal» may come later (approach 3).

## Anti-goals (a failure even if it works)

- Unsafe targets: below the floors below, faster than 1 %/week, or advice that reads as medical.
- Numbers that pretend to precision the food data doesn't have — home dishes are estimates and
  the app says the weekly correction is what makes them right.
- A plan that ignores the family table (only «chicken breast and broccoli») — it won't be kept.
- More cards and clutter (the user has asked repeatedly for simpler, smoother screens).
- Personal data (weight, body) leaving the device or the user's own sync.

## Evidence the rules come from

From secondary summaries that agree with each other (primary NICE/ISSN texts weren't reachable):

- Rate: 0.5–1 % of body weight per week; faster raises muscle loss.
- Deficit: about 500–600 kcal/day (NICE CG189 basis), i.e. ~0.5–1 kg/week.
- Floors: never plan below 1500 kcal (men) / 1200 kcal (women); below 800 needs medical
  supervision — never offered.
- Protein: 1.6–2.2 g per kg (2.0 g/kg default while losing; for BMI ≥ 30 use the weight at
  BMI 27 so the number stays sane).
- Weekly adjustment (MacroFactor-style): expenditure ≈ average intake − (trend change × ~7700
  kcal/kg) / days, on a smoothed trend weight (exponential moving average), not single weigh-ins;
  provisional for the first 2–4 weeks.
- Saudi home dishes have no current official table; values come from USDA-style ingredient data
  and published estimates (e.g. kabsa ≈ 160 kcal/100 g) and are labelled approximate.

## Approaches

1. **A food base inside the app; the app builds the plan** — hand-written foods (Gulf home dishes +
   simple self-cooked staples) with grams and household measures; a local planner composes days
   to the targets; weekly adaptive correction. Offline, private, exact arithmetic. Variety limited
   to the base (80–120 items) — grows by adding foods. **Chosen**, plus: **the user can add their
   own foods/meals**.
2. AI writes the week's plan (paste a request into any AI, paste back). Unlimited variety, but a
   manual step weekly and AIs get calories wrong — works against «professional and exact».
3. Approach 1 with an optional «suggest a new meal» from AI, validated before it's added. Later.

## How it works (decided)

### Setup (one sheet, once)
Sex, birth year, height (reuses the Gym's `info`), current weight, goal weight, pace
(gentle 0.5 % / normal 0.75 % / fast 1 % per week), meals per day (3 + snack default), foods you
don't eat (multi-select: fish, dairy, eggs, red meat… + free text), and whether you eat the
family's lunch (most days / sometimes / rarely) — decides how many family-dish meals the plan uses.

### Targets
- Start: Mifflin-St Jeor × activity (from Gym days if Gym is on, else asked) − deficit for the pace,
  clamped to the floors. Protein per above. Training days (Gym on) get +~150 kcal, rest days −.
- Weekly: on the check-in day the trend-based expenditure replaces the formula once there are
  ≥ 10 weigh-ins over ≥ 14 days; before that the formula stands. Target = expenditure − pace
  deficit, moved at most ±150 kcal per week, never below the floor. If weight hasn't moved for
  2–3 weeks despite adherence, say so and adjust; if adherence was low, say that instead of cutting.

### The plan
- A week of days generated on the check-in; each day 3–4 meals within ±5 % of the day's calories
  and ≥ 90 % of protein. Variety: no identical meal twice in a row, breakfasts rotate.
- Family meal = a dish from the base + portions sized to the meal's share («٤ ملاعق رز (١٢٠ جم) +
  قطعة دجاج بحجم كفك (١٢٠ جم) + سلطة بلا حد»).
- Self-cooked meal = a short recipe (ingredients with amounts, 2–4 steps).
- Swap: shows 3–5 alternatives at the same slot within ±10 % calories; the day's other meals
  rebalance slightly so the day still lands.
- Each meal: «أكلتها» / «أكلت شي ثاني» (pick a food + amount from the base or your own, or
  «ما أدري — تقريبًا كذا سعرة»). That gives the intake the weekly correction needs; unmarked
  days count as planned.

### Build your own plan (the user's addition)
Besides the ready plan, «اصنع جدولك»: you pick the food, the system keeps the numbers.
- The system sets how many meals a day (from the setup: 3 + snack by default) and each meal's
  calorie budget (breakfast 25 %, lunch 35 %, dinner 25 %, snack 15 % of the day's target).
- You add foods to a meal from the base or your own foods, choosing the portion (household
  measure + grams). Every item shows its calories as you pick the amount.
- A cap per item, by kind, so one thing can't take the whole meal: starch (rice, bread, pasta)
  ≤ 50 % of the meal, fats/sweets/drinks with sugar ≤ 20 %, protein foods and vegetables free
  within the meal. The portion picker stops at the cap and says why.
- The meal and the day show a running total against the budget. Adding something that would
  pass the meal's budget is refused — with a way out instead of a dead end: «تقدر تاخذ ٣ ملاعق
  بدل ٤» (the largest portion that fits), or take the room from a later meal that's still empty.
  The day as a whole can't pass its target (+5 % tolerance); past that, no more additions.
- A protein check: if the day ends under 90 % of the protein target, it says which swap fixes it.
- Days you build can be saved as templates and reused («يوم الكبسة»); the weekly adjustment
  scales their portions to the new target and re-checks the caps.
- Your own days count toward the weekly correction exactly like the ready plan.

### Weigh-ins
Daily, morning; a one-tap entry on Today when it's on and you haven't weighed in. Reuses the Gym's
`body` log (same data). Shows the trend line, not daily noise.

### Your own foods
Name, portion (household measure + grams), calories, protein (carbs/fat optional), which meals it
fits. Used by the planner and swaps like built-in foods; marked «أكلتك».

### Shopping list
The week's self-cooked ingredients, summed, grouped (protein, grains, vegetables, dairy…),
tick off while shopping.

### Where it lives — the Gym made optional
- New settings section «الأقسام»: switches for «النادي» and «خطة الأكل» (both off for new users;
  existing users with Gym data keep Gym on).
- The pair button now shared by مصاريفي and النادي becomes مصاريفي + «صحتي»; «صحتي» holds
  tabs for whatever is on: «أكلي» (plan), «جسمي» (weight/measurements — moved out of the Gym),
  «تمريني» (the Gym, when on). Neither on → مصاريفي alone, no switch. The Gym's own content is
  kept as it is today, regrouped (my call: «redesign» read as making it optional and regrouping).
- Today: when the plan is on, one compact row «أكلي اليوم: الغدا — من صحن الكبسة…» with the next
  meal and a weigh-in tap if missing. No new card stack.

## Constraints

- Local-first; nothing new leaves the device except through the user's own sync.
- Storage keys `masar.*` / IDB `masar` unchanged; new state goes under `AppState.diet`
  (migrate/defaults/merge updated like other sections).
- Arabic RTL first, English via `L()`; Latin digits as the rest of the app.
- No personal data in the repo (no weights, no names) — tests use invented numbers.
- Keep the screens simple: one main thing per screen, the rest behind buttons.

## Answers from the user

- The family's most frequent dishes: chicken kabsa, meat kabsa, إيدام (stew), ملوخية — these come
  first in the base with the most careful numbers. إيدام and ملوخية are usually eaten **with rice**,
  so their family-meal portions are «X ملاعق رز + Y مغارف إيدام».
- The Gym redesign and the «صحتي» placement: no objection to the proposal, so it stands (my call,
  open to change): Gym optional, content kept; «صحتي» with «أكلي» / «جسمي» / «تمريني».

## My calls (for the user to check)

- Check-in day = the weekday you set the plan up; the week's plan regenerates then.
- Default pace «normal» (0.75 %/week); default 3 meals + 1 snack.
- Protein 2.0 g/kg (adjusted weight when BMI ≥ 30).
- Training-day +150 kcal only when the Gym is on.
- Unmarked meals count as eaten as planned.

## Left to the builder

- The food base contents (80–120 items; household measures and grams; sources noted per item).
- The plan composer's search (greedy with repair is enough; deterministic per week seed).
- Exact visual layout within the app's existing style and the declutter rules.
- Shopping list grouping details.
