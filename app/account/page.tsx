import type { Metadata } from 'next';
import { onPortalHost } from '@/lib/portal-host';
import { redirect } from 'next/navigation';
import { getClubMember } from '@/lib/club-members';
import AccountSettings from '@/components/club/AccountSettings';

// Neutral, Birdhaus-branded account settings — the same shared AccountSettings
// as /song-club/account, but without the Song Club portal top bar (the site
// header already provides nav). Linked from the header user menu so crew /
// photographers manage their account without going through a Song-Club-branded
// page. Any logged-in user can reach it.
// Shared by both hosts; the portal's root title template adds "· Song Club".
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await onPortalHost()) ? 'Account' : 'The Birdhaus — account',
    robots: { index: false, follow: false },
  };
}

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
