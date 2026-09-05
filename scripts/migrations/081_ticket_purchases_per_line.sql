-- Multi-show attribution fix: a single Square payment whose order spans two
-- shows (or a show + merch) used to be booked entirely to ONE show — the
-- webhook matched `limit 1` and recorded the whole payment amount. Now the
-- webhook writes one row per matched order line, so uniqueness moves from the
-- payment to (payment, variation). A plain index on square_payment_id remains
-- for refund lookups (the dropped unique used to provide it).
--
-- Deploy note: between this migration applying (predeploy) and the new code
-- going live, the OLD webhook's `on conflict (square_payment_id)` insert
-- errors → 500 → Square retries with backoff for ~24h and succeeds once the
-- new code is up. No data is lost; at most a purchase row lands minutes late.
alter table ticket_purchases drop constraint if exists ticket_purchases_square_payment_id_key;
alter table ticket_purchases add constraint ticket_purchases_payment_variation_key
  unique (square_payment_id, square_variation_id);
create index if not exists ticket_purchases_payment_idx on ticket_purchases (square_payment_id);
