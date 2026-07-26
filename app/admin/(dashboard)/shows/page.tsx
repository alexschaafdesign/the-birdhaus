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
      coalesce(vc.bands_with_video_count, 0)::int as bands_with_video_count
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
