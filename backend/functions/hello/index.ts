/**
 * Phase 0 "hello" endpoint — the thinnest possible vertical slice that proves
 * the toolchain: an HTTP request in, a Claude round-trip, JSON out.
 *
 * The handler is factored out of the server bootstrap so tests can exercise it
 * with a mock Claude client and a plain `Request`, with no port binding and no
 * network. The `Deno.serve` entry point only runs when this file is the program
 * entry (not when imported), so importing it in tests is side-effect free.
 *
 * This mirrors the shape a Supabase Edge Function will take in later phases.
 */
import { loadConfig } from "../../src/config.ts";
import { AnthropicClaudeClient, type ClaudeClient } from "../../src/claude.ts";

/** Build the request handler around an injected Claude client. */
export function makeHelloHandler(client: ClaudeClient) {
  return async (req: Request): Promise<Response> => {
    const name = new URL(req.url).searchParams.get("name") ?? "world";
    const reply = await client.hello(
      `Say a one-sentence friendly hello to ${name}.`,
    );
    return Response.json({ ok: true, name, reply });
  };
}

if (import.meta.main) {
  const cfg = loadConfig();
  if (!cfg.anthropicApiKey) {
    console.error("ANTHROPIC_API_KEY is not set — cannot start the hello server.");
    Deno.exit(1);
  }
  const client = new AnthropicClaudeClient(cfg.anthropicApiKey, cfg.claudeModel);
  Deno.serve(makeHelloHandler(client));
}
