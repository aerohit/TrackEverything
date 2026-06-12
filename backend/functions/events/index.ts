/**
 * Phase 2: `POST /events` — manual capture with no LLM in the path. Accepts a
 * JSON event, validates it (reusing the Phase 1 repository), stores it, and
 * returns the stored row. Shaped like a Supabase Edge Function; the handler is
 * factored out so tests can drive it with a `Request` and no port binding.
 *
 * Auth: a shared secret (`INGEST_TOKEN`). A public write endpoint must be
 * protected — anyone who can reach it could otherwise pollute the event log.
 * Clients present it as `Authorization: Bearer <token>` or `x-ingest-token`.
 */
import type { Sql } from "npm:postgres@^3.4.4";
import { connect } from "../../src/db.ts";
import { loadConfig } from "../../src/config.ts";
import { insertEvent, insertEvents, type NewEvent, validateNewEvent } from "../../src/events.ts";

export interface EventsHandlerDeps {
  sql: Sql;
  /** Expected shared secret. When null, auth is disabled (dev only). */
  token: string | null;
}

export function makeEventsHandler(deps: EventsHandlerDeps) {
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

    // Batch form: { "events": [ ... ] } — used to persist confirmed candidates.
    if (Array.isArray(body.events)) {
      return await handleBatch(deps.sql, body.events);
    }

    // Single form: the event object itself.
    const input = toNewEvent(body);
    const errors = validateNewEvent(input);
    if (errors.length > 0) {
      return jsonResponse(400, { error: "invalid event", details: errors });
    }

    const saved = await insertEvent(deps.sql, input);
    return jsonResponse(201, saved);
  };
}

async function handleBatch(sql: Sql, rawEvents: unknown[]): Promise<Response> {
  if (rawEvents.length === 0) {
    return jsonResponse(400, { error: "events array is empty" });
  }
  const inputs: NewEvent[] = [];
  const details: string[] = [];
  rawEvents.forEach((el, i) => {
    if (!isPlainObject(el)) {
      details.push(`events[${i}]: must be an object`);
      return;
    }
    const input = toNewEvent(el);
    const errs = validateNewEvent(input);
    if (errs.length > 0) details.push(`events[${i}]: ${errs.join("; ")}`);
    inputs.push(input);
  });
  if (details.length > 0) {
    return jsonResponse(400, { error: "invalid events", details });
  }
  const saved = await insertEvents(sql, inputs);
  return jsonResponse(201, { events: saved });
}

/** Map a JSON body to a NewEvent. `source` defaults to "manual" for this endpoint. */
function toNewEvent(body: Record<string, unknown>): NewEvent {
  return {
    category: typeof body.category === "string" ? body.category : "",
    occurredAt: typeof body.occurredAt === "string" ? body.occurredAt : "",
    recordedAt: typeof body.recordedAt === "string" ? body.recordedAt : undefined,
    occurredAtConfidence: body.occurredAtConfidence as NewEvent["occurredAtConfidence"],
    source: typeof body.source === "string" ? body.source : "manual",
    fields: body.fields as Record<string, unknown> | undefined,
    rawText: typeof body.rawText === "string" ? body.rawText : null,
    templateId: typeof body.templateId === "string" ? body.templateId : null,
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
    console.error("DATABASE_URL is not set — cannot start the events server.");
    Deno.exit(1);
  }
  if (!cfg.ingestToken) {
    console.warn("INGEST_TOKEN is not set — the endpoint will accept unauthenticated writes.");
  }
  const sql = await connect(cfg.databaseUrl);
  Deno.serve(makeEventsHandler({ sql, token: cfg.ingestToken }));
}
