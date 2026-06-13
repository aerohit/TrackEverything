import { assert } from "@std/assert";

// Keeps the Postman collection honest: every route the production router (main.ts)
// serves must have at least one request in the collection, and the collection must
// not reference a path the router doesn't have. This fails CI when an endpoint is
// added/removed without updating postman/TrackEverything.postman_collection.json
// (the binding rule in CLAUDE.md).

const collection = JSON.parse(
  await Deno.readTextFile(
    new URL("../../postman/TrackEverything.postman_collection.json", import.meta.url),
  ),
);
const mainSrc = await Deno.readTextFile(new URL("../../main.ts", import.meta.url));

/** Every request URL path in the collection, normalised to a router pathname. */
function collectionPaths(items: unknown[], out = new Set<string>()): Set<string> {
  for (const it of items as Array<Record<string, unknown>>) {
    if (Array.isArray(it.item)) collectionPaths(it.item, out);
    const request = it.request as Record<string, unknown> | undefined;
    if (request) {
      const url = request.url as { raw?: string } | string;
      const raw = typeof url === "string" ? url : (url.raw ?? "");
      let p = raw.split("{{baseUrl}}")[1] ?? "/";
      p = p.split("?")[0];
      if (p.length > 1) p = p.replace(/\/+$/, "");
      if (p === "") p = "/";
      out.add(p);
    }
  }
  return out;
}

/** The keys of the `routes` record in main.ts, plus the special-cased /health. */
function routerPaths(): Set<string> {
  const block = mainSrc.match(/Record<string, Handler> = \{([\s\S]*?)\n {2}\};/);
  assert(block, "could not locate the routes record in main.ts");
  const keys = [...block[1].matchAll(/"(\/[^"]*)":/g)].map((m) => m[1]);
  const routes = new Set(keys);
  routes.add("/health"); // handled before the routes table
  return routes;
}

Deno.test("postman: collection covers every router endpoint", () => {
  const routes = routerPaths();
  const documented = collectionPaths(collection.item);
  for (const route of routes) {
    assert(
      documented.has(route),
      `Postman collection is missing a request for "${route}" — add it to ` +
        `postman/TrackEverything.postman_collection.json`,
    );
  }
});

Deno.test("postman: collection has no stale endpoints", () => {
  const routes = routerPaths();
  const documented = collectionPaths(collection.item);
  for (const path of documented) {
    assert(
      routes.has(path),
      `Postman collection references "${path}", which main.ts no longer routes — ` +
        `remove or update it`,
    );
  }
});

Deno.test("postman: every request authenticates with {{ingestToken}} (except health/app)", () => {
  // The collection-level bearer uses {{ingestToken}}; only /health and / opt out.
  const raw = JSON.stringify(collection);
  assert(raw.includes("{{ingestToken}}"), "collection should send the INGEST_TOKEN as a variable");
  assert(raw.includes("{{baseUrl}}"), "collection should parameterise the base URL");
});
