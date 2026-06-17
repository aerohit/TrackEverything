/**
 * Open Food Facts implementation of the ProductLookup seam (ADR-024). Kept apart
 * from barcode.ts so the pure parser stays network-free and unit-testable. Needs
 * no API key, so server/main.ts always wires it (unlike the Claude seams).
 */
import type { CreateItem } from "../shared/inputs.ts";
import { parseOffProduct, type ProductLookup } from "./barcode.ts";

const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product";
// OFF asks API clients to identify themselves via a descriptive User-Agent.
const USER_AGENT = "TrackEverything/1.0 (personal tracker)";
// Only the fields we actually map — keeps the response small.
const FIELDS = "product_name,brands,categories_tags,serving_quantity,serving_size,nutriments";

export class OpenFoodFactsLookup implements ProductLookup {
  #fetch: typeof fetch;

  /** `fetchImpl` is injectable so tests can stub the network. */
  constructor(fetchImpl: typeof fetch = fetch) {
    this.#fetch = fetchImpl;
  }

  async lookup(barcode: string): Promise<CreateItem | null> {
    const url = `${OFF_BASE}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
    const res = await this.#fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (res.status === 404) return null; // unknown barcode
    if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
    const body = await res.json();
    return parseOffProduct(body, barcode);
  }
}
