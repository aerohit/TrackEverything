-- Drop item_component.prep_state (ADR-037). It was accepted by the API and shown
-- if present, but no capture path (editor, scan, barcode, recognize) ever populated
-- it and nothing read it in resolution — always null. `position` (the component
-- ordering used by ORDER BY) stays. Idempotent.

alter table item_component drop column if exists prep_state;
