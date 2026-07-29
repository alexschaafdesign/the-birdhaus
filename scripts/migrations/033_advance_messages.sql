-- The advance thread: every message in either direction for a show. Outbound
-- rows are what Alex sends (the initial advance and any admin replies);
-- inbound rows are bands' replies, delivered by the Resend inbound webhook.
-- This table is the admin "inbox" the Advance tab renders.
create table if not exists advance_messages (
  id bigserial primary key,
  show_id bigint not null references shows (id) on delete cascade,
  -- Attributed band for inbound replies (matched by sender address against the
  -- lineup); null when outbound-to-all or the sender isn't a known lineup band.
  band_id bigint references bands (id) on delete set null,
  direction text not null check (direction in ('outbound', 'inbound')),
  from_email text,
  to_emails jsonb not null default '[]',
  subject text,
  body_html text,
  body_text text,
  -- Resend's message id (outbound) or inbound event id. Used to dedupe webhook
  -- retries — Resend may deliver an inbound event more than once.
  resend_id text,
  created_at timestamptz not null default now()
);

create index if not exists advance_messages_thread_idx on advance_messages (show_id, created_at);

-- Idempotency guard for at-least-once webhook delivery: the same Resend event
-- id can't be inserted twice.
create unique index if not exists advance_messages_resend_id_idx
  on advance_messages (resend_id) where resend_id is not null;
