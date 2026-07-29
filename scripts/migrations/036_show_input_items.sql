-- Per-band gear/input needs for a show, entered manually in the admin (bands
-- send stage plots / input lists in whatever format via the advance thread, so
-- Alex transcribes the gist here). The app rolls these up into a per-show "total
-- needed" — the MAX quantity of each gear type across bands, since bands don't
-- play simultaneously and gear (mics, amps) is reused between sets.
--
-- item_type is a catalog key (lib/input-catalog.ts); custom_label holds the
-- free-text name when item_type = 'other'. Rows are replaced wholesale on save
-- (the admin panel PUTs the full list), so there's no per-row update path.
create table if not exists show_input_items (
  id bigserial primary key,
  show_id bigint not null references shows (id) on delete cascade,
  band_id bigint not null references bands (id) on delete cascade,
  item_type text not null,
  custom_label text,
  quantity integer not null default 1,
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists show_input_items_show_idx
  on show_input_items (show_id);

create index if not exists show_input_items_band_idx
  on show_input_items (show_id, band_id);
