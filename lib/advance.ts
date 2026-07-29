import { sql } from './db';
import {
  DEFAULT_ADVANCE_SUBJECT,
  DEFAULT_ADVANCE_BODY,
  type AdvanceTemplateVars,
  renderAdvanceEmail,
  sendAdvanceEmail,
  generateReplyToken,
  showAdvanceUrl,
  formatAdvanceDate,
  formatLineup,
  formatScheduleBlock,
  formatCallout,
  renderReplyHtml,
  extractEmailAddress,
} from './advance-email';

// Server-side data access for advance templates. For now there's a single
// "default" template (the boilerplate Alex edits in Settings); the schema
// (migration 030) already allows multiple, so this can grow into per-template
// selection later without a migration.
export interface AdvanceTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
  updatedAt: string;
}

interface AdvanceTemplateRow {
  id: number;
  name: string;
  subject: string;
  body: string;
  updated_at: string;
}

function rowToTemplate(row: AdvanceTemplateRow): AdvanceTemplate {
  return {
    id: Number(row.id),
    name: row.name,
    subject: row.subject,
    body: row.body,
    updatedAt: row.updated_at,
  };
}

// Returns the single default template, lazily seeding it from the canonical
// text in lib/advance-email.ts the first time it's read (so there's no separate
// seed step to remember). The `where not exists` guard plus the is_default
// partial unique index (migration 030) keep this idempotent.
export async function getDefaultAdvanceTemplate(): Promise<AdvanceTemplate> {
  await sql`
    insert into advance_templates (name, subject, body, is_default)
    select 'Default', ${DEFAULT_ADVANCE_SUBJECT}, ${DEFAULT_ADVANCE_BODY}, true
    where not exists (select 1 from advance_templates where is_default)
  `;
  const [row] = await sql<AdvanceTemplateRow[]>`
    select id, name, subject, body, updated_at::text as updated_at
    from advance_templates
    where is_default
    limit 1
  `;
  return rowToTemplate(row);
}

// Updates the default template's subject/body. Seeds first so an update before
// any read still has a row to write.
export async function updateDefaultAdvanceTemplate(input: {
  subject: string;
  body: string;
}): Promise<AdvanceTemplate> {
  await getDefaultAdvanceTemplate();
  const [row] = await sql<AdvanceTemplateRow[]>`
    update advance_templates
    set subject = ${input.subject}, body = ${input.body}, updated_at = now()
    where is_default
    returning id, name, subject, body, updated_at::text as updated_at
  `;
  return rowToTemplate(row);
}

// ---------------------------------------------------------------------------
// Per-show advance (compose / send). The "vars" a user edits per show are the
// free-text placeholders below; lineup / show_url / show_date are derived from
// the show itself and never stored.
// ---------------------------------------------------------------------------

// The editable subset persisted in show_advances.vars (migration 034).
export interface SavedAdvanceVars {
  intro: string;
  schedule: string;
  soundcheck_notes: string;
  sound_engineer: string;
}

const EMPTY_VARS: SavedAdvanceVars = {
  intro: '',
  schedule: '',
  soundcheck_notes: '',
  sound_engineer: '',
};

