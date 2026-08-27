'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BandNameInput, { type BandMatch, type TwinSceneBandOption } from './BandNameInput';
import AddBandModal from './AddBandModal';
import SoundEngineerNameInput, { type SoundEngineerMatch } from './SoundEngineerNameInput';
import ImageUploadField from './ImageUploadField';
import ShowDateAvailability from './ShowDateAvailability';
import Section from './Section';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

// Local (not UTC) YYYY-MM-DD for "is this show in the past?" comparisons.
function todayISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
}

// Sound-engineer statuses from the API, kept in sync with lib/sound-engineers.ts.
type SoundEngineerStatus = 'confirmed' | 'asked' | 'declined';

const ENGINEER_STATUS_OPTIONS: { value: SoundEngineerStatus; label: string }[] = [
  { value: 'asked', label: 'Asked' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined', label: 'Declined' },
];

// One row in the unified sound-engineer list: an engineer (picked from the
// registry or freshly typed) plus where they stand — asked / confirmed /
// declined. At most one row may be 'confirmed' per show (enforced on save).
interface EngineerEntry {
  soundEngineerId: number | null;
  name: string;
  status: SoundEngineerStatus;
}

export interface ShowFormInitialValues {
  id?: number;
  slug?: string;
  title?: string;
  date?: string;
  doorsTime?: string | null;
  showTime?: string | null;
  flyer?: string | null;
  bands?: Array<{ name: string; instagram?: string; bio?: string; photo?: string; bandId?: number }> | string[];
  description?: string | null;
  photographer?: { name: string; instagram?: string } | null;
  doorPersonName?: string | null;
  ticketUrl?: string | null;
  externalTicketUrl?: string | null;
  rsvpForm?: boolean;
  videos?: Array<{ youtube: string; title: string; bandIds?: number[] }>;
  audio?: Array<{ bandcamp: string; title: string }>;
  photos?: string[];
  photoFolder?: string | null;
  photoCredit?: string | null;
  content?: string;
  announced?: boolean;
  targetBandCount?: number;
  advanceSent?: boolean;
  soundEngineers?: Array<{ soundEngineerId?: number | null; name: string; status: SoundEngineerStatus }>;
  squareItemId?: string | null;
  squareImageId?: string | null;
  squareLinks?: Array<{ tierLabel: string; amountCents: number; url: string | null }>;
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
  photographerName: string;
  photographerInstagram: string;
  doorPersonName: string;
  ticketUrl: string;
  externalTicketUrl: string;
  rsvpForm: boolean;
  videos: Video[];
  audio: Audio[];
  photosText: string;
  photoFolder: string;
  photoCredit: string;
  content: string;
  announced: boolean;
  targetBandCount: number;
  advanceSent: boolean;
  // Every engineer touched for this show, each with a status. ids are null until
  // a freshly-typed name resolves to a registry row on save.
  engineers: EngineerEntry[];
}

function initFormState(initial?: ShowFormInitialValues): FormState {
  return {
    slug: initial?.slug ?? '',
    slugTouched: Boolean(initial?.slug),
    title: initial?.title ?? '',
    date: initial?.date ?? '',
    doorsTime: initial?.doorsTime ?? '',
    showTime: initial?.showTime ?? '',
    flyer: initial?.flyer ?? '',
    bands: (initial?.bands ?? []).map((b) =>
      typeof b === 'string'
        ? { bandId: null, name: b, instagram: '', bio: '', photo: '' }
        : {
            bandId: b.bandId ?? null,
            name: b.name,
            instagram: b.instagram ?? '',
            bio: b.bio ?? '',
            photo: b.photo ?? '',
          }
    ),
    description: initial?.description ?? '',
    photographerName: initial?.photographer?.name ?? '',
    photographerInstagram: initial?.photographer?.instagram ?? '',
    doorPersonName: initial?.doorPersonName ?? '',
    ticketUrl: initial?.ticketUrl ?? '',
    externalTicketUrl: initial?.externalTicketUrl ?? '',
    rsvpForm: initial?.rsvpForm ?? true,
    videos: (initial?.videos ?? []).map((v) => ({
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
    })),
    audio: initial?.audio ?? [],
    photosText: (initial?.photos ?? []).join('\n'),
    photoFolder: initial?.photoFolder ?? '',
    photoCredit: initial?.photoCredit ?? '',
    content: initial?.content ?? '',
    announced: initial?.announced ?? false,
    targetBandCount: initial?.targetBandCount ?? 3,
    advanceSent: initial?.advanceSent ?? false,
    engineers: (initial?.soundEngineers ?? []).map((e) => ({
      soundEngineerId: e.soundEngineerId ?? null,
      name: e.name,
      status: e.status,
    })),
  };
}

export default function ShowForm({
  mode,
  initialValues,
  embedded = false,
}: {
  mode: 'create' | 'edit';
  initialValues?: ShowFormInitialValues;
  // When rendered inside the per-show tabbed workspace the surrounding layout
  // already supplies the title / back link / tab nav, so the form's own header
  // is suppressed to avoid duplicating them.
  embedded?: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initFormState(initialValues));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photosUploading, setPhotosUploading] = useState(false);
  const [photosUploadProgress, setPhotosUploadProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const photosFileInputRef = useRef<HTMLInputElement>(null);
  const [twinSceneBands, setTwinSceneBands] = useState<TwinSceneBandOption[]>([]);
  // Full door-person roster for the door-person dropdown below, loaded once on
  // mount. Best-effort: on a failed fetch the dropdown just shows whatever name
  // is already saved (preserved as its own option) plus "Unassigned".
  const [doorPersons, setDoorPersons] = useState<string[]>([]);
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
  }, []);

  // Load the door-person roster once for the dropdown. The query-less GET
  // returns the full list ordered by name.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/door-persons')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setDoorPersons(data.map((d: { name: string }) => d.name));
        }
      })
      .catch(() => {
        // degrade to just the saved value + "Unassigned"
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the slug derived from date+title until the operator edits it directly.
  useEffect(() => {
    if (form.slugTouched) return;
    setForm((prev) => ({ ...prev, slug: slugify(`${prev.date}-${prev.title}`) }));
  }, [form.date, form.title, form.slugTouched]);

  // A show is "past" once its date is before today (local). Post-show edits
  // hide the pre-show "bands available this date" helper.
  const isPastShow = /^\d{4}-\d{2}-\d{2}$/.test(form.date) && form.date < todayISODate();

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateBand(index: number, field: 'name' | 'instagram' | 'bio' | 'photo', value: string) {
    setForm((prev) => {
      const bands = [...prev.bands];
      // Retyping the name severs any link to a matched band profile — either
      // reselect from the dropdown or it becomes a new band on save.
      const clearsLink = field === 'name' ? { bandId: null } : {};
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
      };
      return { ...prev, bands };
    });
  }
  function addBand() {
    setForm((prev) => ({
      ...prev,
      bands: [...prev.bands, { bandId: null, name: '', instagram: '', bio: '', photo: '' }],
    }));
  }
  function removeBand(index: number) {
    setForm((prev) => ({ ...prev, bands: prev.bands.filter((_, i) => i !== index) }));
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

  // Retyping an engineer's name severs the link to a registry row — it either
  // re-matches on save or becomes a new engineer.
  function updateEngineerName(index: number, value: string) {
    setForm((prev) => {
      const engineers = [...prev.engineers];
      engineers[index] = { ...engineers[index], name: value, soundEngineerId: null };
      return { ...prev, engineers };
    });
  }
  function selectEngineer(index: number, match: SoundEngineerMatch) {
    setForm((prev) => {
      const engineers = [...prev.engineers];
      engineers[index] = { ...engineers[index], name: match.name, soundEngineerId: match.id };
      return { ...prev, engineers };
    });
  }
  function setEngineerStatus(index: number, status: SoundEngineerStatus) {
    setForm((prev) => {
      // Only one engineer can be confirmed per show, so promoting one demotes
      // any previously-confirmed row back to 'asked'.
      const engineers = prev.engineers.map((e, i) => {
        if (i === index) return { ...e, status };
        if (status === 'confirmed' && e.status === 'confirmed') return { ...e, status: 'asked' as const };
        return e;
      });
      return { ...prev, engineers };
    });
  }
  function addEngineer() {
    setForm((prev) => ({
      ...prev,
      engineers: [...prev.engineers, { soundEngineerId: null, name: '', status: 'asked' }],
    }));
  }
  function removeEngineer(index: number) {
    setForm((prev) => ({
      ...prev,
      engineers: prev.engineers.filter((_, i) => i !== index),
    }));
  }

  // Uploads one or more files and appends their URLs as new lines, rather
  // than replacing the textarea's existing content like ImageUploadField's
  // single-value fields do. Uploads sequentially (not Promise.all) so
  // photosUploadProgress advances one at a time instead of jumping at the end.
  async function handlePhotosUpload(files: FileList | File[]) {
    setError(null);
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) {
        setError('Please choose image files only.');
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        setError(`"${file.name}" is too large (max 8MB).`);
        return;
      }
    }

    setPhotosUploading(true);
    setPhotosUploadProgress({ done: 0, total: fileArray.length });
    try {
      const uploadedUrls: string[] = [];
      for (const file of fileArray) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'photos');
        const res = await fetch('/api/admin/uploads', { method: 'POST', body: formData });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || `Upload failed for "${file.name}"`);
        uploadedUrls.push(body.url);
        setPhotosUploadProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }
      setForm((prev) => ({
        ...prev,
        photosText: prev.photosText
          ? `${prev.photosText}\n${uploadedUrls.join('\n')}`
          : uploadedUrls.join('\n'),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setPhotosUploading(false);
      setPhotosUploadProgress(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setError('Date is required');
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
    }));

    // Flatten the unified engineer list, dropping blank rows and deduping by
    // name (case-insensitively) so the server's uniqueness check passes. Guard
    // against more than one confirmed row slipping through — the UI enforces a
    // single confirmed, but demote any extras to 'asked' just in case.
    const soundEngineers: Array<{
      soundEngineerId: number | null;
      name: string;
      status: SoundEngineerStatus;
    }> = [];
    const seenEngineerNames = new Set<string>();
    let hasConfirmed = false;
    for (const engineer of form.engineers) {
      const name = engineer.name.trim();
      if (!name || seenEngineerNames.has(name.toLowerCase())) continue;
      seenEngineerNames.add(name.toLowerCase());
      let status = engineer.status;
      if (status === 'confirmed') {
        if (hasConfirmed) status = 'asked';
        else hasConfirmed = true;
      }
      soundEngineers.push({ soundEngineerId: engineer.soundEngineerId, name, status });
    }

    const payload = {
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
      photographer: form.photographerName.trim()
        ? {
            name: form.photographerName.trim(),
            ...(form.photographerInstagram.trim()
              ? { instagram: form.photographerInstagram.trim() }
              : {}),
          }
        : null,
      // Sent even when blank (empty string, not undefined) so clearing it on
      // edit actually persists — both show routes normalize blank to null.
      doorPersonName: form.doorPersonName.trim(),
      ticketUrl: form.ticketUrl.trim(),
      externalTicketUrl: form.externalTicketUrl.trim(),
      rsvpForm: form.rsvpForm,
      videos: form.videos
        .filter((v) => v.youtube.trim() && v.title.trim())
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
      photos: form.photosText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      photoFolder: form.photoFolder.trim(),
      photoCredit: form.photoCredit.trim(),
      content: form.content,
      announced: form.announced,
      targetBandCount: form.targetBandCount,
      advanceSent: form.advanceSent,
      soundEngineers,
    };

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
      router.push('/admin/shows');
      router.refresh();
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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{mode === 'create' ? 'New show' : 'Edit show'}</h1>
          <div className="flex items-center gap-4">
            {mode === 'edit' && initialValues?.id && (
              <Link
                href={`/admin/shows/${initialValues.id}/settlement`}
                className="text-sm text-[#E8E0D0]/60 hover:text-[#E8E0D0]"
              >
                Settlement →
              </Link>
            )}
            <button
              type="button"
              onClick={() => router.push('/admin/shows')}
              className="text-sm text-[#E8E0D0]/60 hover:text-[#E8E0D0]"
            >
              ← Back to shows
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2 flex justify-between items-center">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-300/70 hover:text-red-300">
            dismiss
          </button>
        </div>
      )}

      <Section
        title="Show details"
        action={
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-[#E8E0D0]/70 whitespace-nowrap">
              <input
                type="checkbox"
                checked={form.announced}
                onChange={(e) => set('announced', e.target.checked)}
              />
              Announced
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#E8E0D0]/70 whitespace-nowrap">
              <input
                type="checkbox"
                checked={form.advanceSent}
                onChange={(e) => set('advanceSent', e.target.checked)}
              />
              Advanced via email
            </label>
          </div>
        }
      >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Title*</label>
          <input
            required
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Slug</label>
          <input
            value={form.slug}
            onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value, slugTouched: true }))}
            className={`${inputClass} w-full font-mono`}
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Date*</label>
          <input
            required
            type="date"
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
            className={`${inputClass} w-full min-w-0 appearance-none`}
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Doors time</label>
            <input
              placeholder="7:00pm"
              value={form.doorsTime}
              onChange={(e) => set('doorsTime', e.target.value)}
              onBlur={(e) => set('doorsTime', formatShowTime(e.target.value))}
              className={`${inputClass} w-full`}
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Show time</label>
            <input
              placeholder="7:30pm"
              value={form.showTime}
              onChange={(e) => set('showTime', e.target.value)}
              onBlur={(e) => set('showTime', formatShowTime(e.target.value))}
              className={`${inputClass} w-full`}
            />
          </div>
        </div>
        <div className="sm:col-span-2">
          <ImageUploadField
            label="Flyer"
            value={form.flyer}
            onChange={(url) => set('flyer', url)}
            folder="flyers"
            previewClassName="mt-2 max-w-xs rounded"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Description</label>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            className={`${inputClass} w-full resize-none`}
          />
        </div>
      </div>
      </Section>

      {!isPastShow && <ShowDateAvailability date={form.date} />}

      <Section
        title="Bands"
        collapsible
        action={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-[#E8E0D0]/60">
              Bill size
              <input
                type="number"
                min={1}
                value={form.targetBandCount}
                onChange={(e) => set('targetBandCount', Math.max(1, Number(e.target.value) || 1))}
                className={`${inputClass} w-14 text-center`}
              />
            </label>
            <button type="button" onClick={addBand} className="text-xs border border-[#E8E0D0]/30 rounded px-2 py-1 hover:bg-[#E8E0D0]/10">
              + add band
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {form.bands.map((band, index) => (
            <div key={index} className="border border-[#E8E0D0]/10 rounded p-3 space-y-2">
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
                    <p className="text-xs mt-1 flex items-center gap-2">
                      <span className="text-green-400/70">🔗 Linked to existing band profile</span>
                      <button
                        type="button"
                        onClick={() =>
                          setAddBandModal({ index, name: band.name, editBandId: band.bandId ?? undefined })
                        }
                        className="text-[#E8E0D0]/60 underline underline-offset-2 hover:text-[#E8E0D0]"
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
                  className="text-red-400/70 hover:text-red-400 text-sm px-2"
                >
                  Remove
                </button>
              </div>
              <ImageUploadField
                value={band.photo}
                onChange={(url) => updateBand(index, 'photo', url)}
                folder="bands"
                placeholder="Photo URL"
                previewClassName="mt-2 w-9 h-9 rounded-full object-cover"
              />
              <textarea
                placeholder="Bio (optional) — a sentence or a few paragraphs"
                rows={6}
                value={band.bio}
                onChange={(e) => updateBand(index, 'bio', e.target.value)}
                className={`${inputClass} w-full resize-y`}
              />
            </div>
          ))}
          {form.bands.length === 0 && <p className="text-xs text-[#E8E0D0]/30">No bands added yet.</p>}
        </div>
      </Section>

      <Section title="Photographer" collapsible>
        <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Photographer name</label>
          <input
            value={form.photographerName}
            onChange={(e) => set('photographerName', e.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Photographer Instagram</label>
          <input
            value={form.photographerInstagram}
            onChange={(e) => set('photographerInstagram', e.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>
        </div>
      </Section>

      <Section
        title="Sound engineers"
        collapsible
        action={
          <button
            type="button"
            onClick={addEngineer}
            className="text-xs border border-[#E8E0D0]/30 rounded px-2 py-1 hover:bg-[#E8E0D0]/10"
          >
            + add engineer
          </button>
        }
      >
        <div className="space-y-2">
          {form.engineers.map((engineer, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] items-start">
              <div>
                <SoundEngineerNameInput
                  placeholder="Choose or type an engineer…"
                  value={engineer.name}
                  onChange={(value) => updateEngineerName(index, value)}
                  onSelect={(match) => selectEngineer(index, match)}
                  className={`${inputClass} w-full`}
                />
                {engineer.soundEngineerId && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-green-400/70">
                    <span>Linked to existing engineer</span>
                    <Link
                      href={`/admin/sound-engineers/${engineer.soundEngineerId}`}
                      target="_blank"
                      className="text-[#E8E0D0]/60 underline decoration-dotted underline-offset-2 hover:text-[#E8E0D0]"
                    >
                      view profile ↗
                    </Link>
                  </p>
                )}
              </div>
              <select
                value={engineer.status}
                onChange={(e) => setEngineerStatus(index, e.target.value as SoundEngineerStatus)}
                className={`${inputClass} sm:w-32`}
              >
                {ENGINEER_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="text-[#2A2420]">
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeEngineer(index)}
                className="text-red-400/70 hover:text-red-400 text-sm px-2 py-1.5"
              >
                Remove
              </button>
            </div>
          ))}
          {form.engineers.length === 0 && (
            <p className="text-xs text-[#E8E0D0]/30">
              Add each engineer you&apos;ve reached out to and set their status — mark one
              &ldquo;Confirmed&rdquo; once they&apos;re locked in.
            </p>
          )}
        </div>
      </Section>

      <Section title="Door person" collapsible>
        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Door person name</label>
          {(() => {
            // Match the saved name to the roster case-insensitively so the
            // dropdown highlights the registry's casing; keep an unmatched
            // saved value (e.g. one typed before the roster existed) as its own
            // option so it's never silently dropped on save.
            const name = form.doorPersonName;
            const matched = doorPersons.find(
              (n) => n.trim().toLowerCase() === name.trim().toLowerCase()
            );
            return (
              <select
                value={matched ?? name}
                onChange={(e) => set('doorPersonName', e.target.value)}
                className={`${inputClass} w-full sm:max-w-sm`}
              >
                <option value="" className="text-[#2A2420]">Unassigned</option>
                {name && !matched && (
                  <option value={name} className="text-[#2A2420]">{name}</option>
                )}
                {doorPersons.map((n) => (
                  <option key={n} value={n} className="text-[#2A2420]">
                    {n}
                  </option>
                ))}
              </select>
            );
          })()}
          <p className="mt-1 text-xs text-[#E8E0D0]/30">
            Who&apos;s working the door. Pre-fills the door-person payee on this show&apos;s{' '}
            settlement — manage the roster under Crew → Door People.
          </p>
        </div>
      </Section>

      <Section title="Tickets & visibility" collapsible>
        <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Ticket URL</label>
          <input
            value={form.ticketUrl}
            onChange={(e) => set('ticketUrl', e.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">External ticket URL</label>
          <input
            value={form.externalTicketUrl}
            onChange={(e) => set('externalTicketUrl', e.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-[#E8E0D0]/10 flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
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
                className="text-xs border border-[#E8E0D0]/30 rounded px-3 py-1.5 hover:bg-[#E8E0D0]/10 disabled:opacity-50"
              >
                {squareBusy ? 'Creating…' : 'Create Square links'}
              </button>
            ) : !square.imageId ? (
              <button
                type="button"
                onClick={handleSquareSync}
                disabled={squareBusy}
                className="text-xs border border-[#E8E0D0]/30 rounded px-3 py-1.5 hover:bg-[#E8E0D0]/10 disabled:opacity-50"
              >
                {squareBusy ? 'Attaching…' : 'Attach flyer'}
              </button>
            ) : null
          }
        >
          {!square.itemId ? (
            <p className="text-sm text-[#E8E0D0]/50">
              Creates a Square event item with $10 / $20 / $30 donation links. Do this once the show is
              ready to sell — drafts don&apos;t need it.
            </p>
          ) : (
            <div className="space-y-2">
              {square.links.map((link) => (
                <div key={link.tierLabel} className="flex items-center gap-3 text-sm">
                  <span className="text-[#E8E0D0]/60 w-40 shrink-0">{link.tierLabel}</span>
                  {link.url ? (
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#E8E0D0] underline decoration-[#E8E0D0]/30 hover:decoration-[#E8E0D0] break-all"
                    >
                      {link.url}
                    </a>
                  ) : (
                    <span className="text-[#E8E0D0]/30">no link</span>
                  )}
                </div>
              ))}
              {!square.imageId && (
                <p className="text-xs text-[#E8E0D0]/40 pt-1">No flyer photo attached yet.</p>
              )}
            </div>
          )}
          {squareMsg && <p className="text-xs text-[#E8E0D0]/60 mt-3">{squareMsg}</p>}
        </Section>
      )}

      <Section
        title="Videos"
        collapsible
        action={
          <button type="button" onClick={addVideo} className="text-xs border border-[#E8E0D0]/30 rounded px-2 py-1 hover:bg-[#E8E0D0]/10">
            + add video
          </button>
        }
      >
        <div className="space-y-2">
          {form.videos.map((video, index) => (
            <div key={index} className="border border-[#E8E0D0]/10 rounded p-3 space-y-2">
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
                  className="text-red-400/70 hover:text-red-400 text-sm px-2"
                >
                  Remove
                </button>
              </div>
              {form.bands.length > 0 && (
                <div>
                  <p className="text-xs text-[#E8E0D0]/40 mb-1.5">
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
                              ? 'text-xs rounded-full px-2.5 py-1 border border-[#E8E0D0] bg-[#E8E0D0] text-[#2A2420]'
                              : 'text-xs rounded-full px-2.5 py-1 border border-[#E8E0D0]/30 text-[#E8E0D0]/70 hover:border-[#E8E0D0]/60'
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
          {form.videos.length === 0 && <p className="text-xs text-[#E8E0D0]/30">No videos added yet.</p>}
        </div>
      </Section>

      <Section
        title="Audio"
        collapsible
        action={
          <button type="button" onClick={addAudio} className="text-xs border border-[#E8E0D0]/30 rounded px-2 py-1 hover:bg-[#E8E0D0]/10">
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
                className="text-red-400/70 hover:text-red-400 text-sm px-2"
              >
                Remove
              </button>
            </div>
          ))}
          {form.audio.length === 0 && <p className="text-xs text-[#E8E0D0]/30">No audio added yet.</p>}
        </div>
      </Section>

      <details className="rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4 sm:p-5">
        <summary className="text-sm font-semibold text-[#E8E0D0]/90 cursor-pointer select-none">
          Advanced (Cloudinary gallery · page content)
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40">
                Photo URLs (one per line)
              </label>
              <button
                type="button"
                onClick={() => photosFileInputRef.current?.click()}
                disabled={photosUploading}
                className="text-xs border border-[#E8E0D0]/30 rounded px-2 py-1 hover:bg-[#E8E0D0]/10 disabled:opacity-50"
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
            <textarea
              rows={4}
              value={form.photosText}
              onChange={(e) => set('photosText', e.target.value)}
              className={`${inputClass} w-full resize-none font-mono`}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
                Cloudinary photo folder
              </label>
              <input
                value={form.photoFolder}
                onChange={(e) => set('photoFolder', e.target.value)}
                className={`${inputClass} w-full`}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Photo credit</label>
              <input
                value={form.photoCredit}
                onChange={(e) => set('photoCredit', e.target.value)}
                className={`${inputClass} w-full`}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
              Content (markdown)
            </label>
            <textarea
              rows={8}
              value={form.content}
              onChange={(e) => set('content', e.target.value)}
              className={`${inputClass} w-full resize-y font-mono`}
            />
          </div>
        </div>
      </details>

      <div className="flex items-center justify-between pt-2 border-t border-[#E8E0D0]/10">
        {mode === 'edit' ? (
          <button type="button" onClick={handleDelete} className="text-red-400/70 hover:text-red-400 text-sm">
            Delete show
          </button>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={submitting}
          className="bg-[#E8E0D0] text-[#2A2420] border border-[#E8E0D0] rounded px-6 py-2 text-sm font-medium hover:bg-[#E8E0D0]/90 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Saving...' : mode === 'create' ? 'Create show' : 'Save changes'}
        </button>
      </div>
    </form>
    </>
  );
}
