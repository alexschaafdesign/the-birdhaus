import { sql } from '@/lib/db';
import { getTodayCentral } from '@/lib/shows';
import { type ShowListItem } from '@/components/admin/ShowsList';
import AdminShowsBrowser from '@/components/admin/ShowsBrowser';

export const dynamic = 'force-dynamic';

async function getShows(): Promise<ShowListItem[]> {
  const rows = await sql<ShowListItem[]>`
    select
      s.id, s.slug, s.title, s.date::text as date, s.announced, s.flyer,
      s.sound_engineer_name, s.rsvp_form, s.target_band_count, s.ignored_health_checks, s.advance_sent,
      coalesce(b.band_count, 0)::int as band_count,
      coalesce(r.rsvp_count, 0)::int as rsvp_count,
      coalesce(r.guest_count, 0)::int as guest_count,
      coalesce(st.sound_paid, false) as sound_paid,
      coalesce(st.photographer_paid, false) as photographer_paid,
      st.photographer_name,
      coalesce(bp.bands_paid_count, 0)::int as bands_paid_count,
      coalesce(vc.bands_with_video_count, 0)::int as bands_with_video_count,
      coalesce(ii.bands_missing_inputs, 0)::int as bands_missing_inputs,
      coalesce(tp.tickets_sold, 0)::int as tickets_sold,
      coalesce(tp.revenue_cents, 0)::int as revenue_cents,
      s.ticket_limit,
      coalesce(ce.credited_extra, 0)::int as credited_extra
    from shows s
    left join (
      select show_id, count(*) as band_count
      from show_bands
      group by show_id
    ) b on b.show_id = s.id
    left join (
      select show_id, count(*) as rsvp_count, sum(guests) as guest_count
      from rsvps
      group by show_id
    ) r on r.show_id = s.id
    left join settlements st on st.show_id = s.id
    left join (
      -- Excluded bands aren't part of the payout, so count them as "paid" here
      -- to keep the shows-list post-show check from flagging them as unpaid.
      select show_id, count(*) filter (where paid or excluded) as bands_paid_count
      from show_bands
      group by show_id
    ) bp on bp.show_id = s.id
    left join (
      select sb.show_id, count(distinct sb.band_id) as bands_with_video_count
      from show_bands sb
      join band_videos bv on bv.band_id = sb.band_id
      join show_videos sv on sv.video_id = bv.video_id and sv.show_id = sb.show_id
      group by sb.show_id
    ) vc on vc.show_id = s.id
    left join (
      -- Non-excluded lineup bands with no input items recorded yet (show_input_items
      -- only ever holds non-excluded bands), so the shows list can flag missing
      -- input lists / stage plots.
      select sb.show_id, count(*) as bands_missing_inputs
      from show_bands sb
      where not sb.excluded
        and not exists (
          select 1 from show_input_items sii
          where sii.show_id = sb.show_id and sii.band_id = sb.band_id
        )
      group by sb.show_id
    ) ii on ii.show_id = s.id
    left join (
      -- Advance ticket sales recorded by the Square webhook / backfill.
      select show_id, sum(quantity) as tickets_sold, sum(amount_cents) as revenue_cents
      from ticket_purchases
      where status = 'completed' and show_id is not null
      group by show_id
    ) tp on tp.show_id = s.id
    left join (
      -- Extra heads from per-RSVP manual credits: for each credited RSVP,
      -- max(0, credited_tickets − what that RSVP actually bought). Added to
      -- tickets sold for the effective attendance shown on the pill.
      select r.show_id,
        sum(greatest(0, r.credited_tickets - coalesce(b.bought, 0))) as credited_extra
      from rsvps r
      left join lateral (
        select sum(tp2.quantity) as bought
        from ticket_purchases tp2
        where tp2.show_id = r.show_id and tp2.status = 'completed'
          and (
            lower(tp2.buyer_email) = lower(r.email)
            or (r.buyer_email is not null and lower(tp2.buyer_email) = r.buyer_email)
          )
      ) b on true
      where r.credited_tickets is not null
      group by r.show_id
    ) ce on ce.show_id = s.id
    order by s.date desc
  `;
  return rows;
}

export default async function AdminShowsPage() {
  const shows = await getShows();
  const today = getTodayCentral();
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6">
      <AdminShowsBrowser initialShows={shows} today={today} />
    </main>
  );
}
