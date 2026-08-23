'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { SoundEngineerShow } from '@/lib/sound-engineers';
import ImageUploadField from './ImageUploadField';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

const LIST = '/admin/sound-engineers';

const STATUS_STYLE: Record<SoundEngineerShow['status'], string> = {
  confirmed: 'border-emerald-400/40 text-emerald-300/80',
  asked: 'border-[#E8E0D0]/30 text-[#E8E0D0]/50',
  declined: 'border-red-400/30 text-red-300/60',
};

export interface SoundEngineerFormInitialValues {
  id?: number;
  name?: string;
  photo?: string | null;
  bio?: string | null;
  instagram?: string | null;
  contactEmail?: string | null;
  paymentMethod?: string | null;
}

export default function SoundEngineerForm({
  mode,
  initialValues,
  linkedShows,
}: {
  mode: 'create' | 'edit';
  initialValues?: SoundEngineerFormInitialValues;
  linkedShows?: SoundEngineerShow[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name ?? '');
  const [photo, setPhoto] = useState(initialValues?.photo ?? '');
  const [instagram, setInstagram] = useState(initialValues?.instagram ?? '');
  const [contactEmail, setContactEmail] = useState(initialValues?.contactEmail ?? '');
  const [paymentMethod, setPaymentMethod] = useState(initialValues?.paymentMethod ?? '');
  const [bio, setBio] = useState(initialValues?.bio ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    const payload = {
      name: name.trim(),
      photo: photo.trim() || null,
      instagram: instagram.trim() || null,
      // Explicit null so clearing a field actually clears the stored value.
      contactEmail: contactEmail.trim() || null,
      paymentMethod: paymentMethod.trim() || null,
      bio: bio.trim() || null,
    };

    setSubmitting(true);
    try {
      const url = mode === 'create' ? '/api/admin/sound-engineers' : `/api/admin/sound-engineers/${initialValues?.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Failed to save');
      router.push(LIST);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!initialValues?.id) return;
    if (!confirm("Delete this engineer? This can't be undone.")) return;
    try {
      const res = await fetch(`/api/admin/sound-engineers/${initialValues.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Failed to delete');
      router.push(LIST);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete — try again.');
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            {mode === 'create' ? 'New sound engineer' : 'Edit sound engineer'}
          </h1>
          <button
            type="button"
            onClick={() => router.push(LIST)}
            className="text-sm text-[#E8E0D0]/60 hover:text-[#E8E0D0]"
          >
            ← Back to sound engineers
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

        <ImageUploadField
          label="Photo"
          value={photo}
          onChange={setPhoto}
          folder="sound-engineers"
          previewClassName="mt-2 w-24 h-24 rounded-full object-cover"
        />

        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Instagram URL</label>
          <input
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Contact email</label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="engineer@example.com"
            className={`${inputClass} w-full`}
          />
          <p className="text-xs text-[#E8E0D0]/30 mt-1">
            Saved with the engineer and reused when they&rsquo;re looped onto a show advance.
          </p>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Payment handle</label>
          <input
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            placeholder="@venmo-username"
            className={`${inputClass} w-full`}
          />
          <p className="text-xs text-[#E8E0D0]/30 mt-1">
            Venmo username (or how they like to be paid). Admin-only — shown on the settlement sheet when paying out.
          </p>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
            Bio / notes
          </label>
          <textarea
            rows={6}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={`${inputClass} w-full resize-y`}
          />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[#E8E0D0]/10">
          {mode === 'edit' ? (
            <button type="button" onClick={handleDelete} className="text-red-400/70 hover:text-red-400 text-sm">
              Delete engineer
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={submitting}
            className="border border-[#E8E0D0] rounded px-6 py-2 text-sm hover:bg-[#E8E0D0] hover:text-[#2A2420] transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving...' : mode === 'create' ? 'Create engineer' : 'Save changes'}
          </button>
        </div>
      </form>

      {mode === 'edit' && (
        <div className="border border-[#E8E0D0]/15 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-[#E8E0D0]/80 mb-3">Shows worked</h2>
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
                  <span className="truncate flex-1">{show.title}</span>
                  <span
                    className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border flex-shrink-0 ${STATUS_STYLE[show.status]}`}
                  >
                    {show.status}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#E8E0D0]/30">Not assigned to any shows yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
