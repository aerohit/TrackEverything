/**
 * Thin seam over Claude so the rest of the app depends on an interface, not the
 * SDK. This is the boundary that makes the LLM mockable in tests (R-TEST-4):
 * deterministic tests inject `MockClaudeClient`; the live suite uses
 * `AnthropicClaudeClient` against the real API.
 *
 * - `hello` — Phase 0 connectivity check.
 * - `extractJson` — Phase 3: send a system + user prompt, get back parsed JSON.
 */
export interface ClaudeClient {
  /** Send a prompt, return Claude's text reply. */
  hello(prompt: string): Promise<string>;
  /** Send system+user prompts asking for JSON; return the parsed value. */
  extractJson(args: { system: string; user: string }): Promise<unknown>;
  /** Like extractJson, but with an image (e.g. a supplement label) attached. */
  extractJsonFromImage(
    args: { system: string; user: string; imageBase64: string; mediaType: string },
  ): Promise<unknown>;
}

/** Deterministic stand-in for tests — returns canned replies, no network. */
export class MockClaudeClient implements ClaudeClient {
  constructor(
    private readonly reply: string = "hello from the mock",
    private readonly extractJsonReply: unknown = { events: [] },
  ) {}

  hello(_prompt: string): Promise<string> {
    return Promise.resolve(this.reply);
  }

  extractJson(_args: { system: string; user: string }): Promise<unknown> {
    return Promise.resolve(this.extractJsonReply);
  }

  extractJsonFromImage(
    _args: { system: string; user: string; imageBase64: string; mediaType: string },
  ): Promise<unknown> {
    return Promise.resolve(this.extractJsonReply);
  }
}

/**
 * Real client backed by the Anthropic SDK. The SDK is imported lazily so
 * importing this module (e.g. from unit tests using the mock) never pulls the
 * npm package or hits the network.
 */
export class AnthropicClaudeClient implements ClaudeClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = "claude-opus-4-8",
  ) {}

  async hello(prompt: string): Promise<string> {
    const client = await this.client();
    const response = await client.messages.create({
      model: this.model,
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    });
    return firstText(response);
  }

  async extractJson(args: { system: string; user: string }): Promise<unknown> {
    const client = await this.client();
    const response = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    });
    return parseJsonLoose(firstText(response));
  }

  async extractJsonFromImage(
    args: { system: string; user: string; imageBase64: string; mediaType: string },
  ): Promise<unknown> {
    const client = await this.client();
    const response = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: args.system,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: args.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
              data: args.imageBase64,
            },
          },
          { type: "text", text: args.user },
        ],
      }],
    });
    return parseJsonLoose(firstText(response));
  }

  private async client() {
    const { default: Anthropic } = await import("npm:@anthropic-ai/sdk@^0.104.1");
    return new Anthropic({ apiKey: this.apiKey });
  }
}

function firstText(response: { content: Array<{ type: string }> }): string {
  const block = response.content.find((b) => b.type === "text") as
    | { text: string }
    | undefined;
  return block?.text ?? "";
}

/** Parse JSON that may be wrapped in ```json fences or surrounded by prose. */
function parseJsonLoose(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  return JSON.parse(candidate);
}
