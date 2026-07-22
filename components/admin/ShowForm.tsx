'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BandNameInput, { type BandMatch, type TwinSceneBandOption } from './BandNameInput';
import SoundEngineerNameInput, { type SoundEngineerMatch } from './SoundEngineerNameInput';
import ImageUploadField from './ImageUploadField';
import ShowDateAvailability from './ShowDateAvailability';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

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
  bandIndex: number | null;
}

interface Audio {
  bandcamp: string;
  title: string;
}

// Sound-engineer statuses from the API, kept in sync with lib/sound-engineers.ts.
type SoundEngineerStatus = 'confirmed' | 'asked' | 'declined';

// An engineer the operator asked but who isn't the confirmed one — `declined`
// distinguishes "still waiting" from "said no" (the checkbox in the UI).
interface AskedEngineer {
  soundEngineerId: number | null;
  name: string;
  declined: boolean;
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
  ticketUrl?: string | null;
  externalTicketUrl?: string | null;
  rsvpForm?: boolean;
  videos?: Array<{ youtube: string; title: string; bandId?: number }>;
  audio?: Array<{ bandcamp: string; title: string }>;
  photos?: string[];
  photoFolder?: string | null;
  photoCredit?: string | null;
  content?: string;
  announced?: boolean;
  targetBandCount?: number;
  advanceSent?: boolean;
  soundEngineers?: Array<{ soundEngineerId?: number | null; name: string; status: SoundEngineerStatus }>;
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
  // The one assigned engineer. id is null until it resolves to a registry row on save.
  confirmedEngineerName: string;
  confirmedEngineerId: number | null;
  // Everyone else who was asked, whether pending or declined.
  askedEngineers: AskedEngineer[];
}

function initFormState(initial?: ShowFormInitialValues): FormState {
  const confirmed = (initial?.soundEngineers ?? []).find((e) => e.status === 'confirmed');
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
    ticketUrl: initial?.ticketUrl ?? '',
    externalTicketUrl: initial?.externalTicketUrl ?? '',
    rsvpForm: initial?.rsvpForm ?? true,
    videos: (initial?.videos ?? []).map((v) => ({
      youtube: v.youtube,
      title: v.title,
      // Reverse-map the stored bandId back to a position in the bands list
      // above, so the dropdown pre-selects correctly. Falls back to "none"
      // if that band is no longer in this show's lineup.
      bandIndex:
        v.bandId != null
          ? (initial?.bands ?? []).findIndex(
              (b) => typeof b !== 'string' && b.bandId === v.bandId
            )
          : -1,
    })),
    audio: initial?.audio ?? [],
    photosText: (initial?.photos ?? []).join('\n'),
    photoFolder: initial?.photoFolder ?? '',
    photoCredit: initial?.photoCredit ?? '',
    content: initial?.content ?? '',
    announced: initial?.announced ?? false,
    targetBandCount: initial?.targetBandCount ?? 3,
    advanceSent: initial?.advanceSent ?? false,
    confirmedEngineerName: confirmed?.name ?? '',
    confirmedEngineerId: confirmed?.soundEngineerId ?? null,
    askedEngineers: (initial?.soundEngineers ?? [])
      .filter((e) => e.status !== 'confirmed')
      .map((e) => ({
        soundEngineerId: e.soundEngineerId ?? null,
        name: e.name,
        declined: e.status === 'declined',
      })),
  };
}

