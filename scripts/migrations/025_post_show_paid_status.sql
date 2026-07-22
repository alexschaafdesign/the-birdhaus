alter table settlements add column if not exists sound_paid boolean not null default false;
alter table settlements add column if not exists photographer_paid boolean not null default false;
alter table show_bands add column if not exists paid boolean not null default false;
