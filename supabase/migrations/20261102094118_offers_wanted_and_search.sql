-- Fase 2: Tilbud. "Skal med"/"nej tak"-markering og søgning.

alter table offers add column wanted boolean;

create index offers_heading_trgm on offers using gin (heading gin_trgm_ops);
create index offers_ingredient_name_trgm on offers using gin (ingredient_name gin_trgm_ops);
