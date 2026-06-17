-- Capture provenance (phase v2-C0, R-CAP-12): record HOW each intake was captured,
-- so analysis can weight/segment by capture method and so suggestions can learn.
-- Additive + a default for existing rows (their method is unknown → 'manual').

create type intake_source as enum ('quick', 'recent', 'photo', 'voice', 'manual', 'api');

alter table intake_event add column source intake_source not null default 'manual';
