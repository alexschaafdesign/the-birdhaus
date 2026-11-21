'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BandNameInput, { type BandMatch, type TwinSceneBandOption } from './BandNameInput';
import AddBandModal from './AddBandModal';
import PhotographerNameInput, { type PhotographerMatch } from './PhotographerNameInput';
import ImageUploadField from './ImageUploadField';
import { FORM } from '@/components/night/form';
import { Panel as Section, PageHeader, ADMIN_TYPE, FIELD_INLINE, StatusMark, buttonClassName } from './ui';
import { downscaleImage } from '@/lib/downscale-image';

const inputClass = FORM.field;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Normalizes a loosely-typed door/show time (e.g. "7", "7:30", "7pm", "19:00")
// into the "h:mmam/pm" format used throughout the site. Bare hours with no
// am/pm default to pm since doors/show times are always in the evening.
// Anything it can't confidently parse is left untouched.
function formatShowTime(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/i);
  if (!match) return trimmed;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ?? '00';
  if (hour > 23 || Number(minute) > 59) return trimmed;

  const explicitMeridiem = match[3]?.toLowerCase();
  let meridiem: 'am' | 'pm';

  if (explicitMeridiem) {
    meridiem = explicitMeridiem.startsWith('a') ? 'am' : 'pm';
  } else if (hour >= 13) {
    // 24-hour input, e.g. "19:00"
    meridiem = 'pm';
    hour -= 12;
  } else if (hour === 0) {
    meridiem = 'am';
    hour = 12;
  } else {
    meridiem = 'pm';
  }

  if (hour > 12) hour -= 12;
  if (hour === 0) hour = 12;

  return `${hour}:${minute.padStart(2, '0')}${meridiem}`;
}

// Accepts a bare YouTube video ID or a full URL (watch, youtu.be, embed,
// shorts — with or without extra query params like &t= or &list=) and
// normalizes it down to the bare ID used for embedding. Anything it doesn't
// recognize as a YouTube URL is left untouched, so a raw ID passes through.
function extractYoutubeId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  if (host === 'youtu.be') {
    return url.pathname.slice(1).split('/')[0] || trimmed;
  }
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    const v = url.searchParams.get('v');
    if (v) return v;
    const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/);
    if (match) return match[1];
  }

  return trimmed;
}

interface Band {
  bandId: number | null;
  name: string;
  instagram: string;
  bio: string;
  photo: string;
  // The set's free-text note (show_bands.notes); '' = none.
  notes: string;
  // Contact + payout from the band's profile (Crew tab only). Saved
  // to the profile after the lineup saves; saved* is the loaded baseline so
  // only an actual change is sent.
  email: string;
  payout: string;
  savedEmail: string;
  savedPayout: string;
}

interface Video {
  youtube: string;
  title: string;
  // Positions within `form.bands` that this video features — a set can involve
  // more than one band (e.g. a collaborative performance).
  bandIndexes: number[];
}

interface Audio {
  bandcamp: string;
  title: string;
  // Set tag (no UI yet) — kept so editing a show doesn't drop it.
  bandId?: number;
}

// One gallery photo: its URL plus the registry photographer it's credited to
// (null = uncredited). Mirrors lib/shows' ShowPhoto.
interface PhotoEntry {
  url: string;
  photographerId: number | null;
  // The set this photo is from, as a position in `form.bands` (like a video's
  // bandIndexes); absent = night-level. The server resolves it to a bandId.
  bandIndex?: number;
}

// Sound-engineer statuses from the API, kept in sync with lib/sound-engineers.ts.
// The engineer roster/status is edited on the Crew tab now; this type is retained
// only for the initialValues shape the page still passes.
type SoundEngineerStatus = 'confirmed' | 'asked' | 'declined';

export interface ShowFormInitialValues {
  id?: number;
  slug?: string;
  // The night's public id and URL segment (/shows/BH-…), minted by the DB.
  catalogueId?: string;
  status?: 'scheduled' | 'cancelled' | 'postponed';
  // A postponed show's replacement night.
  rescheduledTo?: { id: number; catalogueId: string; date: string } | null;
  title?: string;
  date?: string;
  doorsTime?: string | null;
  showTime?: string | null;
  flyer?: string | null;
  bands?:
    | Array<{
        name: string;
        instagram?: string;
        bio?: string;
        photo?: string;
        bandId?: number;
        notes?: string;
        email?: string | null;
        payout?: string | null;
      }>
    | string[];
  description?: string | null;
  photographer?: { name: string; instagram?: string } | null;
  doorPersonName?: string | null;
  ticketUrl?: string | null;
  externalTicketUrl?: string | null;
  ticketLimit?: number | null;
  rsvpForm?: boolean;
  videos?: Array<{ youtube: string; title: string; bandIds?: number[] }>;
  audio?: Array<{ bandcamp: string; title: string; bandId?: number }>;
  // Per-photo entries. photographerName is resolved server-side (from the
  // registry) purely for display next to each thumbnail; only the id is saved.
  // Legacy string[] rows are accepted and treated as uncredited.
  photos?: Array<
    string | { url: string; photographerId?: number | null; photographerName?: string | null; bandId?: number }
  >;
  // Registry photographer booked to shoot this show (shows.photographer_id).
  // Name is resolved server-side for display in the picker.
  assignedPhotographerId?: number | null;
  assignedPhotographerName?: string | null;
  photoFolder?: string | null;
  photoCredit?: string | null;
  content?: string;
  announced?: boolean;
  targetBandCount?: number;
  advanceSent?: boolean;
  needsSoundEngineer?: boolean;
  soundEngineers?: Array<{ soundEngineerId?: number | null; name: string; status: SoundEngineerStatus }>;
  squareItemId?: string | null;
  squareImageId?: string | null;
  squareLinks?: Array<{ tierLabel: string; amountCents: number; url: string | null }>;
  // The doors / music times read off the show's schedule (see
  // lib/schedule-board timesFromSchedule). Where one is set, the schedule is
  // where that time lives: the field shows it read-only, and a save writes it.
  scheduleTimes?: { doorsTime: string | null; showTime: string | null };
}

interface FormState {
  slug: string;
  slugTouched: boolean;
  title: string;
  date: string;
  doorsTime: string;
  showTime: string;
  flyer: string;
  bands: Band[];
  description: string;
  ticketUrl: string;
  externalTicketUrl: string;
  // Online ticket cap as a string ('' = no cap) so the input can be cleared.
  ticketLimit: string;
  rsvpForm: boolean;
  videos: Video[];
  audio: Audio[];
  // Gallery photos with their per-photo photographer credit (id only; name is
  // cached separately for display). Uploading is the only way to add.
  photos: PhotoEntry[];
  // The photographer newly uploaded photos are credited to, and the target for
  // click-to-recredit. Not persisted on its own — it just drives new entries.
  activePhotographer: { id: number | null; name: string };
  // id → display name cache for showing credits without a lookup per render.
  photographerNames: Record<number, string>;
  photoFolder: string;
  photoCredit: string;
  content: string;
  announced: boolean;
  targetBandCount: number;
  advanceSent: boolean;
  // Opt-in: puts the show in the sound-coverage queue and emails that crew.
  needsSoundEngineer: boolean;
  status: 'scheduled' | 'cancelled' | 'postponed';
}

const EMPTY_CONTACT = { email: '', payout: '', savedEmail: '', savedPayout: '' };

