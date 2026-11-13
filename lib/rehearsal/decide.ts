import { approveBookings, declineBookings, syncSeriesStatus } from './decisions';
import { sendApprovedEmail, sendDeclinedEmail } from './emails';

// Approve or decline, then email the band. Shared by the signed review page
// and admin Requests. The write stands even if the email fails; the result
// says so and admin shows "not emailed" with a resend.

export type DecideResult = { changed: number[]; emailed: boolean };

export async function decide(action: 'approve' | 'decline', ids: number[], reason = ''): Promise<DecideResult> {
  if (action === 'approve') {
    const changed = await approveBookings(ids);
    await syncSeriesStatus(changed);
    return { changed, emailed: changed.length ? await sendApprovedEmail(changed) : false };
  }
  const changed = await declineBookings(ids, reason);
  await syncSeriesStatus(changed);
  return { changed, emailed: changed.length ? await sendDeclinedEmail(changed, reason) : false };
}
