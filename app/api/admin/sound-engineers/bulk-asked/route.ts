import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { addAskedEngineerToShows } from '@/lib/sound-engineers';
import { requireAdmin } from '@/lib/admin-session';

// Bulk "asked this engineer about these dates" — powers the shows-list select
// action so the operator can log one outreach across many shows at once instead
// of opening each show form. Adds an 'asked' relationship per show, skipping any
// show where the engineer already has a status (see addAskedEngineerToShows).
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'An engineer name is required.' }, { status: 400 });
  }

  const rawIds = Array.isArray(body?.showIds) ? body.showIds : null;
  if (!rawIds || rawIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one show.' }, { status: 400 });
  }
  const showIds = rawIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id));
  if (showIds.length === 0) {
    return NextResponse.json({ error: 'No valid shows selected.' }, { status: 400 });
  }

  const result = await sql.begin((tx) => addAskedEngineerToShows(name, showIds, tx));
  return NextResponse.json({
    engineer: result.engineer,
    added: result.added,
    // How many selected shows already had this engineer, so the UI can say
    // "3 added, 2 already asked".
    skipped: showIds.length - result.added,
  });
}
