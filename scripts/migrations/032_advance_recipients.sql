-- One row per band on a show's advance. Snapshots the address the advance was
-- sent to (contact_email can change on the bands overlay later) and tracks the
-- per-band "asks" checklist — the highlighted-in-blue requests Alex needs back
-- from each band (input list/stage plot, schedule confirmation, payment info).
-- Since the advance is a single group thread, these are ticked from who has
-- replied plus manual judgement, not parsed from message contents.
create table if not exists advance_recipients (
  show_id bigint not null references shows (id) on delete cascade,
  band_id bigint not null references bands (id) on delete restrict,
  email text not null,
  -- Checklist state, e.g. {"input_list": false, "schedule": false, "payment": false}.
  -- jsonb (not columns) so the set of asks can evolve without a migration.
  asks jsonb not null default '{"input_list": false, "schedule": false, "payment": false}',
  -- First time we saw an inbound reply from this band's address on the thread.
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (show_id, band_id)
);

create index if not exists advance_recipients_band_idx on advance_recipients (band_id);
