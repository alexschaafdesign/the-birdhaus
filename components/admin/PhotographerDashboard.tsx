'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { downscaleImage } from '@/lib/downscale-image';
import type { PhotographerQueueItem } from '@/lib/photographers';
import { FORM } from '@/components/night/form';
import { Panel, StatusMark, Input, Textarea, ADMIN_TABLE, ADMIN_TYPE, buttonClassName } from './ui';

// Small secondary buttons; the <label> file pickers wear the same class.
const smallButton = buttonClassName('secondary', 's');

function formatDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// The crew photographer's self-serve widget: edit their own profile (photo /
// Instagram / bio) and work their Queue of assigned shows — uploading photos
// straight to the live gallery for past shows that still need them.
export default function PhotographerDashboard({
  name,
  profileHref,
  initialPhoto,
  initialInstagram,
  initialBio,
  queue,
  readOnly = false,
}: {
  name: string;
  profileHref: string;
  initialPhoto: string | null;
  initialInstagram: string | null;
  initialBio: string | null;
  queue: PhotographerQueueItem[];
  // Admin preview: render exactly what she sees, but disable the actions (they
  // upload/save as the logged-in user, which isn't her).
  readOnly?: boolean;
}) {
  const router = useRouter();

  const [photo, setPhoto] = useState(initialPhoto ?? '');
  const [instagram, setInstagram] = useState(initialInstagram ?? '');
  const [bio, setBio] = useState(initialBio ?? '');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Which show is mid-upload, and its progress — keyed by showId.
  const [uploading, setUploading] = useState<{ showId: number; done: number; total: number } | null>(
    null
  );

  async function handlePhotoUpload(file: File) {
    if (readOnly) return;
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setPhotoBusy(true);
    try {
      const prepared = await downscaleImage(file, { maxDim: 1000 });
      const formData = new FormData();
      formData.append('file', prepared);
      const res = await fetch('/api/photographer/photo', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Upload failed');
      setPhoto(body.photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function saveProfile() {
    if (readOnly) return;
    setSavingProfile(true);
    setProfileMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/photographer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instagram, bio }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Save failed');
      setProfileMsg('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleShowUpload(showId: number, files: FileList) {
    if (readOnly) return;
    setError(null);
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    for (const f of fileArray) {
      if (!f.type.startsWith('image/')) {
        setError('Please choose image files only.');
        return;
      }
    }
    setUploading({ showId, done: 0, total: fileArray.length });
    try {
      for (const file of fileArray) {
        const prepared = await downscaleImage(file, { maxDim: 2400 });
        const formData = new FormData();
        formData.append('file', prepared);
        const res = await fetch(`/api/photographer/shows/${showId}/photos`, {
          method: 'POST',
          body: formData,
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || `Upload failed for "${file.name}"`);
        setUploading((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }
      // Pull fresh queue counts / clear the "needs photos" flag.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  }

  const initials = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <Panel
      title="Your photographer page"
      action={
        <Link href={profileHref} target="_blank" className={`text-data-caption-13 ${ADMIN_TYPE.link}`}>
          View public profile ↗
        </Link>
      }
    >
      {error && (
        <div role="alert" className={`${FORM.error} mb-4 flex items-center justify-between gap-3`}>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className={`${ADMIN_TYPE.link} shrink-0`}>
            Dismiss
          </button>
        </div>
      )}

      {/* Profile self-edit */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex items-center gap-3">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="border-surface-ink size-16 border object-cover" />
          ) : (
            <div className="border-surface-ink bg-surface-paper-shade text-header-4 flex size-16 items-center justify-center border font-bold">
              {initials}
            </div>
          )}
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={photoBusy || readOnly}
            className={smallButton}
          >
            {photoBusy ? 'Uploading…' : 'Change photo'}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePhotoUpload(file);
              e.target.value = '';
            }}
          />
        </div>

        <div className="flex-1 space-y-2">
          <Input
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="Instagram (handle or URL)"
            aria-label="Instagram"
            disabled={readOnly}
          />
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Short bio (optional)"
            aria-label="Bio"
            rows={3}
            disabled={readOnly}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={saveProfile}
              disabled={savingProfile || readOnly}
              className={buttonClassName('primary', 's')}
            >
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
            {profileMsg && (
              <span role="status" className={ADMIN_TYPE.meta}>
                {profileMsg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Queue */}
      <div className="border-surface-ink mt-6 border-t pt-4">
        <h3 className={`${ADMIN_TYPE.overline} mb-2`}>Your shows</h3>
        {queue.length === 0 ? (
          <p className={`${ADMIN_TYPE.body} ${ADMIN_TYPE.muted}`}>
            No shows assigned to you yet. When Alex books you for a show, it&apos;ll show up here.
          </p>
        ) : (
          <ul className={ADMIN_TABLE.list}>
            {queue.map((item) => (
              <li key={item.showId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link href={`/shows/${item.slug}`} className={`text-body-3 hover:text-accent-red font-bold underline-offset-4 hover:underline ${ADMIN_TYPE.focus}`}>
                    {item.title}
                  </Link>
                  <p className={ADMIN_TYPE.meta}>{formatDate(item.date)}</p>
                </div>

                <div className="flex items-center gap-3">
                  {!item.isPast ? (
                    <StatusMark tone="neutral">Upcoming shoot</StatusMark>
                  ) : item.needsPhotos ? (
                    <>
                      <StatusMark tone="attention">Needs photos</StatusMark>
                      <label
                        className={`${smallButton} cursor-pointer ${
                          uploading || readOnly ? 'pointer-events-none opacity-30' : ''
                        }`}
                      >
                        {uploading?.showId === item.showId
                          ? `Uploading ${uploading.done}/${uploading.total}…`
                          : 'Upload photos'}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={!!uploading || readOnly}
                          onChange={(e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) handleShowUpload(item.showId, files);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </>
                  ) : (
                    <StatusMark tone="ok">
                      {item.photoCount} photo{item.photoCount === 1 ? '' : 's'}
                    </StatusMark>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
