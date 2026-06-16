/**
 * Claude implementation of the Advisor seam (ADR-023). Kept separate from advise.ts
 * so the pure prompt building stays SDK-free and unit-testable. Constructed by
 * server/main.ts only when ANTHROPIC_API_KEY is set.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AdviceContext } from "../shared/advice.ts";
import { type Advisor, buildAdvicePrompt } from "./advise.ts";

export class AnthropicAdvisor implements Advisor {
  #client: Anthropic;
  #model: string;

  constructor(apiKey: string, model = Deno.env.get("CLAUDE_MODEL") ?? "claude-haiku-4-5") {
    this.#client = new Anthropic({ apiKey });
    this.#model = model;
  }

  async answer(
    { question, context }: { question: string; context: AdviceContext },
  ): Promise<string> {
    const { system, user } = buildAdvicePrompt(context, question);
    const msg = await this.#client.messages.create({
      model: this.#model,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    });
    return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  }
}
