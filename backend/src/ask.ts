/**
 * Phase 6: real-time questions over the recent timeline. The whole window fits in
 * context, so Claude reasons over it directly — no statistics — and must ground
 * every claim in specific `[E#]` events (R-RT-6). Phase 6 ships one template
 * ("what's dragging me down?", R-RT-3); Phase 7 adds the rest over the same path.
 */
import type { ClaudeClient } from "./claude.ts";
import type { EventRow } from "./events.ts";
import { assembleContext, type ContextRef } from "./context.ts";

/** Registered real-time questions. Add more in Phase 7. */
export const ASK_TEMPLATES: Record<string, { question: string }> = {
  whats_dragging_me_down: {
    question: "What has been dragging my energy, mood, or focus down? Be specific and practical.",
  },
};

export type AskTemplateId = keyof typeof ASK_TEMPLATES;

export interface CitedEvent {
  ref: string;
  id: string;
  category: string;
}

export interface AskResult {
  answer: string;
  citedEvents: CitedEvent[];
  /** Citations the model gave that didn't match a known event ref. */
  unmatchedCitations: string[];
  windowHours: number;
}

const SYSTEM = `You are a health-tracking assistant. The user logs things that affect
their mood, energy, and focus. You are given their recent timeline; each event is
tagged [E#]. Answer the question grounded ONLY in this timeline — do not invent
inputs that aren't there. Cite the events you relied on by their [E#] tags. If the
timeline lacks enough signal to answer, say so plainly.

Return ONLY JSON: {"answer": "<concise, practical answer>", "citations": ["E1", "E3"]}.`;

export function buildAskPrompt(
  templateId: string,
  contextText: string,
): { system: string; user: string } {
  const template = ASK_TEMPLATES[templateId];
  if (!template) throw new Error(`unknown question template: ${templateId}`);
  return { system: SYSTEM, user: `Question: ${template.question}\n\n${contextText}` };
}

/** Parse the model's JSON into a stable shape, tolerating minor shape drift. */
export function parseAnswer(raw: unknown): { answer: string; citations: string[] } {
  const obj = isRecord(raw) ? raw : {};
  const answer = typeof obj.answer === "string" ? obj.answer : "";
  const citations = Array.isArray(obj.citations)
    ? obj.citations.filter((c): c is string => typeof c === "string")
    : [];
  return { answer, citations };
}

/** Map the model's `[E#]` citations back to events; split matched vs unmatched. */
export function resolveCitations(
  citations: string[],
  index: ContextRef[],
): { citedEvents: CitedEvent[]; unmatched: string[] } {
  const byRef = new Map(index.map(({ ref, event }) => [ref, event]));
  const citedEvents: CitedEvent[] = [];
  const unmatched: string[] = [];
  for (const ref of citations) {
    const event = byRef.get(ref);
    if (event) citedEvents.push({ ref, id: event.id, category: event.category });
    else unmatched.push(ref);
  }
  return { citedEvents, unmatched };
}

/** Orchestrate: assemble context → ask Claude → resolve citations. */
export async function answerQuestion(claude: ClaudeClient, args: {
  templateId: string;
  events: EventRow[];
  now: Date;
  windowHours: number;
  baselines?: string;
}): Promise<AskResult> {
  const { text, index } = assembleContext({
    events: args.events,
    now: args.now,
    windowHours: args.windowHours,
    baselines: args.baselines,
  });
  const prompt = buildAskPrompt(args.templateId, text);
  const { answer, citations } = parseAnswer(await claude.extractJson(prompt));
  const { citedEvents, unmatched } = resolveCitations(citations, index);
  return { answer, citedEvents, unmatchedCitations: unmatched, windowHours: args.windowHours };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
