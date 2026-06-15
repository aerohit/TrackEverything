/**
 * Seed a realistic week of Inputs (play data). Creates a catalog of common items
 * (coffee, meals, snacks, a pre-workout, supplements…) and logs ~7 days of intake
 * events through the real repository, so each event gets a proper resolved snapshot.
 *
 *   DATABASE_URL='<your db url>' deno task seed:inputs
 *
 * Idempotent per calendar day: items are get-or-created by name, and an event isn't
 * re-inserted if one with the same name + timestamp already exists — so re-running on
 * the same day is a no-op, while running on a new day extends the week.
 */
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { connect } from "./client.ts";
import { migrate } from "./migrate.ts";
import { createIntakeEvent, createItem } from "./inputs.ts";
import { inputItem, intakeEvent } from "./schema.ts";

type Comp = { substance?: string; child?: string; amount: number; unit: string };
interface ItemDef {
  name: string;
  kind: "product" | "recipe" | "simple";
  type: "food" | "drink" | "supplement" | "medication" | "meal" | "other";
  roles?: string[];
  dq: number;
  du: string;
  cq?: number;
  cu?: string;
  comps: Comp[];
}

// Children (referenced by the smoothie recipe) are listed before it.
const CATALOG: ItemDef[] = [
  {
    name: "Coffee",
    kind: "simple",
    type: "drink",
    roles: ["stimulant"],
    dq: 1,
    du: "cup",
    cq: 240,
    cu: "ml",
    comps: [{ substance: "caffeine", amount: 95, unit: "mg" }, {
      substance: "water",
      amount: 240,
      unit: "ml",
    }],
  },
  {
    name: "Espresso",
    kind: "simple",
    type: "drink",
    roles: ["stimulant"],
    dq: 1,
    du: "shot",
    cq: 30,
    cu: "ml",
    comps: [{ substance: "caffeine", amount: 63, unit: "mg" }, {
      substance: "water",
      amount: 30,
      unit: "ml",
    }],
  },
  {
    name: "Whey protein",
    kind: "product",
    type: "supplement",
    dq: 1,
    du: "scoop",
    cq: 30,
    cu: "g",
    comps: [
      { substance: "protein", amount: 24, unit: "g" },
      { substance: "carbohydrate", amount: 3, unit: "g" },
      { substance: "fat", amount: 1.5, unit: "g" },
      { substance: "calories", amount: 120, unit: "kcal" },
    ],
  },
  {
    name: "Banana",
    kind: "simple",
    type: "food",
    dq: 1,
    du: "medium",
    cq: 118,
    cu: "g",
    comps: [
      { substance: "carbohydrate", amount: 27, unit: "g" },
      { substance: "fiber", amount: 3, unit: "g" },
      { substance: "potassium", amount: 422, unit: "mg" },
      { substance: "calories", amount: 105, unit: "kcal" },
    ],
  },
  {
    name: "Greek yogurt",
    kind: "simple",
    type: "food",
    dq: 1,
    du: "cup",
    cq: 170,
    cu: "g",
    comps: [
      { substance: "protein", amount: 17, unit: "g" },
      { substance: "carbohydrate", amount: 6, unit: "g" },
      { substance: "fat", amount: 4, unit: "g" },
      { substance: "calcium", amount: 200, unit: "mg" },
      { substance: "calories", amount: 130, unit: "kcal" },
    ],
  },
  {
    name: "Milk",
    kind: "simple",
    type: "drink",
    dq: 1,
    du: "cup",
    cq: 240,
    cu: "ml",
    comps: [
      { substance: "protein", amount: 8, unit: "g" },
      { substance: "carbohydrate", amount: 12, unit: "g" },
      { substance: "fat", amount: 8, unit: "g" },
      { substance: "calcium", amount: 300, unit: "mg" },
      { substance: "calories", amount: 150, unit: "kcal" },
    ],
  },
  {
    name: "Blueberries",
    kind: "simple",
    type: "food",
    dq: 50,
    du: "g",
    cq: 50,
    cu: "g",
    comps: [{ substance: "carbohydrate", amount: 11, unit: "g" }, {
      substance: "fiber",
      amount: 2,
      unit: "g",
    }, { substance: "calories", amount: 42, unit: "kcal" }],
  },
  {
    name: "Banana smoothie",
    kind: "recipe",
    type: "meal",
    roles: ["drink", "food"],
    dq: 1,
    du: "glass",
    comps: [
      { child: "Whey protein", amount: 30, unit: "g" },
      { child: "Banana", amount: 1, unit: "medium" },
      { child: "Greek yogurt", amount: 150, unit: "g" },
      { child: "Milk", amount: 200, unit: "ml" },
      { child: "Blueberries", amount: 50, unit: "g" },
    ],
  },
  {
    name: "Oatmeal bowl",
    kind: "simple",
    type: "food",
    roles: ["food"],
    dq: 1,
    du: "bowl",
    comps: [
      { substance: "carbohydrate", amount: 30, unit: "g" },
      { substance: "protein", amount: 6, unit: "g" },
      { substance: "fat", amount: 4, unit: "g" },
      { substance: "fiber", amount: 4, unit: "g" },
      { substance: "calories", amount: 180, unit: "kcal" },
    ],
  },
  {
    name: "Chicken salad",
    kind: "simple",
    type: "meal",
    roles: ["food"],
    dq: 1,
    du: "bowl",
    comps: [
      { substance: "protein", amount: 40, unit: "g" },
      { substance: "fat", amount: 28, unit: "g" },
      { substance: "carbohydrate", amount: 12, unit: "g" },
      { substance: "fiber", amount: 5, unit: "g" },
      { substance: "sodium", amount: 700, unit: "mg" },
      { substance: "potassium", amount: 600, unit: "mg" },
      { substance: "calories", amount: 480, unit: "kcal" },
    ],
  },
  {
    name: "Almonds",
    kind: "simple",
    type: "food",
    roles: ["snack"],
    dq: 1,
    du: "handful",
    cq: 28,
    cu: "g",
    comps: [
      { substance: "fat", amount: 14, unit: "g" },
      { substance: "protein", amount: 6, unit: "g" },
      { substance: "carbohydrate", amount: 6, unit: "g" },
      { substance: "fiber", amount: 3, unit: "g" },
      { substance: "calories", amount: 164, unit: "kcal" },
    ],
  },
  {
    name: "Dark chocolate",
    kind: "simple",
    type: "food",
    roles: ["snack"],
    dq: 30,
    du: "g",
    cq: 30,
    cu: "g",
    comps: [
      { substance: "fat", amount: 12, unit: "g" },
      { substance: "carbohydrate", amount: 13, unit: "g" },
      { substance: "caffeine", amount: 25, unit: "mg" },
      { substance: "calories", amount: 170, unit: "kcal" },
    ],
  },
  {
    name: "Protein bar",
    kind: "product",
    type: "food",
    roles: ["snack"],
    dq: 1,
    du: "bar",
    comps: [
      { substance: "protein", amount: 20, unit: "g" },
      { substance: "carbohydrate", amount: 22, unit: "g" },
      { substance: "fat", amount: 8, unit: "g" },
      { substance: "fiber", amount: 10, unit: "g" },
      { substance: "calories", amount: 220, unit: "kcal" },
    ],
  },
  {
    name: "Salmon dinner",
    kind: "simple",
    type: "meal",
    roles: ["food"],
    dq: 1,
    du: "plate",
    comps: [
      { substance: "protein", amount: 34, unit: "g" },
      { substance: "fat", amount: 22, unit: "g" },
      { substance: "omega_3", amount: 2000, unit: "mg" },
      { substance: "sodium", amount: 400, unit: "mg" },
      { substance: "calories", amount: 360, unit: "kcal" },
    ],
  },
  {
    name: "Pasta dinner",
    kind: "simple",
    type: "meal",
    roles: ["food"],
    dq: 1,
    du: "plate",
    comps: [
      { substance: "carbohydrate", amount: 80, unit: "g" },
      { substance: "protein", amount: 18, unit: "g" },
      { substance: "fat", amount: 14, unit: "g" },
      { substance: "sodium", amount: 600, unit: "mg" },
      { substance: "calories", amount: 540, unit: "kcal" },
    ],
  },
  {
    name: "Pre-workout",
    kind: "product",
    type: "supplement",
    roles: ["drink", "stimulant", "workout_support"],
    dq: 1,
    du: "scoop",
    cq: 12,
    cu: "g",
    comps: [
      { substance: "caffeine", amount: 200, unit: "mg" },
      { substance: "creatine", amount: 5, unit: "g" },
      { substance: "citrulline", amount: 6, unit: "g" },
      { substance: "beta_alanine", amount: 3.2, unit: "g" },
      { substance: "sodium", amount: 300, unit: "mg" },
    ],
  },
  {
    name: "Electrolyte drink",
    kind: "product",
    type: "drink",
    roles: ["hydration"],
    dq: 1,
    du: "sachet",
    cq: 500,
    cu: "ml",
    comps: [{ substance: "sodium", amount: 500, unit: "mg" }, {
      substance: "potassium",
      amount: 200,
      unit: "mg",
    }, { substance: "water", amount: 500, unit: "ml" }],
  },
  {
    name: "Magnesium",
    kind: "product",
    type: "supplement",
    dq: 2,
    du: "tablet",
    comps: [{ substance: "magnesium", amount: 200, unit: "mg" }],
  },
  {
    name: "Vitamin D",
    kind: "product",
    type: "supplement",
    dq: 1,
    du: "capsule",
    comps: [{ substance: "vitamin_d", amount: 2000, unit: "iu" }],
  },
  {
    name: "Fish oil",
    kind: "product",
    type: "supplement",
    dq: 1,
    du: "capsule",
    comps: [{ substance: "omega_3", amount: 1000, unit: "mg" }],
  },
  {
    name: "Beer",
    kind: "simple",
    type: "drink",
    roles: ["alcohol"],
    dq: 1,
    du: "bottle",
    cq: 355,
    cu: "ml",
    comps: [{ substance: "alcohol", amount: 14, unit: "g" }, {
      substance: "carbohydrate",
      amount: 13,
      unit: "g",
    }, { substance: "calories", amount: 150, unit: "kcal" }],
  },
  {
    name: "Melatonin",
    kind: "product",
    type: "supplement",
    dq: 1,
    du: "tablet",
    comps: [{ substance: "melatonin", amount: 3, unit: "mg" }],
  },
];

