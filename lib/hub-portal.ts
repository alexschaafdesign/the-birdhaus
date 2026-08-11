import { sql } from './db';
import { uploadFileToR2, ADVANCE_ATTACHMENTS_FOLDER } from './r2';
import { notifyAdvanceActivity } from './advance-email';
import { htmlToText } from './reply-text';

// One message as the public portal shows it. Deliberately PII-free: no
// from_email / to_emails (the raw thread carries band + engineer addresses that
// must not leak to a shared link) — just a display name, plain-text body, and
// direction so the UI can style Alex's replies vs. band messages.
export interface PortalMessage {
  id: number;
  direction: 'outbound' | 'inbound';
  senderName: string;
  body: string;
  createdAt: string;
}

// Write side of the public band advance portal (/hub/<token>). The token has
// already been resolved to a showId by the caller (getShowIdByShareToken) — this
// module never trusts a client-supplied showId. Portal submissions are stored as
// INBOUND advance_messages (+ advance_attachments) exactly like a band's emailed
// reply, so they surface on the admin Inputs tab and Advance thread with no
// changes to those read paths.

// Confirms a band is in the show's current (non-excluded) lineup and returns its
// name. null means "not a band on this show" — the routes reject the submission.
export async function getLineupBand(
  showId: number,
  bandId: number
): Promise<{ id: number; name: string } | null> {
  if (!Number.isInteger(bandId)) return null;
  const [row] = await sql<Array<{ id: number; name: string }>>`
    select b.id, b.name
    from show_bands sb
    join bands b on b.id = sb.band_id
    where sb.show_id = ${showId} and sb.band_id = ${bandId} and not sb.excluded
  `;
  return row ? { id: Number(row.id), name: row.name } : null;
}

// The show title, for notification-email subjects. null if the show vanished.
async function getShowTitle(showId: number): Promise<string | null> {
  const [row] = await sql<Array<{ title: string }>>`
    select title from shows where id = ${showId}
  `;
  return row?.title ?? null;
}

// The show's advance thread, sanitized for the public portal: outbound rows show
// as "the Birdhaus", inbound rows as the attributed band (or "Someone" when the
// sender isn't a known lineup band). HTML-only bodies (Alex's admin replies) are
// flattened to text — never rendered as HTML on the portal. Ordered oldest-first
// so the compose box sits below the latest message.
export async function getPortalThread(showId: number): Promise<PortalMessage[]> {
  const rows = await sql<Array<{
    id: number;
    band_name: string | null;
    direction: 'outbound' | 'inbound';
    body_html: string | null;
    body_text: string | null;
    created_at: string;
  }>>`
    select m.id, b.name as band_name, m.direction, m.body_html, m.body_text,
           m.created_at::text as created_at
    from advance_messages m
    left join bands b on b.id = m.band_id
    where m.show_id = ${showId}
    order by m.created_at asc, m.id asc
  `;
  return rows
    .map((r) => {
      const body = (r.body_text?.trim() || (r.body_html ? htmlToText(r.body_html) : '')).trim();
      return {
        id: Number(r.id),
        direction: r.direction,
        senderName: r.direction === 'outbound' ? 'the Birdhaus' : r.band_name || 'Someone',
        body,
        createdAt: r.created_at,
      };
    })
    .filter((m) => m.body.length > 0);
}

// Records a stage-plot file a band uploaded in the portal: re-hosts it in R2,
// then in one transaction inserts an inbound thread message (so the upload is
// attributed and visible in the Advance thread) and the attachment row that
// points at it. Returns the public URL + filename for the UI's "your files"
// list. Notifies Alex best-effort.
export async function recordPortalStagePlot(input: {
  showId: number;
  bandId: number;
  filename: string;
  contentType: string;
  buffer: Buffer;
}): Promise<{ url: string; filename: string } | null> {
  const band = await getLineupBand(input.showId, input.bandId);
  if (!band) return null;

  const url = await uploadFileToR2(
    ADVANCE_ATTACHMENTS_FOLDER,
    input.buffer,
    input.contentType,
    input.filename
  );

  await sql.begin(async (tx) => {
    const [msg] = await tx<Array<{ id: number }>>`
      insert into advance_messages
        (show_id, band_id, direction, from_email, to_emails, subject, body_text)
      values
        (${input.showId}, ${band.id}, 'inbound', null, '[]'::jsonb, null,
         ${`${band.name} uploaded a stage plot via the portal: ${input.filename}`})
      returning id
    `;
    await tx`
      insert into advance_attachments
        (message_id, show_id, filename, content_type, size_bytes, url)
      values
        (${msg.id}, ${input.showId}, ${input.filename}, ${input.contentType},
         ${input.buffer.length}, ${url})
    `;
  });

  await notifyPortalActivity(input.showId, `${band.name} uploaded a stage plot`, input.filename);

  return { url, filename: input.filename };
}

// Records a message a band (or "sound engineer / other" — bandId null) posted in
// the portal, as an inbound thread message. Returns false if the show is gone or
// a bandId was given that isn't in the lineup. Notifies Alex best-effort.
export async function recordPortalMessage(input: {
  showId: number;
  bandId: number | null;
  body: string;
}): Promise<boolean> {
  const body = input.body.trim().slice(0, 5000);
  if (!body) return false;

  let bandName = 'Someone';
  if (input.bandId !== null) {
    const band = await getLineupBand(input.showId, input.bandId);
    if (!band) return false; // A named band must actually be in the lineup.
    bandName = band.name;
  } else {
    // "Other" — still require the show to exist before writing.
    const title = await getShowTitle(input.showId);
    if (title === null) return false;
  }

  await sql`
    insert into advance_messages
      (show_id, band_id, direction, from_email, to_emails, subject, body_text)
    values
      (${input.showId}, ${input.bandId}, 'inbound', null, '[]'::jsonb, null, ${body})
  `;

  const snippet = body.length > 140 ? `${body.slice(0, 140)}…` : body;
  await notifyPortalActivity(input.showId, `${bandName} sent a message`, snippet);

  return true;
}

// Fire the "band did something in the portal" email to Alex. Swallows errors so a
// Resend outage never turns a saved submission into a user-facing failure.
async function notifyPortalActivity(showId: number, summary: string, detail: string): Promise<void> {
  try {
    const title = await getShowTitle(showId);
    if (title === null) return;
    await notifyAdvanceActivity({ showId, showTitle: title, summary, detail });
  } catch (e) {
    console.error('[hub-portal] activity notification failed', e);
  }
}
