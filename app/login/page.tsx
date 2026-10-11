import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getClubMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { cloudinaryTransform } from '@/lib/cloudinary-url';
import { SONGHAUS_URL } from '@/lib/site';
import ClubLoginForm from '@/components/club/ClubLoginForm';

// Birdhaus login: crew, staff and photographers. Song Club members and
// workspace songwriters log in on Songhaus now; an account like that that
// still has a session here is sent there.
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
  // Already signed in: crew/staff (they hold the admin cookie) go to /admin;
  // anyone else with a session belongs on Songhaus.
  if (await isAdminSession()) redirect('/admin');
  if (await getClubMember()) redirect(`${SONGHAUS_URL}/song-club`);

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
      <p className="mt-1 text-sm text-[#E8E0D0]/60">For crew, photographers, and staff.</p>
      <div className="mt-6">
        <ClubLoginForm forgotEndpoint="/api/account/forgot" />
      </div>
    </main>
  );
}
