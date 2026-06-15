/**
 * Deno entrypoint — the single Deno Deploy service (ADR-015). It mounts the Hono
 * API at /api and serves the built SvelteKit PWA (web/build) for everything else,
 * with an SPA fallback to index.html so client routes deep-link. One origin, no
 * CORS. Production secrets (DATABASE_URL, INGEST_TOKEN) come from the Deploy env.
 */
import { serveStatic } from "hono/deno";
import { connect } from "../db/client.ts";
import { createApp } from "./app.ts";

const { db } = connect();
const app = createApp(db, { token: Deno.env.get("INGEST_TOKEN") });

const WEB_ROOT = "./web/build";
app.use("/*", serveStatic({ root: WEB_ROOT }));
// SPA fallback: anything not an /api route or a real asset returns the shell.
app.get("/*", serveStatic({ path: `${WEB_ROOT}/index.html` }));

Deno.serve(app.fetch);
