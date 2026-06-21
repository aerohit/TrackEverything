/**
 * Seed (idempotent) the grocery **product catalog** — common off-the-shelf foods
 * (veg, fruit, meat, fish, dairy, eggs, grains, nuts, pantry…) as reusable `product`
 * items, each with search aliases (incl. Dutch names) and a per-serving nutrient
 * panel. Lets you build recipes from real products that already carry nutrition.
 *
 * Reads `db/product_catalog.csv`. The `nutrients` column is a `Name:amount;…` list,
 * each amount **per the canonical serving** (per 100 g / 100 ml) and **in that
 * substance's canonical unit** (Energy→kcal, Protein→g, Sodium/Vitamin C→mg,
 * Folate/Vitamin D→mcg, …). Only nutrients the product is a meaningful source of are
 * listed — anything absent simply isn't stored. Substance names must already exist in
 * the substance catalog (matched by name/alias); an unknown one aborts the run rather
 * than auto-creating a junk substance.
 *
 *   deno run --env-file=.env --allow-env --allow-net --allow-read db/scripts/seed_product_catalog.ts
 *   deno run --env-file=.env --allow-env --allow-net --allow-read db/scripts/seed_product_catalog.ts --apply
 */
import { and, eq, isNull } from "drizzle-orm";
import { connect } from "../client.ts";
import { normalizeSubstance, substanceIndex } from "../inputs.ts";
import { inputItem, itemComponent } from "../schema.ts";

const APPLY = Deno.args.includes("--apply");

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') (cur += '"'), i++;
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") (out.push(cur), cur = "");
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

/** Parse "Energy:89; Protein:1.1; Vitamin C:8.7" → [{name, amount}, …]. */
function parseNutrients(s: string): { name: string; amount: number }[] {
  return s.split(";").map((p) => p.trim()).filter(Boolean).map((p) => {
    const i = p.lastIndexOf(":");
    const name = p.slice(0, i).trim();
    const amount = Number(p.slice(i + 1).trim());
    return { name, amount };
  });
}

function numOrNull(s: string): number | null {
  if (!s?.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const csvPath = new URL("../product_catalog.csv", import.meta.url);
const rows = parseCsv(await Deno.readTextFile(csvPath));
console.log(`product_catalog.csv: ${rows.length} products`);

const { sql, db } = connect(Deno.env.get("DATABASE_URL")!);
try {
  const index = await substanceIndex(db);

  // Validate every referenced substance up-front (don't auto-create / pollute).
  const missing = new Set<string>();
  for (const r of rows) {
    for (const n of parseNutrients(r.nutrients ?? "")) {
      if (!Number.isFinite(n.amount)) {
        console.error(`Bad nutrient value in "${r.name}": ${n.name}`);
        Deno.exit(1);
      }
      if (!index.has(normalizeSubstance(n.name))) missing.add(n.name);
    }
  }
  if (missing.size) {
    console.error(
      `Unknown substances (fix the CSV or seed the substance catalog): ${[...missing].join(", ")}`,
    );
    Deno.exit(1);
  }

  let created = 0, updated = 0, comps = 0;
  for (const r of rows) {
    const name = r.name;
    if (!name) continue;
    const aliases = (r.aliases ?? "").split("|").map((s) => s.trim()).filter(Boolean);
    const nutrients = parseNutrients(r.nutrients ?? "").filter((n) => n.amount > 0);
    comps += nutrients.length;

    const [existing] = await db.select({ id: inputItem.id }).from(inputItem)
      .where(and(eq(inputItem.name, name), isNull(inputItem.deletedAt)));
    existing ? updated++ : created++;
    if (!APPLY) continue;

    const values = {
      kind: "product" as const,
      aliases,
      defaultDisplayQuantity: numOrNull(r.display_qty),
      defaultDisplayUnit: r.display_unit || null,
      defaultCanonicalQuantity: numOrNull(r.canonical_qty),
      defaultCanonicalUnit: r.canonical_unit || null,
    };
    let itemId: string;
    if (existing) {
      itemId = existing.id;
      await db.update(inputItem).set({ ...values, updatedAt: new Date() }).where(
        eq(inputItem.id, itemId),
      );
      await db.delete(itemComponent).where(eq(itemComponent.parentItemId, itemId));
    } else {
      const [ins] = await db.insert(inputItem).values({ name, ...values }).returning({
        id: inputItem.id,
      });
      itemId = ins.id;
    }
    const compRows = nutrients.map((n, i) => {
      const meta = index.get(normalizeSubstance(n.name))!;
      return {
        parentItemId: itemId,
        substanceId: meta.id,
        childItemId: null,
        amount: n.amount,
        unit: meta.unit,
        position: i,
      };
    });
    if (compRows.length) await db.insert(itemComponent).values(compRows);
  }

  console.log(
    `${
      APPLY ? "APPLIED" : "DRY RUN"
    }: ${created} new, ${updated} existing, ${comps} nutrient components total`,
  );
  if (!APPLY) console.log("Re-run with --apply to write.");
} finally {
  await sql.end();
}