interface LogEntry {
  label: string;
  item: string;
  d: number;
  h: number;
  m: number;
  tags?: string[];
}

function weekPlan(): LogEntry[] {
  const plan: LogEntry[] = [];
  for (let d = 6; d >= 0; d--) {
    const gym = d % 2 === 0; // gym every other day
    plan.push({ label: "Morning coffee", item: "Coffee", d, h: 7, m: 30 });
    if (d % 2 === 0) {
      plan.push({ label: "Greek yogurt", item: "Greek yogurt", d, h: 8, m: 15 });
      plan.push({ label: "Banana", item: "Banana", d, h: 8, m: 16 });
    } else {
      plan.push({ label: "Morning smoothie", item: "Banana smoothie", d, h: 8, m: 15 });
    }
    plan.push({ label: "Vitamin D", item: "Vitamin D", d, h: 9, m: 0 });
    plan.push({ label: "Fish oil", item: "Fish oil", d, h: 9, m: 0 });
    if (d % 3 === 0) plan.push({ label: "Almonds", item: "Almonds", d, h: 10, m: 45 });
    else if (d % 3 === 1) plan.push({ label: "Protein bar", item: "Protein bar", d, h: 10, m: 45 });
    plan.push({ label: "Lunch — chicken salad", item: "Chicken salad", d, h: 13, m: 0 });
    if (gym) {
      plan.push({
        label: "Pre-workout",
        item: "Pre-workout",
        d,
        h: 16,
        m: 0,
        tags: ["pre_workout"],
      });
      plan.push({
        label: "Electrolytes",
        item: "Electrolyte drink",
        d,
        h: 16,
        m: 5,
        tags: ["pre_workout"],
      });
      plan.push({
        label: "Protein shake",
        item: "Whey protein",
        d,
        h: 17,
        m: 30,
        tags: ["post_workout"],
      });
    } else {
      plan.push({ label: "Afternoon coffee", item: "Coffee", d, h: 15, m: 30 });
    }
    if (d % 2 === 0) {
      plan.push({ label: "Dark chocolate", item: "Dark chocolate", d, h: 16, m: 30 });
    }
    const dinner = d % 2 === 0 ? "Salmon dinner" : "Pasta dinner";
    plan.push({ label: dinner, item: dinner, d, h: 19, m: 30 });
    if (d === 5) plan.push({ label: "Beer", item: "Beer", d, h: 20, m: 30, tags: ["social"] });
    plan.push({ label: "Magnesium", item: "Magnesium", d, h: 21, m: 30, tags: ["before_bed"] });
    if (d === 1 || d === 3) {
      plan.push({ label: "Melatonin", item: "Melatonin", d, h: 21, m: 35, tags: ["before_bed"] });
    }
  }
  return plan;
}