// Which tab of the show workspace this form is rendered in. Each tab shows only
// its own sections and saves only its own fields (PATCH is partial), so two
// tabs can never overwrite each other's edits. Absent = the full form (create).
// The Overview holds the basics AND the lineup (one form, one Save).
export type ShowFormSection = 'overview' | 'public';
type FormPart = 'overview' | 'lineup' | 'public';

// The PATCH fields each section owns.
const SECTION_FIELDS: Record<ShowFormSection, string[]> = {
  overview: ['title', 'slug', 'date', 'doorsTime', 'showTime', 'flyer', 'announced', 'status', 'bands', 'targetBandCount'],
  public: [
    'description', 'ticketUrl', 'externalTicketUrl', 'ticketLimit', 'rsvpForm',
    'videos', 'audio', 'photos', 'photoFolder', 'photoCredit', 'content',
  ],
};

function initFormState(initial: ShowFormInitialValues | undefined, isPast: boolean): FormState {
  const bands = (initial?.bands ?? []).map((b) =>
    typeof b === 'string'
      ? { ...EMPTY_CONTACT, bandId: null, name: b, instagram: '', bio: '', photo: '', notes: '' }
      : {
          bandId: b.bandId ?? null,
          name: b.name,
          instagram: b.instagram ?? '',
          bio: b.bio ?? '',
          photo: b.photo ?? '',
          notes: b.notes ?? '',
          email: b.email ?? '',
          payout: b.payout ?? '',
          savedEmail: b.email ?? '',
          savedPayout: b.payout ?? '',
        }
  );

  const existingVideos: Video[] = (initial?.videos ?? []).map((v) => ({
    youtube: v.youtube,
    title: v.title,
    // Reverse-map each stored bandId back to a position in the bands list
    // above so the pickers pre-select correctly. Bands no longer in this
    // show's lineup are dropped.
    bandIndexes: (v.bandIds ?? [])
      .map((id) =>
        (initial?.bands ?? []).findIndex((b) => typeof b !== 'string' && b.bandId === Number(id))
      )
      .filter((idx) => idx >= 0),
  }));

  // For a past show that has no videos yet, seed one empty video row per band
  // (pre-tagged to that band) so filling in the recap is a matter of pasting
  // links, not adding rows one at a time. Blank rows are dropped on save, and
  // "+ add video" still works for shows that need more.
  const videos: Video[] =
    isPast && existingVideos.length === 0 && bands.length > 0
      ? bands.map((_, i) => ({ youtube: '', title: '', bandIndexes: [i] }))
      : existingVideos;

  return {
    slug: initial?.slug ?? '',
    slugTouched: Boolean(initial?.slug),
    title: initial?.title ?? '',
    date: initial?.date ?? '',
    doorsTime: initial?.scheduleTimes?.doorsTime ?? initial?.doorsTime ?? '',
    showTime: initial?.scheduleTimes?.showTime ?? initial?.showTime ?? '',
    flyer: initial?.flyer ?? '',
    bands,
    description: initial?.description ?? '',
    ticketUrl: initial?.ticketUrl ?? '',
    externalTicketUrl: initial?.externalTicketUrl ?? '',
    ticketLimit:
      initial?.ticketLimit === null || initial?.ticketLimit === undefined
        ? ''
        : String(initial.ticketLimit),
    rsvpForm: initial?.rsvpForm ?? true,
    videos,
    audio: initial?.audio ?? [],
    photos: (initial?.photos ?? []).map((p) => {
      if (typeof p === 'string') return { url: p, photographerId: null };
      // Same reverse-map as videos: a tag for a band no longer in the lineup
      // has no position, so it falls back to night-level.
      const bandIndex =
        p.bandId == null
          ? -1
          : (initial?.bands ?? []).findIndex((b) => typeof b !== 'string' && b.bandId === Number(p.bandId));
      return {
        url: p.url,
        photographerId: p.photographerId ?? null,
        ...(bandIndex >= 0 ? { bandIndex } : {}),
      };
    }),
    // Uploads default to crediting the show's assigned photographer (set on the
    // Crew tab); the photographer booking itself lives there now.
    activePhotographer: {
      id: initial?.assignedPhotographerId ?? null,
      name: initial?.assignedPhotographerName ?? '',
    },
    photographerNames: (initial?.photos ?? []).reduce<Record<number, string>>(
      (acc, p) => {
        if (typeof p !== 'string' && p.photographerId != null && p.photographerName) {
          acc[p.photographerId] = p.photographerName;
        }
        return acc;
      },
      initial?.assignedPhotographerId != null && initial?.assignedPhotographerName
        ? { [initial.assignedPhotographerId]: initial.assignedPhotographerName }
        : {}
    ),
    photoFolder: initial?.photoFolder ?? '',
    photoCredit: initial?.photoCredit ?? '',
    content: initial?.content ?? '',
    announced: initial?.announced ?? false,
    targetBandCount: initial?.targetBandCount ?? 3,
    advanceSent: initial?.advanceSent ?? false,
    needsSoundEngineer: initial?.needsSoundEngineer ?? false,
    status: initial?.status ?? 'scheduled',
  };
}

