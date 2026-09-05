import { NextResponse } from 'next/server';
import { getClubMember } from '@/lib/club-members';
import { splitName } from '@/lib/name';

// Lightweight "who am I" for the site header's auth area. Fetched client-side so
// the header can show a Log in button vs. a user menu without forcing every
// static page to render dynamically. Returns { member: null } when logged out.
export async function GET() {
  const member = await getClubMember();
  if (!member) return NextResponse.json({ member: null });

  // crew/staff hold the admin cookie and land on /admin; surface that so the
  // menu can offer a Dashboard link.
  const canAdmin = member.roles.includes('crew') || member.roles.includes('staff');
  return NextResponse.json({
    member: {
      name: member.name,
      firstName: splitName(member.name).firstName || member.name,
      avatarUrl: member.avatar_url,
      canAdmin,
    },
  });
}
