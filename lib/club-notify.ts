// Blast orchestration for Song Club notifications: fan a message out to every
// opted-in member. Best-effort — a single recipient's failure never aborts the
// batch, and callers wrap these so a Resend outage never breaks the underlying
// action (posting, publishing). Recipient counts are small (a club), so plain
// sequential-ish sends via allSettled are fine.

import { SITE_URL } from './site';
import { getNotificationRecipients } from './club-members';
import { sendAnnouncementEmail, sendClubEventEmail } from './club-email';
import { claimEventNotification, type SongClubEvent } from './song-club';

const PORTAL_URL = `${SITE_URL}/song-club`;

// "2026-08-15" -> "Saturday, August 15" for the event email.
function formatEventDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// Blasts a just-saved event to members if it's published and hasn't been
// announced yet. Best-effort and race-safe: claimEventNotification stamps
// notified_at atomically so only the first publish sends. Returns how many
// were emailed (0 if the event isn't eligible). Callers wrap in try/catch.
export async function maybeNotifyEventPublished(event: SongClubEvent): Promise<number> {
  if (!event.published || event.notified_at) return 0;
  if (!(await claimEventNotification(event.id))) return 0; // someone else won the race
  return notifyNewEvent({
    slug: event.slug,
    title: event.title,
    dateLabel: formatEventDate(event.event_date),
  });
}

export async function notifyAnnouncement(body: string): Promise<number> {
  const recipients = await getNotificationRecipients('announcements');
  const results = await Promise.allSettled(
    recipients.map((r) =>
      sendAnnouncementEmail({ to: r.email, recipientName: r.name, body, portalUrl: PORTAL_URL })
    )
  );
  return logFailures('announcement', results);
}

export async function notifyNewEvent(input: {
  slug: string;
  title: string;
  dateLabel: string;
}): Promise<number> {
  const recipients = await getNotificationRecipients('events');
  const eventUrl = `${SITE_URL}/song-club/${input.slug}`;
  const results = await Promise.allSettled(
    recipients.map((r) =>
      sendClubEventEmail({
        to: r.email,
        recipientName: r.name,
        title: input.title,
        dateLabel: input.dateLabel,
        eventUrl,
      })
    )
  );
  return logFailures('event', results);
}

function logFailures(kind: string, results: PromiseSettledResult<unknown>[]): number {
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    console.error(`[club-notify] ${kind}: ${failed.length}/${results.length} sends failed`, failed[0]);
  }
  return results.length - failed.length;
}
