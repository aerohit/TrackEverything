-- Stacks become a first-class item kind (v2-C2.1, ADR-030): a "stack" is composed
-- of other items (childItemId components), distinct from product/recipe/simple.
-- Additive enum value; existing rows are unaffected.

alter type input_kind add value if not exists 'stack';
