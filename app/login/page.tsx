import type { Metadata } from 'next';
import { onPortalHost } from '@/lib/portal-host';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getClubMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { cloudinaryTransform } from '@/lib/cloudinary-url';
import { listWorkspacesForUser } from '@/lib/workspaces';
import { PORTAL_SITE_NAME, portalRedirect } from '@/lib/site';
import ClubLoginForm from '@/components/club/ClubLoginForm';

// Neutral, Birdhaus-branded login for everyone who has an account (crew,
// photographers, staff, Song Club members, workspace songwriters). It's the
// same shared login system as /song-club/login — the `users` table and club
// session — just without the Song Club branding, so a crew photographer isn't
// logging in through a Song-Club-looking door. The server decides where to
// land them after login (crew/staff → /admin, members → /song-club,
// workspace-only accounts → their workspace); see /api/club/login. Workspace
// pages also send their unauthenticated visitors here with ?next=/w/....
const LOGO_URL = cloudinaryTransform(
  'https://res.cloudinary.com/defdv9zw7/image/upload/v1780325979/Horiz_mkva70.png',
  768
);

// Shared by both hosts; the portal's root title template adds "· Song Club".
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await onPortalHost()) ? 'Log in' : 'The Birdhaus — log in',
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const rawNext = (await searchParams).next;
  const next =
    rawNext && (rawNext.startsWith('/w/') || rawNext.startsWith('/song-club/'))
      ? rawNext
      : undefined;

  // Send already-authenticated visitors where they belong instead of showing a
  // login form; an explicit, validated `next` wins for anyone with a session.
  // isAdminSession covers crew/staff (they hold the admin cookie). Route by
  // actual role, not workspace access: staff can *view* Yellow Ostrich but
  // must never be *landed* there — a staff session whose admin cookie has
  // lapsed belongs on the login form (to re-mint it → /admin), not funneled
  // into the band workspace. So the band branch checks the real `band` role
  // here, not getBandMember() (which also admits staff).
  // `next` is a validated portal/workspace path; /admin stays on the main site.
  if (await isAdminSession()) redirect(next ? portalRedirect(next) : '/admin');
  const member = await getClubMember();
  if (member && next) redirect(portalRedirect(next));
  if (member?.roles.includes('song_club')) redirect(portalRedirect('/song-club'));
  if (member?.roles.includes('band')) redirect(portalRedirect('/yellow-ostrich'));
  if (member) {
    // No Birdhaus roles at all — an invited outside songwriter. Their
    // workspace is the only place they can go.
    const [workspace] = await listWorkspacesForUser(member.id);
    if (workspace) redirect(portalRedirect(`/w/${workspace.slug}`));
  }

  const portal = await onPortalHost();

  return (
    <main className="mx-auto w-full max-w-sm px-5 py-10 text-[#E8E0D0] sm:py-14">
      <div className="mb-6 flex justify-center">
        {portal ? (
          <p className="text-3xl font-semibold tracking-wide">{PORTAL_SITE_NAME}</p>
        ) : (
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
        )}
      </div>
      <h1 className="text-2xl font-semibold">Log in</h1>
      <p className="mt-1 text-sm text-[#E8E0D0]/60">For crew, photographers, and members.</p>
      <div className="mt-6">
        <ClubLoginForm next={next} />
      </div>
    </main>
  );
}
