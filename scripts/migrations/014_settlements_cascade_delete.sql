alter table settlements drop constraint settlements_show_id_fkey;
alter table settlements
  add constraint settlements_show_id_fkey foreign key (show_id) references shows (id) on delete cascade;
