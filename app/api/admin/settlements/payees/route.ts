import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import type { PayeeNameField } from '@/lib/settlements';

const COLUMN_BY_NAME_FIELD: Record<PayeeNameField, string> = {
  photographerName: 'photographer_name',
  soundEngineerName: 'sound_engineer_name',
  doorPersonName: 'door_person_name',
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const role = url.searchParams.get('role') as PayeeNameField | null;
  const q = url.searchParams.get('q')?.trim() ?? '';

  if (!role || !(role in COLUMN_BY_NAME_FIELD)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }
  if (!q) {
    return NextResponse.json([]);
  }

  const column = COLUMN_BY_NAME_FIELD[role];
  // Typeahead path — hit on every keystroke, so keep this cheap.
  const rows = await sql<{ name: string }[]>`
    select distinct ${sql(column)} as name
    from settlements
    where ${sql(column)} ilike ${'%' + q + '%'}
    order by name asc
    limit 8
  `;
  return NextResponse.json(rows.map((r) => r.name));
}
