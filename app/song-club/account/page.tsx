import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getClubMember } from '@/lib/club-members';
import AccountSettings from '@/components/club/AccountSettings';
import ClubTopBar from '@/components/club/ClubTopBar';

export const metadata: Metadata = {
  title: 'Song Club — account',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// Any logged-in user (member, crew, staff) can manage their own account.
export default async function ClubAccountPage() {
  const member = await getClubMember();
  if (!member) redirect('/song-club/login');

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8 text-[#E8E0D0] sm:py-10">
      <ClubTopBar />
      <h1 className="mt-3 text-2xl font-semibold">Your account</h1>
      <div className="mt-6">
        <AccountSettings member={member} />
      </div>
    </main>
  );
}