export default function ShowForm({
  mode,
  initialValues,
  isPast,
  nightDate,
  embedded = false,
  section,
}: {
  mode: 'create' | 'edit';
  // The workspace tab this form is in (see ShowFormSection); absent = everything.
  section?: ShowFormSection;
  initialValues?: ShowFormInitialValues;
  // "Past" is the show page's rule (lib/shows getNightDateCentral: a night
  // lasts until 5am America/Chicago the morning after), worked out on the
  // server, never in the browser's time zone. isPast is the saved date's
  // answer; nightDate is the night it is now, for a date typed into the form.
  isPast: boolean;
  nightDate: string;
  // When rendered inside the per-show tabbed workspace the surrounding layout
  // already supplies the title / back link / tab nav, so the form's own header
  // is suppressed to avoid duplicating them.
  embedded?: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initFormState(initialValues, isPast));
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The Details form is split into two focused views over one shared form/save:
  // "Show & lineup" (identity, bands, engineers) and "Public page & tickets"
  // (tickets, media, page content). Past shows default to the public view since
  // the gallery is the main post-show task.
  const [view, setView] = useState<'show' | 'public'>(isPast ? 'public' : 'show');
  // What to render: a workspace tab shows only its section; the full (create)
  // form keeps the Show & lineup / Public page switch.
  const scheduleTimes = initialValues?.scheduleTimes;
  // A saved time that the schedule has since changed (schedules saved before
  // times followed them). Saving the form writes the schedule's time.
  const timesOutOfDate =
    (scheduleTimes?.doorsTime && scheduleTimes.doorsTime !== (initialValues?.doorsTime ?? '')) ||
    (scheduleTimes?.showTime && scheduleTimes.showTime !== (initialValues?.showTime ?? ''));
  const shows = (part: FormPart) =>
    section
      ? section === part || (section === 'overview' && part === 'lineup')
      : part === 'public' ? view === 'public' : view === 'show';
  const [photosUploading, setPhotosUploading] = useState(false);
  const [photosUploadProgress, setPhotosUploadProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const photosFileInputRef = useRef<HTMLInputElement>(null);
  // Bulk set-tagging: in select mode a click picks a photo (shift-click picks
  // the run since the last click), then "tag selected" applies one band to all.
  const [photoSelectMode, setPhotoSelectMode] = useState(false);
  const [pickedPhotos, setPickedPhotos] = useState<Set<number>>(() => new Set());
  const photoPickAnchor = useRef<number | null>(null);
  const [twinSceneBands, setTwinSceneBands] = useState<TwinSceneBandOption[]>([]);
  // Which band row (index) opened the full band modal, and the name to prefill
  // it with. `editBandId` set → edit that existing band's Twin Scene profile;
  // absent → create a new band. null when the modal is closed.
  const [addBandModal, setAddBandModal] = useState<{
    index: number;
    name: string;
    editBandId?: number;
  } | null>(null);

  // Square donation-link state — created on demand via the button below, never
  // automatically on save. Seeded from whatever's already synced for this show.
  const [square, setSquare] = useState({
    itemId: initialValues?.squareItemId ?? null,
    imageId: initialValues?.squareImageId ?? null,
    links: initialValues?.squareLinks ?? [],
  });
  const [squareBusy, setSquareBusy] = useState(false);
  const [squareMsg, setSquareMsg] = useState<string | null>(null);

  // One fetch per form load, cached for the session — every band typeahead
  // row below filters this same list client-side rather than each fetching
  // its own copy. Best-effort: if Twin Scene is unreachable, the local-only
  // typeahead in BandNameInput still works on its own.
  useEffect(() => {
    if (section && section !== 'overview') return;
    let cancelled = false;
    fetch('/api/admin/bands/twinscene')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setTwinSceneBands(data);
      })
      .catch(() => {
        // degrade to local-only typeahead
      });
    return () => {
      cancelled = true;
    };
  }, [section]);

  // Keep the slug derived from date+title until the operator edits it directly.
  useEffect(() => {
    if (form.slugTouched) return;
    setForm((prev) => ({ ...prev, slug: slugify(`${prev.date}-${prev.title}`) }));
  }, [form.date, form.title, form.slugTouched]);

  // A show is "past" once its night is over (5am Central the morning after).
  // Post-show edits hide the pre-show "bands available this date" helper.
  const isPastShow = /^\d{4}-\d{2}-\d{2}$/.test(form.date) && form.date < nightDate;

  // Once saved as announced, or once it's happened, the date is frozen with
  // the show's /shows/ id: moving it is a Postpone (a new night with its own
  // id), never an edit. Judged on what's saved, not the unsaved checkbox, so
  // a draft can still be re-dated and announced in one save.
  const savedDate = initialValues?.date ?? '';
  const dateFrozen = mode === 'edit' && (Boolean(initialValues?.announced) || isPast);
  const [postponeDate, setPostponeDate] = useState('');
  const [postponing, setPostponing] = useState(false);
  const [showPostpone, setShowPostpone] = useState(false);

  async function handlePostpone() {
    if (!initialValues?.id || !/^\d{4}-\d{2}-\d{2}$/.test(postponeDate)) return;
    if (
      !confirm(
        `Postpone to ${postponeDate}? This creates the new night as its own show and marks this one postponed. ` +
          'Square tickets are not moved: set them up on the new show, and handle refunds in Square.'
      )
    ) {
      return;
    }
    setPostponing(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/shows/${initialValues.id}/postpone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: postponeDate }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Failed to postpone');
      router.push(`/admin/shows/${body.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to postpone');
      setPostponing(false);
    }
  }

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateBand(
    index: number,
    field: 'name' | 'instagram' | 'bio' | 'photo' | 'notes' | 'email' | 'payout',
    value: string
  ) {
    setForm((prev) => {
      const bands = [...prev.bands];
      // Retyping the name severs any link to a matched band profile — either
      // reselect from the dropdown or it becomes a new band on save. A new band
      // has no saved contact, so whatever's in the contact fields gets saved.
      const clearsLink = field === 'name' ? { bandId: null, savedEmail: '', savedPayout: '' } : {};
      bands[index] = { ...bands[index], [field]: value, ...clearsLink };
      return { ...prev, bands };
    });
  }
  function selectBand(index: number, match: BandMatch) {
    setForm((prev) => {
      const bands = [...prev.bands];
      // Picking a band from the dropdown links to that profile, so pull its
      // instagram/bio/photo in wholesale — replacing whatever was there (a
      // previously-linked band's data or leftover typing), which is the point
      // of reselecting. Editing a field afterward still overrides it locally.
      bands[index] = {
        bandId: match.id,
        name: match.name,
        instagram: match.instagram ?? '',
        bio: match.bio ?? '',
        photo: match.photo ?? '',
        // A set note is about this night's set, not the band — keep it.
        notes: bands[index].notes,
        // The picked band's saved contact loads after the lineup saves; a
        // contact typed before then is saved to its profile.
        ...EMPTY_CONTACT,
      };
      return { ...prev, bands };
    });
  }
  function addBand() {
    setForm((prev) => ({
      ...prev,
      bands: [...prev.bands, { ...EMPTY_CONTACT, bandId: null, name: '', instagram: '', bio: '', photo: '', notes: '' }],
    }));
  }
  function removeBand(index: number) {
    setForm((prev) => ({
      ...prev,
      bands: prev.bands.filter((_, i) => i !== index),
      // Video band tags are lineup positions: drop the removed band and shift
      // later ones down with the lineup, so each video stays on its own band.
      videos: prev.videos.map((v) => ({
        ...v,
        bandIndexes: v.bandIndexes.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)),
      })),
      // Photo set tags are lineup positions: a photo from the removed band goes
      // back to night-level, and tags past it shift down with the lineup.
      photos: prev.photos.map((p) => {
        if (p.bandIndex === undefined || p.bandIndex < index) return p;
        if (p.bandIndex === index) return { url: p.url, photographerId: p.photographerId };
        return { ...p, bandIndex: p.bandIndex - 1 };
      }),
    }));
  }

  function updateVideo(index: number, field: 'youtube' | 'title', value: string) {
    setForm((prev) => {
      const videos = [...prev.videos];
      videos[index] = { ...videos[index], [field]: value };
      return { ...prev, videos };
    });
  }
  function toggleVideoBand(index: number, bandIndex: number) {
    setForm((prev) => {
      const videos = [...prev.videos];
      const current = videos[index].bandIndexes;
      const bandIndexes = current.includes(bandIndex)
        ? current.filter((i) => i !== bandIndex)
        : [...current, bandIndex];
      videos[index] = { ...videos[index], bandIndexes };
      return { ...prev, videos };
    });
  }
  function addVideo() {
    setForm((prev) => ({
      ...prev,
      videos: [...prev.videos, { youtube: '', title: '', bandIndexes: [] }],
    }));
  }
  function removeVideo(index: number) {
    setForm((prev) => ({ ...prev, videos: prev.videos.filter((_, i) => i !== index) }));
  }

  function updateAudio(index: number, field: keyof Audio, value: string) {
    setForm((prev) => {
      const audio = [...prev.audio];
      audio[index] = { ...audio[index], [field]: value };
      return { ...prev, audio };
    });
  }
  function addAudio() {
    setForm((prev) => ({ ...prev, audio: [...prev.audio, { bandcamp: '', title: '' }] }));
  }
  function removeAudio(index: number) {
    setForm((prev) => ({ ...prev, audio: prev.audio.filter((_, i) => i !== index) }));
  }

  // Tags the given photos to one set (a position in form.bands), or back to
  // night-level when bandIndex is undefined.
  function tagPhotos(indexes: Iterable<number>, bandIndex: number | undefined) {
    const targets = new Set(indexes);
    setForm((prev) => ({
      ...prev,
      photos: prev.photos.map((p, i) => {
        if (!targets.has(i)) return p;
        return bandIndex === undefined
          ? { url: p.url, photographerId: p.photographerId }
          : { ...p, bandIndex };
      }),
    }));
  }
  function pickPhoto(index: number, extendRange: boolean) {
    setPickedPhotos((prev) => {
      const next = new Set(prev);
      const anchor = photoPickAnchor.current;
      if (extendRange && anchor !== null) {
        const [lo, hi] = anchor < index ? [anchor, index] : [index, anchor];
        for (let i = lo; i <= hi; i++) next.add(i);
      } else if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
    photoPickAnchor.current = index;
  }
  function clearPhotoPicks() {
    setPickedPhotos(new Set());
    photoPickAnchor.current = null;
  }

  // Uploads one or more files and appends them to the gallery, each credited to
  // the currently-selected photographer (form.activePhotographer). Uploads
  // sequentially (not Promise.all) so photosUploadProgress advances one at a
  // time instead of jumping at the end.
  async function handlePhotosUpload(files: FileList | File[]) {
    setError(null);
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) {
        setError('Please choose image files only.');
        return;
      }
    }

    setPhotosUploading(true);
    setPhotosUploadProgress({ done: 0, total: fileArray.length });
    try {
      const uploadedUrls: string[] = [];
      for (const file of fileArray) {
        // Shrink big originals in the browser first; gallery photos open in a
        // full-screen lightbox, so keep generous headroom. Server still does
        // the final resize.
        const prepared = await downscaleImage(file, { maxDim: 2400 });
        const formData = new FormData();
        formData.append('file', prepared);
        formData.append('folder', 'photos');
        const res = await fetch('/api/admin/uploads', { method: 'POST', body: formData });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || `Upload failed for "${file.name}"`);
        uploadedUrls.push(body.url);
        setPhotosUploadProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }
      setForm((prev) => ({
        ...prev,
        photos: [
          ...prev.photos,
          ...uploadedUrls.map((url) => ({ url, photographerId: prev.activePhotographer.id })),
        ],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setPhotosUploading(false);
      setPhotosUploadProgress(null);
    }
  }

  // After the lineup saves: write any changed band email / payout handle to
  // that band's profile. The show save resolved every band (including new
  // ones) to an id, in the order sent, so match by position.
  async function saveBandContacts(sent: Band[], resolved: unknown) {
    const resolvedBands = Array.isArray(resolved) ? (resolved as Array<{ bandId?: number | string }>) : [];
    const failures: string[] = [];
    for (const [i, b] of sent.entries()) {
      const bandId = Number(resolvedBands[i]?.bandId ?? b.bandId);
      if (!Number.isInteger(bandId) || bandId <= 0) continue;
      const patch: { contactEmail?: string; paymentMethod?: string } = {};
      if (b.email.trim() !== b.savedEmail) patch.contactEmail = b.email.trim();
      if (b.payout.trim() !== b.savedPayout) patch.paymentMethod = b.payout.trim();
      if (Object.keys(patch).length === 0) continue;
      const res = await fetch(`/api/admin/bands/${bandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).catch(() => null);
      if (!res?.ok) failures.push(b.name);
    }
    if (failures.length > 0) {
      throw new Error(`Lineup saved, but contact details didn't save for: ${failures.join(', ')}`);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const ownsBasics = !section || section === 'overview';
    if (ownsBasics && !form.title.trim()) {
      setError('Title is required');
      setView('show');
      return;
    }
    if (ownsBasics && !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setError('Date is required');
      setView('show');
      return;
    }

    // Bands with an empty name get dropped from the submitted array, which
    // shifts positions — so a video's bandIndexes (recorded against form.bands'
    // original positions) need remapping to where those bands actually land
    // in the filtered array the server will resolve against.
    const nonEmptyBands = form.bands
      .map((b, originalIndex) => ({ b, originalIndex }))
      .filter(({ b }) => b.name.trim());
    const filteredIndexByOriginal = new Map(
      nonEmptyBands.map(({ originalIndex }, filteredIndex) => [originalIndex, filteredIndex])
    );
    const bandsPayload = nonEmptyBands.map(({ b }) => ({
      name: b.name.trim(),
      ...(b.instagram.trim() ? { instagram: b.instagram.trim() } : {}),
      ...(b.bio.trim() ? { bio: b.bio.trim() } : {}),
      ...(b.photo.trim() ? { photo: b.photo.trim() } : {}),
      ...(b.bandId ? { bandId: b.bandId } : {}),
      // Always sent (blank clears): the form loaded every set's note, so it's
      // the source of truth here.
      notes: b.notes,
    }));

    const fullPayload: Record<string, unknown> = {
      title: form.title.trim(),
      slug: slugify(form.slug) || undefined,
      date: form.date,
      // Send these nullable text fields even when blank (empty string, not
      // undefined) so clearing one on edit actually persists — JSON.stringify
      // drops undefined keys, and the update route skips absent keys, so an
      // omitted field silently keeps its old value. Both routes normalize
      // ''/blank to null.
      doorsTime: form.doorsTime.trim(),
      showTime: form.showTime.trim(),
      flyer: form.flyer.trim(),
      bands: bandsPayload,
      description: form.description.trim(),
      // Per-photo photographer credit lives on each `photos` entry now (see
      // below). The legacy show-level `photographer` field is intentionally not
      // sent: on create it defaults to null, and on edit an omitted key leaves
      // any existing legacy credit untouched (the public page prefers per-photo
      // credits over it anyway).
      ticketUrl: form.ticketUrl.trim(),
      externalTicketUrl: form.externalTicketUrl.trim(),
      // '' clears the cap (null = unlimited); otherwise the parsed integer.
      ticketLimit: form.ticketLimit.trim() === '' ? null : Number(form.ticketLimit.trim()),
      rsvpForm: form.rsvpForm,
      videos: form.videos
        // Title is optional — keep any row that has a YouTube URL so a
        // blank title no longer silently drops the video on save.
        .filter((v) => v.youtube.trim())
        .map((v) => {
          // Remap each selected band from its original lineup position to where
          // it lands in the filtered (non-empty) bands array the server resolves.
          const bandIndexes = v.bandIndexes
            .map((i) => filteredIndexByOriginal.get(i))
            .filter((i): i is number => i !== undefined);
          return {
            youtube: v.youtube.trim(),
            title: v.title.trim(),
            ...(bandIndexes.length > 0 ? { bandIndexes } : {}),
          };
        }),
      audio: form.audio.filter((a) => a.bandcamp.trim() && a.title.trim()),
      photos: form.photos
        .map((p) => {
          // Remap the set tag the same way as videos' bandIndexes above.
          const bandIndex = p.bandIndex === undefined ? undefined : filteredIndexByOriginal.get(p.bandIndex);
          return {
            url: p.url.trim(),
            photographerId: p.photographerId,
            ...(bandIndex !== undefined ? { bandIndex } : {}),
          };
        })
        .filter((p) => p.url),
      photoFolder: form.photoFolder.trim(),
      photoCredit: form.photoCredit.trim(),
      content: form.content,
      announced: form.announced,
      targetBandCount: form.targetBandCount,
      advanceSent: form.advanceSent,
      needsSoundEngineer: form.needsSoundEngineer,
      // Cancel / un-cancel on edit. 'postponed' only comes from Postpone.
      ...(mode === 'edit' && form.status !== 'postponed' ? { status: form.status } : {}),
    };

    // A workspace tab sends only the fields it owns. The Public page tab
    // doesn't send the lineup, so the server can't resolve set tags by lineup
    // position — tag videos/photos by the bands' saved ids instead (every band
    // on that tab is saved, so each has one).
    let payload: Record<string, unknown> = fullPayload;
    if (section) {
      payload = Object.fromEntries(
        Object.entries(fullPayload).filter(([k]) => SECTION_FIELDS[section].includes(k))
      );
      if (section === 'public') {
        const idAt = (i: number) => form.bands[i]?.bandId ?? null;
        payload.videos = form.videos
          .filter((v) => v.youtube.trim())
          .map((v) => {
            const bandIds = [...new Set(v.bandIndexes.map(idAt).filter((id): id is number => id != null))];
            return {
              youtube: v.youtube.trim(),
              title: v.title.trim(),
              ...(bandIds.length > 0 ? { bandIds } : {}),
            };
          });
        payload.photos = form.photos
          .map((p) => {
            const bandId = p.bandIndex === undefined ? null : idAt(p.bandIndex);
            return {
              url: p.url.trim(),
              photographerId: p.photographerId,
              ...(bandId != null ? { bandId } : {}),
            };
          })
          .filter((p) => p.url);
      }
    }

    setSubmitting(true);
    try {
      const url = mode === 'create' ? '/api/admin/shows' : `/api/admin/shows/${initialValues?.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Failed to save show');
      if (section === 'overview') await saveBandContacts(nonEmptyBands.map(({ b }) => b), body?.bands);
      // Editing inside the per-show workspace: stay put and refresh so the tab
      // badges and other tabs pick up the change — no more bouncing to the shows
      // list mid-edit. Creating a show (or the standalone form) still navigates.
      if (mode === 'edit' && embedded) {
        router.refresh();
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        router.push('/admin/shows');
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save show');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!initialValues?.id) return;
    if (!confirm('Delete this show? This can\'t be undone.')) return;
    try {
      const res = await fetch(`/api/admin/shows/${initialValues.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      router.push('/admin/shows');
      router.refresh();
    } catch {
      setError('Failed to delete show — try again.');
    }
  }

  async function handleSquareSync() {
    if (!initialValues?.id) return;
    setSquareBusy(true);
    setSquareMsg(null);
    try {
      const res = await fetch(`/api/admin/shows/${initialValues.id}/square`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Square sync failed');
      setSquare({
        itemId: data.itemId ?? square.itemId,
        imageId: data.imageId ?? square.imageId,
        links: Array.isArray(data.links) ? data.links : square.links,
      });
      // The sync points Ticket URL at the donation-tier page; mirror it into the
      // form so the field updates live and a later Save doesn't overwrite it.
      if (typeof data.ticketUrl === 'string') set('ticketUrl', data.ticketUrl);
      const byStatus: Record<string, string> = {
        disabled: 'Square sync is disabled in this environment (SQUARE_SYNC_ENABLED is off).',
        created: 'Created Square item and donation links.',
        flyer_attached: 'Attached the flyer to the existing Square item.',
        no_flyer: 'Links exist, but this show has no flyer yet — add one and save, then click again to attach a photo.',
        exists: 'Square links already exist for this show.',
      };
      setSquareMsg(byStatus[data.status] ?? null);
    } catch (err) {
      setSquareMsg(err instanceof Error ? err.message : 'Square sync failed');
    } finally {
      setSquareBusy(false);
    }
  }

  // Combined Videos / Photos card. Rendered in one of two spots depending on
  // whether the show is in the past: for past shows it moves up directly under
  // Show details and opens by default (the gallery is the main post-show task);
  // for upcoming shows it stays lower down and collapsed. Defined as a helper so
  // the markup lives in exactly one place regardless of position.
  const videosPhotosSection = (defaultOpen: boolean) => (
    <Section
      title="Videos / Photos"
      collapsible
      defaultOpen={defaultOpen}
      action={
        <button type="button" onClick={addVideo} className="text-data-caption-13 border border-surface-ink px-2 py-1 cursor-pointer hover:bg-surface-paper-shade">
          + add video
        </button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          {form.videos.map((video, index) => (
            <div key={index} className="border border-surface-ink p-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-start">
                <input
                  placeholder="YouTube URL or video ID"
                  value={video.youtube}
                  onChange={(e) => updateVideo(index, 'youtube', e.target.value)}
                  onBlur={(e) => updateVideo(index, 'youtube', extractYoutubeId(e.target.value))}
                  className={`${inputClass} w-full`}
                />
                <input
                  placeholder="Title"
                  value={video.title}
                  onChange={(e) => updateVideo(index, 'title', e.target.value)}
                  className={`${inputClass} w-full`}
                />
                <button
                  type="button"
                  onClick={() => removeVideo(index)}
                  className="text-accent-red cursor-pointer hover:underline text-body-3 px-2"
                >
                  Remove
                </button>
              </div>
              {form.bands.length > 0 && (
                <div>
                  <p className="text-data-caption-13 text-surface-ink/60 mb-1.5">
                    Which band(s) is this a video of? (optional)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {form.bands.map((band, bandIdx) => {
                      const selected = video.bandIndexes.includes(bandIdx);
                      return (
                        <button
                          key={bandIdx}
                          type="button"
                          onClick={() => toggleVideoBand(index, bandIdx)}
                          className={
                            selected
                              ? 'text-data-caption-13  px-2.5 py-1 border border-surface-ink bg-surface-ink text-surface-paper'
                              : 'text-data-caption-13  px-2.5 py-1 border border-surface-ink text-surface-ink/80 hover:border-accent-red'
                          }
                        >
                          {band.name || `Band ${bandIdx + 1}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
          {form.videos.length === 0 && <p className="text-data-caption-13 text-surface-ink/60">No videos added yet.</p>}
        </div>

        <div className="pt-4 border-t border-surface-ink space-y-3">
          <div>
            <label className={FORM.label}>
              Photographer for these photos
            </label>
            <PhotographerNameInput
              value={form.activePhotographer.name}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, activePhotographer: { id: null, name: value } }))
              }
              onSelect={(match: PhotographerMatch) =>
                setForm((prev) => ({
                  ...prev,
                  activePhotographer: { id: match.id, name: match.name },
                  photographerNames: { ...prev.photographerNames, [match.id]: match.name },
                }))
              }
              placeholder="Choose or add a photographer…"
              className={`${inputClass} w-full sm:max-w-sm`}
            />
            <p className="mt-1 text-data-caption-13 text-surface-ink/60 max-w-prose">
              Photos you upload are credited to this photographer (pulled from the Photographers
              registry). Shooting a gallery with more than one? Upload each person&apos;s batch
              under their name — or switch the name here and click a photo below to re-credit it.
            </p>
          </div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase">
              Photos
            </label>
            <button
              type="button"
              onClick={() => photosFileInputRef.current?.click()}
              disabled={photosUploading}
              className="text-data-caption-13 border border-surface-ink px-2 py-1 cursor-pointer hover:bg-surface-paper-shade disabled:opacity-50"
            >
              {photosUploadProgress
                ? `Uploading ${photosUploadProgress.done}/${photosUploadProgress.total}...`
                : '+ Upload photos'}
            </button>
            <input
              ref={photosFileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) handlePhotosUpload(files);
                e.target.value = '';
              }}
            />
          </div>
          {form.photos.length > 0 && form.bands.length > 0 && (
            <div className="space-y-2 border border-surface-ink px-3 py-2 text-data-caption-13">
              {photoSelectMode ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-surface-ink/80 tabular-nums">{pickedPhotos.size} selected</span>
                    <button
                      type="button"
                      onClick={() => setPickedPhotos(new Set(form.photos.map((_, i) => i)))}
                      className="text-surface-ink/60 underline underline-offset-2 hover:text-accent-red"
                    >
                      all
                    </button>
                    <button
                      type="button"
                      onClick={clearPhotoPicks}
                      className="text-surface-ink/60 underline underline-offset-2 hover:text-accent-red"
                    >
                      none
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoSelectMode(false);
                        clearPhotoPicks();
                      }}
                      className="ml-auto border border-surface-ink px-2 py-1 cursor-pointer hover:bg-surface-paper-shade"
                    >
                      Done
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-surface-ink/60">Tag selected →</span>
                    {form.bands.map((band, bandIdx) => (
                      <button
                        key={bandIdx}
                        type="button"
                        disabled={pickedPhotos.size === 0}
                        onClick={() => {
                          tagPhotos(pickedPhotos, bandIdx);
                          clearPhotoPicks();
                        }}
                        className=" px-2.5 py-1 border border-surface-ink text-surface-ink/80 hover:border-accent-red disabled:opacity-40"
                      >
                        {band.name || `Band ${bandIdx + 1}`}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={pickedPhotos.size === 0}
                      onClick={() => {
                        tagPhotos(pickedPhotos, undefined);
                        clearPhotoPicks();
                      }}
                      className=" px-2.5 py-1 border border-dashed border-surface-ink text-surface-ink/60 hover:border-accent-red disabled:opacity-40"
                    >
                      Whole night
                    </button>
                  </div>
                  <p className="text-surface-ink/60">Click photos to select; shift-click selects everything in between.</p>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-surface-ink/60">
                    {[
                      `Whole night ${form.photos.filter((p) => p.bandIndex === undefined).length}`,
                      ...form.bands.map(
                        (band, bandIdx) =>
                          `${band.name || `Band ${bandIdx + 1}`} ${form.photos.filter((p) => p.bandIndex === bandIdx).length}`
                      ),
                    ].join(' · ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPhotoSelectMode(true)}
                    className="ml-auto border border-surface-ink px-2 py-1 cursor-pointer hover:bg-surface-paper-shade"
                  >
                    Tag photos by set
                  </button>
                </div>
              )}
            </div>
          )}
          {form.photos.length === 0 ? (
            <p className="text-data-caption-13 text-surface-ink/60">
              No photos yet — choose a photographer above, then use “Upload photos”.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {form.photos.map((photo, i) => {
                const creditName =
                  photo.photographerId != null ? form.photographerNames[photo.photographerId] : null;
                const picked = photoSelectMode && pickedPhotos.has(i);
                return (
                  <div
                    key={`${photo.url}-${i}`}
                    className={`group relative overflow-hidden  border ${
                      picked ? 'border-surface-ink ring-2 ring-accent-red' : 'border-surface-ink/20'
                    }`}
                  >
                    <div className="relative aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {photoSelectMode ? (
                        <button
                          type="button"
                          onClick={(e) => pickPhoto(i, e.shiftKey)}
                          aria-label={picked ? 'Deselect photo' : 'Select photo'}
                          aria-pressed={picked}
                          className="absolute inset-0 flex items-start justify-start p-1.5 select-none"
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center  border text-data-caption-13 ${
                              picked
                                ? 'border-surface-ink bg-surface-ink text-surface-paper'
                                : 'border-surface-ink bg-surface-paper/60'
                            }`}
                          >
                            {picked ? '✓' : ''}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            // Picks are indexes, so a removal would shift them.
                            clearPhotoPicks();
                            setForm((prev) => ({
                              ...prev,
                              photos: prev.photos.filter((_, j) => j !== i),
                            }));
                          }}
                          aria-label="Remove photo"
                          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center  bg-surface-paper/80 text-surface-ink opacity-0 transition-opacity hover:bg-surface-paper-shade group-hover:opacity-100"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => {
                          const photos = [...prev.photos];
                          photos[i] = { ...photos[i], photographerId: prev.activePhotographer.id };
                          return { ...prev, photos };
                        })
                      }
                      title="Credit this photo to the photographer selected above"
                      className="block w-full truncate px-2 py-1 text-left text-data-label-10-small hover:bg-surface-paper-shade"
                    >
                      {creditName ? (
                        <span className="text-surface-ink/80">📷 {creditName}</span>
                      ) : (
                        <span className="text-surface-ink/60">Uncredited — click to credit</span>
                      )}
                    </button>
                    {form.bands.length > 0 && (
                      <select
                        aria-label="Set this photo is from"
                        value={photo.bandIndex ?? ''}
                        onChange={(e) =>
                          tagPhotos([i], e.target.value === '' ? undefined : Number(e.target.value))
                        }
                        className={`block w-full truncate bg-transparent px-1.5 pb-1 text-data-label-10-small focus:outline-none ${
                          photo.bandIndex === undefined ? 'text-surface-ink/60' : 'text-surface-ink/80'
                        }`}
                      >
                        <option value="" className="bg-surface-paper">
                          Whole night
                        </option>
                        {form.bands.map((band, bandIdx) => (
                          <option key={bandIdx} value={bandIdx} className="bg-surface-paper">
                            {band.name || `Band ${bandIdx + 1}`}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Section>
  );

  return (
    <>
    {addBandModal && (
      <AddBandModal
        initialName={addBandModal.name}
        editBandId={addBandModal.editBandId}
        onCreated={(match) => {
          selectBand(addBandModal.index, match);
          setAddBandModal(null);
        }}
        onClose={() => setAddBandModal(null)}
      />
    )}
    <form onSubmit={handleSubmit} className="space-y-6">
      {!embedded && (
        <PageHeader
          overline="Shows"
          title={mode === 'create' ? 'New show' : 'Edit show'}
          actions={
          <div className="flex items-center gap-4">
            {mode === 'edit' && initialValues?.id && (
              <Link
                href={`/admin/shows/${initialValues.id}/settlement`}
                className={`text-body-3 ${ADMIN_TYPE.link}`}
              >
                Settlement →
              </Link>
            )}
            <button
              type="button"
              onClick={() => router.push('/admin/shows')}
              className={`text-body-3 ${ADMIN_TYPE.link}`}
            >
              ← Back to shows
            </button>
          </div>
          }
        />
      )}

      {error && (
        <div role="alert" className={`${FORM.error} flex items-center justify-between gap-3`}>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className={ADMIN_TYPE.link}>
            Dismiss
          </button>
        </div>
      )}

      {(!section || section === 'overview') && (
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {section ? <span /> : (
        <div role="group" aria-label="Form section" className="flex flex-wrap gap-2">
          {([
            ['show', 'Show & lineup'],
            ['public', 'Public page & tickets'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              aria-pressed={view === value}
              className={buttonClassName(view === value ? 'primary' : 'secondary', 's')}
            >
              {label}
            </button>
          ))}
        </div>
        )}

        {/* Announced = listed on the public site. It's a form field like the
            rest: flipping it here takes effect on Save. */}
        <div className="flex items-center gap-3">
          <StatusMark tone={form.announced ? 'ok' : 'neutral'}>
            {form.announced ? 'Announced · public' : 'Draft · hidden'}
          </StatusMark>
          <button
            type="button"
            onClick={() => set('announced', !form.announced)}
            aria-pressed={form.announced}
            className={buttonClassName(form.announced ? 'ghost' : 'secondary', 's')}
          >
            {form.announced ? 'Unannounce' : 'Announce'}
          </button>
        </div>
      </div>
      )}

      {shows('overview') && (
      <>
      <Section title="Show details">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={FORM.label}>Title*</label>
          <input
            required
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>
        <div>
          <label className={FORM.label}>Slug</label>
          <input
            value={form.slug}
            onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value, slugTouched: true }))}
            className={`${inputClass} w-full `}
          />
        </div>
        <div>
          <label className={FORM.label}>Date*</label>
          <input
            required
            type="date"
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
            disabled={dateFrozen || form.status === 'postponed'}
            className={`${inputClass} w-full min-w-0 appearance-none disabled:opacity-60`}
          />
          {dateFrozen && (
            <div className="mt-1.5 space-y-2 text-data-caption-13 text-surface-ink/60">
              <p>
                {initialValues?.announced ? 'Announced' : 'Past'}: the date is locked to this night&apos;s page.{' '}
                {!isPastShow && form.status === 'scheduled' && initialValues?.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => setShowPostpone((v) => !v)}
                    className="underline hover:text-accent-red"
                  >
                    Postpone…
                  </button>
                )}
              </p>
              {showPostpone && !isPastShow && form.status === 'scheduled' && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={postponeDate}
                    onChange={(e) => setPostponeDate(e.target.value)}
                    className={`${inputClass} min-w-0 appearance-none`}
                    aria-label="New date"
                  />
                  <button
                    type="button"
                    onClick={handlePostpone}
                    disabled={postponing || !postponeDate || postponeDate === savedDate}
                    className=" bg-surface-ink px-3 py-1.5 text-data-caption-13 font-bold text-surface-paper disabled:opacity-40"
                  >
                    {postponing ? 'Postponing…' : 'Postpone to this date'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {mode === 'edit' && initialValues?.catalogueId && (
          <div>
            <label className={FORM.label}>Status</label>
            {form.status === 'postponed' ? (
              <p className="py-1.5 text-body-3">
                Postponed
                {initialValues.rescheduledTo && (
                  <>
                    {' → '}
                    <Link href={`/admin/shows/${initialValues.rescheduledTo.id}`} className="underline">
                      {initialValues.rescheduledTo.catalogueId} ({initialValues.rescheduledTo.date})
                    </Link>
                  </>
                )}
              </p>
            ) : (
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value as 'scheduled' | 'cancelled')}
                className={`${inputClass} w-full`}
              >
                <option value="scheduled">Scheduled</option>
                <option value="cancelled">Cancelled</option>
              </select>
            )}
            <p className="mt-1.5 text-data-caption-13 text-surface-ink/60">
              Page:{' '}
              <a href={`/shows/${initialValues.catalogueId}`} target="_blank" rel="noopener noreferrer" className=" underline">
                /shows/{initialValues.catalogueId}
              </a>
            </p>
          </div>
        )}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className={FORM.label}>Doors time</label>
            <input
              placeholder="7:00pm"
              value={form.doorsTime}
              onChange={(e) => set('doorsTime', e.target.value)}
              onBlur={(e) => set('doorsTime', formatShowTime(e.target.value))}
              readOnly={Boolean(scheduleTimes?.doorsTime)}
              className={`${inputClass} w-full read-only:opacity-60`}
            />
          </div>
          <div className="flex-1">
            <label className={FORM.label}>Show time</label>
            <input
              placeholder="7:30pm"
              value={form.showTime}
              onChange={(e) => set('showTime', e.target.value)}
              onBlur={(e) => set('showTime', formatShowTime(e.target.value))}
              readOnly={Boolean(scheduleTimes?.showTime)}
              className={`${inputClass} w-full read-only:opacity-60`}
            />
          </div>
        </div>
        {(scheduleTimes?.doorsTime || scheduleTimes?.showTime) && initialValues?.id && (
          <p className="sm:col-span-2 -mt-1 text-data-caption-13 text-surface-ink/60">
            {scheduleTimes.doorsTime && scheduleTimes.showTime ? 'These come' : 'The locked time comes'} from the{' '}
            <a
              href="#schedule"
              className="underline decoration-dotted underline-offset-2 hover:text-accent-red"
            >
              schedule below
            </a>{' '}
            — change them there and the public page, Portal and TV follow.
            {timesOutOfDate && ' The public page still shows the old times: Save changes to update it.'}
          </p>
        )}
        <div className="sm:col-span-2">
          <ImageUploadField
            label="Flyer"
            value={form.flyer}
            onChange={(url) => set('flyer', url)}
            folder="flyers"
            previewClassName="mt-2 max-w-xs "
          />
        </div>
      </div>
      </Section>
      </>
      )}

      {shows('lineup') && (
      <>
      <Section
        title="Bands"
        // Its own tab in the workspace: always open there.
        collapsible={!section}
        action={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-data-caption-13 text-surface-ink/60">
              Bill size
              <input
                type="number"
                min={1}
                value={form.targetBandCount}
                onChange={(e) => set('targetBandCount', Math.max(1, Number(e.target.value) || 1))}
                className={`${FIELD_INLINE} w-14 text-center`}
              />
            </label>
            <button type="button" onClick={addBand} className="text-data-caption-13 border border-surface-ink px-2 py-1 cursor-pointer hover:bg-surface-paper-shade">
              + add band
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {form.bands.map((band, index) => (
            <div key={index} className="border border-surface-ink p-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-start">
                <div>
                  <BandNameInput
                    placeholder="Band name"
                    value={band.name}
                    onChange={(value) => updateBand(index, 'name', value)}
                    onSelect={(match) => selectBand(index, match)}
                    onAddNew={(name) => setAddBandModal({ index, name })}
                    twinSceneBands={twinSceneBands}
                    className={`${inputClass} w-full`}
                  />
                  {band.bandId && (
                    <p className="text-data-caption-13 mt-1 flex items-center gap-2">
                      <span className="text-surface-ink">🔗 Linked to existing band profile</span>
                      <button
                        type="button"
                        onClick={() =>
                          setAddBandModal({ index, name: band.name, editBandId: band.bandId ?? undefined })
                        }
                        className="text-surface-ink/60 underline underline-offset-2 hover:text-accent-red"
                      >
                        Edit full profile
                      </button>
                    </p>
                  )}
                </div>
                <input
                  placeholder="Instagram URL"
                  value={band.instagram}
                  onChange={(e) => updateBand(index, 'instagram', e.target.value)}
                  className={`${inputClass} w-full`}
                />
                <button
                  type="button"
                  onClick={() => removeBand(index)}
                  className="text-accent-red cursor-pointer hover:underline text-body-3 px-2"
                >
                  Remove
                </button>
              </div>
              {section === 'overview' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="email"
                    placeholder="Contact email — gets the Portal invite"
                    value={band.email}
                    onChange={(e) => updateBand(index, 'email', e.target.value)}
                    className={`${inputClass} w-full`}
                    aria-label={`${band.name || 'Band'} contact email`}
                  />
                  <input
                    placeholder="Payout handle (Venmo) — private"
                    value={band.payout}
                    onChange={(e) => updateBand(index, 'payout', e.target.value)}
                    className={`${inputClass} w-full`}
                    aria-label={`${band.name || 'Band'} payout handle`}
                  />
                </div>
              )}
              <ImageUploadField
                value={band.photo}
                onChange={(url) => updateBand(index, 'photo', url)}
                folder="bands"
                placeholder="Photo URL"
                previewClassName="mt-2 w-9 h-9  object-cover"
              />
              <textarea
                placeholder="Bio (optional) — a sentence or a few paragraphs"
                rows={3}
                value={band.bio}
                onChange={(e) => updateBand(index, 'bio', e.target.value)}
                className={`${inputClass} w-full resize-y`}
              />
              <textarea
                placeholder="Set notes (optional) — e.g. played with a string section, or a setlist"
                rows={2}
                value={band.notes}
                onChange={(e) => updateBand(index, 'notes', e.target.value)}
                className={`${inputClass} w-full resize-y`}
              />
            </div>
          ))}
          {form.bands.length === 0 && <p className="text-data-caption-13 text-surface-ink/60">No bands added yet.</p>}
        </div>
      </Section>

{!section && (
      <Section title="Sound">
        <div>
          <label className="flex items-center gap-2 text-body-3">
            <input
              type="checkbox"
              checked={form.needsSoundEngineer}
              onChange={(e) => set('needsSoundEngineer', e.target.checked)}
            />
            Needs a sound engineer
          </label>
          <p className="text-data-caption-13 text-surface-ink/60 mt-1 max-w-prose">
            Puts this show in the sound engineer queue and emails whoever books sound when you save.
            Leave it off for nights you&apos;re running sound yourself.
          </p>
        </div>
      </Section>
      )}
      </>
      )}

      {shows('public') && (
      <>
      <Section title="Public page">
        <label className={FORM.label}>Description</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          className={`${inputClass} w-full resize-none`}
        />
      </Section>

      <Section title="Tickets & visibility" collapsible defaultOpen={Boolean(section) && !isPastShow}>
        <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={FORM.label}>Ticket URL</label>
          <input
            value={form.ticketUrl}
            onChange={(e) => set('ticketUrl', e.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>
        <div>
          <label className={FORM.label}>External ticket URL</label>
          <input
            value={form.externalTicketUrl}
            onChange={(e) => set('externalTicketUrl', e.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className={FORM.label}>
          Online ticket limit
        </label>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="No limit"
          value={form.ticketLimit}
          onChange={(e) => set('ticketLimit', e.target.value.replace(/[^0-9]/g, ''))}
          className={`${FIELD_INLINE} w-40`}
        />
        <p className="text-data-caption-13 text-surface-ink/60 mt-1 max-w-prose">
          Max tickets sellable online (total, across all donation tiers). Leave blank for no cap.
          Counts completed online sales only — door/cash sales aren&apos;t included. Once reached, the
          tickets page shows “sold out” and points buyers to the door.
        </p>
      </div>

      <div className="mt-4 pt-4 border-t border-surface-ink flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-body-3">
          <input
            type="checkbox"
            checked={form.rsvpForm}
            onChange={(e) => set('rsvpForm', e.target.checked)}
          />
          Show RSVP form
        </label>
      </div>
      </Section>

      {mode === 'edit' && (
        <Section
          title="Square donation links"
          collapsible
          action={
            !square.itemId ? (
              <button
                type="button"
                onClick={handleSquareSync}
                disabled={squareBusy}
                className="text-data-caption-13 border border-surface-ink px-3 py-1.5 cursor-pointer hover:bg-surface-paper-shade disabled:opacity-50"
              >
                {squareBusy ? 'Creating…' : 'Create Square links'}
              </button>
            ) : !square.imageId ? (
              <button
                type="button"
                onClick={handleSquareSync}
                disabled={squareBusy}
                className="text-data-caption-13 border border-surface-ink px-3 py-1.5 cursor-pointer hover:bg-surface-paper-shade disabled:opacity-50"
              >
                {squareBusy ? 'Attaching…' : 'Attach flyer'}
              </button>
            ) : null
          }
        >
          {!square.itemId ? (
            <p className="text-body-3 text-surface-ink/60">
              Creates a Square event item with $10 / $20 / $30 donation links. Do this once the show is
              ready to sell — drafts don&apos;t need it.
            </p>
          ) : (
            <div className="space-y-2">
              {square.links.map((link) => (
                <div key={link.tierLabel} className="flex items-center gap-3 text-body-3">
                  <span className="text-surface-ink/60 w-40 shrink-0">{link.tierLabel}</span>
                  {link.url ? (
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all underline underline-offset-4 hover:text-accent-red"
                    >
                      {link.url}
                    </a>
                  ) : (
                    <span className="text-surface-ink/60">no link</span>
                  )}
                </div>
              ))}
              {!square.imageId && (
                <p className="text-data-caption-13 text-surface-ink/60 pt-1">No flyer photo attached yet.</p>
              )}
            </div>
          )}
          {squareMsg && <p className="text-data-caption-13 text-surface-ink/60 mt-3">{squareMsg}</p>}
        </Section>
      )}

      {videosPhotosSection(isPastShow)}

      <Section
        title="Audio"
        collapsible
        action={
          <button type="button" onClick={addAudio} className="text-data-caption-13 border border-surface-ink px-2 py-1 cursor-pointer hover:bg-surface-paper-shade">
            + add audio
          </button>
        }
      >
        <div className="space-y-2">
          {form.audio.map((audio, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-start">
              <input
                placeholder="Bandcamp embed URL"
                value={audio.bandcamp}
                onChange={(e) => updateAudio(index, 'bandcamp', e.target.value)}
                className={`${inputClass} w-full`}
              />
              <input
                placeholder="Title"
                value={audio.title}
                onChange={(e) => updateAudio(index, 'title', e.target.value)}
                className={`${inputClass} w-full`}
              />
              <button
                type="button"
                onClick={() => removeAudio(index)}
                className="text-accent-red cursor-pointer hover:underline text-body-3 px-2"
              >
                Remove
              </button>
            </div>
          ))}
          {form.audio.length === 0 && <p className="text-data-caption-13 text-surface-ink/60">No audio added yet.</p>}
        </div>
      </Section>

      <details className="border border-surface-ink bg-surface-paper p-4 sm:p-5">
        <summary className="text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase cursor-pointer select-none hover:text-accent-red">
          Advanced (Cloudinary gallery · page content)
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={FORM.label}>
                Cloudinary photo folder
              </label>
              <input
                value={form.photoFolder}
                onChange={(e) => set('photoFolder', e.target.value)}
                className={`${inputClass} w-full`}
              />
            </div>
            <div>
              <label className={FORM.label}>Photo credit</label>
              <input
                value={form.photoCredit}
                onChange={(e) => set('photoCredit', e.target.value)}
                className={`${inputClass} w-full`}
              />
            </div>
          </div>
          <div>
            <label className={FORM.label}>
              Content (markdown)
            </label>
            <textarea
              rows={8}
              value={form.content}
              onChange={(e) => set('content', e.target.value)}
              className={`${inputClass} w-full resize-y `}
            />
          </div>
        </div>
      </details>
      </>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-surface-ink">
        {mode === 'edit' && (!section || section === 'overview') ? (
          <button type="button" onClick={handleDelete} className="text-accent-red cursor-pointer hover:underline text-body-3">
            Delete show
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          {saved && <span role="status" className="text-body-3 font-bold">Saved ✓</span>}
          <button
            type="submit"
            disabled={submitting}
            className={buttonClassName('primary', 's')}
          >
            {submitting
              ? 'Saving...'
              : mode === 'create'
                ? 'Create show'
                : 'Save changes'}
          </button>
        </div>
      </div>
    </form>
    </>
  );
}
