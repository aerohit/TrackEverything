/**
 * One-off substance reconciliation (ADR-038). After migration 0014 seeds the catalog,
 * this repoints item_component + resolved_amount from the legacy substances onto the
 * catalog (matching by name then alias, case-insensitive), then deletes the legacy rows.
 * Run only where legacy logged data exists (the QA / pre-prod DB) — a no-op on a fresh DB.
 *
 *   deno run --env-file=.env --allow-env --allow-net --allow-read db/scripts/reconcile_substances.ts
 *   deno run --env-file=.env --allow-env --allow-net --allow-read db/scripts/reconcile_substances.ts --apply
 */
import postgres from "postgres";

// The catalog seeded by 0014 (+ the "Other" catch-all the apply step creates), so anything
// else in the table is a legacy row to remap. Keep in sync with 0014.
const CATALOG = new Set<string>([
  "Bicarbonate",
  "Chloride",
  "Magnesium Citrate",
  "Magnesium Glycinate",
  "Potassium",
  "Potassium Citrate",
  "Sodium",
  "Sodium Chloride",
  "Energy",
  "Added Sugars",
  "Alpha-Linolenic Acid",
  "Arachidonic Acid",
  "Beta-Glucan",
  "Capric Acid",
  "Caprylic Acid",
  "Carbohydrate",
  "Casein",
  "Cellulose",
  "Cholesterol",
  "Collagen",
  "Conjugated Linoleic Acid",
  "Dietary Fiber",
  "Docosahexaenoic Acid",
  "Eicosapentaenoic Acid",
  "Fat",
  "Fructooligosaccharides",
  "Fructose",
  "Galactooligosaccharides",
  "Galactose",
  "Gamma-Linolenic Acid",
  "Glucose",
  "Guar Gum",
  "Insoluble Fiber",
  "Inulin",
  "Lactose",
  "Linoleic Acid",
  "Maltose",
  "Medium-Chain Triglycerides",
  "Monounsaturated Fat",
  "Oleic Acid",
  "Omega-3 Fatty Acids",
  "Omega-6 Fatty Acids",
  "Pectin",
  "Polyunsaturated Fat",
  "Protein",
  "Psyllium Husk",
  "Resistant Starch",
  "Saturated Fat",
  "Soluble Fiber",
  "Starch",
  "Sucrose",
  "Sugar",
  "Trans Fat",
  "Whey Protein Isolate",
  "Xanthan Gum",
  "Amlodipine",
  "Amoxicillin",
  "Aspirin",
  "Atomoxetine",
  "Atorvastatin",
  "Azithromycin",
  "Bupropion",
  "Cetirizine",
  "Dexamfetamine",
  "Diclofenac",
  "Diphenhydramine",
  "Fluoxetine",
  "Ibuprofen",
  "Levothyroxine",
  "Lisdexamfetamine",
  "Lisinopril",
  "Loperamide",
  "Loratadine",
  "Metformin",
  "Methylphenidate",
  "Metoprolol",
  "Modafinil",
  "Naproxen",
  "Omeprazole",
  "Paracetamol",
  "Prednisone",
  "Pseudoephedrine",
  "Salbutamol",
  "Sertraline",
  "Boron",
  "Calcium",
  "Chromium",
  "Copper",
  "Fluoride",
  "Iodine",
  "Iron",
  "Magnesium",
  "Manganese",
  "Molybdenum",
  "Phosphorus",
  "Selenium",
  "Silicon",
  "Zinc",
  "Zinc Picolinate",
  "Acesulfame K",
  "Acetic Acid",
  "Allium Sativum",
  "Aspartame",
  "Bacopa Monnieri",
  "Beetroot Extract",
  "Bifidobacterium Bifidum",
  "Bifidobacterium Lactis",
  "Bifidobacterium Longum",
  "Camellia Sinensis",
  "Cinnamon Extract",
  "Citric Acid",
  "Cranberry Extract",
  "Curcuma Longa",
  "Echinacea Purpurea",
  "Erythritol",
  "Ginkgo Biloba",
  "Grape Seed Extract",
  "Griffonia Simplicifolia",
  "Humulus Lupulus",
  "Hypericum Perforatum",
  "Lactic Acid",
  "Lactobacillus Acidophilus",
  "Lactobacillus Rhamnosus",
  "Lavandula Angustifolia",
  "Lepidium Meyenii",
  "Malic Acid",
  "Maltitol",
  "Matricaria Chamomilla",
  "Melissa Officinalis",
  "Monosodium Glutamate",
  "Panax Ginseng",
  "Passiflora Incarnata",
  "Potassium Sorbate",
  "Probiotics",
  "Rhodiola Rosea",
  "Saccharomyces Boulardii",
  "Saw Palmetto Extract",
  "Silybum Marianum",
  "Sodium Benzoate",
  "Sorbitol",
  "Soy Lecithin",
  "Steviol Glycosides",
  "Sucralose",
  "Valeriana Officinalis",
  "Withania Somnifera",
  "Xylitol",
  "Zingiber Officinale",
  "Cannabidiol",
  "Ethanol",
  "Kava",
  "Kratom",
  "MDMA",
  "Nitrous Oxide",
  "Psilocybin",
  "Tetrahydrocannabinol",
  "Caffeine",
  "Guarana",
  "Nicotine",
  "Synephrine",
  "Theobromine",
  "Theophylline",
  "Yohimbine",
  "5-Hydroxytryptophan",
  "Acetyl-L-Carnitine Hydrochloride",
  "Alanine",
  "Alpha-Lipoic Acid",
  "Anthocyanins",
  "Arginine",
  "Arginine Alpha-Ketoglutarate",
  "Berberine",
  "Beta-Alanine",
  "Betaine",
  "Bioflavonoids",
  "Branched-Chain Amino Acids",
  "Catechin",
  "Chlorogenic Acid",
  "Chondroitin",
  "Citrulline Malate",
  "Creatine",
  "Creatine Monohydrate",
  "Curcumin",
  "Cysteine",
  "DHEA",
  "Epigallocatechin Gallate",
  "Essential Amino Acids",
  "Fish Oil",
  "Gamma-Aminobutyric Acid",
  "Glucosamine",
  "Glutamine",
  "Glutathione",
  "Glycine",
  "Hesperidin",
  "Histidine",
  "Hyaluronic Acid",
  "Isoleucine",
  "Krill Oil",
  "L-Carnitine",
  "L-Citrulline",
  "L-Ornithine",
  "L-Theanine",
  "Leucine",
  "Lysine",
  "Melatonin",
  "Methionine",
  "Methylsulfonylmethane",
  "N-Acetyl-L-Tyrosine",
  "N-Acetylcysteine",
  "Naringin",
  "Nicotinamide Mononucleotide",
  "Nicotinamide Riboside",
  "Nitrate",
  "Phenylalanine",
  "Phosphatidylserine",
  "Piperine",
  "Pregnenolone",
  "Proanthocyanidins",
  "Proline",
  "Quercetin",
  "Resveratrol",
  "Rutin",
  "Serine",
  "Silymarin",
  "Sodium Bicarbonate",
  "Taurine",
  "Threonine",
  "Tryptophan",
  "Tyrosine",
  "Ubiquinone",
  "Valine",
  "4-Aminobenzoic Acid",
  "Alpha-Carotene",
  "Ascorbic Acid",
  "Astaxanthin",
  "Beta-Carotene",
  "Biotin",
  "Cholecalciferol",
  "Choline",
  "Cobalamin",
  "Cyanocobalamin",
  "Ergocalciferol",
  "Folate",
  "Folic Acid",
  "Inositol",
  "Levomefolic Acid",
  "Lutein",
  "Lycopene",
  "Menaquinone",
  "Methylcobalamin",
  "Mixed Tocopherols",
  "Niacin",
  "Nicotinamide",
  "Pantothenic Acid",
  "Phylloquinone",
  "Pyridoxal 5'-Phosphate",
  "Pyridoxine",
  "Retinol",
  "Riboflavin",
  "Thiamine",
  "Tocopherol",
  "Vitamin A",
  "Vitamin D",
  "Vitamin E",
  "Vitamin K",
  "Zeaxanthin",
  "Water",
  "Other",
]);

