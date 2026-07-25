-- show_square_links.show_id was created without on delete cascade (026), so
-- deleting a show that has been synced to Square fails on the FK. Mirror the
-- cascade the other show child tables (show_bands, show_videos, rsvps, etc.) use.
alter table show_square_links drop constraint show_square_links_show_id_fkey;
alter table show_square_links
  add constraint show_square_links_show_id_fkey foreign key (show_id) references shows (id) on delete cascade;
