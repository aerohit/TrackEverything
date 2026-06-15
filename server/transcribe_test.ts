import { assertEquals } from "@std/assert";
import { audioFilename, parseTranscription } from "./transcribe.ts";

Deno.test("parseTranscription: reads the text from various shapes", () => {
  assertEquals(parseTranscription({ text: "  two eggs and toast " }), "two eggs and toast");
  assertEquals(parseTranscription("a black coffee"), "a black coffee");
  assertEquals(parseTranscription({ nope: 1 }), "");
  assertEquals(parseTranscription(null), "");
});

Deno.test("audioFilename: derives an extension from the MIME type", () => {
  assertEquals(audioFilename("audio/webm"), "voice.webm");
  assertEquals(audioFilename("audio/mp4"), "voice.mp4");
  assertEquals(audioFilename("audio/mpeg"), "voice.mp3");
  assertEquals(audioFilename("audio/x-m4a"), "voice.m4a");
  assertEquals(audioFilename("audio/"), "voice.webm"); // fallback
});
