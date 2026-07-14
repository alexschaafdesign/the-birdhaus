-- Lets an operator acknowledge a flagged "Show Health" issue as intentional
-- (e.g. RSVP form deliberately disabled for a show) so it stops being flagged,
-- without changing the underlying field it's about. Stores a JSON array of the
-- issue keys used in components/admin/ShowHealthPanel.tsx.
alter table shows add column if not exists ignored_health_checks jsonb not null default '[]'::jsonb;
