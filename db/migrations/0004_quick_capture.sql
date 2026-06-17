-- Quick Capture (phase v2-C1): one-tap favorites on a dedicated capture screen.
-- An item can be pinned as a quick-log favorite (with display ordering); a pinned
-- item may carry a few amount presets (e.g. Water 250/500/750 ml) for one-tap
-- variable logging. Resolution is unchanged — a quick log is an ordinary
-- intake_event against the item, so the resolver/totals already handle it.

alter table input_item add column quick_log boolean not null default false;
alter table input_item add column quick_order integer;

create index input_item_quick_idx on input_item (quick_order) where quick_log;

create table quick_preset (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references input_item (id) on delete cascade,
  position integer not null default 0,
  label text not null,
  quantity double precision not null,
  unit text not null
);

create index quick_preset_item_idx on quick_preset (item_id);
