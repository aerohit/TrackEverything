-- 0002_inputs.sql
-- v2-2: the Inputs domain (ADR-018). "Input = anything intentionally put into the
-- body." Two layers: a human-level log (intake_event → input_item) and an analytical
-- decomposition (item_component → substance), frozen per event as resolved_amount.
-- Elemental/analytical substances only for now (compound→elemental conversion deferred).

-- Controlled vocabularies.
do $$ begin
  create type substance_type as enum (
    'macronutrient', 'mineral', 'electrolyte', 'vitamin', 'stimulant',
    'supplement_compound', 'psychoactive', 'medication', 'energy', 'water', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type substance_unit as enum ('g', 'mg', 'mcg', 'ml', 'kcal', 'iu');
exception when duplicate_object then null; end $$;

do $$ begin
  create type input_kind as enum ('product', 'recipe', 'simple');
exception when duplicate_object then null; end $$;

do $$ begin
  create type input_primary_type as enum ('food', 'drink', 'supplement', 'medication', 'meal', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type intake_confidence as enum ('high', 'medium', 'low', 'unknown');
exception when duplicate_object then null; end $$;

-- Level 3: the analytical layer — nutrients, minerals, active compounds (seeded below).
create table if not exists substance (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  substance_type substance_type not null,
  canonical_unit substance_unit not null,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Levels 1+2: the reusable human-level thing (product / recipe / simple food).
create table if not exists input_item (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind input_kind not null,
  primary_type input_primary_type not null,
  roles text[] not null default '{}',
  brand text,
  -- Default serving: what one "natural" unit is, and its canonical (analysable) size.
  default_display_quantity double precision,
  default_display_unit text,
  default_canonical_quantity double precision,
  default_canonical_unit text,
  version integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists input_item_name_idx on input_item (name);

-- Composition: each component is EITHER a substance (actives/nutrients) OR a child
-- item (recipe ingredients) — never both. Amounts are per the parent's default serving.
create table if not exists item_component (
  id uuid primary key default gen_random_uuid(),
  parent_item_id uuid not null references input_item(id) on delete cascade,
  substance_id uuid references substance(id) on delete restrict,
  child_item_id uuid references input_item(id) on delete restrict,
  amount double precision not null,
  unit text not null,
  position integer not null default 0,
  prep_state text,
  constraint item_component_one_target check (
    (substance_id is not null) <> (child_item_id is not null)
  )
);
create index if not exists item_component_parent_idx on item_component (parent_item_id);

-- The log: one thing consumed at one time. item_id is nullable (freeform logs allowed,
-- refined later). Mutable — corrections + progressive detail (updated_at + soft delete).
create table if not exists intake_event (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  display_name text not null,
  item_id uuid references input_item(id) on delete set null,
  item_version integer,
  quantity double precision not null,
  unit text not null,
  canonical_quantity double precision,
  canonical_unit text,
  confidence intake_confidence not null default 'medium',
  context_tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists intake_event_occurred_at_idx on intake_event (occurred_at);

-- The analytical snapshot frozen at log time (powers daily totals). Re-computed when
-- the event is edited; never rewritten by later edits to the source item.
create table if not exists resolved_amount (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references intake_event(id) on delete cascade,
  substance_id uuid not null references substance(id) on delete restrict,
  amount double precision not null,
  unit substance_unit not null,
  confidence intake_confidence not null default 'medium',
  source text not null default 'manual'
);
create index if not exists resolved_amount_event_idx on resolved_amount (event_id);

-- Seed a starter analytical vocabulary (idempotent; extend as needed).
insert into substance (name, substance_type, canonical_unit, aliases) values
  ('calories', 'energy', 'kcal', '{energy,kcal}'),
  ('protein', 'macronutrient', 'g', '{}'),
  ('carbohydrate', 'macronutrient', 'g', '{carbs,carbohydrates}'),
  ('fat', 'macronutrient', 'g', '{fats}'),
  ('fiber', 'macronutrient', 'g', '{fibre}'),
  ('sugar', 'macronutrient', 'g', '{sugars}'),
  ('sodium', 'electrolyte', 'mg', '{na}'),
  ('potassium', 'electrolyte', 'mg', '{k}'),
  ('magnesium', 'mineral', 'mg', '{mg-mineral}'),
  ('calcium', 'mineral', 'mg', '{ca}'),
  ('iron', 'mineral', 'mg', '{fe}'),
  ('zinc', 'mineral', 'mg', '{zn}'),
  ('vitamin_d', 'vitamin', 'iu', '{vit-d,cholecalciferol}'),
  ('vitamin_c', 'vitamin', 'mg', '{vit-c,ascorbic-acid}'),
  ('caffeine', 'stimulant', 'mg', '{}'),
  ('creatine', 'supplement_compound', 'g', '{creatine-monohydrate}'),
  ('citrulline', 'supplement_compound', 'g', '{l-citrulline,citrulline-malate}'),
  ('beta_alanine', 'supplement_compound', 'g', '{beta-alanine}'),
  ('omega_3', 'supplement_compound', 'mg', '{omega3,fish-oil}'),
  ('melatonin', 'supplement_compound', 'mg', '{}'),
  ('alcohol', 'psychoactive', 'g', '{ethanol}'),
  ('water', 'water', 'ml', '{h2o}')
on conflict (name) do nothing;
