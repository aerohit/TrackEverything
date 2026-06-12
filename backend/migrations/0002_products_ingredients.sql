-- 0002: composite supplements. A "product" is an item (Phase 1 `items` table)
-- with an ingredient list; a logged event can reference the product it came from
-- so analysis can decompose it into ingredient amounts (ADR-010, R-PAT-5).

-- amount is double precision (not numeric) so the driver returns a JS number for
-- the servings-multiplier math; supplement label precision doesn't need exact
-- decimals. canonical_name starts as a simple lowercased name (Q5 deferred).
create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  name text not null,
  amount double precision,
  unit text,
  canonical_name text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ingredients_item_id_idx on ingredients (item_id);

-- Link an event to the product it logged (nullable; set for composite supplements).
alter table events add column if not exists item_id uuid references items(id) on delete set null;
