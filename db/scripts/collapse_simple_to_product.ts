/**
 * One-off data fix for ADR-039: collapse the `input_item.kind` value `simple` into
 * `product` (they were structurally + behaviourally identical). Repoints existing
 * rows, then recreates the `input_kind` enum without `simple`. Run manually where
 * legacy `simple` rows exist; a no-op once everything is `product`/`recipe`/`stack`.
 *
 *   deno run --env-file=.env --allow-env --allow-net --allow-read db/scripts/collapse_simple_to_product.ts
 *   deno run --env-file=.env --allow-env --allow-net --allow-read db/scripts/collapse_simple_to_product.ts --apply
 */
import postgres from "postgres";

const APPLY = Deno.args.includes("--apply");
const url = Deno.env.get("DATABASE_URL");
if (!url) {
  console.error("DATABASE_URL not set");
  Deno.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

try {
  // Compare as text — once 'simple' is dropped from the enum, the literal `'simple'`
  // is itself an invalid enum value, so `kind = 'simple'` would error.
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int n from input_item where kind::text = 'simple'`;
  const enumVals = (await sql<{ v: string }[]>`
    select e.enumlabel v from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'input_kind'
     order by e.enumsortorder`).map((r) => r.v);
  const hasSimpleValue = enumVals.includes("simple");

  console.log(`input_item rows with kind='simple': ${n}`);
  console.log(`input_kind enum: ${enumVals.join(", ")}`);

  if (n === 0 && !hasSimpleValue) {
    console.log("\nNothing to do — already collapsed.");
  } else if (!APPLY) {
    const parts = [];
    if (n > 0) parts.push(`repoint ${n} item(s) simple → product`);
    if (hasSimpleValue) parts.push("drop 'simple' from the input_kind enum");
    console.log(`\nDRY RUN — re-run with --apply to ${parts.join(" and ")}.`);
  } else {
    await sql.begin(async (tx) => {
      if (n > 0) {
        await tx`update input_item set kind = 'product' where kind::text = 'simple'`;
        console.log(`repointed ${n} item(s): simple → product`);
      }
      if (hasSimpleValue) {
        // Postgres can't drop an enum value, so recreate the type without it (safe now
        // that no row uses 'simple'). Only input_item.kind references input_kind.
        await tx`alter type input_kind rename to input_kind_old`;
        await tx`create type input_kind as enum ('product', 'recipe', 'stack')`;
        await tx`
          alter table input_item alter column kind type input_kind using kind::text::input_kind`;
        await tx`drop type input_kind_old`;
        console.log("recreated input_kind enum as (product, recipe, stack)");
      }
    });
    console.log("APPLIED ✓");
  }
} finally {
  await sql.end();
}
