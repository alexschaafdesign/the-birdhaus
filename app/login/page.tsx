import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getSessionAccount } from '@/lib/accounts/members';
import { isAdminSession } from '@/lib/admin-session';
import { cloudinaryTransform } from '@/lib/cloudinary-url';
import { SONGHAUS_URL } from '@/lib/site';
import LoginForm from '@/components/account/LoginForm';

// Birdhaus login: crew, staff and photographers. Song Club members and
// workspace songwriters log in on Songhaus now: the page says so, and the
// login route answers their correct password with a link there instead of a
// session.
const LOGO_URL = cloudinaryTransform(
  'https://res.cloudinary.com/defdv9zw7/image/upload/v1780325979/Horiz_mkva70.png',
  768
);

export const metadata: Metadata = {
  title: 'The Birdhaus — log in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // Already signed in with admin access (staff): straight to /admin. A crew
  // account without staff has no admin cookie, so /admin sends it here:
  // redirecting it back would loop, so it gets the form and a note instead.
  // (A leftover session from a former Song Club member reads as signed out.)
  if (await isAdminSession()) redirect('/admin');
  const signedIn = await getSessionAccount();

  return (
    <main className="mx-auto w-full max-w-sm px-5 py-10 text-[#E8E0D0] sm:py-14">
      <div className="mb-6 flex justify-center">
        <Image
          src={LOGO_URL}
          alt="The Birdhaus"
          width={0}
          height={0}
          sizes="280px"
          priority
          unoptimized
          className="h-auto w-full max-w-[280px]"
        />
      </div>
      <h1 className="text-2xl font-semibold">Log in</h1>
      {signedIn && (
        <p className="mt-3 rounded-lg border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.04] p-3 text-sm text-[#E8E0D0]/80">
          You&apos;re signed in as {signedIn.name}, but your account doesn&apos;t include admin
          access. Ask an admin to add the Staff role on the Crew page.
        </p>
      )}
      <p className="mt-1 text-sm text-[#E8E0D0]/60">For crew, photographers, and staff.</p>
      <div className="mt-6">
        <LoginForm />
      </div>
      <p className="mt-6 text-sm text-[#E8E0D0]/60">
        Song Club member? Song Club is now Songhaus, and your account moved with it:{' '}
        <a href={`${SONGHAUS_URL}/login`} className="underline underline-offset-2 hover:text-[#E8E0D0]">
          log in at thesonghaus.org
        </a>
        .
      </p>
    </main>
  );
}
