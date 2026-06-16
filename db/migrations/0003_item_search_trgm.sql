-- Fuzzy item search (ADR-022). Voice/photo recognition rarely reproduces a stored
-- item's name exactly (punctuation, word order, minor mishears), so the catalog
-- search uses pg_trgm word-similarity instead of a strict substring match. The GIN
-- trigram index also accelerates the ILIKE substring fallback.
create extension if not exists pg_trgm;

create index if not exists input_item_name_trgm
  on input_item using gin (name gin_trgm_ops);
