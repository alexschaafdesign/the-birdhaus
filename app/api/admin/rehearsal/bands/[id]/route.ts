import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { updateBand, validateNewBand } from '@/lib/rehearsal/bands';

// Edit a band's contact details, notes and archived flag.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Bad band id' }, { status: 400 });
  const body = await request.json().catch(() => null);
  const parsed = validateNewBand(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const ok = await updateBand(id, { ...parsed.value, archived: body?.archived === true });
  if (!ok) return NextResponse.json({ error: 'Band not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
