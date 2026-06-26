# Manual test — can I capture a typical week easily?

A runnable checklist for the three input forms on the **Regular Items** screen
(Create Regular Item · Create Recipe · Create Stack). The point isn't correctness
(that's covered by tests) — it's **friction**: tick each case off, jot how it felt,
then fill in the report card at the bottom.

**As you go, notice:** taps per item · whether search finds things fast (English +
Dutch) · piece-vs-grams confusion · how tedious custom nutrition is · how often the
catalog is missing something.

**Prerequisite:** the product catalog is seeded in the environment you're testing
(`make seed-products ENV=…`). The recipe cases search it for members; without it,
create the member products via Form 1 first.

---

## Form 1 — Create Regular Item (type your own nutrition)

For branded/packaged items the catalog lacks. Serving (qty + unit) + optional grams +
ingredients (substance + amount + unit, per serving).

- [ ] **1A · simple — `Oatcake`** · serving `1 piece` · Energy 44 kcal · Carbohydrate 6 g ·
      Protein 1 g · Fat 1.8 g · Dietary Fiber 0.9 g
      *(the bare minimum: name + a few macros)*
- [ ] **1B · medium — `Whey Protein (vanilla)`** · serving `1 scoop`, grams `30 g` ·
      Energy 120 · Protein 24 g · Carbohydrate 3 g · Fat 1.5 g · Sodium 50 mg · Calcium 120 mg
      *(a non-gram serving plus a gram weight; a mineral)*
- [ ] **1C · complex — `Daily Multivitamin`** · serving `1 tablet` ·
      Vitamin D 1000 **iu** · Vitamin C 80 mg · Vitamin B12 2.5 mcg · Iron 14 mg ·
      Zinc 10 mg · Magnesium 56 mg
      *(many rows, mixed mcg/mg/IU units, IU→mcg conversion)*
- [ ] **1D · piece + weight — `Sourdough Slice`** · serving `1 slice`, grams `50 g` ·
      Energy 130 · Carbohydrate 25 g · Protein 5 g · Dietary Fiber 2 g
      *(log later by slice OR by grams — does it feel natural?)*

## Form 2 — Create Recipe (built from catalog products)

Name + serving + members = product search + qty + unit. Search by English **or Dutch** name.

- [ ] **2A · simple — `Yoghurt & Honey`** · serving `1 bowl` ·
      Greek Yogurt 150 g · Honey 20 g
- [ ] **2B · medium — `Overnight Oats`** · serving `1 jar` ·
      Rolled Oats 50 g · Semi-skimmed Milk 200 ml · Banana **1 piece** · Chia Seeds 15 g
      *(weight + volume + piece in one recipe)*
- [ ] **2C · complex — `Chicken Stir-fry`** · serving `1 plate` ·
      Chicken Breast 150 g · Broccoli 100 g · Red Bell Pepper 80 g · White Rice 180 g ·
      Soy Sauce 15 ml · Olive Oil 10 ml
      *(6 members — how many taps? does search keep up?)*
- [ ] **2D · Dutch search — `Boterham Kaas`** · serving `1 serving` ·
      search `volkorenbrood` → 2 slice · `goudse kaas` → 30 g · `boter` → 5 g
      *(finding products by Dutch alias)*
- [ ] **2E · validation — `Bad Recipe`** · try typing a stack name, and a made-up
      product like `Unicorn Steak`
      *(only products appear; non-matches are flagged and dropped on save)*

## Form 3 — Create Stack (a routine; each member logs as its own timeline entry)

Name + members = any non-stack item (products **and** recipes), qty + unit. No serving.

- [ ] **3A · simple — `Breakfast`** · Banana 1 piece · Greek Yogurt 150 g · Coffee 1 mug
- [ ] **3B · medium — `Lunch Box`** · **Boterham Kaas** (recipe 2D) · Apple 1 piece ·
      Greek Yogurt 150 g
      *(a stack that includes a recipe)*
- [ ] **3C · complex — `Daily Supplements`** · **Daily Multivitamin** (1C) ·
      **Whey Protein** (1B) · Magnesium Glycinate 1 piece
      *(your custom products; on logging, try the "Skip items?" checklist)*

*(3B and 3C reuse items from 1B, 1C, 2D — create those first.)*

## Then — actually capture the week

The forms above are one-time setup; the week is logged on the **Log** screen.

- [ ] Pin the recurring ones (Breakfast, Overnight Oats, Daily Supplements) to Quick Capture.
- [ ] Log a few days by tapping them; backfill an earlier day with the "Logging at" time control.
- [ ] Confirm on the Overview that recipes show one line, stacks show one line per member,
      and the macros/micros add up.

---

## Report card — fill this in

Rate each 1 (painful) – 5 (effortless), and note the worst friction.

| Question | Score 1–5 | Notes |
| --- | --- | --- |
| Recipe entry cost (the 6-ingredient stir-fry) | | |
| Member search — fast? English + Dutch? | | |
| Piece vs grams — natural or confusing? | | |
| Custom nutrition (the multivitamin's micros) | | |
| Coverage — % of your real week these forms capture vs one-off / eating-out | | |
| Catalog gaps — how many products you had to create yourself | | |
| Logging the week (Quick Capture + time backfill) | | |

**Items I couldn't find in the catalog (candidates for `product_catalog.csv`):**

-

**Biggest friction / what I'd change first:**

-
