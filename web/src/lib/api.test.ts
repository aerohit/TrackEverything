import { describe, expect, it, vi } from "vitest";
import { ApiError, createCheckin, intakeTotals, listCheckins, logIntake, searchItems } from "./api";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe("api client", () => {
  it("listCheckins sends the bearer token and parses checkins, with a kind filter", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({
        checkins: [{ id: "1", kind: "mood", rating: 3, note: null, recordedAt: "2026-06-15T08:00:00.000Z" }],
      })
    );
    const out = await listCheckins({ kind: "mood", limit: 50 }, { fetch, token: "tok" });
    expect(out).toHaveLength(1);
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toContain("/api/checkins?");
    expect(String(url)).toContain("kind=mood");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("createCheckin POSTs the readings and returns the rows", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({
        checkins: [{ id: "1", kind: "mood", rating: 4, note: null, recordedAt: "2026-06-15T08:00:00.000Z" }],
      }, true, 201)
    );
    const out = await createCheckin({ readings: [{ kind: "mood", rating: 4 }] }, { fetch, token: "tok" });
    expect(out[0].rating).toBe(4);
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("/api/checkins");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string).readings[0].kind).toBe("mood");
  });

  it("throws ApiError on a non-ok response (e.g. 401)", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => jsonResponse({ error: "unauthorized" }, false, 401));
    await expect(listCheckins({}, { fetch, token: "" })).rejects.toBeInstanceOf(ApiError);
  });

  it("searchItems encodes the query", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => jsonResponse({ items: [] }));
    await searchItems("pre workout", { fetch, token: "tok" });
    expect(String(fetch.mock.calls[0][0])).toContain("/api/items?search=pre%20workout");
  });

  it("logIntake POSTs the intake body and returns the event", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ id: "1", displayName: "Coffee", resolved: [] }, true, 201)
    );
    const ev = await logIntake({ displayName: "Coffee", quantity: 1, unit: "cup" }, { fetch, token: "tok" });
    expect(ev.displayName).toBe("Coffee");
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("/api/intake");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string).unit).toBe("cup");
  });

  it("intakeTotals sends the from/to window", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => jsonResponse({ totals: [] }));
    await intakeTotals(new Date("2026-06-15T00:00:00Z"), new Date("2026-06-16T00:00:00Z"), { fetch, token: "t" });
    const url = String(fetch.mock.calls[0][0]);
    expect(url).toContain("/api/intake/totals?");
    expect(url).toContain("from=2026-06-15");
    expect(url).toContain("to=2026-06-16");
  });
});
