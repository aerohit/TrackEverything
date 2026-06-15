import { describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createCheckin,
  createItem,
  intakeTotals,
  listCheckins,
  listSubstances,
  logIntake,
  recentItems,
  recognizeIntake,
  scanItem,
  searchItems,
  transcribeAudio,
} from "./api";

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

  it("listSubstances reads the vocabulary", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ substances: [{ id: "1", name: "caffeine", canonicalUnit: "mg" }] })
    );
    const out = await listSubstances({ fetch, token: "t" });
    expect(out[0].name).toBe("caffeine");
    expect(String(fetch.mock.calls[0][0])).toBe("/api/substances");
  });

  it("createItem POSTs the item body and surfaces a server error message", async () => {
    const ok = vi.fn<typeof globalThis.fetch>(async () => jsonResponse({ id: "1", name: "X" }, true, 201));
    await createItem(
      { name: "X", kind: "product", primaryType: "supplement", components: [{ substance: "caffeine", amount: 200, unit: "mg" }] },
      { fetch: ok, token: "t" },
    );
    const [url, init] = ok.mock.calls[0];
    expect(String(url)).toBe("/api/items");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string).components[0].substance).toBe("caffeine");

    const bad = vi.fn<typeof globalThis.fetch>(async () => jsonResponse({ error: "Unknown substance: x" }, false, 400));
    await expect(createItem({ name: "X", kind: "simple", primaryType: "food" }, { fetch: bad, token: "t" }))
      .rejects.toThrow("Unknown substance");
  });

  it("scanItem POSTs the image and returns the draft", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ name: "Multivitamin", kind: "product", primaryType: "supplement", components: [] })
    );
    const draft = await scanItem("BASE64DATA", "image/png", { fetch, token: "t" });
    expect(draft.name).toBe("Multivitamin");
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("/api/items/scan");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({ imageBase64: "BASE64DATA", mediaType: "image/png" });
  });

  it("scanItem surfaces a 503 when scanning is unconfigured", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ error: "label scanning is not configured" }, false, 503)
    );
    await expect(scanItem("x", "image/png", { fetch, token: "t" })).rejects.toThrow("not configured");
  });

  it("transcribeAudio POSTs the audio and returns the text", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => jsonResponse({ text: "one banana" }));
    const text = await transcribeAudio("AUDIO64", "audio/webm", { fetch, token: "t" });
    expect(text).toBe("one banana");
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("/api/transcribe");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ audioBase64: "AUDIO64", mediaType: "audio/webm" });
  });

  it("recognizeIntake posts a photo source and returns recognition + matches", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({
        recognized: { name: "banana", quantity: 1, unit: "piece", primaryType: "food", draft: {} },
        matches: [{ id: "i1", name: "Banana" }],
      })
    );
    const out = await recognizeIntake({ imageBase64: "IMG", mediaType: "image/jpeg" }, { fetch, token: "t" });
    expect(out.recognized.name).toBe("banana");
    expect(out.matches[0].name).toBe("Banana");
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("/api/intake/recognize");
    expect(JSON.parse(init?.body as string)).toEqual({
      source: "photo",
      imageBase64: "IMG",
      mediaType: "image/jpeg",
    });
  });

  it("recognizeIntake posts a text source", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ recognized: { name: "coffee", quantity: 1, unit: "cup", primaryType: "drink", draft: {} }, matches: [] })
    );
    await recognizeIntake({ text: "a coffee" }, { fetch, token: "t" });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({ source: "text", text: "a coffee" });
  });

  it("recentItems requests the recent list with a limit", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ items: [{ itemId: "i1", displayName: "Banana", quantity: 2, unit: "piece", lastLoggedAt: "x" }] })
    );
    const out = await recentItems(10, { fetch, token: "t" });
    expect(out[0].displayName).toBe("Banana");
    expect(String(fetch.mock.calls[0][0])).toBe("/api/intake/recent-items?limit=10");
  });
});
