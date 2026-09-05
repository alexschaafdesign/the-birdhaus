import { NextResponse } from 'next/server';
import { getClubMember } from '@/lib/club-members';
import { updatePhotographerSelf } from '@/lib/photographers';

// Self-serve photographer profile fields (Instagram + bio), scoped to the
// photographer linked to this login. 403 if none is linked.
// PATCH { instagram?, bio? }
export async function PATCH(request: Request) {
  const member = await getClubMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const instagram = typeof body?.instagram === 'string' ? body.instagram.trim() || null : null;
  const bio = typeof body?.bio === 'string' ? body.bio.trim() || null : null;

  const linked = await updatePhotographerSelf(member.id, { instagram, bio });
  if (!linked) {
    return NextResponse.json({ error: 'No photographer profile linked to your account' }, { status: 403 });
  }
  return NextResponse.json({ ok: true, instagram, bio });
}
