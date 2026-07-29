'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { BandShow } from '@/lib/bands';
import ImageUploadField from './ImageUploadField';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

export interface BandFormInitialValues {
  id?: number;
  name?: string;
  instagram?: string | null;
  bio?: string | null;
  photo?: string | null;
  isTouring?: boolean;
  hometown?: string | null;
  contactEmail?: string | null;
}

export default function BandForm({
  mode,
  initialValues,
  linkedShows,
}: {
  mode: 'create' | 'edit';
  initialValues?: BandFormInitialValues;
  linkedShows?: BandShow[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name ?? '');
  const [instagram, setInstagram] = useState(initialValues?.instagram ?? '');
  const [bio, setBio] = useState(initialValues?.bio ?? '');
  const [photo, setPhoto] = useState(initialValues?.photo ?? '');
  const [isTouring, setIsTouring] = useState(initialValues?.isTouring ?? false);
  const [hometown, setHometown] = useState(initialValues?.hometown ?? '');
  const [contactEmail, setContactEmail] = useState(initialValues?.contactEmail ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectLocal() {
    setIsTouring(false);
    setHometown(''); // clear rather than just hide, so a stale value can't linger
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    const payload = {
      name: name.trim(),
      instagram: instagram.trim() || undefined,
      bio: bio.trim() || undefined,
      photo: photo.trim() || undefined,
      isTouring,
      // Explicitly null (not omitted) when not touring — PATCH only clears a
      // stored hometown when the "hometown" key is actually present in the body.
      hometown: isTouring ? hometown.trim() || null : null,
      // Explicit null so clearing the field actually clears the stored email.
      contactEmail: contactEmail.trim() || null,
    };

    setSubmitting(true);
    try {
      const url = mode === 'create' ? '/api/admin/bands' : `/api/admin/bands/${initialValues?.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Failed to save band');
      router.push('/admin/bands');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save band');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!initialValues?.id) return;
    if (!confirm("Delete this band? This can't be undone.")) return;
    try {
      const res = await fetch(`/api/admin/bands/${initialValues.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      router.push('/admin/bands');
      router.refresh();
    } catch {
      setError('Failed to delete band — try again.');
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{mode === 'create' ? 'New band' : 'Edit band'}</h1>
          <button
            type="button"
            onClick={() => router.push('/admin/bands')}
            className="text-sm text-[#E8E0D0]/60 hover:text-[#E8E0D0]"
          >
            ← Back to bands
          </button>
        </div>

        {error && (
          <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2 flex justify-between items-center">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-red-300/70 hover:text-red-300">
              dismiss
            </button>
          </div>
        )}

        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Name*</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Instagram URL</label>
          <input
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
            Contact email
          </label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="band@example.com"
            className={`${inputClass} w-full`}
          />
          <p className="text-xs text-[#E8E0D0]/30 mt-1">
            Saved with the band and reused for show advance emails.
          </p>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Local or touring?</label>
          <div className="flex text-xs rounded border border-[#E8E0D0]/30 overflow-hidden w-fit">
            <button
              type="button"
              onClick={selectLocal}
              className="px-3 py-1.5 transition-colors"
              style={{
                backgroundColor: !isTouring ? '#E8E0D0' : 'transparent',
                color: !isTouring ? '#2A2420' : '#E8E0D080',
              }}
            >
              Local
            </button>
            <button
              type="button"
              onClick={() => setIsTouring(true)}
              className="px-3 py-1.5 transition-colors border-l border-[#E8E0D0]/30"
              style={{
                backgroundColor: isTouring ? '#E8E0D0' : 'transparent',
                color: isTouring ? '#2A2420' : '#E8E0D080',
              }}
            >
              Touring
            </button>
          </div>
          {isTouring && (
            <input
              placeholder="Hometown — e.g. Austin, TX"
              value={hometown}
              onChange={(e) => setHometown(e.target.value)}
              className={`${inputClass} w-full mt-2`}
            />
          )}
        </div>

        <ImageUploadField
          label="Photo"
          value={photo}
          onChange={setPhoto}
          folder="bands"
          previewClassName="mt-2 w-24 h-24 rounded-full object-cover"
        />

        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
            Bio — a sentence or a few paragraphs
          </label>
          <textarea
            rows={8}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={`${inputClass} w-full resize-y`}
          />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[#E8E0D0]/10">
          {mode === 'edit' ? (
            <button type="button" onClick={handleDelete} className="text-red-400/70 hover:text-red-400 text-sm">
              Delete band
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={submitting}
            className="border border-[#E8E0D0] rounded px-6 py-2 text-sm hover:bg-[#E8E0D0] hover:text-[#2A2420] transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving...' : mode === 'create' ? 'Create band' : 'Save changes'}
          </button>
        </div>
      </form>

      {mode === 'edit' && (
        <div className="border border-[#E8E0D0]/15 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-[#E8E0D0]/80 mb-3">Shows played</h2>
          {linkedShows && linkedShows.length > 0 ? (
            <div className="space-y-1.5">
              {linkedShows.map((show) => (
                <Link
                  key={show.id}
                  href={`/shows/${show.slug}`}
                  target="_blank"
                  className="flex items-center gap-3 text-sm hover:text-[#E8E0D0] text-[#E8E0D0]/70"
                >
                  <span className="text-[#E8E0D0]/40 font-mono text-xs">{show.date}</span>
                  <span className="truncate">{show.title}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#E8E0D0]/30">Hasn&rsquo;t played a Birdhaus show yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
