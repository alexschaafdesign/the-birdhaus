import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getClubMember } from '@/lib/club-members';
import AccountSettings from '@/components/club/AccountSettings';

export const metadata: Metadata = {
  title: 'Song Club — account',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// Any logged-in user (member, crew, staff) can manage their own account.
export default async function ClubAccountPage() {
  const member = await getClubMember();
  if (!member) redirect('/club/login');

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8 text-[#E8E0D0] sm:py-10">
      <Link href="/club" className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]">
        ← Song Club portal
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Your account</h1>
      <div className="mt-6">
        <AccountSettings member={member} />
      </div>
    </main>
  );
}
