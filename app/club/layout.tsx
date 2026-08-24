import Link from 'next/link';
import { getClubMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import ClubUserMenu from '@/components/club/ClubUserMenu';

export const dynamic = 'force-dynamic';

// Persistent top bar across every Song Club portal page: the logo (home link)
// on the left, the user menu on the right. Only shown to authenticated
// viewers, so the logged-out login/signup pages (also under /club) keep their
// own standalone layout.
export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  const member = await getClubMember();
  const admin = member ? false : await isAdminSession();
  const showBar = Boolean(member) || admin;

  return (
    <>
      {showBar && (
        <div className="sticky top-0 z-30 border-b border-[#E8E0D0]/10 bg-[#2A2420]/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-2.5 sm:px-8">
            <Link href="/club" className="flex items-center gap-2 text-[#E8E0D0]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/song-club-logo.png"
                alt=""
                className="h-8 w-8 rounded-full"
              />
              <span className="text-sm font-semibold tracking-wide">Song Club</span>
            </Link>
            {member ? (
              <ClubUserMenu name={member.name} avatarUrl={member.avatar_url} />
            ) : (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-[#E8E0D0]/60">the Birdhaus (admin)</span>
                <Link
                  href="/admin/song-club/members"
                  className="text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
                >
                  Manage members
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
      {children}
    </>
  );
}
