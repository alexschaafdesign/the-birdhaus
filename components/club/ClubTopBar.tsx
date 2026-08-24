import Link from 'next/link';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import ClubUserMenu from './ClubUserMenu';

// Persistent Song Club bar: logo (home link) + the user menu / admin controls /
// a Log in link. Rendered at the top of each portal page's <main>. Guests see a
// Log in link; there's no separate club layout anymore.
export default async function ClubTopBar() {
  const member = await getClubPortalMember();
  const admin = member ? false : await isAdminSession();

  return (
    <div className="mb-4 border-b border-[#E8E0D0]/10 pb-3">
      <div className="flex items-center justify-between">
        <Link href="/song-club" className="flex items-center gap-2 text-[#E8E0D0]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/song-club-logo.png" alt="" className="h-8 w-8 rounded-full" />
          <span className="text-sm font-semibold tracking-wide">Song Club</span>
        </Link>
        {member ? (
          <ClubUserMenu name={member.name} avatarUrl={member.avatar_url} />
        ) : admin ? (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[#E8E0D0]/60">the Birdhaus (admin)</span>
            <Link
              href="/admin/song-club/members"
              className="text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
            >
              Manage members
            </Link>
          </div>
        ) : (
          <Link
            href="/song-club/login"
            className="rounded-md border border-[#E8E0D0]/30 px-3.5 py-1.5 text-sm font-semibold text-[#E8E0D0] transition hover:border-[#E8E0D0]/60 hover:bg-[#E8E0D0]/[0.06]"
          >
            Log in
          </Link>
        )}
      </div>
    </div>
  );
}
