-- Fase 3: finder de 10 mest sandsynlige fødevarer for en ingrediens-tekst
-- via pg_trgm-similaritet, til brug i ingrediens->fødevare-matching.

create or replace function match_foods_by_trigram(search text, match_count int default 10)
returns table (id uuid, name_da text, similarity real)
language sql
stable
as $$
  select id, name_da, similarity(name_da, search) as similarity
  from foods
  order by similarity(name_da, search) desc
  limit match_count;
$$;