// Legacy names whose own name/aliases don't auto-match the catalog, or are catalog gaps -> "Other".
const OVERRIDES: Record<string, string> = {
  "epa_(eicosapentaenoic_acid)": "Eicosapentaenoic Acid",
  "dha_(docosahexaenoic_acid)": "Docosahexaenoic Acid",
  "fish_oil_(triglyceride)": "Fish Oil",
  "vitamin_e_(mixed_tocopherols)": "Tocopherol",
  "pink_himalayan_salt": "Sodium Chloride",
  "n_acetyl_l_carnitine_hydrochloride": "Acetyl-L-Carnitine Hydrochloride",
  "valerian_extract": "Valeriana Officinalis",
  "unsaturated_fat": "Other",
  "gold_poppy": "Other",
  "polypodium_leucotomos": "Other",
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, "_");
const APPLY = Deno.args.includes("--apply");
const url = Deno.env.get("DATABASE_URL");
if (!url) {
  console.error("DATABASE_URL not set");
  Deno.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

try {
  const subs = await sql<{ id: string; name: string; aliases: string[] }[]>`
    select id, name, aliases from substance`;
  // Resolver over the catalog: normalized name + each alias -> canonical {id, name}.
  const resolver = new Map<string, { id: string; name: string }>();
  for (const s of subs) {
    if (!CATALOG.has(s.name)) continue;
    resolver.set(norm(s.name), { id: s.id, name: s.name });
    for (const a of s.aliases) resolver.set(norm(a), { id: s.id, name: s.name });
  }
  const legacy = subs.filter((s) => !CATALOG.has(s.name));

  type Plan = { oldId: string; oldName: string; target: string; newId: string | null };
  const plan: Plan[] = [];
  const unmatched: string[] = [];
  for (const L of legacy) {
    const ov = OVERRIDES[L.name];
    if (ov === "Other") {
      plan.push({ oldId: L.id, oldName: L.name, target: "Other", newId: null });
      continue;
    }
    let hit = ov ? resolver.get(norm(ov)) : undefined;
    if (!hit) {
      for (const cand of [L.name, ...L.aliases]) {
        const h = resolver.get(norm(cand));
        if (h) {
          hit = h;
          break;
        }
      }
    }
    if (!hit) {
      unmatched.push(L.name);
      continue;
    }
    plan.push({ oldId: L.id, oldName: L.name, target: hit.name, newId: hit.id });
  }

  // Reference counts (for the report).
  const refs = new Map<string, { ic: number; ra: number }>();
  for (const L of legacy) {
    const [{ ic }] = await sql<{ ic: number }[]>`
      select count(*)::int ic from item_component where substance_id = ${L.id}`;
    const [{ ra }] = await sql<{ ra: number }[]>`
      select count(*)::int ra from resolved_amount where substance_id = ${L.id}`;
    refs.set(L.id, { ic, ra });
  }

  console.log(`legacy: ${legacy.length} | mapped: ${plan.length} | unmatched: ${unmatched.length}`);
  for (const p of plan.sort((a, b) => a.oldName.localeCompare(b.oldName))) {
    const r = refs.get(p.oldId)!;
    console.log(`  ${p.oldName}  ->  ${p.target}  (ic=${r.ic}, ra=${r.ra})`);
  }
  if (unmatched.length) {
    console.error("\nUNMATCHED — add an override and re-run:", unmatched);
    Deno.exit(1);
  }
  if (!APPLY) {
    console.log("\nDRY RUN — re-run with --apply to write the changes.");
    Deno.exit(0);
  }

  await sql.begin(async (tx) => {
    let otherId = resolver.get("other")?.id ?? null;
    if (!otherId && plan.some((p) => p.target === "Other")) {
      const [o] = await tx<{ id: string }[]>`
        insert into substance (name, substance_type, canonical_unit) values ('Other','other','mg')
        on conflict (name) do update set name = excluded.name returning id`;
      otherId = o.id;
    }
    for (const p of plan) {
      const nid = p.newId ?? otherId!;
      await tx`update item_component set substance_id = ${nid} where substance_id = ${p.oldId}`;
      await tx`update resolved_amount set substance_id = ${nid} where substance_id = ${p.oldId}`;
    }
    const ids = plan.map((p) => p.oldId);
    if (ids.length) await tx`delete from substance where id in ${tx(ids)}`;
    const [{ n }] = await tx<{ n: number }[]>`
      select count(*)::int n from item_component ic
       where ic.substance_id is not null
         and not exists (select 1 from substance s where s.id = ic.substance_id)`;
    if (n > 0) throw new Error("orphaned item_component refs remain — rolling back");
    console.log(`remapped ${plan.length} legacy substances; deleted ${ids.length}.`);
  });
  console.log("APPLIED \u2713");
} finally {
  await sql.end();
}
