import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getClubMember } from '@/lib/club-members';
import AccountSettings from '@/components/club/AccountSettings';

// Account settings for crew, staff and photographers, linked from the header
// user menu. Any logged-in user can reach it.
export const metadata: Metadata = {
  title: 'The Birdhaus — account',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const member = await getClubMember();
  if (!member) redirect('/login');

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8 text-[#E8E0D0] sm:py-10">
      <h1 className="text-2xl font-semibold">Your account</h1>
      <div className="mt-6">
        <AccountSettings member={member} />
      </div>
    </main>
  );
}
