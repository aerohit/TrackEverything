/**
 * Phase 4b: `/products` — manage composite supplements (item + ingredient list).
 *
 *   GET  /products                      → list products
 *   GET  /products?name=X&servings=2    → one product, with ingredients expanded
 *   POST /products                      → create { name, category, ingredients:[...] }
 */
import type { Sql } from "npm:postgres@^3.4.4";
import { connect } from "../../src/db.ts";
import { loadConfig } from "../../src/config.ts";
import {
  createProduct,
  expandToIngredients,
  getProductByName,
  listProducts,
  type NewProduct,
  validateNewProduct,
} from "../../src/products.ts";

export interface ProductsHandlerDeps {
  sql: Sql;
  token: string | null;
}

export function makeProductsHandler(deps: ProductsHandlerDeps) {
  return async (req: Request): Promise<Response> => {
    if (deps.token) {
      const provided = bearerToken(req) ?? req.headers.get("x-ingest-token");
      if (provided !== deps.token) return jsonResponse(401, { error: "unauthorized" });
    }

    const url = new URL(req.url);

    if (req.method === "GET") {
      const name = url.searchParams.get("name");
      if (!name) {
        return jsonResponse(200, { products: await listProducts(deps.sql) });
      }
      const product = await getProductByName(deps.sql, name);
      if (!product) return jsonResponse(404, { error: `no product named "${name}"` });
      const servings = Number(url.searchParams.get("servings") ?? "1");
      const expanded = expandToIngredients(
        product.ingredients,
        Number.isFinite(servings) && servings > 0 ? servings : 1,
      );
      return jsonResponse(200, { product, expanded });
    }

    if (req.method === "POST") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return jsonResponse(400, { error: "invalid JSON body" });
      }
      if (!isPlainObject(body)) return jsonResponse(400, { error: "body must be a JSON object" });
      const input = toNewProduct(body);
      const errors = validateNewProduct(input);
      if (errors.length > 0) {
        return jsonResponse(400, { error: "invalid product", details: errors });
      }
      return jsonResponse(201, await createProduct(deps.sql, input));
    }

    return jsonResponse(405, { error: "method not allowed" });
  };
}

function toNewProduct(body: Record<string, unknown>): NewProduct {
  const ingredients = Array.isArray(body.ingredients)
    ? body.ingredients.filter(isPlainObject).map((ing) => ({
      name: typeof ing.name === "string" ? ing.name : "",
      amount: typeof ing.amount === "number" ? ing.amount : null,
      unit: typeof ing.unit === "string" ? ing.unit : null,
    }))
    : [];
  return {
    name: typeof body.name === "string" ? body.name : "",
    category: typeof body.category === "string" ? body.category : "supplement",
    defaultFields: isPlainObject(body.defaultFields) ? body.defaultFields : undefined,
    ingredients,
  };
}

function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

if (import.meta.main) {
  const cfg = loadConfig();
  if (!cfg.databaseUrl) {
    console.error("DATABASE_URL is not set — cannot start the products server.");
    Deno.exit(1);
  }
  const sql = await connect(cfg.databaseUrl);
  Deno.serve(makeProductsHandler({ sql, token: cfg.ingestToken }));
}
