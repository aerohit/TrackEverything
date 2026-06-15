import { assert, assertEquals } from "@std/assert";
import {
  createCheckinSchema,
  kindSchema,
  ratingSchema,
  SUBJECTIVE_KINDS,
} from "./subjective_state.ts";

Deno.test("kind: only the known subjective states are valid", () => {
  for (const k of SUBJECTIVE_KINDS) assert(kindSchema.safeParse(k).success);
  assert(!kindSchema.safeParse("vibes").success);
});

Deno.test("rating: integer 1-5 only", () => {
  for (const ok of [1, 2, 3, 4, 5]) assert(ratingSchema.safeParse(ok).success);
  for (const bad of [0, 6, 2.5, -1]) assert(!ratingSchema.safeParse(bad).success, `${bad}`);
});

Deno.test("createCheckin: accepts one or several readings", () => {
  assert(createCheckinSchema.safeParse({ readings: [{ kind: "mood", rating: 4 }] }).success);
  assert(
    createCheckinSchema.safeParse({
      readings: [{ kind: "mood", rating: 4 }, { kind: "energy", rating: 3 }, {
        kind: "focus",
        rating: 5,
      }],
      note: "solid morning",
    }).success,
  );
});

Deno.test("createCheckin: rejects an empty check-in", () => {
  assert(!createCheckinSchema.safeParse({ readings: [] }).success);
  assert(!createCheckinSchema.safeParse({ note: "x" }).success);
});

Deno.test("createCheckin: rejects a duplicated kind in one check-in", () => {
  const r = createCheckinSchema.safeParse({
    readings: [{ kind: "mood", rating: 4 }, { kind: "mood", rating: 2 }],
  });
  assert(!r.success);
});

Deno.test("createCheckin: rejects an out-of-range rating", () => {
  assertEquals(
    createCheckinSchema.safeParse({ readings: [{ kind: "focus", rating: 9 }] }).success,
    false,
  );
});
