# web — TrackEverything PWA (v2)

The v2 front end: a **SvelteKit** (Svelte 5) single-page app, built to static assets and served by
the Hono service in [`../server`](../server) as **one Deno Deploy service** (same origin, no CORS).
See [ADR-015](../docs/ARCHITECTURE.md#adr-015).

## Responsive

Mobile-first and **optimized for phone and desktop** (R-VIEW-7): a single column on phones, an
**adaptive two-pane** layout (check-in beside the day chart) at ≥ 880px. Light/dark theme follows
the system with a manual toggle (R-VIEW-6), resolved before first paint to avoid a flash.

## Develop

```sh
cd web
npm install
npm run dev        # vite dev server (proxy /api to a running server, or use the full build)
npm run check      # svelte-check (type-check)
npm test           # vitest unit tests
npm run build      # → web/build (static SPA the Hono service serves)
```

Run the **whole app** (PWA + API) as one service from the repo root: `npm --prefix web run build`
then `deno task start` (serves `web/build` + `/api`). Needs `DATABASE_URL` and `INGEST_TOKEN`.

## Notes

- The token is entered once and kept in `localStorage`; the API client sends it as a Bearer header.
- [`src/lib/types.ts`](src/lib/types.ts) mirrors the server's shared Zod contract
  (`../shared/subjective_state.ts`), which stays the runtime source of truth and validates every
  request — a small type-only copy so the web build stays inside the Node/Vite world.
