import type { Metadata } from 'next';
import Link from 'next/link';
import { listMembers } from '@/lib/club-members';

import ClubMembersList from '@/components/admin/ClubMembersList';

export const metadata: Metadata = {
  title: 'Song Club members',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminClubMembersPage() {
  const members = await listMembers();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8 text-[#E8E0D0]">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/admin/song-club"
            className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
          >
            ← Song Club
          </Link>
          <h2 className="mt-1 text-xl font-medium">Portal members</h2>
        </div>
        <Link
          href="/club"
          className="rounded-md border border-[#E8E0D0]/30 px-3.5 py-1.5 text-sm text-[#E8E0D0]/80 transition hover:border-[#E8E0D0]/60 hover:text-[#E8E0D0]"
        >
          Open the portal →
        </Link>
      </div>

      <ClubMembersList initialMembers={members} />
    </main>
  );
}
