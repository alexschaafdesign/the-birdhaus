-- Rehearsal: optional "gear needed" per booking. 109 is already applied on
-- dev, so this is its own additive migration rather than an edit to 109.
--
-- gear_options is the house gear list (admin Settings; the public /rehearsal
-- page reads it too, so there's one source). Bookings and series store the
-- chosen labels as text, not ids: removing an option from settings later
-- leaves past bookings' values intact. gear_needed/gear_notes are for Alex's
-- room setup only — never shown to other bands.

alter table rehearsal_settings
  add column if not exists gear_options text[] not null
    default '{"Drum kit","Bass amp","Guitar amp","Vocal mics","PA / monitors","Keyboard DI"}';
alter table rehearsal_settings drop constraint if exists rehearsal_settings_gear_options_size;
alter table rehearsal_settings add constraint rehearsal_settings_gear_options_size
  check (cardinality(gear_options) <= 30 and char_length(array_to_string(gear_options, '|')) <= 2000);

alter table rehearsal_series add column if not exists gear_needed text[] not null default '{}';
alter table rehearsal_series add column if not exists gear_notes text not null default '';
alter table rehearsal_series drop constraint if exists rehearsal_series_gear_size;
alter table rehearsal_series add constraint rehearsal_series_gear_size
  check (cardinality(gear_needed) <= 30 and char_length(gear_notes) <= 500);

-- Series values are copied onto each occurrence; each occurrence is editable.
alter table rehearsal_bookings add column if not exists gear_needed text[] not null default '{}';
alter table rehearsal_bookings add column if not exists gear_notes text not null default '';
alter table rehearsal_bookings drop constraint if exists rehearsal_bookings_gear_size;
alter table rehearsal_bookings add constraint rehearsal_bookings_gear_size
  check (cardinality(gear_needed) <= 30 and char_length(gear_notes) <= 500);

-- Prefill for the band's next request; updated whenever they change it.
alter table rehearsal_bands add column if not exists default_gear_needed text[] not null default '{}';
alter table rehearsal_bands add column if not exists default_gear_notes text not null default '';
alter table rehearsal_bands drop constraint if exists rehearsal_bands_gear_size;
alter table rehearsal_bands add constraint rehearsal_bands_gear_size
  check (cardinality(default_gear_needed) <= 30 and char_length(default_gear_notes) <= 500);