// Accepts arbitrary input (jsonb from the DB, or a request body) and returns a
// clean SavedAdvanceVars with only known string fields, defaulting the rest.
export function normalizeAdvanceVars(input: unknown): SavedAdvanceVars {
  const v = (input ?? {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === 'string' ? x : '');
  return {
    intro: str(v.intro),
    schedule: str(v.schedule),
    soundcheck_notes: str(v.soundcheck_notes),
    sound_engineer: str(v.sound_engineer),
  };
}

export interface AdvanceRecipient {
  bandId: number;
  name: string;
  email: string | null;
}

export interface AdvanceThreadMessage {
  id: number;
  bandId: number | null;
  direction: 'outbound' | 'inbound';
  fromEmail: string | null;
  toEmails: string[];
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  createdAt: string;
}

export interface ShowAdvanceState {
  showId: number;
  show: { title: string; date: string | null; slug: string; soundEngineerName: string };
  recipients: AdvanceRecipient[];
  vars: SavedAdvanceVars;
  status: 'none' | 'draft' | 'sent';
  sentAt: string | null;
  preview: { subject: string; html: string };
  messages: AdvanceThreadMessage[];
}

interface ShowForAdvanceRow {
  title: string;
  date: string | null;
  slug: string;
  sound_engineer_name: string | null;
}

// Loads the minimal show fields the advance needs. The sound engineer defaults
// to whoever is confirmed on the show (show_sound_engineers), falling back to
// the staffing note on the show itself (shows.sound_engineer_name, migration 018).
async function loadShowForAdvance(showId: number): Promise<ShowForAdvanceRow | null> {
  const [row] = await sql<ShowForAdvanceRow[]>`
    select
      s.title,
      s.date::text as date,
      s.slug,
      coalesce(
        (select se.name
         from show_sound_engineers sse
         join sound_engineers se on se.id = sse.sound_engineer_id
         where sse.show_id = s.id and sse.status = 'confirmed'
         limit 1),
        s.sound_engineer_name
      ) as sound_engineer_name
    from shows s
    where s.id = ${showId}
  `;
  return row ?? null;
}

// The lineup that should receive the advance: bands on the show, excluding any
// marked excluded (migration 029), in stage order.
async function loadRecipients(showId: number): Promise<AdvanceRecipient[]> {
  const rows = await sql<Array<{ band_id: number; name: string; contact_email: string | null }>>`
    select b.id as band_id, b.name, b.contact_email
    from show_bands sb
    join bands b on b.id = sb.band_id
    where sb.show_id = ${showId} and not sb.excluded
    order by sb.sort_order
  `;
  return rows.map((r) => ({
    bandId: Number(r.band_id),
    name: r.name,
    email: r.contact_email?.trim() || null,
  }));
}

// Assembles the full AdvanceTemplateVars (derived + saved) used for rendering.
function buildTemplateVars(
  show: ShowForAdvanceRow,
  recipients: AdvanceRecipient[],
  saved: SavedAdvanceVars
): AdvanceTemplateVars {
  return {
    intro: saved.intro,
    schedule: formatScheduleBlock(saved.schedule),
    soundcheck_notes: formatCallout(saved.soundcheck_notes),
    // Editable, but defaults to the show's confirmed engineer.
    sound_engineer: saved.sound_engineer || (show.sound_engineer_name ?? ''),
    lineup: formatLineup(recipients.map((r) => r.name)),
    show_url: showAdvanceUrl(show.slug),
    show_date: show.date ? formatAdvanceDate(show.date) : '',
  };
}

interface ShowAdvanceRow {
  status: 'draft' | 'sent';
  sent_at: string | null;
  reply_token: string;
  vars: unknown;
}

// Full state for the Advance tab: show info, recipient list (with emails so the
// UI can flag missing ones), saved draft vars, status, a live preview rendered
// from the current default template, and the message thread.
export async function getShowAdvanceState(showId: number): Promise<ShowAdvanceState | null> {
  const show = await loadShowForAdvance(showId);
  if (!show) return null;

  const [recipients, template, [advanceRow], messageRows] = await Promise.all([
    loadRecipients(showId),
    getDefaultAdvanceTemplate(),
    sql<ShowAdvanceRow[]>`
      select status, sent_at::text as sent_at, reply_token, vars
      from show_advances
      where show_id = ${showId}
    `,
    sql<Array<{
      id: number;
      band_id: number | null;
      direction: 'outbound' | 'inbound';
      from_email: string | null;
      to_emails: unknown;
      subject: string | null;
      body_html: string | null;
      body_text: string | null;
      created_at: string;
    }>>`
      select id, band_id, direction, from_email, to_emails, subject,
             body_html, body_text, created_at::text as created_at
      from advance_messages
      where show_id = ${showId}
      order by created_at asc
    `,
  ]);

  const saved = advanceRow
    ? { ...EMPTY_VARS, ...normalizeAdvanceVars(advanceRow.vars) }
    : { ...EMPTY_VARS };
  const templateVars = buildTemplateVars(show, recipients, saved);
  const preview = await renderAdvanceEmail(
    { subject: template.subject, body: template.body },
    templateVars
  );

  return {
    showId,
    show: {
      title: show.title,
      date: show.date,
      slug: show.slug,
      soundEngineerName: show.sound_engineer_name ?? '',
    },
    recipients,
    vars: saved,
    status: advanceRow ? advanceRow.status : 'none',
    sentAt: advanceRow?.sent_at ?? null,
    preview: { subject: preview.subject, html: preview.html },
    messages: messageRows.map((m) => ({
      id: Number(m.id),
      bandId: m.band_id === null ? null : Number(m.band_id),
      direction: m.direction,
      fromEmail: m.from_email,
      toEmails: Array.isArray(m.to_emails) ? (m.to_emails as string[]) : [],
      subject: m.subject,
      bodyHtml: m.body_html,
      bodyText: m.body_text,
      createdAt: m.created_at,
    })),
  };
}

// Renders the current subject/body from template + vars for a show. Shared by
// the draft-save and send paths so both persist an identical rendering.
async function renderForShow(
  show: ShowForAdvanceRow,
  recipients: AdvanceRecipient[],
  saved: SavedAdvanceVars
): Promise<{ subject: string; html: string }> {
  const template = await getDefaultAdvanceTemplate();
  const templateVars = buildTemplateVars(show, recipients, saved);
  const { subject, html } = await renderAdvanceEmail(
    { subject: template.subject, body: template.body },
    templateVars
  );
  return { subject, html };
}

// Upserts the show_advances row with the rendered subject/body + saved vars,
// creating a reply token on first write. Never downgrades a 'sent' advance back
// to 'draft'. Returns the row's reply token.
async function upsertShowAdvance(
  showId: number,
  rendered: { subject: string; html: string },
  saved: SavedAdvanceVars
): Promise<string> {
  const token = generateReplyToken();
  const [row] = await sql<Array<{ reply_token: string }>>`
    insert into show_advances (show_id, subject, body, status, reply_token, vars)
    values (${showId}, ${rendered.subject}, ${rendered.html}, 'draft', ${token}, ${sql.json(saved as unknown as Record<string, string>)})
    on conflict (show_id) do update
      set subject = excluded.subject,
          body = excluded.body,
          vars = excluded.vars,
          updated_at = now()
    returning reply_token
  `;
  return row.reply_token;
}

// Saves the advance as a draft (no email sent). Returns the refreshed state.
export async function saveShowAdvanceDraft(
  showId: number,
  varsInput: unknown
): Promise<ShowAdvanceState | null> {
  const show = await loadShowForAdvance(showId);
  if (!show) return null;
  const recipients = await loadRecipients(showId);
  const saved = normalizeAdvanceVars(varsInput);
  const rendered = await renderForShow(show, recipients, saved);
  await upsertShowAdvance(showId, rendered, saved);
  return getShowAdvanceState(showId);
}

export interface SendAdvanceResult {
  sentCount: number;
  skipped: string[];
}

// Sends the group advance to the lineup, records the send, and marks the show
// advanced. Throws if the show is gone or no recipient has an email.
export async function sendShowAdvance(
  showId: number,
  varsInput: unknown
): Promise<SendAdvanceResult> {
  const show = await loadShowForAdvance(showId);
  if (!show) throw new Error('Show not found');
  const recipients = await loadRecipients(showId);

  const withEmail = recipients.filter((r) => r.email);
  const skipped = recipients.filter((r) => !r.email).map((r) => r.name);
  if (withEmail.length === 0) {
    throw new Error('No lineup bands have a contact email set.');
  }

  const saved = normalizeAdvanceVars(varsInput);
  const rendered = await renderForShow(show, recipients, saved);
  // Ensure the row (and its reply token) exists before sending, since the
  // Reply-To carries the token.
  const replyToken = await upsertShowAdvance(showId, rendered, saved);

  const toEmails = withEmail.map((r) => r.email as string);
  const { id: resendId } = await sendAdvanceEmail({
    toEmails,
    subject: rendered.subject,
    html: rendered.html,
    replyToken,
  });

  // Record the send. Not wrapped in a txn with the Resend call: the email has
  // already gone out by here, so we just persist what happened.
  await sql`
    update show_advances
    set status = 'sent', sent_at = now(), updated_at = now()
    where show_id = ${showId}
  `;

  for (const r of withEmail) {
    await sql`
      insert into advance_recipients (show_id, band_id, email)
      values (${showId}, ${r.bandId}, ${r.email})
      on conflict (show_id, band_id) do update set email = excluded.email
    `;
  }

  await sql`
    insert into advance_messages
      (show_id, direction, from_email, to_emails, subject, body_html, resend_id)
    values
      (${showId}, 'outbound', ${process.env.RESEND_ADVANCE_FROM_EMAIL ?? null},
       ${sql.json(toEmails)}, ${rendered.subject}, ${rendered.html}, ${resendId || null})
  `;

  // Keep the legacy boolean (migration 021) in sync so the shows list's
  // "advanced?" indicator reflects reality.
  await sql`update shows set advance_sent = true where id = ${showId}`;

  return { sentCount: toEmails.length, skipped };
}

// ---------------------------------------------------------------------------
// Inbound replies (Resend inbound webhook) + admin replies on the thread.
// ---------------------------------------------------------------------------

// Records a band's reply, delivered by the Resend inbound webhook. The show is
// found by the reply token (from the advance-{token}@... address); the band is
// attributed by matching the sender against the recipients we sent to. Idempotent
// on resendId so webhook retries don't double-insert.
export async function recordInboundReply(input: {
  token: string;
  fromEmail: string;
  toEmails: string[];
  subject: string | null;
  html: string | null;
  text: string | null;
  resendId: string;
}): Promise<{ matched: boolean; deduped: boolean }> {
  const [advance] = await sql<Array<{ show_id: number }>>`
    select show_id from show_advances where reply_token = ${input.token}
  `;
  if (!advance) return { matched: false, deduped: false };
  const showId = Number(advance.show_id);

  // Dedupe webhook retries — but if we already stored this reply WITHOUT a body
  // (e.g. the body wasn't retrievable on the first delivery) and this delivery
  // carries one, backfill it rather than skipping. Resend retries the same event
  // on non-2xx, so this lets a later attempt (or a manual replay) fill the gap.
  const [existing] = await sql<
    Array<{ id: number; body_html: string | null; body_text: string | null }>
  >`
    select id, body_html, body_text from advance_messages
    where resend_id = ${input.resendId} limit 1
  `;
  if (existing) {
    const hadBody = existing.body_html || existing.body_text;
    const haveBody = input.html || input.text;
    if (!hadBody && haveBody) {
      await sql`
        update advance_messages
        set body_html = ${input.html}, body_text = ${input.text}
        where id = ${existing.id}
      `;
    }
    return { matched: true, deduped: true };
  }

  const sender = extractEmailAddress(input.fromEmail);
  const [recip] = await sql<Array<{ band_id: number }>>`
    select band_id from advance_recipients
    where show_id = ${showId} and lower(email) = ${sender}
    limit 1
  `;
  const bandId = recip ? Number(recip.band_id) : null;

  await sql`
    insert into advance_messages
      (show_id, band_id, direction, from_email, to_emails, subject, body_html, body_text, resend_id)
    values
      (${showId}, ${bandId}, 'inbound', ${input.fromEmail}, ${sql.json(input.toEmails)},
       ${input.subject}, ${input.html}, ${input.text}, ${input.resendId})
  `;

  if (bandId !== null) {
    await sql`
      update advance_recipients
      set responded_at = now()
      where show_id = ${showId} and band_id = ${bandId} and responded_at is null
    `;
  }

  return { matched: true, deduped: false };
}

// Sends an admin reply on an existing advance thread — to the same lineup, with
// the same Reply-To token so bands' replies keep threading back. Requires the
// advance to have been sent already.
export async function sendShowAdvanceReply(
  showId: number,
  bodyMarkdown: string
): Promise<{ sentCount: number }> {
  const text = bodyMarkdown.trim();
  if (!text) throw new Error('Reply body is empty.');

  const [advance] = await sql<Array<{ reply_token: string; subject: string; status: string }>>`
    select reply_token, subject, status from show_advances where show_id = ${showId}
  `;
  if (!advance) throw new Error('No advance has been started for this show.');
  if (advance.status !== 'sent') throw new Error('Send the advance before replying on the thread.');

  const recipients = await loadRecipients(showId);
  const toEmails = recipients.map((r) => r.email).filter((e): e is string => !!e);
  if (toEmails.length === 0) throw new Error('No lineup bands have a contact email set.');

  const html = await renderReplyHtml(text);
  const subject = advance.subject.startsWith('Re:') ? advance.subject : `Re: ${advance.subject}`;

  const { id: resendId } = await sendAdvanceEmail({
    toEmails,
    subject,
    html,
    replyToken: advance.reply_token,
  });

  await sql`
    insert into advance_messages
      (show_id, direction, from_email, to_emails, subject, body_html, body_text, resend_id)
    values
      (${showId}, 'outbound', ${process.env.RESEND_ADVANCE_FROM_EMAIL ?? null},
       ${sql.json(toEmails)}, ${subject}, ${html}, ${text}, ${resendId || null})
  `;

  return { sentCount: toEmails.length };
}
