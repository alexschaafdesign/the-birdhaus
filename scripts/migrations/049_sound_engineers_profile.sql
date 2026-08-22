-- Profile fields for sound engineers, mirroring the bands overlay so each
-- engineer can have a photo / bio / instagram managed from the new Sound
-- Engineers admin section (and surfaced on the settlement sheet later).
-- contact_email already exists (037_sound_engineers_email.sql). Additive only.
alter table sound_engineers add column if not exists photo text;
alter table sound_engineers add column if not exists bio text;
alter table sound_engineers add column if not exists instagram text;
