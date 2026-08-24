import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import ClubLoginForm from '@/components/club/ClubLoginForm';
import SongClubLogo from '@/components/club/SongClubLogo';

export const metadata: Metadata = {
  title: 'Song Club — log in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ClubLoginPage() {
  // The admin session always counts as being in the club — never show a login
  // prompt to Alex.
  if ((await isAdminSession()) || (await getClubPortalMember())) redirect('/song-club');

  return (
    <main className="mx-auto w-full max-w-sm px-5 py-10 text-[#E8E0D0] sm:py-14">
      <div className="mb-4">
        <SongClubLogo className="h-24 w-24" />
      </div>
      <h1 className="text-2xl font-semibold">Song Club portal</h1>
      <p className="mt-1 text-sm text-[#E8E0D0]/60">Log in to the club.</p>
      <div className="mt-6">
        <ClubLoginForm />
      </div>
      <p className="mt-4 text-sm text-[#E8E0D0]/50">
        New to Song Club?{' '}
        <Link href="/song-club/signup" className="underline underline-offset-2 hover:text-[#E8E0D0]">
          Sign up
        </Link>
      </p>
    </main>
  );
}
