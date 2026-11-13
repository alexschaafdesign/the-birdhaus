import { sql } from '../db';
import { addDays, chicagoDate, startOfChicagoDay, type Reason } from './availability.ts';
import { clashesFor } from './availability-data';
import { bookingsByIds, syncSeriesStatus, type AdminBooking } from './decisions';
import { sendExpiredEmail, sendMorningEmail, sendReminderEmail } from './emails';

// The rehearsal daily job (Vercel Cron ~7am Chicago, production only; admin
// "Run now" anywhere). Every step is safe to repeat: each email records when
// it went out, and Alex's morning email goes once per Chicago day unless
// forced from "Run now".
//
//  1. Expire pending requests past their expiry (or whose session started)
//     and tell each band once.
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
}

function group<T>(list: T[], key: (t: T) => string): T[][] {
  const m = new Map<string, T[]>();
  for (const t of list) m.set(key(t), [...(m.get(key(t)) ?? []), t]);
  return [...m.values()];
}

export async function runDaily(opts: { now?: Date; force?: boolean } = {}): Promise<DailySummary> {
  const now = opts.now ?? new Date();
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
  for (const g of group(toTell, (r) => `${r.bandId}:${r.requestKey ?? r.id}`)) {
    if (await sendExpiredEmail(g.map((r) => r.id))) expiryEmails += 1;
  }

  // 2. Day-before reminders, one email per band.
  const due = await sql<{ id: number; bandId: number }[]>`
    select id::int as id, band_id::int as "bandId" from rehearsal_bookings
    where status = 'confirmed' and reminder_sent_at is null
      and starts_at >= ${tomorrowStart} and starts_at < ${dayAfterStart}
  `;
  let reminders = 0;
  for (const g of group(due, (r) => String(r.bandId))) {
    if (await sendReminderEmail(g.map((r) => r.id))) reminders += 1;
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
  else if (!todayAll.length && !tomorrow.length && !newConflicts.length && !expiredRows.length) morningEmail = 'nothing to say';
  else {
    const ok = await sendMorningEmail({
      today: todayAll,
      tomorrow,
      newConflicts,
      expired: expiredRows.length,
      outstandingCents: outstanding,
      calendarChecked,
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
  };
  if (morningEmail !== 'failed') await sql`update rehearsal_daily_runs set summary = ${sql.json(summary as unknown as Record<string, string>)} where day = ${day}::date`;
  return summary;
}
