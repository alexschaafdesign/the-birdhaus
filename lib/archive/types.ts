// The 2027 Archive's data model: Night → Sets → Media. The /redesign/archive
// pages only ever see these types. Live nights are adapted from the shows table
// (./live.ts); ?sample nights come from ./fixtures.ts. Neither is a second list
// of nights — the shows table stays the one source.
//
// Media is allowed at BOTH levels because the real data is split that way:
// video is tagged per band (band_videos), while photos and audio are stored per
// show. Night-level media renders once in the night band; set-level media
// renders inside its set block.

// BH: a night at the house (BH-YYMMDD). SAD: a Song-a-day edition (SAD-###),
// which never happens in the house, so its edition number is its id.
export type NightKind = 'bh' | 'sad';

// The index's series filter. FC is a BH night carrying a Fresh Cuts tag, so it
// filters separately from plain BH nights.
export type SeriesFilter = 'bh' | 'fc' | 'sad';

export type Video = {
  /** YouTube id. Absent on ?sample fixtures, which render a still panel. */
  youtube?: string;
  title?: string;
  /** Seconds. Not stored on real videos yet. */
  durationSec?: number;
};

export type Audio = {
  /** Bandcamp album/track page, or the embed URL the show form stores. */
  bandcamp: string;
  title?: string;
};

export type Photo = {
  /** Absent on ?sample fixtures, which render a placeholder tile. */
  url?: string;
  credit?: string;
};

export type SetMedia = {
  /** The set's main player: the first video tagged to its band. */
  video?: Video;
  /** Every further video tagged to the set, listed under the player ("Also
   *  from this set") so none is hidden or misfiled as a full-night video. */
  moreVideos?: Video[];
  audio?: Audio;
  photos?: Photo[];
};

export type NightMedia = {
  /** Videos not tagged to any one band (e.g. a full-night cut). */
  videos?: Video[];
  audio?: Audio[];
  photos?: Photo[];
  /** Cloudinary folder; its photos are fetched on the detail page only. */
  photoFolder?: string;
};

export type ArchiveSet = {
  /** The set's catalogue id, numbered in bill order: "BH-260904-2". Also its
   *  anchor on the detail page (#BH-260904-2). */
  id: string;
  /** 1-based running order. */
  order: number;
  band: string;
  /** The band's Birdhaus slug, when it's in the bands table. */
  bandSlug?: string;
  /** Band-name anchor (#slug), unique within the night; an alias of `id`. */
  slug: string;
  /** "21:30" (24h). */
  start?: string;
  durationSec?: number;
  media: SetMedia;
  /** Free text (show_bands.notes): "played with a string section", or a
   *  setlist if a band ever sends one. Rarely known. */
  notes?: string;
  /** Releases made from this one set (release_links with a band_id). */
  releases?: Release[];
};

export type Credits = {
  sound?: string;
  /** Cameras on the night (show_rig.camera_count); can exceed operators, since a
   *  locked-off camera has none. */
  cameraCount?: number;
  /** Camera operators (show_credits, role 'camera'). */
  cameras?: string[];
  /** Recorded channel count (e.g. 18). */
  channels?: number;
  photos?: string[];
};

export type Release = {
  /** "BHR-012" (tape) or "BHV-004" (video). */
  id: string;
  title: string;
  url?: string;
};

export type Night = {
  /** "BH-260904", "BH-260904b" (second event that date), "SAD-005". */
  id: string;
  kind: NightKind;
  /** "YYYY-MM-DD". */
  date: string;
  /** Multi-day events (Song-a-day) only. */
  endDate?: string;
  /** Fresh Cuts installment number, on BH nights in the series. */
  freshCuts?: number;
  /** Shown in place of a lineup when there are no sets (Song-a-day). */
  title?: string;
  sets: ArchiveSet[];
  media: NightMedia;
  credits: Credits;
  /** Releases made from the whole night (release_links, band_id null). */
  releases?: Release[];
};
