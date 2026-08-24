import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getClubMember } from '@/lib/club-members';
import ClubLoginForm from '@/components/club/ClubLoginForm';

export const metadata: Metadata = {
  title: 'Song Club — log in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ClubLoginPage() {
  if (await getClubMember()) redirect('/club');

  return (
    <main className="mx-auto w-full max-w-sm px-5 py-10 text-[#E8E0D0] sm:py-14">
      <h1 className="text-2xl font-semibold">Song Club portal</h1>
      <p className="mt-1 text-sm text-[#E8E0D0]/60">
        Members only. Log in with the account from your invite email.
      </p>
      <div className="mt-6">
        <ClubLoginForm />
      </div>
    </main>
  );
}
