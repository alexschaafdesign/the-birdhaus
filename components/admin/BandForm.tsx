'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { BandShow } from '@/lib/bands';
import ImageUploadField from './ImageUploadField';
import { prefillFromTwinScene } from './twinScenePrefill';
import { FORM } from '@/components/night/form';
import { PageHeader, Panel, ADMIN_TYPE, buttonClassName } from './ui';

const inputClass = FORM.field;

const BANDS_LIST = '/admin/bands';

// Where to go after save / cancel. A caller (e.g. the Advance tab's "add an
// email" link) can pass ?returnTo=<internal path> to come back where it started;
// defaults to the bands list. Only same-origin absolute paths are honored —
// reject protocol-relative ("//host") and any scheme to avoid an open redirect.
function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return BANDS_LIST;
  return value;
}

export interface BandFormInitialValues {
  id?: number;
  name?: string;
  instagram?: string | null;
  bio?: string | null;
  photo?: string | null;
  isTouring?: boolean;
  hometown?: string | null;
  contactEmail?: string | null;
  paymentMethod?: string | null;
  twinsceneSlug?: string | null;
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
  const returnTo = safeReturnTo(useSearchParams().get('returnTo'));
  const hasReturn = returnTo !== BANDS_LIST;
  const [name, setName] = useState(initialValues?.name ?? '');
  const [instagram, setInstagram] = useState(initialValues?.instagram ?? '');
  const [bio, setBio] = useState(initialValues?.bio ?? '');
  const [photo, setPhoto] = useState(initialValues?.photo ?? '');
  const [isTouring, setIsTouring] = useState(initialValues?.isTouring ?? false);
  const [hometown, setHometown] = useState(initialValues?.hometown ?? '');
  const [contactEmail, setContactEmail] = useState(initialValues?.contactEmail ?? '');
  const [paymentMethod, setPaymentMethod] = useState(initialValues?.paymentMethod ?? '');
  const [twinsceneSlug, setTwinsceneSlug] = useState(initialValues?.twinsceneSlug ?? '');
  const [prefilling, setPrefilling] = useState(false);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectLocal() {
    setIsTouring(false);
    setHometown(''); // clear rather than just hide, so a stale value can't linger
  }

  async function handlePrefill() {
    setPrefilling(true);
    setPrefillNote(null);
    try {
      const { values, message } = await prefillFromTwinScene(name, { instagram, bio, photo, twinsceneSlug });
      setInstagram(values.instagram);
      setBio(values.bio);
      setPhoto(values.photo);
      setTwinsceneSlug(values.twinsceneSlug);
      setPrefillNote(message);
    } catch (err) {
      setPrefillNote(err instanceof Error ? err.message : 'Lookup failed.');
    } finally {
      setPrefilling(false);
    }
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
      paymentMethod: paymentMethod.trim() || null,
      twinsceneSlug: twinsceneSlug.trim() || null,
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
      router.push(returnTo);
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
      router.push(returnTo);
      router.refresh();
    } catch {
      setError('Failed to delete band — try again.');
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <PageHeader
          overline="Bands"
          title={mode === 'create' ? 'New band' : 'Edit band'}
          actions={
            <button type="button" onClick={() => router.push(returnTo)} className={`text-body-3 ${ADMIN_TYPE.link}`}>
              {hasReturn ? '← Back' : '← Back to bands'}
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
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePrefill}
              disabled={prefilling || !name.trim()}
              className={buttonClassName('secondary', 's')}
            >
              {prefilling ? 'Looking…' : 'Prefill from Twin Scene'}
            </button>
            <span role="status" className={ADMIN_TYPE.meta}>
              {prefillNote ?? 'Copies Instagram, photo and bio into empty fields, once.'}
            </span>
          </div>
        </div>

        <div>
          <label className={FORM.label}>Instagram URL</label>
          <input
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            className={`${inputClass} w-full`}
          />
        </div>

        <div>
          <label className={FORM.label}>
            Contact email
          </label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="band@example.com"
            className={`${inputClass} w-full`}
          />
          <p className={`${ADMIN_TYPE.meta} mt-1`}>
            Saved with the band and reused for show advance emails.
          </p>
        </div>

        <div>
          <label className={FORM.label}>
            Payout handle (Venmo)
          </label>
          <input
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            placeholder="@their-venmo (or other)"
            className={`${inputClass} w-full`}
          />
          <p className={`${ADMIN_TYPE.meta} mt-1`}>
            Saved on the band&rsquo;s profile — shared across every show and prefilled on each
            settlement. Private, admin-only, never shown publicly.
          </p>
        </div>

        <div>
          <label className={FORM.label}>Local or touring?</label>
          <div role="group" aria-label="Local or touring" className="flex gap-2">
            <button
              type="button"
              onClick={selectLocal}
              aria-pressed={!isTouring}
              className={buttonClassName(!isTouring ? 'primary' : 'secondary', 's')}
            >
              Local
            </button>
            <button
              type="button"
              onClick={() => setIsTouring(true)}
              aria-pressed={isTouring}
              className={buttonClassName(isTouring ? 'primary' : 'secondary', 's')}
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
          previewClassName="border-surface-ink mt-2 size-24 border object-cover"
        />

        <div>
          <label className={FORM.label}>
            Bio — a sentence or a few paragraphs
          </label>
          <textarea
            rows={8}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={`${inputClass} w-full resize-y`}
          />
        </div>

        <div className="border-surface-ink flex items-center justify-between border-t pt-4">
          {mode === 'edit' ? (
            <button type="button" onClick={handleDelete} className="text-body-3 text-accent-red cursor-pointer underline-offset-4 hover:underline">
              Delete band
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={submitting}
            className={buttonClassName('primary', 's')}
          >
            {submitting ? 'Saving...' : mode === 'create' ? 'Create band' : 'Save changes'}
          </button>
        </div>
      </form>

      {mode === 'edit' && (
        <Panel title="Shows played">
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
            <p className={ADMIN_TYPE.meta}>Hasn&rsquo;t played a Birdhaus show yet.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
