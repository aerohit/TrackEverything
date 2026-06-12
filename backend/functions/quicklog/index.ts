/**
 * Phase 4: `POST /quicklog` — one-tap logging. Body names a template; we expand
 * it into an event at tap time and store it. This is what the Home/Lock-Screen
 * Shortcut hits (R-CAP-5, R-CAP-6).
 *
 *   { "template": "my coffee" }                 // log with the template's defaults
 *   { "template": "my coffee", "fields": {...}, "occurredAt": "..." }  // overrides
 */
import type { Sql } from "npm:postgres@^3.4.4";
import { connect } from "../../src/db.ts";
import { loadConfig } from "../../src/config.ts";
import { insertEvent } from "../../src/events.ts";
import { expandTemplate, getTemplateByName } from "../../src/templates.ts";

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
    if (!isPlainObject(body) || typeof body.template !== "string" || body.template.trim() === "") {
      return jsonResponse(400, { error: "body.template (template name) is required" });
    }

    const template = await getTemplateByName(deps.sql, body.template);
    if (!template) {
      return jsonResponse(404, { error: `no template named "${body.template}"` });
    }

    const event = expandTemplate(template, {
      now: deps.now?.() ?? new Date(),
      occurredAt: typeof body.occurredAt === "string" ? body.occurredAt : undefined,
      fields: isPlainObject(body.fields) ? body.fields : undefined,
    });
    const saved = await insertEvent(deps.sql, event);
    return jsonResponse(201, saved);
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
