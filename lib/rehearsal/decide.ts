import { approveBookings, declineBookings, syncSeriesStatus } from './decisions';
import { sendApprovedEmail, sendDeclinedEmail } from './emails';
import { sql } from '../db';
import { extendSeries } from './series-extend';

// Approve or decline, then email the band. Shared by the signed review page
// and admin Requests. The write stands even if the email fails; the result
// says so and admin shows "not emailed" with a resend.

export type DecideResult = { changed: number[]; emailed: boolean };

export async function decide(action: 'approve' | 'decline', ids: number[], reason = ''): Promise<DecideResult> {
  if (action === 'approve') {
    const changed = await approveBookings(ids);
    await syncSeriesStatus(changed);
    const emailed = changed.length ? await sendApprovedEmail(changed) : false;
    // An approved series also takes any dates that came into the window while
    // it waited (the daily run keeps it going after that).
    if (changed.length) {
      const series = await sql<{ id: number }[]>`
        select distinct series_id::int as id from rehearsal_bookings where id in ${sql(changed)} and series_id is not null
      `;
      if (series.length) await extendSeries({ seriesIds: series.map((r) => r.id) });
    }
    return { changed, emailed };
  }
  const changed = await declineBookings(ids, reason);
  await syncSeriesStatus(changed);
  return { changed, emailed: changed.length ? await sendDeclinedEmail(changed, reason) : false };
}
