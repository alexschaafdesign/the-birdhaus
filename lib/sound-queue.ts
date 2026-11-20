// "Needs a sound engineer" notices. When a save turns a show's
// needs_sound_engineer flag on (new show, edit, or a postponed night's new
// date), everyone looking after sound coverage — active crew accounts with the
// 'sound_coverage' focus area — gets one email linking to the show's Crew tab.
// The same flag decides what's in their queue (SoundCoverageWidget).
//
// Sends go through getResendClient, so off production they're redirected or
// blocked per lib/staging.ts.

import { sql } from './db';
import { getResendClient } from './email';
import { emailButton, emailDetails, emailDocument, emailP, emailTextFooter, escapeEmail } from './email-layout';
import { claimAlertSlot } from './alerts';
import { getTodayCentral } from './shows';
import { SITE_URL } from './site';

// Flipping the toggle off and on again within this window doesn't re-send.
const RESEND_WINDOW_MS = 15 * 60 * 1000;

function formatDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// Active crew with the sound-coverage focus area, minus whoever made the
// change (no point emailing Ty about a show Ty just flagged).
async function getSoundCoverageRecipients(excludeUserId: number | null) {
  return sql<Array<{ id: number; email: string; name: string }>>`
    select u.id::int as id, u.email, u.name
    from users u
    where u.status = 'active'
      and 'sound_coverage' = any(u.focus_areas)
      and exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'crew')
      and u.id is distinct from ${excludeUserId}
  `;
}

// Call after the save commits (from `after()`), only when the flag went from
// off to on. Re-checks the show so a stale call never emails about a show that
// no longer needs anyone. Errors are logged, never thrown: a failed notice
// must not fail the save.
export async function notifySoundEngineerNeeded(showId: number, actorUserId: number | null): Promise<void> {
  try {
    const [show] = await sql<
      Array<{
        title: string;
        date: string;
        doors_time: string | null;
        show_time: string | null;
        needs_sound_engineer: boolean;
        sound_engineer_name: string | null;
        status: string;
        band_names: string[];
      }>
    >`
      select s.title, s.date::text as date, s.doors_time, s.show_time, s.needs_sound_engineer,
        s.sound_engineer_name, s.status,
        coalesce((
          select array_agg(b.name order by sb.sort_order)
          from show_bands sb join bands b on b.id = sb.band_id
          where sb.show_id = s.id
        ), '{}') as band_names
      from shows s
      where s.id = ${showId}
    `;
    if (!show) return;
    if (!show.needs_sound_engineer || show.sound_engineer_name || show.status !== 'scheduled') return;
    if (show.date < getTodayCentral()) return;

    const recipients = await getSoundCoverageRecipients(actorUserId);
    if (recipients.length === 0) return;

    if (!(await claimAlertSlot(`sound-queue:${showId}`, RESEND_WINDOW_MS))) return;

    const from = process.env.RESEND_FROM_EMAIL;
    if (!from) throw new Error('RESEND_FROM_EMAIL is not set');

    const date = formatDate(show.date);
    const crewUrl = `${SITE_URL}/admin/shows/${showId}/crew`;
    const times = [show.doors_time && `Doors ${show.doors_time}`, show.show_time && `Show ${show.show_time}`]
      .filter(Boolean)
      .join(' · ');
    const lineup = show.band_names.join(', ');
    const subject = `Sound engineer needed: ${show.title} (${date})`;

    const rows: Array<[string, string]> = [
      ['Show', escapeEmail(show.title)],
      ['Date', escapeEmail(date)],
    ];
    if (times) rows.push(['Times', escapeEmail(times)]);
    if (lineup) rows.push(['Lineup', escapeEmail(lineup)]);

    const html = emailDocument({
      variant: 'admin',
      preheader: `${show.title} on ${date} needs a sound engineer.`,
      body:
        emailP(`<strong>This show needs a sound engineer.</strong> It's in your queue on your admin home.`) +
        emailDetails(rows) +
        emailButton(crewUrl, 'Find an engineer') +
        emailP(`Log who you ask and who confirms on the show's Crew tab.`),
    });
    const text =
      [
        'This show needs a sound engineer. It is in your queue on your admin home.',
        '',
        `Show: ${show.title}`,
        `Date: ${date}`,
        times ? `Times: ${times}` : null,
        lineup ? `Lineup: ${lineup}` : null,
        '',
        `Find an engineer: ${crewUrl}`,
      ]
        .filter((l): l is string => l !== null)
        .join('\n') + emailTextFooter('admin');

    const { error } = await getResendClient('sound-engineer-needed').batch.send(
      recipients.map((r) => ({ from, to: r.email, subject, html, text }))
    );
    if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
  } catch (error) {
    console.error('[sound-queue] notify failed', { showId, error });
  }
}
