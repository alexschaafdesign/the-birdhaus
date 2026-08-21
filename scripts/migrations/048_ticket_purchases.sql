-- Layer 1 ticketing hardening: own the ticket-sales data. One row per COMPLETED
-- Square payment that maps to a show's donation-tier variation. Written by the
-- Square payment webhook (app/api/webhooks/square) and, for history, by
-- scripts/backfill-ticket-purchases.mjs. Additive only.
create table if not exists ticket_purchases (
  id bigint generated always as identity primary key,
  -- set null (not cascade) so revenue history survives a show deletion
  show_id bigint references shows(id) on delete set null,
  square_payment_id text not null unique,   -- dedupe key for webhook retries
  square_order_id text,
  square_variation_id text,
  amount_cents integer not null default 0,  -- payment total (already includes quantity)
  quantity integer not null default 1,      -- from the order line item
  buyer_email text,
  status text not null default 'completed', -- 'completed' | 'refunded'
  source text not null default 'webhook',   -- 'webhook' | 'backfill' (backfill rows never get emails)
  payment_created_at timestamptz,
  confirmation_email_sent_at timestamptz,
  raw jsonb,                                -- payment object as received, for forensics
  created_at timestamptz not null default now()
);

create index if not exists ticket_purchases_show_id_idx on ticket_purchases (show_id);

-- Serverless admin-alert throttle: at most one alert per key per window,
-- claimed via conditional upsert so concurrent lambdas can't double-send.
create table if not exists admin_alerts (
  key text primary key,
  last_sent_at timestamptz not null default now()
);
