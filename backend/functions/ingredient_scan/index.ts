/**
 * Phase 4b: `POST /ingredient-scan` — a supplement-label photo in, an ingredient
 * list out. Returns candidates **unsaved** (R-CAP-15); the client confirms/edits
 * and then creates the product via `POST /products`. Mirrors the voice
 * capture→confirm split, with an image instead of a transcript.
 *
 *   { "image": "<base64>", "mediaType": "image/jpeg" }
 */
import { AnthropicClaudeClient, type ClaudeClient } from "../../src/claude.ts";
import { loadConfig } from "../../src/config.ts";
import { extractIngredientsFromImage } from "../../src/products.ts";

const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export interface IngredientScanDeps {
  claude: ClaudeClient;
  token: string | null;
}

export function makeIngredientScanHandler(deps: IngredientScanDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return jsonResponse(405, { error: "method not allowed" });
    if (deps.token) {
      const provided = bearerToken(req) ?? req.headers.get("x-ingest-token");
      if (provided !== deps.token) return jsonResponse(401, { error: "unauthorized" });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "invalid JSON body" });
    }
    if (!isPlainObject(body) || typeof body.image !== "string" || body.image === "") {
      return jsonResponse(400, { error: "body.image (base64 string) is required" });
    }
    const mediaType = typeof body.mediaType === "string" ? body.mediaType : "image/jpeg";
    if (!ALLOWED_MEDIA_TYPES.includes(mediaType)) {
      return jsonResponse(400, {
        error: `unsupported mediaType; use one of ${ALLOWED_MEDIA_TYPES.join(", ")}`,
      });
    }

    const ingredients = await extractIngredientsFromImage(deps.claude, {
      imageBase64: body.image,
      mediaType,
    });
    return jsonResponse(200, { ingredients });
  };
}

function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

if (import.meta.main) {
  const cfg = loadConfig();
  if (!cfg.anthropicApiKey) {
    console.error("ANTHROPIC_API_KEY is not set — cannot start the ingredient-scan server.");
    Deno.exit(1);
  }
  const claude = new AnthropicClaudeClient(cfg.anthropicApiKey, cfg.claudeModel);
  Deno.serve(makeIngredientScanHandler({ claude, token: cfg.ingestToken }));
}
