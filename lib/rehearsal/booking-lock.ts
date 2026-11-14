import type { TransactionSql } from 'postgres';

// Serialises everything that adds rehearsal bookings (band requests, the
// daily series extension), so the turnover buffer — which the DB exclusion
// constraint doesn't know about — can be re-checked safely inside the write
// transaction. Transaction-scoped: released at commit/rollback.
const LOCK_KEY = 'rehearsal-bookings';

export async function lockBookings(tx: TransactionSql): Promise<void> {
  await tx`select pg_advisory_xact_lock(hashtext(${LOCK_KEY}))`;
}

// Does any booking that holds time (confirmed, or pending and not expired)
// overlap [start, end) widened by the buffer on both sides?
export async function bufferClash(tx: TransactionSql, start: Date, end: Date, bufferMinutes: number, now: Date): Promise<boolean> {
  const from = new Date(start.getTime() - bufferMinutes * 60_000);
  const to = new Date(end.getTime() + bufferMinutes * 60_000);
  const [row] = await tx<{ n: number }[]>`
    select count(*)::int as n
    from rehearsal_bookings
    where (status = 'confirmed' or (status = 'pending' and expires_at > ${now}))
      and starts_at < ${to} and ends_at > ${from}
  `;
  return row.n > 0;
}