function at(dayOffset: number, h: number, m: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() - dayOffset);
  dt.setHours(h, m, 0, 0);
  return dt;
}

async function main() {
  const url = Deno.env.get("DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL is not set");
  await migrate(url);
  const { sql, db } = connect(url);
  try {
    // Get-or-create the catalog (children first, so recipes can reference them).
    const idByName = new Map<string, string>();
    const metaByName = new Map<string, { dq: number; du: string }>();
    let created = 0;
    for (const def of CATALOG) {
      metaByName.set(def.name, { dq: def.dq, du: def.du });
      const [existing] = await db.select({ id: inputItem.id }).from(inputItem).where(
        and(eq(inputItem.name, def.name), isNull(inputItem.deletedAt)),
      );
      if (existing) {
        idByName.set(def.name, existing.id);
        continue;
      }
      const id = await createItem(db, {
        name: def.name,
        kind: def.kind,
        primaryType: def.type,
        roles: def.roles ?? [],
        defaultServing: {
          displayQuantity: def.dq,
          displayUnit: def.du,
          canonicalQuantity: def.cq,
          canonicalUnit: def.cu,
        },
        components: def.comps.map((c) =>
          c.child
            ? { childItemId: idByName.get(c.child) as string, amount: c.amount, unit: c.unit }
            : { substance: c.substance, amount: c.amount, unit: c.unit }
        ),
      });
      idByName.set(def.name, id);
      created++;
    }

    // Existing events in the 7-day window, to keep re-runs idempotent.
    const from = at(6, 0, 0);
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setDate(to.getDate() + 1);
    const existing = await db.select({
      displayName: intakeEvent.displayName,
      occurredAt: intakeEvent.occurredAt,
    })
      .from(intakeEvent)
      .where(and(gte(intakeEvent.occurredAt, from), lt(intakeEvent.occurredAt, to)));
    const seen = new Set(existing.map((e) => `${e.displayName}|${e.occurredAt.toISOString()}`));

    let logged = 0;
    for (const e of weekPlan()) {
      const meta = metaByName.get(e.item);
      const itemId = idByName.get(e.item);
      if (!meta || !itemId) continue;
      const occurredAt = at(e.d, e.h, e.m);
      if (seen.has(`${e.label}|${occurredAt.toISOString()}`)) continue;
      await createIntakeEvent(db, {
        displayName: e.label,
        itemId,
        quantity: meta.dq,
        unit: meta.du,
        occurredAt: occurredAt.toISOString(),
        confidence: "high",
        contextTags: e.tags ?? [],
      });
      logged++;
    }

    console.log(
      `Seed complete: ${created} new items (of ${CATALOG.length}), ${logged} intake events added.`,
    );
  } finally {
    await sql.end();
  }
}

if (import.meta.main) await main();
