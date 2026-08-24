import { NextResponse } from 'next/server';
import { getClubMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { deletePin, getPins, setPinFeatured } from '@/lib/club-board';

// Admin-only: PATCH { featured: boolean } promotes/demotes a pin in the
// featured block at the top of the portal.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.featured !== 'boolean') {
    return NextResponse.json({ error: 'featured must be true or false' }, { status: 400 });
  }
  if (!(await setPinFeatured(id, body.featured))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ pins: await getPins() });
}

// Members can remove their own pins; the admin can remove any.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const member = await getClubMember();
  const by = member
    ? { memberId: member.id }
    : (await isAdminSession())
      ? { admin: true as const }
      : null;
  if (!by) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await deletePin(id, by))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ pins: await getPins() });
}
