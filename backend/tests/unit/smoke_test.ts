import { assertEquals } from "@std/assert";
import { loadConfig } from "../../src/config.ts";

// Proves the test runner itself works.
Deno.test("smoke: the test runner runs", () => {
  assertEquals(1 + 1, 2);
});

Deno.test("loadConfig: applies defaults when env is empty", () => {
  const cfg = loadConfig({});
  assertEquals(cfg.claudeModel, "claude-opus-4-8");
  assertEquals(cfg.anthropicApiKey, null);
  assertEquals(cfg.databaseUrl, null);
});

Deno.test("loadConfig: reads values from the env record", () => {
  const cfg = loadConfig({
    ANTHROPIC_API_KEY: "sk-test",
    DATABASE_URL: "postgres://localhost/db",
    CLAUDE_MODEL: "claude-haiku-4-5",
  });
  assertEquals(cfg.anthropicApiKey, "sk-test");
  assertEquals(cfg.databaseUrl, "postgres://localhost/db");
  assertEquals(cfg.claudeModel, "claude-haiku-4-5");
});
