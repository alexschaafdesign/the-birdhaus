-- Featured pins: admin-promoted items (a Samply player, usually) rendered
-- large at the top of the Song Club portal, above the thread.
alter table song_club_pins add column if not exists featured boolean not null default false;
