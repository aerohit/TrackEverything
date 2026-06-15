-- 0001_subjective_state.sql
-- v2 (ADR-016): the first per-domain entity, Subjective State (domain 5).
-- Plain Postgres so it runs on the CI service container, local Postgres, and
-- Supabase alike. gen_random_uuid() is built in (Postgres 13+).

create table if not exists subjective_state (
  id uuid primary key default gen_random_uuid(),
  mood smallint check (mood between 1 and 5),
  energy smallint check (energy between 1 and 5),
  focus smallint check (focus between 1 and 5),
  note text,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- A check-in must rate at least one dimension (no empty snapshots).
  constraint subjective_state_at_least_one_rating
    check (mood is not null or energy is not null or focus is not null)
);

create index if not exists subjective_state_occurred_at_idx
  on subjective_state (occurred_at);
