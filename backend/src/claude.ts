/**
 * Thin seam over Claude so the rest of the app depends on an interface, not the
 * SDK. This is the boundary that makes the LLM mockable in tests (R-TEST-4):
 * deterministic tests inject `MockClaudeClient`; the live suite uses
 * `AnthropicClaudeClient` against the real API.
 *
 * In Phase 0 the only capability is a trivial `hello` round-trip to prove the
 * API wiring. Real extraction/analysis methods are added in later phases.
 */
export interface ClaudeClient {
  /** Send a prompt, return Claude's text reply. */
  hello(prompt: string): Promise<string>;
}

/** Deterministic stand-in for tests — returns a canned reply, no network. */
export class MockClaudeClient implements ClaudeClient {
  constructor(private readonly reply: string = "hello from the mock") {}

  hello(_prompt: string): Promise<string> {
    return Promise.resolve(this.reply);
  }
}

/**
 * Real client backed by the Anthropic SDK. The SDK is imported lazily inside
 * `hello` so that importing this module (e.g. from unit tests using the mock)
 * never pulls the npm package or hits the network.
 */
export class AnthropicClaudeClient implements ClaudeClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = "claude-opus-4-8",
  ) {}

  async hello(prompt: string): Promise<string> {
    const { default: Anthropic } = await import("npm:@anthropic-ai/sdk@^0.104.1");
    const client = new Anthropic({ apiKey: this.apiKey });
    const response = await client.messages.create({
      model: this.model,
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    });
    // response.content is a list of blocks; pick the first text block.
    const textBlock = response.content.find(
      (block: { type: string }) => block.type === "text",
    ) as { text: string } | undefined;
    return textBlock?.text ?? "";
  }
}
