-- 0001_subjective_state.sql
-- v2 (ADR-016/017): the first per-domain entity, Subjective State (domain 5).
-- Immutable readings: a `kind` (which subjective state) + a 1-5 `rating`, stamped
-- once at recorded_at. No occurred_at / updated_at / deleted_at — rows never change.
-- Add a new subjective state by extending the enum (alter type ... add value) — no
-- new columns. Plain Postgres so it runs on CI, local, and Supabase alike.

do $$ begin
  create type subjective_kind as enum ('mood', 'energy', 'focus');
exception
  when duplicate_object then null;
end $$;

create table if not exists subjective_state (
  id uuid primary key default gen_random_uuid(),
  kind subjective_kind not null,
  rating integer not null check (rating between 1 and 5),
  note text,
  recorded_at timestamptz not null default now()
);

create index if not exists subjective_state_recorded_at_idx
  on subjective_state (recorded_at);
