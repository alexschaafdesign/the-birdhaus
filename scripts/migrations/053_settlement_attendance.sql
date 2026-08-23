-- Official attendance for the show, recorded on the settlement sheet after the
-- night. Null = not recorded (distinct from an actual zero).
alter table settlements add column if not exists attendance integer;
