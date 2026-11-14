import { sql } from '../db';
import { addDays, chicagoDate, startOfChicagoDay, type Reason } from './availability.ts';
import { clashesFor } from './availability-data';
import { bookingsByIds, syncSeriesStatus, type AdminBooking } from './decisions';
import { sendExpiredEmail, sendMorningEmail, sendReminderEmail, sendSeriesSkipEmail } from './emails';
import { extendSeries } from './series-extend';
import { getRehearsalSettings } from './settings';

// The rehearsal daily job (Vercel Cron ~7am Chicago, production only; admin
// "Run now" anywhere). Every step is safe to repeat: each email records when
// it went out, and Alex's morning email goes once per Chicago day unless
// forced from "Run now".
//
//  1. Expire pending requests past their expiry (or whose session started)
//     and tell each band once.
//  1b. Keep approved series going: book their dates that came into the
//     window (confirmed), skip ones that aren't open, tell those bands once.
//  2. Remind bands the day before a confirmed session.
//  3. Flag confirmed bookings a show / Not-available day / blackout / busy time
//     now lands on (never cancel); clear flags that no longer apply.
//  4. Email Alex: today's and tomorrow's sessions with gear, new conflicts.

export interface DailySummary {
  day: string;
  expired: number;
  expiryEmails: number;
  reminders: number;
  newConflicts: number;
  clearedConflicts: number;
  morningEmail: 'sent' | 'already sent today' | 'nothing to say' | 'failed';
  calendarChecked: boolean;
  seriesBooked: number;
  seriesSkipped: number;
}

function group<T>(list: T[], key: (t: T) => string): T[][] {
  const m = new Map<string, T[]>();
  for (const t of list) m.set(key(t), [...(m.get(key(t)) ?? []), t]);
  return [...m.values()];
}

