import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { sendInviteEmail } from '@/lib/rehearsal/emails';

// Email a band its private booking link (the invite email).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const ok = await sendInviteEmail(id);
  if (!ok) return NextResponse.json({ error: 'No active link, or the email didn’t send.' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
