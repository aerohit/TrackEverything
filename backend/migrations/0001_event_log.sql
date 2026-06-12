-- 0001_event_log.sql
-- Phase 1: the event log (system of record) plus the items/templates reference
-- tables. Category/source/field conventions live in docs/data-dictionary.md.
-- Plain Postgres so it runs on the CI service container, a local Postgres, and
-- Supabase alike. gen_random_uuid() is built into Postgres 13+ (no extension).

-- Personal items / product catalog ("my coffee"; a supplement product).
-- Phase 4b adds an ingredients table referencing this.
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  default_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Quick-log templates (one-tap habits). Phase 4 builds on this.
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  default_fields jsonb not null default '{}'::jsonb,
  item_id uuid references items(id) on delete set null,
  created_at timestamptz not null default now()
);

-- The event log: one append-only row per logged thing.
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  occurred_at_confidence text not null default 'high'
    check (occurred_at_confidence in ('high', 'inferred')),
  source text not null,
  fields jsonb not null default '{}'::jsonb,
  raw_text text,
  template_id uuid references templates(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists events_occurred_at_idx on events (occurred_at);
create index if not exists events_category_idx on events (category);
