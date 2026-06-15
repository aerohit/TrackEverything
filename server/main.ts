/**
 * Deno entrypoint — the single Deno Deploy service (ADR-015). It mounts the Hono
 * API at /api and serves the built SvelteKit PWA (web/build) for everything else,
 * with an SPA fallback to index.html so client routes deep-link. One origin, no
 * CORS. Production secrets (DATABASE_URL, INGEST_TOKEN) come from the Deploy env.
 */
import { serveStatic } from "hono/deno";
import { sql } from "drizzle-orm";
import { connect } from "../db/client.ts";
import { createApp } from "./app.ts";

// On Deno Deploy an uncaught rejection crashes the isolate (the v1 crash-loop —
// see ADR-011's consequences). Keep the isolate alive and just log instead.
globalThis.addEventListener("unhandledrejection", (e) => {
  console.error("unhandled rejection (kept alive):", e.reason);
  e.preventDefault();
});

const { db } = connect();
// Warm the pooled DB connection at startup so the first request isn't cold.
db.execute(sql`select 1`).catch(() => {});

const app = createApp(db, { token: Deno.env.get("INGEST_TOKEN") });

const WEB_ROOT = "./web/build";
app.use("/*", serveStatic({ root: WEB_ROOT }));
// SPA fallback: anything not an /api route or a real asset returns the shell.
app.get("/*", serveStatic({ path: `${WEB_ROOT}/index.html` }));

Deno.serve(app.fetch);
