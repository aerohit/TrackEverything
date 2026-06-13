import { assertEquals } from "@std/assert";
import { assembleContext, selectWindow } from "../../src/context.ts";
import { makeEvent } from "../helpers/events.ts";

const now = new Date("2026-06-12T12:00:00Z");

Deno.test("selectWindow: keeps in-window events, drops old ones, sorts oldest first", () => {
  const out = selectWindow(
    [
      makeEvent({ occurred_at: new Date("2026-06-12T11:00:00Z"), category: "drink" }),
      makeEvent({ occurred_at: new Date("2026-06-09T12:00:00Z"), category: "sleep" }), // >48h ago
      makeEvent({ occurred_at: new Date("2026-06-12T06:00:00Z"), category: "mood" }),
    ],
    now,
    48,
  );
  assertEquals(out.map((e) => e.category), ["mood", "drink"]);
});

Deno.test("assembleContext: tags events [E#] and indexes them to ids", () => {
  const e1 = makeEvent({
    occurred_at: new Date("2026-06-12T08:00:00Z"),
    category: "drink",
    fields: { item: "coffee" },
  });
  const { text, index } = assembleContext({ events: [e1], now });
  assertEquals(index.length, 1);
  assertEquals(index[0].ref, "E1");
  assertEquals(index[0].event.id, e1.id);
  assertEquals(text.includes("E1"), true);
  assertEquals(text.includes("drink"), true);
});

Deno.test("assembleContext: merges baselines and handles an empty window", () => {
  const { text } = assembleContext({ events: [], now, baselines: "usual: 2 coffees, sleep 7h" });
  assertEquals(text.includes("Baselines:"), true);
  assertEquals(text.includes("usual: 2 coffees"), true);
  assertEquals(text.includes("no events in this window"), true);
});
