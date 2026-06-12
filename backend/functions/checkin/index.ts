/**
 * Phase 5: `POST /checkin` — log a subjective mood/energy/focus rating. Stores one
 * event per provided dimension (atomically). This is what the on-demand Shortcut
 * and the scheduled-prompt Automation both hit (R-SUBJ-1/2/3).
 *
 *   { "mood": 4 }                          // single dimension
 *   { "mood": 4, "energy": 2, "focus": 3, "note": "post-lunch dip" }
 */
import type { Sql } from "npm:postgres@^3.4.4";
import { connect } from "../../src/db.ts";
import { loadConfig } from "../../src/config.ts";
import { insertEvents } from "../../src/events.ts";
import { buildCheckinEvents, type NewCheckin, validateCheckin } from "../../src/checkins.ts";

export interface CheckinHandlerDeps {
  sql: Sql;
  token: string | null;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

export function makeCheckinHandler(deps: CheckinHandlerDeps) {
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

    const input = toNewCheckin(body);
    const errors = validateCheckin(input);
    if (errors.length > 0) {
      return jsonResponse(400, { error: "invalid check-in", details: errors });
    }

    const events = buildCheckinEvents(input, deps.now?.() ?? new Date());
    const saved = await insertEvents(deps.sql, events);
    return jsonResponse(201, { events: saved });
  };
}

function toNewCheckin(body: Record<string, unknown>): NewCheckin {
  return {
    mood: typeof body.mood === "number" ? body.mood : undefined,
    energy: typeof body.energy === "number" ? body.energy : undefined,
    focus: typeof body.focus === "number" ? body.focus : undefined,
    occurredAt: typeof body.occurredAt === "string" ? body.occurredAt : undefined,
    note: typeof body.note === "string" ? body.note : null,
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
    console.error("DATABASE_URL is not set — cannot start the checkin server.");
    Deno.exit(1);
  }
  const sql = await connect(cfg.databaseUrl);
  Deno.serve(makeCheckinHandler({ sql, token: cfg.ingestToken }));
}
