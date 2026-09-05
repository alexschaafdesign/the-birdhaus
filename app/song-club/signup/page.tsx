import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import ClubSignupForm from '@/components/club/ClubSignupForm';
import SongClubLogo from '@/components/club/SongClubLogo';

export const metadata: Metadata = {
  title: 'Song Club — sign up',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ClubSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if ((await isAdminSession()) || (await getClubPortalMember())) redirect('/song-club');
  const rawNext = (await searchParams).next;
  const next = rawNext && rawNext.startsWith('/song-club/') ? rawNext : undefined;
  const loginHref = next ? `/song-club/login?next=${encodeURIComponent(next)}` : '/song-club/login';

  return (
    <main className="mx-auto w-full max-w-sm px-5 py-10 text-[#E8E0D0] sm:py-14">
      <div className="mb-4">
        <SongClubLogo className="h-20 w-20" />
      </div>
      <h1 className="text-2xl font-semibold">Join Song Club</h1>
      <p className="mt-1 text-sm text-[#E8E0D0]/60">
        Sign up to see the club, then unlock the events you took part in.
      </p>
      <div className="mt-6">
        <ClubSignupForm next={next} />
      </div>
      <div className="mt-6 border-t border-[#E8E0D0]/10 pt-5 text-center">
        <p className="text-sm text-[#E8E0D0]/60">Already a member?</p>
        <Link
          href={loginHref}
          className="mt-2 block w-full rounded-md border border-[#E8E0D0]/30 px-4 py-2.5 text-sm font-semibold text-[#E8E0D0] transition hover:border-[#E8E0D0]/60 hover:bg-[#E8E0D0]/[0.06]"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
