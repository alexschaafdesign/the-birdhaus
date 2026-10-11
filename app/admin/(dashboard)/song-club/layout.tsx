import SongClubFrozen from '@/components/admin/SongClubFrozen';

// Every /admin/song-club page is read-only while Song Club admin lives in
// Songhaus (lib/song-club-freeze.ts).
export default function SongClubAdminLayout({ children }: { children: React.ReactNode }) {
  return <SongClubFrozen bannerClassName="mx-auto w-full max-w-6xl px-6 pt-6">{children}</SongClubFrozen>;
}
