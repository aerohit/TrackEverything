/**
 * Claude implementation of the IntakeRecognizer seam (ADR-020). Kept separate from
 * recognize.ts so the pure parser stays SDK-free and unit-testable. Vision is used for
 * a meal photo; the same prompt reads a typed/transcribed phrase as text. Constructed by
 * server/main.ts only when ANTHROPIC_API_KEY is set.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { RecognizedIntake } from "../shared/inputs.ts";
import {
  extractJson,
  type IntakeRecognizer,
  parseRecognized,
  RECOGNIZE_SYSTEM_PROMPT,
  type RecognizeInput,
} from "./recognize.ts";

export class AnthropicIntakeRecognizer implements IntakeRecognizer {
  #client: Anthropic;
  #model: string;

  constructor(apiKey: string, model = Deno.env.get("CLAUDE_MODEL") ?? "claude-haiku-4-5") {
    this.#client = new Anthropic({ apiKey });
    this.#model = model;
  }

  async recognize(input: RecognizeInput): Promise<RecognizedIntake> {
    const content: Anthropic.ContentBlockParam[] = input.kind === "photo"
      ? [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: input.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: input.imageBase64,
          },
        },
        { type: "text", text: "Identify what is being consumed. Return JSON only." },
      ]
      : [{ type: "text", text: `Consumed: ${input.text}\nReturn JSON only.` }];

    const msg = await this.#client.messages.create({
      model: this.#model,
      max_tokens: 1000,
      system: RECOGNIZE_SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return parseRecognized(extractJson(text));
  }
}
