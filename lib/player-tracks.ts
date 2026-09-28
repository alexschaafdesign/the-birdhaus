// The unit the site-wide player (components/player/GlobalPlayer) plays: just
// enough to stream the audio and label the bottom bar, with a link back to
// wherever the track lives. Keys are namespaced so Song Club tracks and band
// versions can share one queue without id collisions.
import type { ClubTrack } from '@/lib/club-music';
import type { BandSong, BandSongVersion } from '@/lib/band-songs';

export interface PlayerTrack {
  // Globally unique: `club:<trackId>` or `band:<versionId>`.
  key: string;
  url: string;
  title: string;
  subtitle?: string;
  // Where the bar's title links — the page the track "belongs" to.
  href?: string;
  peaks?: number[] | null;
  durationSeconds?: number | null;
}

export function clubTrackToPlayerTrack(t: ClubTrack): PlayerTrack {
  return {
    key: `club:${t.id}`,
    url: t.url,
    title: t.title,
    subtitle: `${t.uploaderName} · Song Club`,
    href: `/song-club/track/${t.id}`,
    peaks: t.peaks,
    durationSeconds: t.durationSeconds,
  };
}

export function bandVersionToPlayerTrack(
  v: BandSongVersion,
  songTitle: string,
  songHref: string
): PlayerTrack {
  return {
    key: `band:${v.id}`,
    url: v.url,
    title: songTitle,
    subtitle: v.label,
    href: songHref,
    peaks: v.peaks,
    durationSeconds: v.durationSeconds,
  };
}

// A song's latest version, for the band list rows' inline play buttons. Null
// when the song has no playable recording yet.
export function bandSongToPlayerTrack(s: BandSong, workspaceSlug: string): PlayerTrack | null {
  if (!s.latestVersionId || !s.latestVersionUrl) return null;
  return {
    key: `band:${s.latestVersionId}`,
    url: s.latestVersionUrl,
    title: s.title,
    subtitle: s.latestVersionLabel ?? undefined,
    href: `/w/${workspaceSlug}/songs/${s.id}`,
  };
}
