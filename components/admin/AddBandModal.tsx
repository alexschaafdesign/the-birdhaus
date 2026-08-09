'use client';

import { useEffect, useState } from 'react';
import ImageUploadField from './ImageUploadField';
import type { BandMatch } from './BandNameInput';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';
const labelClass = 'block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1';

interface FeaturedLinkRow {
  url: string;
  label: string;
}

// The full Band form — mirrors Twin Scene's own "Add your band" fields
// (lib/bands.ts BandSubmissionInput). Reached from the Edit Show band row two
// ways:
//   • Create (no editBandId): the operator typed a name not in the directory.
//     On submit it creates the band in Twin Scene (with enrichment) and the
//     linked Birdhaus overlay row via POST /api/admin/bands/twinscene/create.
//   • Edit (editBandId set): the operator clicked "Edit full profile" on a band
//     already on the bill. On open it pre-fills from the canonical Twin Scene
//     profile (GET /api/admin/bands/twinscene/[bandId]); on submit it PUTs the
//     full profile back — a full replace, same writer Twin Scene's own correct
//     form uses.
// Either way the resolved match (name/instagram/bio/photo) is handed back to the
// show row via onCreated. Comma-separated inputs cover the list fields (genres,
// members, …); the photo reuses the R2 ImageUploadField.
export default function AddBandModal({
  initialName = '',
  editBandId,
  onCreated,
  onClose,
}: {
  initialName?: string;
  // When set, the modal edits this local band's canonical Twin Scene profile in
  // place instead of creating a new band.
  editBandId?: number;
  onCreated: (match: BandMatch) => void;
  onClose: () => void;
}) {
  const isEdit = editBandId != null;
  const [name, setName] = useState(initialName);
  const [genres, setGenres] = useState('');
  const [similarTo, setSimilarTo] = useState('');
  const [city, setCity] = useState('');
  const [locality, setLocality] = useState('');
  const [neighborhoods, setNeighborhoods] = useState('');
  const [members, setMembers] = useState('');
  const [website, setWebsite] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [bandcamp, setBandcamp] = useState('');
  const [bandcampLink, setBandcampLink] = useState('');
  const [youtubeChannel, setYoutubeChannel] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMethod, setContactMethod] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [featuredLinks, setFeaturedLinks] = useState<FeaturedLinkRow[]>([]);
  // Edit mode fetches the current profile before the form is usable.
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc closes, matching typical modal behavior. Best-effort — no focus trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  // Edit mode: pull the band's current canonical profile in to pre-fill every
  // field, since a save is a full replace and must round-trip untouched values.
  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/bands/twinscene/${editBandId}`);
        if (!res.ok) throw new Error(`Load failed (${res.status})`);
        const { editable } = await res.json();
        if (cancelled || !editable) return;
        const join = (v: unknown) => (Array.isArray(v) ? v.join(', ') : '');
        setName(editable.name ?? '');
        setGenres(join(editable.genres));
        setSimilarTo(join(editable.similarTo));
        setCity(editable.city ?? '');
        setLocality(editable.locality ?? '');
        setNeighborhoods(join(editable.neighborhoods));
        setMembers(join(editable.members));
        setWebsite(editable.website ?? '');
        setInstagram(editable.instagram ?? '');
        setFacebook(editable.facebook ?? '');
        setBandcamp(editable.bandcamp ?? '');
        setBandcampLink(editable.bandcampLink ?? '');
        setYoutubeChannel(editable.youtubeChannel ?? '');
        setContactEmail(editable.contactEmail ?? '');
        setContactMethod(editable.contactMethod ?? '');
        setBio(editable.bio ?? '');
        setPhotoUrl(editable.photoUrl ?? '');
        setFeaturedLinks(
          Array.isArray(editable.featuredLinks)
            ? editable.featuredLinks.map((l: { url?: string; label?: string }) => ({
                url: l.url ?? '',
                label: l.label ?? '',
              }))
            : [],
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load band.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, editBandId]);

  const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Band name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload = {
      name: trimmed,
      genres: csv(genres),
      similarTo: csv(similarTo),
      city,
      locality,
      neighborhoods: csv(neighborhoods),
      members: csv(members),
      website,
      instagram,
      facebook,
      bandcamp,
      bandcampLink,
      youtubeChannel,
      contactEmail,
      contactMethod,
      bio,
      photoUrl,
      featuredLinks: featuredLinks.filter((l) => l.url.trim()),
    };
    try {
      const res = await fetch(
        isEdit ? `/api/admin/bands/twinscene/${editBandId}` : '/api/admin/bands/twinscene/create',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `${isEdit ? 'Save' : 'Create'} failed (${res.status})`);
      }
      const synced = await res.json();
      onCreated({ ...synced, id: Number(synced.id) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="my-8 w-full max-w-2xl rounded-lg border border-[#E8E0D0]/20 bg-[#171412] p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isEdit ? 'Edit band in Twin Scene' : 'Add a new band to Twin Scene'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-[#E8E0D0]/50 hover:text-[#E8E0D0] disabled:opacity-40"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-[#E8E0D0]/40">
          {isEdit
            ? "Editing this band's shared Twin Scene profile. Changes save to the directory both sites read. Only the name is required."
            : "This band isn't in the directory yet. Fill in what you know — it's created in Twin Scene's shared directory and linked here. Only the name is required."}
        </p>

        {loading ? (
          <p className="py-8 text-center text-sm text-[#E8E0D0]/50">Loading band…</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Band name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} w-full`} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Genres (comma-separated)</label>
                <input value={genres} onChange={(e) => setGenres(e.target.value)} className={`${inputClass} w-full`} />
              </div>
              <div>
                <label className={labelClass}>For fans of (comma-separated)</label>
                <input value={similarTo} onChange={(e) => setSimilarTo(e.target.value)} className={`${inputClass} w-full`} />
              </div>
              <div>
                <label className={labelClass}>City</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} className={`${inputClass} w-full`} />
              </div>
              <div>
                <label className={labelClass}>Locality</label>
                <select value={locality} onChange={(e) => setLocality(e.target.value)} className={`${inputClass} w-full`}>
                  <option value="">Unspecified</option>
                  <option value="local">Local</option>
                  <option value="touring">Touring</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Neighborhoods (comma-separated)</label>
                <input value={neighborhoods} onChange={(e) => setNeighborhoods(e.target.value)} className={`${inputClass} w-full`} />
              </div>
              <div>
                <label className={labelClass}>Members (comma-separated)</label>
                <input value={members} onChange={(e) => setMembers(e.target.value)} className={`${inputClass} w-full`} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Instagram</label>
                <input value={instagram} onChange={(e) => setInstagram(e.target.value)} className={`${inputClass} w-full`} />
              </div>
              <div>
                <label className={labelClass}>Facebook</label>
                <input value={facebook} onChange={(e) => setFacebook(e.target.value)} className={`${inputClass} w-full`} />
              </div>
              <div>
                <label className={labelClass}>Website</label>
                <input value={website} onChange={(e) => setWebsite(e.target.value)} className={`${inputClass} w-full`} />
              </div>
              <div>
                <label className={labelClass}>Bandcamp (URL or embed)</label>
                <input value={bandcamp} onChange={(e) => setBandcamp(e.target.value)} className={`${inputClass} w-full`} />
              </div>
              <div>
                <label className={labelClass}>Bandcamp link</label>
                <input value={bandcampLink} onChange={(e) => setBandcampLink(e.target.value)} className={`${inputClass} w-full`} />
              </div>
              <div>
                <label className={labelClass}>YouTube channel</label>
                <input value={youtubeChannel} onChange={(e) => setYoutubeChannel(e.target.value)} className={`${inputClass} w-full`} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Contact email</label>
                <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={`${inputClass} w-full`} />
              </div>
              <div>
                <label className={labelClass}>Contact method</label>
                <input
                  value={contactMethod}
                  onChange={(e) => setContactMethod(e.target.value)}
                  placeholder="email | instagram | website"
                  className={`${inputClass} w-full`}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Photo</label>
              <ImageUploadField value={photoUrl} onChange={setPhotoUrl} folder="bands" placeholder="Photo URL" />
            </div>

            <div>
              <label className={labelClass}>Bio</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={5} className={`${inputClass} w-full resize-y`} />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className={labelClass}>Featured links</label>
                <button
                  type="button"
                  onClick={() => setFeaturedLinks((prev) => [...prev, { url: '', label: '' }])}
                  className="rounded border border-[#E8E0D0]/30 px-2 py-0.5 text-xs hover:bg-[#E8E0D0]/10"
                >
                  + add link
                </button>
              </div>
              <div className="space-y-2">
                {featuredLinks.map((link, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={link.url}
                      onChange={(e) =>
                        setFeaturedLinks((prev) => prev.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))
                      }
                      placeholder="URL"
                      className={`${inputClass} flex-1`}
                    />
                    <input
                      value={link.label}
                      onChange={(e) =>
                        setFeaturedLinks((prev) => prev.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))
                      }
                      placeholder="Label"
                      className={`${inputClass} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => setFeaturedLinks((prev) => prev.filter((_, j) => j !== i))}
                      className="px-2 text-sm text-red-400/70 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded border border-[#E8E0D0]/30 px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || loading}
            className="rounded bg-[#E8E0D0] px-4 py-1.5 text-sm font-semibold text-[#2A2420] hover:bg-white disabled:opacity-40"
          >
            {submitting ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create band'}
          </button>
        </div>
      </div>
    </div>
  );
}
