import { NextResponse } from 'next/server';
import { getClubMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { createPost, getPosts } from '@/lib/club-board';

// Post to the club board as the logged-in member, or as "the Birdhaus" when
// the visitor holds the admin session instead. Returns the refreshed thread
// (hub-portal pattern) so the UI can swap it in.
export async function POST(request: Request) {
  const member = await getClubMember();
  const author = member ? member.id : (await isAdminSession()) ? ('admin' as const) : null;
  if (author === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.body === 'string' ? body.body : '';
  if (!(await createPost(author, text))) {
    return NextResponse.json({ error: 'Message is empty' }, { status: 400 });
  }

  return NextResponse.json({ posts: await getPosts() });
}
