import type { Metadata } from 'next';
import Link from 'next/link';
import { getMemberBySetupToken } from '@/lib/club-members';
import ClubSetPasswordForm from '@/components/club/ClubSetPasswordForm';

export const metadata: Metadata = {
  title: 'Join Song Club',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// The emailed set-password link — used by both fresh invites and password
// resets (same single-use token machinery).
export default async function ClubInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { token } = await params;
  const rawNext = (await searchParams).next;
  const next = rawNext && rawNext.startsWith('/song-club/') ? rawNext : undefined;
  const member = await getMemberBySetupToken(token);

  if (!member) {
    return (
      <main className="mx-auto w-full max-w-sm px-5 py-10 text-[#E8E0D0] sm:py-14">
        <h1 className="text-2xl font-semibold">Song Club portal</h1>
        <p className="mt-3 text-sm text-[#E8E0D0]/70">
          This link is invalid or has expired — invite links are single-use.
        </p>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          If you already picked a password,{' '}
          <Link href="/song-club/login" className="underline underline-offset-2 hover:text-white">
            log in here
          </Link>
          . Otherwise use “Forgot password?” on that page, or ask Alex for a
          fresh invite.
        </p>
      </main>
    );
  }

  const returning = member.has_password;
  // A crew/staff account (no song_club role) is joining the admin, not the
  // portal — word the invite line accordingly.
  const isCrew = !member.roles.includes('song_club');
  const joinLine = isCrew
    ? `Pick a password for ${member.email} to get into the Birdhaus admin.`
    : `Pick a password for ${member.email} to join the Song Club portal.`;
  return (
    <main className="mx-auto w-full max-w-sm px-5 py-10 text-[#E8E0D0] sm:py-14">
      <h1 className="text-2xl font-semibold">
        {returning ? 'Set a new password' : `Welcome, ${member.name.split(' ')[0]}!`}
      </h1>
      <p className="mt-1 text-sm text-[#E8E0D0]/60">
        {returning ? `Pick a new password for ${member.email}.` : joinLine}
      </p>
      <div className="mt-6">
        <ClubSetPasswordForm token={token} next={next} />
      </div>
    </main>
  );
}
