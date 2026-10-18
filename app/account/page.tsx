import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionAccount } from '@/lib/accounts/members';
import { SiteFrame } from '@/components/night/SiteFrame';
import { SectionHeader } from '@/components/ui/SectionHeader';
import AccountSettings from '@/components/account/AccountSettings';

// Account settings for crew, staff and photographers, linked from the footer
// account slot. Any logged-in user can reach it.
export const metadata: Metadata = {
  title: 'The Birdhaus — account',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const member = await getSessionAccount();
  if (!member) redirect('/login');

  return (
    <SiteFrame stats={null}>
      <h1 className="sr-only">Your account</h1>
      <section aria-labelledby="account" className="flex w-full max-w-md flex-col gap-6">
        <SectionHeader id="account" label="Your account" rule="none" />
        <AccountSettings member={member} />
      </section>
    </SiteFrame>
  );
}
