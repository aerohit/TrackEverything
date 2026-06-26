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
import { AnthropicItemScanner } from "./scan_anthropic.ts";
import { OpenFoodFactsLookup } from "./barcode_off.ts";
import { AnthropicIntakeRecognizer } from "./recognize_anthropic.ts";
import { AnthropicAdvisor } from "./advise_anthropic.ts";

// On Deno Deploy an uncaught rejection crashes the isolate (the v1 crash-loop —
// see ADR-011's consequences). Keep the isolate alive and just log instead.
globalThis.addEventListener("unhandledrejection", (e) => {
  console.error("unhandled rejection (kept alive):", e.reason);
  e.preventDefault();
});

const { db } = connect();
// Warm the pooled DB connection at startup so the first request isn't cold.
db.execute(sql`select 1`).catch(() => {});

// Label scanning + meal/phrase recognition are enabled when an Anthropic key is
// present (Claude vision). Voice is transcribed on-device (Web Speech API) and
// reaches the recognizer as text — no server-side transcription provider needed.
const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
const scanner = anthropicKey ? new AnthropicItemScanner(anthropicKey) : undefined;
const recognizer = anthropicKey ? new AnthropicIntakeRecognizer(anthropicKey) : undefined;
const advisor = anthropicKey ? new AnthropicAdvisor(anthropicKey) : undefined;
// Barcode lookup hits Open Food Facts and needs no API key, so it's always on.
const lookup = new OpenFoodFactsLookup();

const app = createApp(db, {
  token: Deno.env.get("INGEST_TOKEN"),
  scanner,
  lookup,
  recognizer,
  advisor,
  // Set per Deno Deploy environment (test | prod); drives the PWA's non-prod banner.
  env: Deno.env.get("APP_ENV") ?? "dev",
});

const WEB_ROOT = "./web/build";
app.use("/*", serveStatic({ root: WEB_ROOT }));
// SPA fallback: anything not an /api route or a real asset returns the shell.
app.get("/*", serveStatic({ path: `${WEB_ROOT}/index.html` }));

Deno.serve(app.fetch);
