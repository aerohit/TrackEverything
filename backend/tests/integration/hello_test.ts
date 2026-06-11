import { assertEquals } from "@std/assert";
import { makeHelloHandler } from "../../functions/hello/index.ts";
import { MockClaudeClient } from "../../src/claude.ts";

// Exercises the real request -> handler -> response path end to end, with the
// Claude call mocked for determinism (R-TEST-2, R-TEST-4).
Deno.test("hello handler: returns JSON with the reply and parsed name", async () => {
  const handler = makeHelloHandler(new MockClaudeClient("Hello, Rohit!"));
  const res = await handler(new Request("http://localhost/?name=Rohit"));

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { ok: true, name: "Rohit", reply: "Hello, Rohit!" });
});

Deno.test("hello handler: defaults the name to 'world'", async () => {
  const handler = makeHelloHandler(new MockClaudeClient("Hi!"));
  const res = await handler(new Request("http://localhost/"));

  const body = await res.json();
  assertEquals(body.name, "world");
});
