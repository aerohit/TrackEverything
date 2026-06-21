-- Give reusable items their own search aliases (other names / Dutch names), so a
-- product can be found by any of them — mirroring substance.aliases. Used to seed a
-- searchable grocery-product catalog. Idempotent.

alter table input_item
  add column if not exists aliases text[] not null default '{}';
