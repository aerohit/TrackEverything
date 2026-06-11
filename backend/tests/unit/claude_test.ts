import { assertEquals } from "@std/assert";
import { MockClaudeClient } from "../../src/claude.ts";

Deno.test("MockClaudeClient: returns its canned reply", async () => {
  const client = new MockClaudeClient("hi there");
  assertEquals(await client.hello("anything"), "hi there");
});

Deno.test("MockClaudeClient: has a sensible default reply", async () => {
  const client = new MockClaudeClient();
  const reply = await client.hello("anything");
  assertEquals(typeof reply, "string");
  assertEquals(reply.length > 0, true);
});
