/**
 * OpenAI-compatible Whisper implementation of the Transcriber seam (ADR-020). Uses a
 * plain multipart POST (no SDK) to `${baseUrl}/audio/transcriptions`, so it works with
 * OpenAI or any compatible endpoint (e.g. Groq) via env config. Constructed by
 * server/main.ts only when TRANSCRIBE_API_KEY is set.
 */
import { audioFilename, parseTranscription, type Transcriber } from "./transcribe.ts";

export class OpenAITranscriber implements Transcriber {
  #apiKey: string;
  #baseUrl: string;
  #model: string;

  constructor(
    apiKey: string,
    baseUrl = Deno.env.get("TRANSCRIBE_BASE_URL") ?? "https://api.openai.com/v1",
    model = Deno.env.get("TRANSCRIBE_MODEL") ?? "whisper-1",
  ) {
    this.#apiKey = apiKey;
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#model = model;
  }

  async transcribe(
    { audioBase64, mediaType }: { audioBase64: string; mediaType: string },
  ): Promise<string> {
    const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mediaType }), audioFilename(mediaType));
    form.append("model", this.#model);
    form.append("response_format", "json");

    const res = await fetch(`${this.#baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.#apiKey}` },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`transcription failed (${res.status}): ${await res.text().catch(() => "")}`);
    }
    return parseTranscription(await res.json());
  }
}
