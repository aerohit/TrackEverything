/**
 * Claude-vision implementation of the ItemScanner seam (ADR-019). Kept separate
 * from scan.ts so the pure parser stays SDK-free and unit-testable. Constructed
 * by server/main.ts only when ANTHROPIC_API_KEY is set.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { CreateItem } from "../shared/inputs.ts";
import { extractJson, type ItemScanner, parseScannedItem, SCAN_SYSTEM_PROMPT } from "./scan.ts";

export class AnthropicItemScanner implements ItemScanner {
  #client: Anthropic;
  #model: string;

  constructor(apiKey: string, model = Deno.env.get("CLAUDE_MODEL") ?? "claude-haiku-4-5") {
    this.#client = new Anthropic({ apiKey });
    this.#model = model;
  }

  async scan(
    { imageBase64, mediaType }: { imageBase64: string; mediaType: string },
  ): Promise<CreateItem> {
    const msg = await this.#client.messages.create({
      model: this.#model,
      max_tokens: 1500,
      system: SCAN_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: imageBase64,
            },
          },
          { type: "text", text: "Extract this label as JSON only." },
        ],
      }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return parseScannedItem(extractJson(text));
  }
}
