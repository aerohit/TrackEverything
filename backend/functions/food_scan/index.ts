/**
 * Phase 12: `POST /food-scan` — a meal photo in, itemized food candidates out
 * (name + estimated amount, calories, macros, ingredients). Returns candidates
 * **unsaved** (R-CAP-16); the client confirms/edits and persists `food` events via
 * `POST /events`. Mirrors `/ingredient-scan`, with a different vision prompt.
 *
 *   { "image": "<base64>", "mediaType": "image/jpeg" }
 */
import { AnthropicClaudeClient, type ClaudeClient } from "../../src/claude.ts";
import { loadConfig } from "../../src/config.ts";
import { extractFoodFromImage } from "../../src/food.ts";

const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export interface FoodScanDeps {
  claude: ClaudeClient;
  token: string | null;
}

export function makeFoodScanHandler(deps: FoodScanDeps) {
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

    const foods = await extractFoodFromImage(deps.claude, {
      imageBase64: body.image,
      mediaType,
    });
    return jsonResponse(200, { foods });
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
    console.error("ANTHROPIC_API_KEY is not set — cannot start the food-scan server.");
    Deno.exit(1);
  }
  const claude = new AnthropicClaudeClient(cfg.anthropicApiKey, cfg.claudeModel);
  Deno.serve(makeFoodScanHandler({ claude, token: cfg.ingestToken }));
}
