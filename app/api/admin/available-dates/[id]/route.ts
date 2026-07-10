import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dateId = parseId(id);
  if (dateId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  await sql`delete from available_dates where id = ${dateId}`;
  return NextResponse.json({ ok: true });
}
