-- Manual door-list flags on RSVPs: check people in as they arrive, and mark
-- them paid by hand (the existing "Bought" badge is derived from Square matching;
-- this is a separate, admin-set flag for cash/comp/other payments).
alter table rsvps add column if not exists arrived boolean not null default false;
alter table rsvps add column if not exists arrived_at timestamptz;
alter table rsvps add column if not exists paid boolean not null default false;
alter table rsvps add column if not exists paid_at timestamptz;
