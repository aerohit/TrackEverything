/**
 * Typed client for the same-origin Hono API. Types come from the shared Zod
 * contract (type-only import — erased at build, so no zod ships in the bundle).
 * The INGEST_TOKEN is kept in localStorage and sent as a Bearer header; tests
 * inject `fetch` + `token` instead.
 */
import type {
  Checkin,
  CreateCheckin,
  CreateIntake,
  CreateItemBody,
  DailyTotal,
  InputItemSummary,
  IntakeEvent,
  SubjectiveKind,
  Substance,
} from "$lib/types";

export interface ApiCtx {
  fetch?: typeof fetch;
  token?: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function resolve(ctx: ApiCtx) {
  const f = ctx.fetch ?? globalThis.fetch;
  let token = ctx.token;
  if (token === undefined && typeof localStorage !== "undefined") {
    token = localStorage.getItem("te_token") ?? "";
  }
  return { f, token: token ?? "" };
}

function headers(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = { authorization: "Bearer " + token };
  if (json) h["content-type"] = "application/json";
  return h;
}

export interface ListParams {
  from?: Date;
  to?: Date;
  kind?: SubjectiveKind;
  limit?: number;
}

export async function listCheckins(params: ListParams = {}, ctx: ApiCtx = {}): Promise<Checkin[]> {
  const { f, token } = resolve(ctx);
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from.toISOString());
  if (params.to) q.set("to", params.to.toISOString());
  if (params.kind) q.set("kind", params.kind);
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  const res = await f("/api/checkins" + (qs ? "?" + qs : ""), { headers: headers(token) });
  if (!res.ok) throw new ApiError(res.status, "Failed to load check-ins");
  return (await res.json()).checkins as Checkin[];
}

export async function createCheckin(body: CreateCheckin, ctx: ApiCtx = {}): Promise<Checkin[]> {
  const { f, token } = resolve(ctx);
  const res = await f("/api/checkins", {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, "Failed to save check-in");
  return (await res.json()).checkins as Checkin[];
}

// ---- Inputs domain ----

export async function searchItems(search: string, ctx: ApiCtx = {}): Promise<InputItemSummary[]> {
  const { f, token } = resolve(ctx);
  const res = await f("/api/items?search=" + encodeURIComponent(search), { headers: headers(token) });
  if (!res.ok) throw new ApiError(res.status, "Failed to search items");
  return (await res.json()).items as InputItemSummary[];
}

export async function listItems(ctx: ApiCtx = {}): Promise<InputItemSummary[]> {
  const { f, token } = resolve(ctx);
  const res = await f("/api/items", { headers: headers(token) });
  if (!res.ok) throw new ApiError(res.status, "Failed to load items");
  return (await res.json()).items as InputItemSummary[];
}

export async function listSubstances(ctx: ApiCtx = {}): Promise<Substance[]> {
  const { f, token } = resolve(ctx);
  const res = await f("/api/substances", { headers: headers(token) });
  if (!res.ok) throw new ApiError(res.status, "Failed to load substances");
  return (await res.json()).substances as Substance[];
}

export async function createItem(body: CreateItemBody, ctx: ApiCtx = {}): Promise<InputItemSummary> {
  const { f, token } = resolve(ctx);
  const res = await f("/api/items", {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.json().then((b) => b?.error).catch(() => null);
    throw new ApiError(res.status, msg || "Failed to create item");
  }
  return await res.json() as InputItemSummary;
}

export async function logIntake(body: CreateIntake, ctx: ApiCtx = {}): Promise<IntakeEvent> {
  const { f, token } = resolve(ctx);
  const res = await f("/api/intake", {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, "Failed to log intake");
  return await res.json() as IntakeEvent;
}

export async function listIntake(
  params: { from?: Date; to?: Date; limit?: number } = {},
  ctx: ApiCtx = {},
): Promise<IntakeEvent[]> {
  const { f, token } = resolve(ctx);
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from.toISOString());
  if (params.to) q.set("to", params.to.toISOString());
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  const res = await f("/api/intake" + (qs ? "?" + qs : ""), { headers: headers(token) });
  if (!res.ok) throw new ApiError(res.status, "Failed to load intake");
  return (await res.json()).events as IntakeEvent[];
}

export async function intakeTotals(from: Date, to: Date, ctx: ApiCtx = {}): Promise<DailyTotal[]> {
  const { f, token } = resolve(ctx);
  const q = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  const res = await f("/api/intake/totals?" + q.toString(), { headers: headers(token) });
  if (!res.ok) throw new ApiError(res.status, "Failed to load totals");
  return (await res.json()).totals as DailyTotal[];
}

export async function deleteIntake(id: string, ctx: ApiCtx = {}): Promise<void> {
  const { f, token } = resolve(ctx);
  const res = await f("/api/intake/" + id, { method: "DELETE", headers: headers(token) });
  if (!res.ok && res.status !== 404) throw new ApiError(res.status, "Failed to delete");
}
