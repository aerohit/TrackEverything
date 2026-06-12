/**
 * Phase 4b: composite supplements. A product is an item (Phase 1 `items`) plus an
 * ingredient list. You define it once — optionally by extracting the list from a
 * label photo (R-CAP-15) — then log it by name (R-CAP-13). Analysis decomposes a
 * logged product into ingredient amounts (R-PAT-5, ADR-010).
 *
 * `expandToIngredients` and `parseIngredientCandidates` are pure (unit-tested);
 * the repo functions take a `postgres` connection (integration-tested).
 */
import type { Sql } from "npm:postgres@^3.4.4";
import type { ClaudeClient } from "./claude.ts";
import { isKnownCategory } from "./vocab.ts";

export interface NewIngredient {
  name: string;
  amount?: number | null;
  unit?: string | null;
}

export interface IngredientRow {
  id: string;
  item_id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  canonical_name: string | null;
  position: number;
  created_at: Date;
}

export interface NewProduct {
  name: string;
  category: string;
  defaultFields?: Record<string, unknown>;
  ingredients: NewIngredient[];
}

export interface ProductRow {
  id: string;
  name: string;
  category: string;
  default_fields: Record<string, unknown>;
  created_at: Date;
  ingredients: IngredientRow[];
}

export interface ExpandedIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
  canonical_name: string;
}

/** Canonical ingredient key — a simple lowercase for now (Q5 deferred). */
export function canonicalize(name: string): string {
  return name.trim().toLowerCase();
}

export function validateNewProduct(input: NewProduct): string[] {
  const errors: string[] = [];
  if (!input.name || input.name.trim() === "") errors.push("name is required");
  if (!input.category || !isKnownCategory(input.category)) {
    errors.push(`category "${input.category}" is not a known category`);
  }
  if (!Array.isArray(input.ingredients) || input.ingredients.length === 0) {
    errors.push("ingredients must be a non-empty array");
  } else {
    input.ingredients.forEach((ing, i) => {
      if (!ing.name || ing.name.trim() === "") errors.push(`ingredients[${i}].name is required`);
      if (ing.amount != null && typeof ing.amount !== "number") {
        errors.push(`ingredients[${i}].amount must be a number or null`);
      }
    });
  }
  return errors;
}

/**
 * Decompose a product's ingredients for a number of servings: each amount is
 * scaled by `servings` (null amounts stay null). This is the product→ingredient
 * expansion the aggregation layer uses.
 */
export function expandToIngredients(
  ingredients: Array<Pick<IngredientRow, "name" | "amount" | "unit" | "canonical_name">>,
  servings = 1,
): ExpandedIngredient[] {
  return ingredients.map((ing) => ({
    name: ing.name,
    amount: ing.amount == null ? null : ing.amount * servings,
    unit: ing.unit,
    canonical_name: ing.canonical_name ?? canonicalize(ing.name),
  }));
}

/** Map vision JSON ({ingredients:[{name,amount,unit}]}) into ingredient candidates. */
export function parseIngredientCandidates(raw: unknown): NewIngredient[] {
  const list = isRecord(raw) ? raw.ingredients : undefined;
  if (!Array.isArray(list)) return [];
  return list
    .filter(isRecord)
    .map((ing) => ({
      name: typeof ing.name === "string" ? ing.name : "",
      amount: typeof ing.amount === "number" ? ing.amount : null,
      unit: typeof ing.unit === "string" ? ing.unit : null,
    }))
    .filter((ing) => ing.name !== "");
}

/** Extract a product's ingredient list from a label image (not saved). */
export async function extractIngredientsFromImage(
  claude: ClaudeClient,
  args: { imageBase64: string; mediaType: string },
): Promise<NewIngredient[]> {
  const raw = await claude.extractJsonFromImage({
    system: `You read the Supplement Facts / ingredients panel from a product label image.
Return ONLY JSON: {"ingredients":[{"name":...,"amount":...,"unit":...}]}.
- "name": the ingredient as printed (e.g. "Magnesium Glycinate").
- "amount": the number per serving, or null if not shown.
- "unit": e.g. "mg", "mcg", "g", "IU", or null.
List the active ingredients; skip "other ingredients"/fillers unless that's all there is.`,
    user: "Extract the ingredient list from this label.",
    imageBase64: args.imageBase64,
    mediaType: args.mediaType,
  });
  return parseIngredientCandidates(raw);
}

export async function createProduct(sql: Sql, input: NewProduct): Promise<ProductRow> {
  const errors = validateNewProduct(input);
  if (errors.length > 0) {
    throw new Error(`invalid product: ${errors.join("; ")}`);
  }
  return await sql.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    const items = await tx<Omit<ProductRow, "ingredients">[]>`
      insert into items (name, category, default_fields)
      values (
        ${input.name},
        ${input.category},
        ${sql.json((input.defaultFields ?? {}) as unknown as Parameters<typeof sql.json>[0])}
      )
      returning *
    `;
    const item = items[0];
    const ingredients: IngredientRow[] = [];
    let position = 0;
    for (const ing of input.ingredients) {
      const rows = await tx<IngredientRow[]>`
        insert into ingredients (item_id, name, amount, unit, canonical_name, position)
        values (
          ${item.id}, ${ing.name}, ${ing.amount ?? null}, ${ing.unit ?? null},
          ${canonicalize(ing.name)}, ${position++}
        )
        returning *
      `;
      ingredients.push(rows[0]);
    }
    return { ...item, ingredients };
  });
}

export async function getProductByName(sql: Sql, name: string): Promise<ProductRow | null> {
  const items = await sql<Omit<ProductRow, "ingredients">[]>`
    select * from items where name = ${name}
  `;
  const item = items[0];
  if (!item) return null;
  const ingredients = await sql<IngredientRow[]>`
    select * from ingredients where item_id = ${item.id} order by position
  `;
  return { ...item, ingredients };
}

/** List products (items that have at least one ingredient), with their ingredients. */
export async function listProducts(sql: Sql): Promise<ProductRow[]> {
  const items = await sql<Omit<ProductRow, "ingredients">[]>`
    select i.* from items i
    where exists (select 1 from ingredients g where g.item_id = i.id)
    order by i.name
  `;
  const products: ProductRow[] = [];
  for (const item of items) {
    const ingredients = await sql<IngredientRow[]>`
      select * from ingredients where item_id = ${item.id} order by position
    `;
    products.push({ ...item, ingredients });
  }
  return products;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
