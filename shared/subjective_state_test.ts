import { assert, assertEquals } from "@std/assert";
import { createCheckinSchema, DIMENSIONS, updateCheckinSchema } from "./subjective_state.ts";

Deno.test("createCheckin: accepts any subset of dimensions", () => {
  for (const d of DIMENSIONS) {
    const r = createCheckinSchema.safeParse({ [d]: 3 });
    assert(r.success, `${d} alone should be valid`);
  }
  assert(createCheckinSchema.safeParse({ mood: 5, energy: 1, focus: 3, note: "ok" }).success);
});

Deno.test("createCheckin: rejects an empty check-in (no dimension rated)", () => {
  assert(!createCheckinSchema.safeParse({}).success);
  assert(!createCheckinSchema.safeParse({ note: "just a note" }).success);
});

Deno.test("createCheckin: enforces the 1-5 integer range", () => {
  for (const bad of [0, 6, 2.5, -1]) {
    assert(!createCheckinSchema.safeParse({ mood: bad }).success, `${bad} should be rejected`);
  }
});

Deno.test("createCheckin: occurredAt must be an ISO datetime with offset", () => {
  assert(createCheckinSchema.safeParse({ mood: 3, occurredAt: "2026-06-15T09:00:00Z" }).success);
  assert(!createCheckinSchema.safeParse({ mood: 3, occurredAt: "2026-06-15" }).success);
});

Deno.test("updateCheckin: rejects an empty patch", () => {
  assert(!updateCheckinSchema.safeParse({}).success);
  assertEquals(updateCheckinSchema.safeParse({ focus: 4 }).success, true);
});
