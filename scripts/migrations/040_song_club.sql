-- Song Club — admin-run songwriter meetups, each with a public RSVP form that
-- emails the attendee the event's address + details. Moved over from Twin Scene
-- (its migration 0067), where it originally lived; same schema. These are our
-- own events, separate from the house-show `shows` table. Admin-managed (the
-- single-operator admin session gates it — no per-event editors in v1).
create table song_club_events (
  id             bigserial primary key,
  slug           text unique not null,
  title          text not null,
  event_date     date not null,
  start_time     text,            -- free text, e.g. "7:00 PM"
  end_time       text,
  venue_name     text,            -- per-event location (name)
  address        text,            -- the address emailed to RSVPs
  arrival_notes  text,            -- parking / how to find the door / etc.
  description    text,            -- per-event theme/blurb, shown on page + email
  flyer_url      text,
  published      boolean not null default false,  -- draft vs live
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index song_club_events_event_date_idx on song_club_events (event_date);

create table song_club_rsvps (
  id                          bigserial primary key,
  event_id                    bigint not null references song_club_events(id) on delete cascade,
  name                        text not null,
  email                       text not null,
  guests                      integer not null default 1,
  confirmation_email_sent_at  timestamptz,
  created_at                  timestamptz not null default now()
);

create index song_club_rsvps_event_id_idx on song_club_rsvps (event_id);
