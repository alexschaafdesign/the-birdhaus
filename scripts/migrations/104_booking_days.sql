-- Booking: each calendar day gets one title (what the calendar cell shows)
-- and a free-text notepad ("Ghosting Merit? Fend - asked. Josie - asked"),
-- replacing the per-day note list and the structured asks list. date_notes
-- and date_holds stay untouched (unused by new code) so this is additive and
-- the live code keeps working until the deploy lands.

create table if not exists booking_days (
  date date primary key,
  title text not null default '' check (char_length(title) <= 120),
  notepad text not null default '' check (char_length(notepad) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fold the old data in. The first note was already the cell label, so it
-- becomes the title (unless too long for one); every other note, then every
-- ask as "Name - status (note)", becomes a notepad line.
with notes as (
  select date, body, created_at, id,
         row_number() over (partition by date order by created_at, id) as rn
  from date_notes
),
titles as (
  select date, body as title from notes where rn = 1 and char_length(body) <= 120
),
note_lines as (
  select n.date, string_agg(n.body, E'\n' order by n.created_at, n.id) as lines
  from notes n
  left join titles t on t.date = n.date and n.rn = 1
  where t.date is null
  group by n.date
),
ask_lines as (
  select h.date,
         string_agg(
           p.name || ' - ' || h.status || coalesce(' (' || h.note || ')', ''),
           E'\n' order by h.created_at, h.id
         ) as lines
  from date_holds h
  join booking_prospects p on p.id = h.prospect_id
  group by h.date
),
days as (
  select date from notes union select date from ask_lines
)
insert into booking_days (date, title, notepad)
select d.date,
       coalesce(t.title, ''),
       left(concat_ws(E'\n', nl.lines, al.lines), 10000)
from days d
left join titles t on t.date = d.date
left join note_lines nl on nl.date = d.date
left join ask_lines al on al.date = d.date
on conflict (date) do nothing;