export async function runDaily(opts: { now?: Date; force?: boolean } = {}): Promise<DailySummary> {
  const now = opts.now ?? new Date();
  const settings = await getRehearsalSettings();
  const day = chicagoDate(now);
  const tomorrowStart = startOfChicagoDay(addDays(day, 1));
  const dayAfterStart = startOfChicagoDay(addDays(day, 2));
  const todayStart = startOfChicagoDay(day);

  // 1. Expire. Only requests from the last 30 days get an email (no backlog spam).
  const expiredRows = await sql<{ id: number }[]>`
    update rehearsal_bookings set status = 'expired', updated_at = now()
    where status = 'pending' and (expires_at <= ${now} or starts_at <= ${now})
    returning id::int as id
  `;
  await syncSeriesStatus(expiredRows.map((r) => r.id));
  const toTell = await sql<{ id: number; bandId: number; requestKey: string | null }[]>`
    select id::int as id, band_id::int as "bandId", request_key as "requestKey"
    from rehearsal_bookings
    where status = 'expired' and expiry_notified_at is null and created_at > ${now} - interval '30 days'
  `;
  let expiryEmails = 0;
  if (settings.lapsedEmailsEnabled) {
    for (const g of group(toTell, (r) => `${r.bandId}:${r.requestKey ?? r.id}`)) {
      if (await sendExpiredEmail(g.map((r) => r.id))) expiryEmails += 1;
    }
  } else if (toTell.length) {
    // Switched off: count them as told, so turning it back on doesn't send old ones.
    await sql`update rehearsal_bookings set expiry_notified_at = now() where id in ${sql(toTell.map((r) => r.id))}`;
  }

  // 1b. Extend approved series, then tell bands about any skipped dates
  // (including ones skipped when a series was approved) once.
  const ext = await extendSeries({ now });
  const unnotified = await sql<{ seriesId: number; bandId: number; bandName: string; start: Date; minutes: number }[]>`
    select k.series_id::int as "seriesId", s.band_id::int as "bandId", b.name as "bandName",
           k.starts_at as start, coalesce(s.block_minutes, 180) as minutes
    from rehearsal_series_skips k
    join rehearsal_series s on s.id = k.series_id
    join rehearsal_bands b on b.id = s.band_id
    where k.notified_at is null and k.starts_at > ${now}
    order by k.starts_at
  `;
  for (const g of group(unnotified, (r) => String(r.bandId))) {
    const sessions = g.map((r) => ({ start: r.start, end: new Date(r.start.getTime() + r.minutes * 60_000) }));
    if (await sendSeriesSkipEmail(g[0].bandId, sessions)) {
      for (const r of g) {
        await sql`update rehearsal_series_skips set notified_at = now() where series_id = ${r.seriesId} and starts_at = ${r.start}`;
      }
    }
  }
  const bookedRows = await bookingsByIds(
    (
      await sql<{ id: number }[]>`
        select id::int as id from rehearsal_bookings where catalogue_id in ${sql(ext.booked.map((b) => b.catalogueId).concat(['-']))}
      `
    ).map((r) => r.id),
  );

  // 2. Day-before reminders, one email per band.
  const due = await sql<{ id: number; bandId: number }[]>`
    select id::int as id, band_id::int as "bandId" from rehearsal_bookings
    where status = 'confirmed' and reminder_sent_at is null
      and starts_at >= ${tomorrowStart} and starts_at < ${dayAfterStart}
  `;
  let reminders = 0;
  if (settings.reminderEmailsEnabled) {
    for (const g of group(due, (r) => String(r.bandId))) {
      if (await sendReminderEmail(g.map((r) => r.id))) reminders += 1;
    }
  }

  // 3. Conflicts on upcoming confirmed bookings.
  const upcomingIds = await sql<{ id: number }[]>`
    select id::int as id from rehearsal_bookings where status = 'confirmed' and ends_at > ${now}
  `;
  const upcoming = await bookingsByIds(upcomingIds.map((r) => r.id));
  const { reasons, calendarChecked } = await clashesFor(upcoming, now);
  const newConflicts: Array<{ booking: AdminBooking; reasons: Reason[] }> = [];
  let clearedConflicts = 0;
  for (const b of upcoming) {
    const r = reasons.get(b.id);
    if (r) {
      await sql`
        update rehearsal_bookings
        set conflict = true, conflict_reason = ${r.join(',')},
            conflict_flagged_at = coalesce(conflict_flagged_at, ${now}), updated_at = now()
        where id = ${b.id}
      `;
      if (!b.conflict) newConflicts.push({ booking: { ...b, conflict: true }, reasons: r });
    } else if (b.conflict && calendarChecked) {
      // Only clear when the calendar was readable, so a feed outage can't
      // silently drop a busy-time conflict.
      await sql`
        update rehearsal_bookings
        set conflict = false, conflict_reason = '', conflict_flagged_at = null, conflict_notified_at = null,
            updated_at = now()
        where id = ${b.id}
      `;
      clearedConflicts += 1;
    }
  }
  // Also tell Alex about flags raised elsewhere (e.g. a blackout he added) that he
  // hasn't been emailed about yet.
  for (const b of upcoming) {
    if (b.conflict && !newConflicts.some((c) => c.booking.id === b.id) && reasons.get(b.id)) {
      const [row] = await sql<{ notified: boolean }[]>`
        select conflict_notified_at is not null as notified from rehearsal_bookings where id = ${b.id}
      `;
      if (row && !row.notified) newConflicts.push({ booking: b, reasons: reasons.get(b.id)! });
    }
  }

  // 4. Alex's morning email, once per Chicago day.
  const [claimed] = await sql<{ day: string }[]>`
    insert into rehearsal_daily_runs (day) values (${day}::date)
    on conflict (day) do nothing
    returning day::text as day
  `;
  const today = upcoming.filter((b) => b.startsAt >= todayStart && b.startsAt < tomorrowStart);
  // `upcoming` excludes sessions that already ended today; fetch them too.
  const endedToday = await sql<{ id: number }[]>`
    select id::int as id from rehearsal_bookings
    where status = 'confirmed' and starts_at >= ${todayStart} and ends_at <= ${now}
  `;
  const todayAll = [...(await bookingsByIds(endedToday.map((r) => r.id))), ...today].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  const tomorrow = upcoming.filter((b) => b.startsAt >= tomorrowStart && b.startsAt < dayAfterStart);
  const [{ outstanding }] = await sql<{ outstanding: number }[]>`
    select coalesce(sum(price_cents), 0)::int as outstanding from rehearsal_bookings
    where status = 'confirmed' and payment_status = 'unpaid' and starts_at <= ${now}
  `;

  let morningEmail: DailySummary['morningEmail'];
  if (!claimed && !opts.force) morningEmail = 'already sent today';
  else if (
    !todayAll.length &&
    !tomorrow.length &&
    !newConflicts.length &&
    !expiredRows.length &&
    !bookedRows.length &&
    !unnotified.length
  )
    morningEmail = 'nothing to say';
  else {
    const ok = await sendMorningEmail({
      today: todayAll,
      tomorrow,
      newConflicts,
      expired: expiredRows.length,
      outstandingCents: outstanding,
      paymentsEnabled: settings.paymentsEnabled,
      calendarChecked,
      seriesBooked: bookedRows.map((b) => ({ bandName: b.bandName, start: b.startsAt, end: b.endsAt, catalogueId: b.catalogueId })),
      seriesSkipped: unnotified.map((r) => ({
        bandName: r.bandName,
        start: r.start,
        end: new Date(r.start.getTime() + r.minutes * 60_000),
      })),
    });
    morningEmail = ok ? 'sent' : 'failed';
    // Let the next run try again.
    if (!ok && claimed) await sql`delete from rehearsal_daily_runs where day = ${day}::date`;
  }

  const summary: DailySummary = {
    day,
    expired: expiredRows.length,
    expiryEmails,
    reminders,
    newConflicts: newConflicts.length,
    clearedConflicts,
    morningEmail,
    calendarChecked,
    seriesBooked: ext.booked.length,
    seriesSkipped: unnotified.length,
  };
  if (morningEmail !== 'failed') await sql`update rehearsal_daily_runs set summary = ${sql.json(summary as unknown as Record<string, string>)} where day = ${day}::date`;
  return summary;
}
