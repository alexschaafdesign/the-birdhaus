-- Per-show advance: the rendered (and possibly hand-edited) email that goes to
-- the whole lineup as a single group thread. One row per show. Supersedes the
-- plain shows.advance_sent boolean from 021 (which we keep in sync for now so
-- the shows list's existing "advanced?" indicator keeps working).
create table if not exists show_advances (
  show_id bigint primary key references shows (id) on delete cascade,
  -- Which boilerplate this was composed from; nulled if that template is later
  -- deleted, since the composed subject/body below are already snapshotted here.
  template_id bigint references advance_templates (id) on delete set null,
  subject text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  -- Group reply-to token. Outbound mail sets Reply-To: advance-{token}@<domain>,
  -- so a band's "reply all" lands on the inbound webhook, which looks the show
  -- up by this token (band is then attributed by sender address). Random,
  -- unique, and supplied by the app at creation time (no DB crypto extension).
  reply_token text not null unique,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
