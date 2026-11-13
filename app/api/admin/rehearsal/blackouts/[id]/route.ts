import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { deleteBlackout } from '@/lib/rehearsal/blackouts';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  if (!(await deleteBlackout(id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
