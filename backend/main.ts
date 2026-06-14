/**
 * Production entrypoint: ONE Deno service that routes by path to the same
 * injectable handler factories used by the standalone functions and the tests.
 * Deploy this single file (Deno Deploy, or any Deno host); Supabase provides
 * Postgres. See docs/deploy.md and ADR-011.
 *
 *   GET  /                 → health
 *   POST /events           GET|POST /templates   POST /quicklog
 *   GET|POST /products     POST /checkin
 *   POST /capture          POST /ingredient-scan  POST /ask   (need ANTHROPIC_API_KEY)
 */
import type { Sql } from "npm:postgres@^3.4.4";
import { loadConfig } from "./src/config.ts";
import { connect } from "./src/db.ts";
import { AnthropicClaudeClient, type ClaudeClient } from "./src/claude.ts";
import { APP_HTML } from "./ui/app.ts";
import { makeEventsHandler } from "./functions/events/index.ts";
import { makeCaptureHandler } from "./functions/capture/index.ts";
import { makeTemplatesHandler } from "./functions/templates/index.ts";
import { makeQuicklogHandler } from "./functions/quicklog/index.ts";
import { makeProductsHandler } from "./functions/products/index.ts";
import { makeIngredientScanHandler } from "./functions/ingredient_scan/index.ts";
import { makeFoodScanHandler } from "./functions/food_scan/index.ts";
import { makeCheckinHandler } from "./functions/checkin/index.ts";
import { makeAskHandler } from "./functions/ask/index.ts";
import { makeOverviewHandler } from "./functions/overview/index.ts";

type Handler = (req: Request) => Promise<Response>;

export interface RouterDeps {
  sql: Sql;
  claude: ClaudeClient | null;
  token: string | null;
}

/** Build the path router. Pure wrt deps so it's unit-testable without a DB. */
export function buildRouter(deps: RouterDeps): Handler {
  const { sql, claude, token } = deps;

  const claudeRoute = (make: (c: ClaudeClient) => Handler): Handler =>
    claude
      ? make(claude)
      : () => Promise.resolve(json(503, { error: "ANTHROPIC_API_KEY not configured" }));

  const appHandler: Handler = (req) =>
    Promise.resolve(
      req.method === "GET"
        ? new Response(APP_HTML, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        })
        : json(405, { error: "method not allowed" }),
    );

  const routes: Record<string, Handler> = {
    "/": appHandler,
    "/app": appHandler,
    "/events": makeEventsHandler({ sql, token }),
    "/templates": makeTemplatesHandler({ sql, token }),
    "/quicklog": makeQuicklogHandler({ sql, token }),
    "/products": makeProductsHandler({ sql, token }),
    "/checkin": makeCheckinHandler({ sql, token }),
    "/overview": makeOverviewHandler({ sql, token }),
    "/capture": claudeRoute((c) => makeCaptureHandler({ claude: c, token })),
    "/ingredient-scan": claudeRoute((c) => makeIngredientScanHandler({ claude: c, token })),
    "/food-scan": claudeRoute((c) => makeFoodScanHandler({ claude: c, token })),
    "/ask": claudeRoute((c) => makeAskHandler({ sql, claude: c, token })),
  };

  return (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/health") {
      // `?warm=1` also pings the database — used by the warm-up cron to keep the
      // pooled connection (and a free-tier Supabase project) from going cold/paused.
      // Plain /health stays DB-free so it's a fast liveness probe.
      if (url.searchParams.has("warm")) {
        return sql`select 1 as ok`.then(
          () => json(200, { ok: true, service: "trackeverything", db: true }),
          () => json(200, { ok: true, service: "trackeverything", db: false }),
        );
      }
      return Promise.resolve(json(200, { ok: true, service: "trackeverything" }));
    }
    const handler = routes[path];
    if (!handler) return Promise.resolve(json(404, { error: `no route for ${path}` }));
    return handler(req);
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

if (import.meta.main) {
  // A stray DB rejection (e.g. postgres.js surfacing a "canceling statement due to
  // statement timeout" on a dropped pooled connection, with no awaiting context)
  // would otherwise be an *uncaught* rejection that crashes the Deno Deploy isolate —
  // which then reboots and the next request pays a cold start (often a
  // DEPLOYMENT_TIMED_OUT). Swallow it (logged) so one bad query can't take the
  // service down; real request errors are still handled per-route and returned as 5xx.
  globalThis.addEventListener("unhandledrejection", (e) => {
    console.error("unhandled rejection (kept alive):", e.reason);
    e.preventDefault();
  });

  const cfg = loadConfig();
  if (!cfg.databaseUrl) {
    console.error("DATABASE_URL is required.");
    Deno.exit(1);
  }
  if (!cfg.ingestToken) {
    console.warn("INGEST_TOKEN is not set — endpoints will accept unauthenticated requests.");
  }
  const sql = await connect(cfg.databaseUrl);
  // Open the first DB connection now (fire-and-forget) so the TLS + auth handshake
  // overlaps with the isolate boot instead of blocking the first request — cuts the
  // cold-start latency seen right after a deploy. Errors are ignored (the real
  // request will surface any genuine DB problem).
  sql`select 1`.catch(() => {});
  const claude = cfg.anthropicApiKey
    ? new AnthropicClaudeClient(cfg.anthropicApiKey, cfg.claudeModel)
    : null;
  if (!claude) {
    console.warn(
      "ANTHROPIC_API_KEY is not set — /capture, /ingredient-scan, /ask will return 503.",
    );
  }
  Deno.serve(buildRouter({ sql, claude, token: cfg.ingestToken }));
}
