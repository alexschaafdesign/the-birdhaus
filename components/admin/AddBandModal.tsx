'use client';

import { FORM } from '@/components/night/form';
import { ADMIN_TYPE, buttonClassName } from './ui';
import { useEffect, useState } from 'react';
import ImageUploadField from './ImageUploadField';
import { prefillFromTwinScene } from './twinScenePrefill';
import type { BandMatch } from './BandNameInput';

const inputClass = FORM.field;
const labelClass = FORM.label;

// The band form, opened from an Edit Show band row. Same fields as the admin
// Bands page form (BandForm), saved to the same Birdhaus `bands` row through
// the same routes:
//   • Create (no editBandId): the operator typed a name not in the list.
//     POST /api/admin/bands.
//   • Edit (editBandId set): "Edit band profile" on a band already on the bill.
//     GET then PATCH /api/admin/bands/[id].
// "Prefill from Twin Scene" copies Instagram/photo/bio into empty fields once.
// Either way the resolved match is handed back to the show row via onCreated.
export default function AddBandModal({
  initialName = '',
  editBandId,
  onCreated,
  onClose,
}: {
  initialName?: string;
  editBandId?: number;
  onCreated: (match: BandMatch) => void;
  onClose: () => void;
}) {
  const isEdit = editBandId != null;
  const [name, setName] = useState(initialName);
  const [instagram, setInstagram] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [isTouring, setIsTouring] = useState(false);
  const [hometown, setHometown] = useState('');
  const [bio, setBio] = useState('');
  const [photo, setPhoto] = useState('');
  const [twinsceneSlug, setTwinsceneSlug] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Esc closes, matching typical modal behavior. Best-effort — no focus trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/bands/${editBandId}`);
        if (!res.ok) throw new Error(`Load failed (${res.status})`);
        const row = await res.json();
        if (cancelled) return;
        setName(row.name ?? '');
        setInstagram(row.instagram ?? '');
        setContactEmail(row.contact_email ?? '');
        setPaymentMethod(row.payment_method ?? '');
        setIsTouring(Boolean(row.is_touring));
        setHometown(row.hometown ?? '');
        setBio(row.bio ?? '');
        setPhoto(row.photo ?? '');
        setTwinsceneSlug(row.twinscene_slug ?? '');
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
    } catch (e) {
      setPrefillNote(e instanceof Error ? e.message : 'Lookup failed.');
    } finally {
      setPrefilling(false);
    }
  }

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Band name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    // Explicit nulls so clearing a field clears it (PATCH only touches keys
    // that are present).
    const payload = {
      name: trimmed,
      instagram: instagram.trim() || null,
      contactEmail: contactEmail.trim() || null,
      paymentMethod: paymentMethod.trim() || null,
      isTouring,
      hometown: isTouring ? hometown.trim() || null : null,
      bio: bio.trim() || null,
      photo: photo.trim() || null,
      twinsceneSlug: twinsceneSlug.trim() || null,
    };
    try {
      const res = await fetch(isEdit ? `/api/admin/bands/${editBandId}` : '/api/admin/bands', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const row = await res.json().catch(() => null);
      if (!res.ok) throw new Error(row?.error || `${isEdit ? 'Save' : 'Create'} failed (${res.status})`);
      onCreated({
        id: Number(row.id),
        name: row.name,
        instagram: row.instagram ?? null,
        bio: row.bio ?? null,
        photo: row.photo ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-surface-ink/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="my-8 w-full max-w-2xl border-2 border-surface-ink bg-surface-paper p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-header-4 font-bold">{isEdit ? 'Edit band' : 'Add a new band'}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="cursor-pointer hover:text-accent-red disabled:opacity-40"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-data-caption-13 text-surface-ink/60">
          {isEdit
            ? 'Saves to this band’s Birdhaus profile, the same one the Bands page edits. Only the name is required.'
            : 'Saved to Birdhaus’s band list, so it’s here next time you book them. Only the name is required.'}
        </p>

        {loading ? (
          <p className="py-8 text-center text-body-3 text-surface-ink/60">Loading band…</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Band name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} w-full`} />
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
              <label className={labelClass}>Instagram URL</label>
              <input value={instagram} onChange={(e) => setInstagram(e.target.value)} className={`${inputClass} w-full`} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Contact email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="band@example.com"
                  className={`${inputClass} w-full`}
                />
              </div>
              <div>
                <label className={labelClass}>Payout handle (Venmo)</label>
                <input
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  placeholder="@their-venmo (or other)"
                  className={`${inputClass} w-full`}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Local or touring?</label>
              <div role="group" aria-label="Local or touring" className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsTouring(false);
                    setHometown('');
                  }}
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

            <div>
              <label className={labelClass}>Photo</label>
              <ImageUploadField value={photo} onChange={setPhoto} folder="bands" placeholder="Photo URL" />
            </div>

            <div>
              <label className={labelClass}>Bio</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={5} className={`${inputClass} w-full resize-y`} />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className={`${FORM.error} mt-3`}>
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className={buttonClassName('secondary', 's')}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || loading}
            className={buttonClassName('primary', 's')}
          >
            {submitting ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create band'}
          </button>
        </div>
      </div>
    </div>
  );
}
