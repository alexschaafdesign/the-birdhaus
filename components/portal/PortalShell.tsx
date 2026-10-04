import Link from 'next/link';
import { getClubMember } from '@/lib/club-members';
import { listWorkspacesForUser } from '@/lib/workspaces';
import { SITE_URL } from '@/lib/site';
import PortalLogoutButton from './PortalLogoutButton';

const navLink =
  'text-[#E8E0D0]/70 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline';

// Site chrome for the portal host (Fresh Cuts): wordmark, portal-only nav,
// and a small footer back to the Birdhaus. Replaces the Birdhaus Header there;
// the root layout picks one or the other by host.
export default async function PortalShell({ children }: { children: React.ReactNode }) {
  const member = await getClubMember();
  const workspaces = member ? await listWorkspacesForUser(member.id) : [];

  return (
    <>
      <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 pt-6 pb-2 sm:px-8">
        <Link href="/" className="text-lg font-semibold tracking-wide text-[#E8E0D0]">
          Fresh Cuts
        </Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Link href="/" className={navLink}>
            Home
          </Link>
          <Link href="/#events" className={navLink}>
            Events
          </Link>
          {workspaces.map((w) => (
            <Link key={w.id} href={`/w/${w.slug}`} className={navLink}>
              {workspaces.length === 1 ? 'My songs' : w.name}
            </Link>
          ))}
          {member ? (
            <>
              <Link href="/account" className={navLink}>
                Account
              </Link>
              <PortalLogoutButton className={navLink} />
            </>
          ) : (
            <Link href="/login" className={navLink}>
              Log in
            </Link>
          )}
        </nav>
      </header>
      {children}
      <footer className="mx-auto w-full max-w-3xl px-5 pt-10 pb-8 text-xs text-[#E8E0D0]/40 sm:px-8">
        <a href={SITE_URL} className="underline-offset-2 transition hover:text-[#E8E0D0]/70 hover:underline">
          by Birdhaus
        </a>
      </footer>
    </>
  );
}
