import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getClubPortalMember } from '@/lib/club-members';
import ClubSignupForm from '@/components/club/ClubSignupForm';
import SongClubLogo from '@/components/club/SongClubLogo';

export const metadata: Metadata = {
  title: 'Song Club — sign up',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ClubSignupPage() {
  if (await getClubPortalMember()) redirect('/club');

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
        <ClubSignupForm />
      </div>
      <p className="mt-4 text-sm text-[#E8E0D0]/50">
        Already a member?{' '}
        <Link href="/club/login" className="underline underline-offset-2 hover:text-[#E8E0D0]">
          Log in
        </Link>
      </p>
    </main>
  );
}
