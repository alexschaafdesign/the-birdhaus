-- Per-item flag: this band will use the house backline (amp/kit) for this line
-- rather than bringing their own. Only meaningful for house-eligible gear
-- (guitar amp, bass amp, drum kit — the catalog items with a houseLabel); other
-- item types always store false. Drives the "N using house amp, M bringing own"
-- rollup on the show's Total needed. Additive, default false so existing rows
-- read as "bringing own".
alter table show_input_items
  add column use_house boolean not null default false;