export default function ShowForm({
  mode,
  initialValues,
}: {
  mode: 'create' | 'edit';
  initialValues?: ShowFormInitialValues;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initFormState(initialValues));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photosUploading, setPhotosUploading] = useState(false);
  const photosFileInputRef = useRef<HTMLInputElement>(null);
  const [twinSceneBands, setTwinSceneBands] = useState<TwinSceneBandOption[]>([]);

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

  // Keep the slug derived from date+title until the operator edits it directly.
  useEffect(() => {
    if (form.slugTouched) return;
    setForm((prev) => ({ ...prev, slug: slugify(`${prev.date}-${prev.title}`) }));
  }, [form.date, form.title, form.slugTouched]);

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
      const current = bands[index];
      bands[index] = {
        bandId: match.id,
        name: match.name,
        // Only fill fields the operator hasn't already typed something into for this show.
        instagram: current.instagram || match.instagram || '',
        bio: current.bio || match.bio || '',
        photo: current.photo || match.photo || '',
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
  function updateVideoBandIndex(index: number, bandIndex: number) {
    setForm((prev) => {
      const videos = [...prev.videos];
      videos[index] = { ...videos[index], bandIndex };
      return { ...prev, videos };
    });
  }
  function addVideo() {
    setForm((prev) => ({
      ...prev,
      videos: [...prev.videos, { youtube: '', title: '', bandIndex: -1 }],
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

  // Retyping the confirmed engineer's name severs the link to a registry row —
  // it either re-matches on save or becomes a new engineer.
  function updateConfirmedEngineerName(value: string) {
    setForm((prev) => ({ ...prev, confirmedEngineerName: value, confirmedEngineerId: null }));
  }
  function selectConfirmedEngineer(match: SoundEngineerMatch) {
    setForm((prev) => ({ ...prev, confirmedEngineerName: match.name, confirmedEngineerId: match.id }));
  }

  function updateAskedEngineerName(index: number, value: string) {
    setForm((prev) => {
      const askedEngineers = [...prev.askedEngineers];
      askedEngineers[index] = { ...askedEngineers[index], name: value, soundEngineerId: null };
      return { ...prev, askedEngineers };
    });
  }
  function selectAskedEngineer(index: number, match: SoundEngineerMatch) {
    setForm((prev) => {
      const askedEngineers = [...prev.askedEngineers];
      askedEngineers[index] = { ...askedEngineers[index], name: match.name, soundEngineerId: match.id };
      return { ...prev, askedEngineers };
    });
  }
  function toggleAskedEngineerDeclined(index: number, declined: boolean) {
    setForm((prev) => {
      const askedEngineers = [...prev.askedEngineers];
      askedEngineers[index] = { ...askedEngineers[index], declined };
      return { ...prev, askedEngineers };
    });
  }
  function addAskedEngineer() {
    setForm((prev) => ({
      ...prev,
      askedEngineers: [...prev.askedEngineers, { soundEngineerId: null, name: '', declined: false }],
    }));
  }
  function removeAskedEngineer(index: number) {
    setForm((prev) => ({
      ...prev,
      askedEngineers: prev.askedEngineers.filter((_, i) => i !== index),
    }));
  }

  // Uploads a file and appends its URL as a new line, rather than replacing
  // the textarea's existing content like ImageUploadField's single-value fields do.
  async function handlePhotosUpload(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Image is too large (max 8MB).');
      return;
    }

    setPhotosUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'photos');
      const res = await fetch('/api/admin/uploads', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Upload failed');
      setForm((prev) => ({
        ...prev,
        photosText: prev.photosText ? `${prev.photosText}\n${body.url}` : body.url,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setPhotosUploading(false);
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
    // shifts positions — so a video's bandIndex (recorded against form.bands'
    // original positions) needs remapping to where its band actually lands
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

    // Confirmed engineer (if named) + everyone asked, deduped by name against
    // the confirmed one and each other so the server's uniqueness check passes.
    const soundEngineers: Array<{
      soundEngineerId: number | null;
      name: string;
      status: SoundEngineerStatus;
    }> = [];
    const seenEngineerNames = new Set<string>();
    const confirmedName = form.confirmedEngineerName.trim();
    if (confirmedName) {
      soundEngineers.push({
        soundEngineerId: form.confirmedEngineerId,
        name: confirmedName,
        status: 'confirmed',
      });
      seenEngineerNames.add(confirmedName.toLowerCase());
    }
    for (const asked of form.askedEngineers) {
      const name = asked.name.trim();
      if (!name || seenEngineerNames.has(name.toLowerCase())) continue;
      seenEngineerNames.add(name.toLowerCase());
      soundEngineers.push({
        soundEngineerId: asked.soundEngineerId,
        name,
        status: asked.declined ? 'declined' : 'asked',
      });
    }

    const payload = {
      title: form.title.trim(),
      slug: slugify(form.slug) || undefined,
      date: form.date,
      doorsTime: form.doorsTime.trim() || undefined,
      showTime: form.showTime.trim() || undefined,
      flyer: form.flyer.trim() || undefined,
      bands: bandsPayload,
      description: form.description.trim() || undefined,
      photographer: form.photographerName.trim()
        ? {
            name: form.photographerName.trim(),
            ...(form.photographerInstagram.trim()
              ? { instagram: form.photographerInstagram.trim() }
              : {}),
          }
        : null,
      ticketUrl: form.ticketUrl.trim() || undefined,
      externalTicketUrl: form.externalTicketUrl.trim() || undefined,
      rsvpForm: form.rsvpForm,
      videos: form.videos
        .filter((v) => v.youtube.trim() && v.title.trim())
        .map((v) => {
          const filteredIndex =
            v.bandIndex != null && v.bandIndex >= 0
              ? filteredIndexByOriginal.get(v.bandIndex)
              : undefined;
          return {
            youtube: v.youtube.trim(),
            title: v.title.trim(),
            ...(filteredIndex !== undefined ? { bandIndex: filteredIndex } : {}),
          };
        }),
      audio: form.audio.filter((a) => a.bandcamp.trim() && a.title.trim()),
      photos: form.photosText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      photoFolder: form.photoFolder.trim() || undefined,
      photoCredit: form.photoCredit.trim() || undefined,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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

      {error && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2 flex justify-between items-center">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-300/70 hover:text-red-300">
            dismiss
          </button>
        </div>
      )}

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
            className={`${inputClass} w-full`}
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
      </div>

      <ShowDateAvailability date={form.date} />

      <div className="border border-[#E8E0D0]/15 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#E8E0D0]/80">Bands</h2>
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
        </div>
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
                    twinSceneBands={twinSceneBands}
                    className={`${inputClass} w-full`}
                  />
                  {band.bandId && (
                    <p className="text-xs text-green-400/70 mt-1">🔗 Linked to existing band profile</p>
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
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Description</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          className={`${inputClass} w-full resize-none`}
        />
      </div>

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

      <div className="border border-[#E8E0D0]/15 rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-[#E8E0D0]/80">Sound engineer</h2>
        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
            Confirmed engineer
          </label>
          <div className="sm:max-w-sm">
            <SoundEngineerNameInput
              placeholder="Start typing a name…"
              value={form.confirmedEngineerName}
              onChange={updateConfirmedEngineerName}
              onSelect={selectConfirmedEngineer}
              className={`${inputClass} w-full`}
            />
          </div>
          {form.confirmedEngineerId && (
            <p className="text-xs text-green-400/70 mt-1">🔗 Linked to existing engineer</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40">
              Also asked
            </label>
            <button
              type="button"
              onClick={addAskedEngineer}
              className="text-xs border border-[#E8E0D0]/30 rounded px-2 py-1 hover:bg-[#E8E0D0]/10"
            >
              + ask another
            </button>
          </div>
          <div className="space-y-2">
            {form.askedEngineers.map((engineer, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] items-center">
                <SoundEngineerNameInput
                  placeholder="Engineer name"
                  value={engineer.name}
                  onChange={(value) => updateAskedEngineerName(index, value)}
                  onSelect={(match) => selectAskedEngineer(index, match)}
                  className={`${inputClass} w-full`}
                />
                <label className="flex items-center gap-2 text-sm text-[#E8E0D0]/70 px-1 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={engineer.declined}
                    onChange={(e) => toggleAskedEngineerDeclined(index, e.target.checked)}
                  />
                  said no
                </label>
                <button
                  type="button"
                  onClick={() => removeAskedEngineer(index)}
                  className="text-red-400/70 hover:text-red-400 text-sm px-2"
                >
                  Remove
                </button>
              </div>
            ))}
            {form.askedEngineers.length === 0 && (
              <p className="text-xs text-[#E8E0D0]/30">
                Track engineers you&apos;ve reached out to — check &ldquo;said no&rdquo; when they decline.
              </p>
            )}
          </div>
        </div>
      </div>

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

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.rsvpForm}
            onChange={(e) => set('rsvpForm', e.target.checked)}
          />
          Show RSVP form
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.announced}
            onChange={(e) => set('announced', e.target.checked)}
          />
          Announced (visible on /upcoming)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.advanceSent}
            onChange={(e) => set('advanceSent', e.target.checked)}
          />
          Advanced via email
        </label>
      </div>

      <div className="border border-[#E8E0D0]/15 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#E8E0D0]/80">Videos</h2>
          <button type="button" onClick={addVideo} className="text-xs border border-[#E8E0D0]/30 rounded px-2 py-1 hover:bg-[#E8E0D0]/10">
            + add video
          </button>
        </div>
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
                <select
                  value={video.bandIndex ?? -1}
                  onChange={(e) => updateVideoBandIndex(index, Number(e.target.value))}
                  className={`${inputClass} w-full`}
                >
                  <option value={-1}>Which band is this a video of? (optional)</option>
                  {form.bands.map((band, bandIdx) => (
                    <option key={bandIdx} value={bandIdx}>
                      {band.name || `Band ${bandIdx + 1}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
          {form.videos.length === 0 && <p className="text-xs text-[#E8E0D0]/30">No videos added yet.</p>}
        </div>
      </div>

      <div className="border border-[#E8E0D0]/15 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#E8E0D0]/80">Audio</h2>
          <button type="button" onClick={addAudio} className="text-xs border border-[#E8E0D0]/30 rounded px-2 py-1 hover:bg-[#E8E0D0]/10">
            + add audio
          </button>
        </div>
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
      </div>

      <details className="border border-[#E8E0D0]/15 rounded-lg p-4">
        <summary className="text-sm font-semibold text-[#E8E0D0]/80 cursor-pointer select-none">
          Advanced / Cloudinary gallery
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
                {photosUploading ? 'Uploading...' : '+ Upload photo'}
              </button>
              <input
                ref={photosFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotosUpload(file);
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
        </div>
      </details>

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
  );
}
