-- Square sync: link a show to its Square Catalog EVENT item and per-tier
-- Payment Links. Additive only. shows.id is bigserial, so show_id is bigint.
alter table shows add column if not exists square_item_id text;

create table if not exists show_square_links (
  id bigint generated always as identity primary key,
  show_id bigint references shows(id),
  tier_label text not null,
  amount_cents integer not null,
  square_variation_id text,
  square_payment_link_id text,
  square_order_id text,
  url text,
  created_at timestamptz not null default now()
);

create index if not exists show_square_links_show_id_idx on show_square_links (show_id);
