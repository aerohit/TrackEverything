/**
 * Phase 4: `GET /templates` (list) and `POST /templates` (create) — manage the
 * quick-log templates that `POST /quicklog` expands. You set these up rarely, so
 * this is the management surface; the one-tap path is the separate quicklog
 * function.
 */
import type { Sql } from "npm:postgres@^3.4.4";
import { connect } from "../../src/db.ts";
import { loadConfig } from "../../src/config.ts";
import {
  createTemplate,
  listTemplates,
  type NewTemplate,
  validateNewTemplate,
} from "../../src/templates.ts";

export interface TemplatesHandlerDeps {
  sql: Sql;
  token: string | null;
}

export function makeTemplatesHandler(deps: TemplatesHandlerDeps) {
  return async (req: Request): Promise<Response> => {
    if (deps.token) {
      const provided = bearerToken(req) ?? req.headers.get("x-ingest-token");
      if (provided !== deps.token) {
        return jsonResponse(401, { error: "unauthorized" });
      }
    }

    if (req.method === "GET") {
      const templates = await listTemplates(deps.sql);
      return jsonResponse(200, { templates });
    }

    if (req.method === "POST") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return jsonResponse(400, { error: "invalid JSON body" });
      }
      if (!isPlainObject(body)) {
        return jsonResponse(400, { error: "body must be a JSON object" });
      }
      const input = toNewTemplate(body);
      const errors = validateNewTemplate(input);
      if (errors.length > 0) {
        return jsonResponse(400, { error: "invalid template", details: errors });
      }
      const created = await createTemplate(deps.sql, input);
      return jsonResponse(201, created);
    }

    return jsonResponse(405, { error: "method not allowed" });
  };
}

function toNewTemplate(body: Record<string, unknown>): NewTemplate {
  return {
    name: typeof body.name === "string" ? body.name : "",
    category: typeof body.category === "string" ? body.category : "",
    defaultFields: isPlainObject(body.defaultFields) ? body.defaultFields : undefined,
    itemId: typeof body.itemId === "string" ? body.itemId : null,
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
    console.error("DATABASE_URL is not set — cannot start the templates server.");
    Deno.exit(1);
  }
  const sql = await connect(cfg.databaseUrl);
  Deno.serve(makeTemplatesHandler({ sql, token: cfg.ingestToken }));
}
