/**
 * Phase 6: `POST /ask` — a real-time question over the recent timeline.
 *
 *   { "question": "whats_dragging_me_down", "windowHours": 48 }
 *
 * Fetches the recent events, assembles a citable context, asks Claude, and returns
 * the answer with the events it cited. Phase 6 ships one question template.
 */
import type { Sql } from "npm:postgres@^3.4.4";
import { connect } from "../../src/db.ts";
import { loadConfig } from "../../src/config.ts";
import { AnthropicClaudeClient, type ClaudeClient } from "../../src/claude.ts";
import { getRecentEvents } from "../../src/events.ts";
import { DEFAULT_WINDOW_HOURS } from "../../src/context.ts";
import { answerQuestion, ASK_TEMPLATES } from "../../src/ask.ts";

const MAX_WINDOW_HOURS = 72;

export interface AskHandlerDeps {
  sql: Sql;
  claude: ClaudeClient;
  token: string | null;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

export function makeAskHandler(deps: AskHandlerDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return jsonResponse(405, { error: "method not allowed" });
    if (deps.token) {
      const provided = bearerToken(req) ?? req.headers.get("x-ingest-token");
      if (provided !== deps.token) return jsonResponse(401, { error: "unauthorized" });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "invalid JSON body" });
    }
    if (!isPlainObject(body)) return jsonResponse(400, { error: "body must be a JSON object" });

    const templateId = typeof body.question === "string" ? body.question : "whats_dragging_me_down";
    const template = ASK_TEMPLATES[templateId];
    if (!template) {
      return jsonResponse(400, {
        error: `unknown question "${templateId}"`,
        available: Object.keys(ASK_TEMPLATES),
      });
    }

    const param = typeof body.param === "string" ? body.param : undefined;
    if (template.paramRequired && (param === undefined || param.trim() === "")) {
      return jsonResponse(400, {
        error: `question "${templateId}" requires a "${template.paramName}" parameter`,
      });
    }

    const windowHours = clampWindow(body.windowHours);
    const now = deps.now?.() ?? new Date();
    const since = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
    const events = await getRecentEvents(deps.sql, since);

    const result = await answerQuestion(deps.claude, {
      templateId,
      param,
      events,
      now,
      windowHours,
    });
    return jsonResponse(200, result);
  };
}

function clampWindow(value: unknown): number {
  const n = typeof value === "number" ? value : DEFAULT_WINDOW_HOURS;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WINDOW_HOURS;
  return Math.min(n, MAX_WINDOW_HOURS);
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
  if (!cfg.databaseUrl || !cfg.anthropicApiKey) {
    console.error("DATABASE_URL and ANTHROPIC_API_KEY are required for the ask server.");
    Deno.exit(1);
  }
  const sql = await connect(cfg.databaseUrl);
  const claude = new AnthropicClaudeClient(cfg.anthropicApiKey, cfg.claudeModel);
  Deno.serve(makeAskHandler({ sql, claude, token: cfg.ingestToken }));
}
