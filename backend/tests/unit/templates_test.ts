import { assertEquals } from "@std/assert";
import { expandTemplate, type TemplateRow, validateNewTemplate } from "../../src/templates.ts";

const now = new Date("2026-06-12T12:00:00Z");

const coffee: TemplateRow = {
  id: "tmpl-1",
  name: "my coffee",
  category: "drink",
  default_fields: { item: "coffee", caffeine_mg: 120 },
  item_id: null,
  created_at: now,
};

Deno.test("validateNewTemplate: accepts a valid template", () => {
  assertEquals(
    validateNewTemplate({
      name: "my coffee",
      category: "drink",
      defaultFields: { caffeine_mg: 120 },
    }),
    [],
  );
});

Deno.test("validateNewTemplate: rejects missing name and unknown category", () => {
  const errors = validateNewTemplate({ name: "", category: "telepathy" });
  assertEquals(errors.some((e) => e.includes("name")), true);
  assertEquals(errors.some((e) => e.includes("category")), true);
});

Deno.test("expandTemplate: applies defaults, occurredAt=now, quicklog source", () => {
  const event = expandTemplate(coffee, { now });
  assertEquals(event.category, "drink");
  assertEquals(event.source, "quicklog");
  assertEquals(event.occurredAtConfidence, "high");
  assertEquals((event.occurredAt as Date).getTime(), now.getTime());
  assertEquals(event.fields, { item: "coffee", caffeine_mg: 120 });
  assertEquals(event.templateId, "tmpl-1");
});

Deno.test("expandTemplate: per-tap fields override defaults", () => {
  const event = expandTemplate(coffee, { now, fields: { caffeine_mg: 80, decaf: true } });
  assertEquals(event.fields, { item: "coffee", caffeine_mg: 80, decaf: true });
});

Deno.test("expandTemplate: honours an explicit occurredAt (after-the-fact)", () => {
  const event = expandTemplate(coffee, { now, occurredAt: "2026-06-12T08:00:00Z" });
  assertEquals(event.occurredAt, "2026-06-12T08:00:00Z");
});
