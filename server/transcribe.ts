/**
 * Voice transcription (ADR-020) — turn a recorded voice memo into text, which then
 * flows through the intake recognizer like any typed phrase. The concrete (OpenAI-
 * compatible Whisper) implementation lives in transcribe_openai.ts; this file keeps
 * the seam + the pure response parsing so it's unit-tested without a network call.
 */
export interface Transcriber {
  transcribe(args: { audioBase64: string; mediaType: string }): Promise<string>;
}

/** Pull the transcript text out of an OpenAI-compatible `/audio/transcriptions` reply. */
export function parseTranscription(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object" && typeof (raw as { text?: unknown }).text === "string") {
    return (raw as { text: string }).text.trim();
  }
  return "";
}

/** Map an audio MIME type to a filename the multipart upload can advertise. */
export function audioFilename(mediaType: string): string {
  const sub = mediaType.split("/")[1]?.replace("x-", "").replace("mpeg", "mp3");
  return `voice.${sub || "webm"}`;
}
