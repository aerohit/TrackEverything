/**
 * Postgres + Drizzle connection. Mirrors the MVP's pooler-safe options
 * (prepare:false for the Supabase transaction pooler; bounded timeouts/lifetime
 * so a stale connection can't wedge the isolate — see ADR-011 and the v1
 * crash-loop fix).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export interface Connection {
  sql: ReturnType<typeof postgres>;
  db: Db;
}

export function connect(
  databaseUrl: string | undefined = Deno.env.get("DATABASE_URL"),
): Connection {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const sql = postgres(databaseUrl, {
    max: 4,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 10,
    max_lifetime: 60 * 5,
  });
  return { sql, db: drizzle(sql, { schema }) };
}
