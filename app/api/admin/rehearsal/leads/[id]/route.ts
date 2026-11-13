import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { inviteLead, setLeadStatus } from '@/lib/rehearsal/leads';
import { sendInviteEmail } from '@/lib/rehearsal/emails';

// Lead actions: invite (creates the band + link and emails it), archive, restore.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  const action = (await request.json().catch(() => null))?.action;
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  if (action === 'invite') {
    const r = await inviteLead(id);
    if (!r) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    const emailed = await sendInviteEmail(r.bandId);
    return NextResponse.json({ ok: true, bandId: r.bandId, emailed });
  }
  if (action === 'archive' || action === 'restore') {
    const ok = await setLeadStatus(id, action === 'archive' ? 'archived' : 'new');
    if (!ok) return NextResponse.json({ error: 'Invited leads stay as they are.' }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
