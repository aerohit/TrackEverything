import { assert } from "@std/assert";
import { isKnownCategory, isKnownConfidence, isKnownSource } from "../../src/vocab.ts";

Deno.test("vocab: recognises known values", () => {
  assert(isKnownCategory("supplement"));
  assert(isKnownSource("whoop"));
  assert(isKnownConfidence("inferred"));
});

Deno.test("vocab: rejects unknown values", () => {
  assert(!isKnownCategory("telepathy"));
  assert(!isKnownSource("telegram"));
  assert(!isKnownConfidence("maybe"));
});
