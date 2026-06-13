/**
 * Phase 4: `POST /quicklog` — one-tap logging. Body names a template (Phase 4) or
 * a composite-supplement product (Phase 4b); we build an event at tap time and
 * store it. This is what the Home/Lock-Screen Shortcut hits (R-CAP-5, R-CAP-6,
 * R-CAP-13).
 *
 *   { "template": "my coffee" }                          // template defaults
 *   { "template": "my coffee", "fields": {...}, "occurredAt": "..." }
 *   { "product": "sleep stack", "servings": 2 }          // log a product by name
 */
import type { Sql } from "npm:postgres@^3.4.4";
import { connect } from "../../src/db.ts";
import { loadConfig } from "../../src/config.ts";
import { insertEvent, type NewEvent } from "../../src/events.ts";
import { expandTemplate, getTemplateByName } from "../../src/templates.ts";
import { getProductByName } from "../../src/products.ts";

export interface QuicklogHandlerDeps {
  sql: Sql;
  token: string | null;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

export function makeQuicklogHandler(deps: QuicklogHandlerDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return jsonResponse(405, { error: "method not allowed" });
    }
    if (deps.token) {
      const provided = bearerToken(req) ?? req.headers.get("x-ingest-token");
      if (provided !== deps.token) {
        return jsonResponse(401, { error: "unauthorized" });
      }
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "invalid JSON body" });
    }
    if (!isPlainObject(body)) {
      return jsonResponse(400, { error: "body must be a JSON object" });
    }

    const now = deps.now?.() ?? new Date();
    const occurredAt = typeof body.occurredAt === "string" ? body.occurredAt : undefined;
    const overrides = isPlainObject(body.fields) ? body.fields : undefined;

    // Composite supplement: log a product by name (Phase 4b).
    if (typeof body.product === "string" && body.product.trim() !== "") {
      const product = await getProductByName(deps.sql, body.product);
      if (!product) {
        return jsonResponse(404, { error: `no product named "${body.product}"` });
      }
      const servings = typeof body.servings === "number" && body.servings > 0 ? body.servings : 1;
      const event: NewEvent = {
        category: product.category,
        occurredAt: occurredAt ?? now,
        occurredAtConfidence: "high",
        source: "quicklog",
        // `item` defaults to the product name so the log is self-describing in a
        // timeline; a product-defined `item` or a per-tap override still wins.
        fields: { item: product.name, ...product.default_fields, servings, ...(overrides ?? {}) },
        itemId: product.id,
      };
      return jsonResponse(201, await insertEvent(deps.sql, event));
    }

    // Quick-log template (Phase 4).
    if (typeof body.template === "string" && body.template.trim() !== "") {
      const template = await getTemplateByName(deps.sql, body.template);
      if (!template) {
        return jsonResponse(404, { error: `no template named "${body.template}"` });
      }
      const event = expandTemplate(template, { now, occurredAt, fields: overrides });
      return jsonResponse(201, await insertEvent(deps.sql, event));
    }

    return jsonResponse(400, { error: "body.template or body.product is required" });
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
    console.error("DATABASE_URL is not set — cannot start the quicklog server.");
    Deno.exit(1);
  }
  const sql = await connect(cfg.databaseUrl);
  Deno.serve(makeQuicklogHandler({ sql, token: cfg.ingestToken }));
}
