/**
 * Guards the "keep the Postman collection in sync" rule (CLAUDE.md): every route
 * registered in app.ts / inputs_routes.ts must have exactly one matching request in
 * postman/TrackEverything.postman_collection.json, and vice-versa. Pure file parsing
 * — no DB — so it always runs. Add a route → add a request, or this fails.
 */
import { assertEquals } from "@std/assert";

const at = (p: string) => new URL(p, import.meta.url);

/** "METHOD /path" for every `app.*` / `api.*` route registration (api.* gets the /api prefix). */
function codeRoutes(): Set<string> {
  const out = new Set<string>();
  const re = /\b(app|api)\.(get|post|patch|delete|put)\(\s*["']([^"']+)["']/g;
  for (const file of ["./app.ts", "./inputs_routes.ts"]) {
    const src = Deno.readTextFileSync(at(file));
    for (const m of src.matchAll(re)) {
      const prefix = m[1] === "app" ? "" : "/api";
      out.add(`${m[2].toUpperCase()} ${prefix}${m[3]}`);
    }
  }
  return out;
}

interface PmItem {
  item?: PmItem[];
  request?: { method: string; url: { path?: string[] } | string };
}

/** "METHOD /path" for every request in the collection (path params kept as :id). */
function collectionRoutes(): Set<string> {
  const col = JSON.parse(
    Deno.readTextFileSync(at("../postman/TrackEverything.postman_collection.json")),
  ) as { item?: PmItem[] };
  const out = new Set<string>();
  const walk = (items: PmItem[]) => {
    for (const it of items) {
      if (it.item) walk(it.item);
      if (it.request) {
        const u = it.request.url;
        const path = typeof u === "string"
          ? new URL(u.replace("{{baseUrl}}", "http://x")).pathname
          : "/" + (u.path ?? []).join("/");
        out.add(`${it.request.method.toUpperCase()} ${path}`);
      }
    }
  };
  walk(col.item ?? []);
  return out;
}

Deno.test("postman collection stays in sync with the registered API routes", () => {
  const code = codeRoutes();
  const pm = collectionRoutes();
  const missing = [...code].filter((r) => !pm.has(r)).sort(); // in code, not documented
  const stale = [...pm].filter((r) => !code.has(r)).sort(); // documented, no longer in code
  assertEquals(missing, [], `Postman collection is missing routes: ${missing.join(", ")}`);
  assertEquals(
    stale,
    [],
    `Postman collection has routes that no longer exist: ${stale.join(", ")}`,
  );
});
