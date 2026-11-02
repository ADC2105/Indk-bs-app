-- Fase 3: Næringsdata. Unik på frida_id, så import-frida.mjs kan køres flere
-- gange uden at duplikere fødevarer (NULL - til estimater - er stadig tilladt
-- flere gange, Postgres behandler NULL'er som forskellige i et unikt indeks).

alter table foods add constraint foods_frida_id_unique unique (frida_id);
