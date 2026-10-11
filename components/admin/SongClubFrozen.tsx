import { SONG_CLUB_ADMIN_FROZEN } from '@/lib/song-club-freeze';
import SongClubFrozenBanner from './SongClubFrozenBanner';

// Wraps Song Club admin UI while it's frozen: the banner, then the content in
// a disabled fieldset, which disables every button, input, select and
// textarea inside it. Links still work, so the pages stay browsable.
export default function SongClubFrozen({
  children,
  bannerClassName,
  href,
}: {
  children: React.ReactNode;
  bannerClassName?: string;
  href?: string;
}) {
  if (!SONG_CLUB_ADMIN_FROZEN) return <>{children}</>;
  return (
    <>
      <div className={bannerClassName}>
        <SongClubFrozenBanner href={href} />
      </div>
      <fieldset
        disabled
        className="contents [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 [&_input:disabled]:opacity-60 [&_select:disabled]:opacity-60 [&_textarea:disabled]:opacity-60"
      >
        {children}
      </fieldset>
    </>
  );
}
