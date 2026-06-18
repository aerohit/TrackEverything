-- Add 'cfu' (colony-forming units) to the substance_unit enum so probiotics can be
-- measured in their standard unit. It's a count unit — the resolver treats it like
-- 'iu' (matches only itself, no mass/volume conversion). Idempotent.

alter type substance_unit add value if not exists 'cfu';
