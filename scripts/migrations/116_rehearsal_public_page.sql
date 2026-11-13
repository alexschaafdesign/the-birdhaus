-- Rehearsal: the public /rehearsal page's editable copy and photos, and a
-- switch so the page stays hidden (404) until Alex turns it on. Additive.
-- The page never shows a calendar, availability or the address.

alter table rehearsal_settings add column if not exists public_page_enabled boolean not null default false;
alter table rehearsal_settings add column if not exists public_intro text not null default ''
  check (char_length(public_intro) <= 5000);
alter table rehearsal_settings add column if not exists house_rules text not null default ''
  check (char_length(house_rules) <= 5000);
-- R2 image URLs (images.thebirdhaus.org/rehearsal/…), in display order.
alter table rehearsal_settings add column if not exists photo_urls text[] not null default '{}';
alter table rehearsal_settings drop constraint if exists rehearsal_settings_photo_urls_size;
alter table rehearsal_settings add constraint rehearsal_settings_photo_urls_size
  check (cardinality(photo_urls) <= 12);
