-- A per-band door code Alex enters on the band's admin page. Shown on the
-- band's private booking page while they have a confirmed session that
-- hasn't ended. Additive: a text column with a constant default.
alter table rehearsal_bands add column if not exists door_code text not null default '';
alter table rehearsal_bands drop constraint if exists rehearsal_bands_door_code_size;
alter table rehearsal_bands add constraint rehearsal_bands_door_code_size check (char_length(door_code) <= 100);
