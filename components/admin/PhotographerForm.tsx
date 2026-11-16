'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { PhotographerShow } from '@/lib/photographers';
import ImageUploadField from './ImageUploadField';
import { FORM } from '@/components/night/form';
import { PageHeader, Panel, ADMIN_TYPE, buttonClassName } from './ui';

const inputClass = FORM.field;

const LIST = '/admin/photographers';

export interface PhotographerFormInitialValues {
  id?: number;
  name?: string;
  photo?: string | null;
  bio?: string | null;
  instagram?: string | null;
  contactEmail?: string | null;
  paymentMethod?: string | null;
  userId?: number | null;
}

export interface CrewOption {
  id: number;
  name: string;
  email: string;
}

export default function PhotographerForm({
  mode,
  initialValues,
  linkedShows,
  crewOptions = [],
}: {
  mode: 'create' | 'edit';
  initialValues?: PhotographerFormInitialValues;
  linkedShows?: PhotographerShow[];
  // Crew logins an admin can link this photographer to (their account then
  // manages the profile and gets the Queue). Only shown when editing.
  crewOptions?: CrewOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name ?? '');
  const [photo, setPhoto] = useState(initialValues?.photo ?? '');
  const [instagram, setInstagram] = useState(initialValues?.instagram ?? '');
  const [contactEmail, setContactEmail] = useState(initialValues?.contactEmail ?? '');
  const [paymentMethod, setPaymentMethod] = useState(initialValues?.paymentMethod ?? '');
  const [bio, setBio] = useState(initialValues?.bio ?? '');
  const [userId, setUserId] = useState<number | null>(initialValues?.userId ?? null);
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
      contactEmail: contactEmail.trim() || null,
      paymentMethod: paymentMethod.trim() || null,
      bio: bio.trim() || null,
      // Only the edit form links a login (create has no id yet); send even when
      // null so unlinking persists.
      ...(mode === 'edit' ? { userId } : {}),
    };

    setSubmitting(true);
    try {
      const url = mode === 'create' ? '/api/admin/photographers' : `/api/admin/photographers/${initialValues?.id}`;
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
    if (!confirm("Delete this photographer? This can't be undone.")) return;
    try {
      const res = await fetch(`/api/admin/photographers/${initialValues.id}`, { method: 'DELETE' });
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
        <PageHeader
          overline="Crew"
          title={mode === 'create' ? 'New photographer' : 'Edit photographer'}
          actions={
            <button type="button" onClick={() => router.push(LIST)} className={`text-body-3 ${ADMIN_TYPE.link}`}>
              ← Back to photographers
            </button>
          }
        />

        {error && (
          <div role="alert" className={`${FORM.error} flex items-center justify-between gap-3`}>
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className={ADMIN_TYPE.link}>
              Dismiss
            </button>
          </div>
        )}

        <div>
          <label className={FORM.label}>Name*</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>

        <ImageUploadField
          paper
          label="Photo"
          value={photo}
          onChange={setPhoto}
          folder="photographers"
          previewClassName="border-surface-ink mt-2 size-24 border object-cover"
        />

        <div>
          <label className={FORM.label}>Instagram URL</label>
          <input
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>

        {mode === 'edit' && (
          <div>
            <label className={FORM.label}>
              Linked crew account
            </label>
            <select
              value={userId ?? ''}
              onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : null)}
              className={`${inputClass} w-full`}
            >
              <option value="">
                Not linked
              </option>
              {crewOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>
            <p className="mt-1 text-data-caption-13 text-surface-ink/60 max-w-prose">
              Connect this photographer to a crew login. They can then edit their own profile photo,
              Instagram, and bio, and see a Queue of shows they&apos;re assigned to shoot. Manage crew
              accounts under Crew.
            </p>
          </div>
        )}

        <div>
          <label className={FORM.label}>Contact email</label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="photographer@example.com"
            className={`${inputClass} w-full`}
          />
        </div>

        <div>
          <label className={FORM.label}>Payout handle (Venmo)</label>
          <input
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            placeholder="@venmo-username"
            className={`${inputClass} w-full`}
          />
          <p className={`${ADMIN_TYPE.meta} mt-1`}>
            Venmo username (or how they like to be paid). Admin-only — shown on the settlement sheet when paying out.
          </p>
        </div>

        <div>
          <label className={FORM.label}>Bio / notes</label>
          <textarea
            rows={6}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={`${inputClass} w-full resize-y`}
          />
        </div>

        <div className="border-surface-ink flex items-center justify-between border-t pt-4">
          {mode === 'edit' ? (
            <button type="button" onClick={handleDelete} className="text-body-3 text-accent-red cursor-pointer underline-offset-4 hover:underline">
              Delete photographer
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={submitting}
            className={buttonClassName('primary', 's')}
          >
            {submitting ? 'Saving...' : mode === 'create' ? 'Create photographer' : 'Save changes'}
          </button>
        </div>
      </form>

      {mode === 'edit' && (
        <Panel title="Shows shot">
          {linkedShows && linkedShows.length > 0 ? (
            <div className="space-y-1.5">
              {linkedShows.map((show) => (
                <Link
                  key={show.id}
                  href={`/shows/${show.slug}`}
                  target="_blank"
                  className="flex items-center gap-3 text-body-3 hover:text-accent-red"
                >
                  <span className="text-surface-ink/60 text-data-caption-13 tabular-nums">{show.date}</span>
                  <span className="truncate">{show.title}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-data-caption-13 text-surface-ink/60">No settlements name this photographer yet.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
