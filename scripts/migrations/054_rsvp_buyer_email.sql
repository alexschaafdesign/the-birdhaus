-- Manual purchase matching: when a Square buyer paid with a different address
-- than they RSVPed with, the admin can link the two. buyer_email is the
-- alternate (lowercased) address whose purchases get credited to this RSVP.
alter table rsvps add column if not exists buyer_email text;
