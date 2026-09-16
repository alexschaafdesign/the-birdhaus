// Blast orchestration for Song Club notifications: fan a message out to every
// opted-in member. Sends go through Resend's batch endpoint (sendEmailBatch) in
// one request per 100 recipients — NOT one concurrent request each, which
// tripped Resend's rate limit and silently dropped most of a large blast.
// Best-effort — callers wrap these so a Resend outage never breaks the
// underlying action (posting, publishing). Each returns how many were emailed.

import { sql } from './db';
import { SITE_URL } from './site';
import { getGroupNotificationRecipients, getNotificationRecipients } from './club-members';
import { buildAnnouncementEmail, buildClubEventEmail, sendEmailBatch } from './club-email';
import { claimEventNotification, slugify, type SongClubEvent } from './song-club';

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
  return sendEmailBatch(
    recipients.map((r) =>
      buildAnnouncementEmail({ to: r.email, recipientName: r.name, body, portalUrl: PORTAL_URL })
    )
  );
}

// A group-board post's email goes to THAT GROUP's members only (opt-out
// respected), and the button links straight to the group's page — never the
// club-wide announcement list.
export async function notifyGroupPost(groupId: number, body: string): Promise<number> {
  const [group] = await sql<Array<{ name: string; slug: string }>>`
    select g.name, e.slug
    from song_club_groups g
    join song_club_events e on e.id = g.event_id
    where g.id = ${groupId}
  `;
  if (!group) return 0;
  const groupUrl = `${SITE_URL}/song-club/${group.slug}/${slugify(group.name)}`;
  const recipients = await getGroupNotificationRecipients(groupId);
  return sendEmailBatch(
    recipients.map((r) =>
      buildAnnouncementEmail({ to: r.email, recipientName: r.name, body, portalUrl: groupUrl })
    )
  );
}

export async function notifyNewEvent(input: {
  slug: string;
  title: string;
  dateLabel: string;
}): Promise<number> {
  const recipients = await getNotificationRecipients('events');
  const eventUrl = `${SITE_URL}/song-club/${input.slug}`;
  return sendEmailBatch(
    recipients.map((r) =>
      buildClubEventEmail({
        to: r.email,
        recipientName: r.name,
        title: input.title,
        dateLabel: input.dateLabel,
        eventUrl,
      })
    )
  );
}
