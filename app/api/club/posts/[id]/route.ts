import { NextResponse } from 'next/server';
import { getClubMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { deletePost, getPosts } from '@/lib/club-board';

// Members can delete their own posts; the admin can delete any.
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

  const deleted = await deletePost(id, by);
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ posts: await getPosts(deleted.eventId) });
}
