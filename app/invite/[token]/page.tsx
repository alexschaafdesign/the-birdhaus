import type { Metadata } from 'next';
import Link from 'next/link';
import { getMemberBySetupToken } from '@/lib/club-members';
import ClubSetPasswordForm from '@/components/club/ClubSetPasswordForm';

export const metadata: Metadata = {
  title: 'Set your password',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// The emailed set-password link for Birdhaus accounts (crew invites and
// Birdhaus password resets). Same single-use tokens as the portal's
// /song-club/invite page, but it lives on the main site and accepts through
// /api/account/invite, so crew links never route through the portal.
export default async function AccountInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const member = await getMemberBySetupToken(token);

  if (!member) {
    return (
      <main className="mx-auto w-full max-w-sm px-5 py-10 text-[#E8E0D0] sm:py-14">
        <h1 className="text-2xl font-semibold">Set your password</h1>
        <p className="mt-3 text-sm text-[#E8E0D0]/70">
          This link is invalid or has expired — these links are single-use.
        </p>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          If you already picked a password,{' '}
          <Link href="/login" className="underline underline-offset-2 hover:text-white">
            log in here
          </Link>
          . Otherwise use “Forgot password?” on that page, or ask Alex for a
          fresh invite.
        </p>
      </main>
    );
  }

  const returning = member.has_password;
  return (
    <main className="mx-auto w-full max-w-sm px-5 py-10 text-[#E8E0D0] sm:py-14">
      <h1 className="text-2xl font-semibold">
        {returning ? 'Set a new password' : `Welcome, ${member.name.split(' ')[0]}!`}
      </h1>
      <p className="mt-1 text-sm text-[#E8E0D0]/60">
        {returning
          ? `Pick a new password for ${member.email}.`
          : `Pick a password for ${member.email} to get into the Birdhaus admin.`}
      </p>
      <div className="mt-6">
        <ClubSetPasswordForm token={token} endpoint={`/api/account/invite/${token}`} />
      </div>
    </main>
  );
}
