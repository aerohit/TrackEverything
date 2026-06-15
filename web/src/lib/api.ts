/**
 * Typed client for the same-origin Hono API. Types come from the shared Zod
 * contract (type-only import — erased at build, so no zod ships in the bundle).
 * The INGEST_TOKEN is kept in localStorage and sent as a Bearer header; tests
 * inject `fetch` + `token` instead.
 */
import type { Checkin, CreateCheckin, SubjectiveKind } from "$lib/types";

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
