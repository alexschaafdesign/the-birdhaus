import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionAccount } from '@/lib/accounts/members';
import { isAdminSession } from '@/lib/admin-session';
import { SONGHAUS_URL } from '@/lib/site';
import { SiteFrame } from '@/components/night/SiteFrame';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FORM } from '@/components/night/form';
import LoginForm from '@/components/account/LoginForm';

// Birdhaus login: crew, staff and photographers. Song Club members and
// workspace songwriters log in on Songhaus now: the page says so, and the
// login route answers their correct password with a link there instead of a
// session.

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
    <SiteFrame stats={null}>
      <h1 className="sr-only">Log in</h1>
      <section aria-labelledby="login" className="flex w-full max-w-sm flex-col gap-4">
        <SectionHeader id="login" label="Log in" rule="none" />
        <p className="text-body-3 leading-normal">For crew, photographers, and staff.</p>
        {signedIn && (
          <p className={FORM.notice} role="status">
            You&apos;re signed in as {signedIn.name}, but your account doesn&apos;t include admin
            access. Ask an admin to add the Staff role on the Crew page.
          </p>
        )}
        <LoginForm />
        <p className="text-body-3 leading-normal">
          Song Club member? Song Club is now Songhaus, and your account moved with it:{' '}
          <a href={`${SONGHAUS_URL}/login`} className={FORM.link}>
            log in at thesonghaus.org
          </a>
          .
        </p>
      </section>
    </SiteFrame>
  );
}
