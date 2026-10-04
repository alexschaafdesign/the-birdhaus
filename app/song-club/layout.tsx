import { portalMetadata } from '@/lib/portal-metadata';

export const metadata = portalMetadata('/song-club');

export default function SongClubLayout({ children }: { children: React.ReactNode }) {
  return children;
}
