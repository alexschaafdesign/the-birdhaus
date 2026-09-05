import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { DATE_OFFER_STATUSES } from '@/lib/date-offers';
import { requireAdmin } from '@/lib/admin-session';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const rows = await sql`select id, submission_id, date::text as date, status, created_at, updated_at from submission_date_offers order by date asc`;
  return NextResponse.json(rows);
}

// Logs (or updates) that a specific submission was contacted about a specific
// date — upserted so re-marking the same submission/date just changes its status.
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const submissionId = Number(body?.submission_id);
  const date = typeof body?.date === 'string' ? body.date : '';
  const status = typeof body?.status === 'string' ? body.status : 'contacted';

  if (!Number.isInteger(submissionId) || !ISO_DATE_RE.test(date) || !DATE_OFFER_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const [row] = await sql`
    insert into submission_date_offers (submission_id, date, status)
    values (${submissionId}, ${date}, ${status})
    on conflict (submission_id, date)
    do update set status = excluded.status, updated_at = now()
    returning id, submission_id, date::text as date, status, created_at, updated_at
  `;

  return NextResponse.json(row, { status: 201 });
}
