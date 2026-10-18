import type { Metadata } from 'next';
import Link from 'next/link';
import { getMemberBySetupToken } from '@/lib/accounts/members';
import { SiteFrame } from '@/components/night/SiteFrame';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FORM } from '@/components/night/form';
import SetPasswordForm from '@/components/account/SetPasswordForm';

export const metadata: Metadata = {
  title: 'Set your password',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// The emailed set-password link for Birdhaus accounts (crew invites and
// Birdhaus password resets), accepted through /api/account/invite.
export default async function AccountInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const member = await getMemberBySetupToken(token);

  if (!member) {
    return (
      <SiteFrame stats={null}>
        <h1 className="sr-only">Set your password</h1>
        <section aria-labelledby="set-password" className="text-body-3 flex w-full max-w-sm flex-col gap-3 leading-normal">
          <SectionHeader id="set-password" label="Set your password" rule="none" />
          <p>This link is invalid or has expired — these links are single-use.</p>
          <p>
            If you already picked a password,{' '}
            <Link href="/login" className={FORM.link}>
              log in here
            </Link>
            . Otherwise use “Forgot password?” on that page, or ask Alex for a fresh invite.
          </p>
        </section>
      </SiteFrame>
    );
  }

  const returning = member.has_password;
  const heading = returning ? 'Set a new password' : `Welcome, ${member.name.split(' ')[0]}!`;
  return (
    <SiteFrame stats={null}>
      <h1 className="sr-only">{heading}</h1>
      <section aria-labelledby="set-password" className="flex w-full max-w-sm flex-col gap-4">
        <SectionHeader id="set-password" label={heading} rule="none" />
        <p className="text-body-3 leading-normal break-words">
          {returning
            ? `Pick a new password for ${member.email}.`
            : `Pick a password for ${member.email} to get into the Birdhaus admin.`}
        </p>
        <SetPasswordForm token={token} />
      </section>
    </SiteFrame>
  );
}
