import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getBandMember, getClubPortalMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { cloudinaryTransform } from '@/lib/cloudinary-url';
import ClubLoginForm from '@/components/club/ClubLoginForm';

// Neutral, Birdhaus-branded login for everyone who has an account (crew,
// photographers, staff, Song Club members). It's the same shared login system
// as /song-club/login — the `users` table and club session — just without the
// Song Club branding, so a crew photographer isn't logging in through a
// Song-Club-looking door. The server decides where to land them after login
// (crew/staff → /admin, members → /song-club); see /api/club/login.
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
  // Send already-authenticated visitors where they belong instead of showing a
  // login form. isAdminSession covers crew/staff (they hold the admin cookie).
  if (await isAdminSession()) redirect('/admin');
  if (await getClubPortalMember()) redirect('/song-club');
  if (await getBandMember()) redirect('/yellow-ostrich');

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
      <p className="mt-1 text-sm text-[#E8E0D0]/60">For crew, photographers, and members.</p>
      <div className="mt-6">
        <ClubLoginForm />
      </div>
    </main>
  );
}
