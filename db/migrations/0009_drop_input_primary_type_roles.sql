-- Drop input_item.primary_type and input_item.roles (ADR-034). Neither drove any
-- behaviour: primary_type was display-only metadata and roles was never read. `kind`
-- (incl. the load-bearing `stack`) and `brand` remain. Idempotent — safe to re-run.

alter table input_item drop column if exists primary_type;
alter table input_item drop column if exists roles;
drop type if exists input_primary_type;
