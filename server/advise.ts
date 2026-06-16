/**
 * Advice over the recent log (ADR-023) — turn a question + the last N hours of
 * check-ins/intake into a prompt for Claude. The Claude implementation lives in
 * advise_anthropic.ts; this file keeps the seam + the pure prompt building so it's
 * unit-tested without the SDK or a network call.
 */
import type { AdviceContext } from "../shared/advice.ts";

export interface Advisor {
  answer(args: { question: string; context: AdviceContext }): Promise<string>;
}

export const ADVICE_SYSTEM_PROMPT =
  `You are a thoughtful wellness assistant inside a personal tracking app. The user logs what
they consume (food, drink, supplements, caffeine, medication…) and how they feel (mood, energy,
focus on a 1–5 scale). Using ONLY the data provided, answer the user's question.

Guidelines:
- Look for plausible patterns and timing relationships between inputs and how they felt (e.g. late
  caffeine, low hydration, big sugar load, a missed meal, alcohol). Cite the specific logged items
  and times you're drawing on.
- Be concise and practical. Prefer a short answer with a few concrete, actionable suggestions.
- Be honest about uncertainty and limited data. If there isn't enough logged to say much, say so and
  suggest what to log next. Do not invent entries that aren't in the data.
- This is general wellness reflection, not medical advice. Don't diagnose. If something looks like it
  needs medical attention, gently suggest seeing a professional.`;

/** A compact "YYYY-MM-DD HH:MM" from an ISO timestamp (UTC, minute precision). */
function hm(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

/** Render the gathered context into a readable block for the prompt. */
export function summarizeContext(ctx: AdviceContext): string {
  const lines: string[] = [];
  lines.push(`Data window: the last ${ctx.windowHours} hours, ending ${hm(ctx.now)} (UTC).`);

  lines.push("", "Subjective check-ins (most recent first):");
  if (ctx.checkins.length) {
    for (const c of ctx.checkins) {
      lines.push(`- ${hm(c.recordedAt)} — ${c.kind} ${c.rating}/5${c.note ? ` (${c.note})` : ""}`);
    }
  } else {
    lines.push("- (none logged)");
  }

  lines.push("", "Intake (most recent first):");
  if (ctx.events.length) {
    for (const e of ctx.events) {
      const resolved = e.resolved.length
        ? ` [${e.resolved.map((r) => `${r.substance} ${r.amount}${r.unit}`).join(", ")}]`
        : "";
      const tags = e.contextTags.length ? ` #${e.contextTags.join(" #")}` : "";
      lines.push(
        `- ${hm(e.occurredAt)} — ${e.displayName}, ${e.quantity} ${e.unit}${resolved}${tags}`,
      );
    }
  } else {
    lines.push("- (none logged)");
  }

  lines.push("", "Per-substance totals over the window:");
  if (ctx.totals.length) {
    for (const t of ctx.totals) lines.push(`- ${t.substance}: ${t.amount} ${t.unit}`);
  } else {
    lines.push("- (none)");
  }

  return lines.join("\n");
}

/** Build the system + user messages for an advice question. */
export function buildAdvicePrompt(
  ctx: AdviceContext,
  question: string,
): { system: string; user: string } {
  const user = `Here is what I have logged recently.\n\n${summarizeContext(ctx)}\n\n` +
    `My question: ${question.trim()}`;
  return { system: ADVICE_SYSTEM_PROMPT, user };
}
