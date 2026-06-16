/**
 * "Ask LLM" contract (ADR-023) — ask a question about your recently logged inputs
 * and feelings; the server gathers the last N hours of data, builds a prompt, and
 * Claude answers. One Zod source of truth shared by the API and the client.
 */
import { z } from "zod";
import type { DailyTotal, IntakeEvent } from "./inputs.ts";
import type { Checkin } from "./subjective_state.ts";

/** A question to answer over the recent log (POST /api/ask). */
export const askRequestSchema = z.object({
  question: z.string().min(1).max(2000),
});
export type AskRequest = z.infer<typeof askRequestSchema>;

/** The recent data the advisor reasons over (gathered server-side). */
export interface AdviceContext {
  now: string; // ISO — "now" the window ends at
  windowHours: number; // how far back the window reaches
  checkins: Checkin[]; // subjective state readings (mood/energy/focus)
  events: IntakeEvent[]; // intake events with resolved substances
  totals: DailyTotal[]; // per-substance totals over the window
}

export interface AskResponse {
  answer: string;
}
