/**
 * Configuration loaded from the environment.
 *
 * Kept as a pure function of an env record so it is trivial to unit-test
 * without touching the real process environment.
 */
export interface Config {
  /** Anthropic API key, or null if not configured. */
  anthropicApiKey: string | null;
  /** Postgres connection string, or null if not configured. */
  databaseUrl: string | null;
  /** Claude model id to use. */
  claudeModel: string;
}

const DEFAULT_MODEL = "claude-opus-4-8";

/**
 * Build a Config from an environment record (defaults to the real process env).
 * Pass an explicit record in tests for determinism.
 */
export function loadConfig(env: Record<string, string> = Deno.env.toObject()): Config {
  return {
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? null,
    databaseUrl: env.DATABASE_URL ?? null,
    claudeModel: env.CLAUDE_MODEL ?? DEFAULT_MODEL,
  };
}
