'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserAccount, ProfileLink } from '@/lib/accounts/members';
import { downscaleImage } from '@/lib/downscale-image';
import { FORM } from '@/components/night/form';

// The label/url pair sizes via flex (w-28 / flex-1) instead of both fighting
// to be 100% wide, so their field drops FORM.field's w-full.
const linkInput = FORM.field.replace('w-full ', '');

// Self-service profile, avatar, notification prefs, and password change.
export default function AccountSettings({ member }: { member: UserAccount }) {
  const router = useRouter();
  const [name, setName] = useState(member.name);
  const [bio, setBio] = useState(member.bio ?? '');
  const [links, setLinks] = useState<ProfileLink[]>(member.links ?? []);
  const [avatarUrl, setAvatarUrl] = useState(member.avatar_url);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwNotice, setPwNotice] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  // "Current password is incorrect" is about the current-password field:
  // shown under it with a red border. Other password errors sit above the
  // button.
  const [pwErrorOnCurrent, setPwErrorOnCurrent] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    setProfileNotice(null);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          bio,
          links: links.filter((l) => l.url.trim()),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't save (${res.status})`);
      setProfileNotice('Saved.');
      router.refresh();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    setProfileError(null);
    try {
      // Shrink big originals in the browser so they slip under Vercel's ~4.5 MB
      // request-body cap; the server does the final resize. Mirrors every other
      // image upload flow (see RoundCover, ImageUploadField).
      const prepared = await downscaleImage(file);
      const form = new FormData();
      form.set('file', prepared);
      const res = await fetch('/api/account/avatar', { method: 'POST', body: form });
      // A 413 comes from the platform before our handler runs (no JSON body), so
      // give a plain-language reason instead of a bare status code.
      if (res.status === 413) {
        throw new Error("That image is too big — try one under a few MB.");
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Upload failed (${res.status})`);
      setAvatarUrl(data.avatarUrl);
      router.refresh();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPw(true);
    setPwError(null);
    setPwErrorOnCurrent(false);
    setPwNotice(null);
    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message: string = data?.error ?? `Couldn't change (${res.status})`;
        setPwErrorOnCurrent(res.status === 400 && /current password/i.test(message));
        throw new Error(message);
      }
      setPwNotice('Password changed.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Couldn't change password");
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <form onSubmit={saveProfile} className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <div className="border-surface-ink size-16 shrink-0 overflow-hidden rounded-full border">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="text-header-4 flex h-full w-full items-center justify-center">
                {member.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <label className={`${FORM.link} text-body-3 has-[:focus-visible]:outline-accent-red has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2`}>
            {uploadingAvatar ? 'Uploading…' : 'Change avatar'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploadingAvatar}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
              }}
            />
          </label>
        </div>

        <div>
          <label htmlFor="acct-name" className={FORM.label}>
            Name
          </label>
          <input
            id="acct-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FORM.field}
          />
        </div>

        <div>
          <label htmlFor="acct-bio" className={FORM.label}>
            Bio
          </label>
          <textarea
            id="acct-bio"
            rows={3}
            placeholder="A line or two about you and your music."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={`${FORM.field} resize-y`}
          />
        </div>

        <div>
          <p className={FORM.label}>Links</p>
          <p className={FORM.hint}>
            Bandcamp, Instagram, your site — shown on your attendee card.
          </p>
          <div className="space-y-2">
            {links.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Label"
                  aria-label={`Link ${i + 1} label`}
                  value={l.label}
                  onChange={(e) =>
                    setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                  className={`${linkInput} w-28 shrink-0`}
                />
                <input
                  type="text"
                  placeholder="https://…"
                  aria-label={`Link ${i + 1} URL`}
                  value={l.url}
                  onChange={(e) =>
                    setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                  }
                  className={`${linkInput} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={() => setLinks(links.filter((_, j) => j !== i))}
                  aria-label="Remove link"
                  className="hover:text-accent-red focus-visible:outline-accent-red text-body-1 shrink-0 cursor-pointer px-2 focus-visible:outline-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          {links.length < 8 && (
            <button
              type="button"
              onClick={() => setLinks([...links, { label: '', url: '' }])}
              className={`${FORM.link} text-body-3 mt-3`}
            >
              + Add a link
            </button>
          )}
        </div>

        {profileError && (
          <p className={FORM.error} role="alert">
            {profileError}
          </p>
        )}
        {profileNotice && (
          <div className={FORM.notice} role="status">
            {profileNotice}
          </div>
        )}

        <button
          type="submit"
          disabled={savingProfile}
          className={FORM.primary}
        >
          {savingProfile ? 'Saving…' : 'Save profile'}
        </button>
      </form>

      <form onSubmit={changePassword} className="border-surface-ink/20 flex flex-col gap-4 border-t pt-8">
        <h2 className={FORM.label}>Change password</h2>
        <div>
          <label htmlFor="acct-current-pw" className={FORM.label}>
            Current password
          </label>
          <input
            id="acct-current-pw"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            aria-invalid={pwErrorOnCurrent ? true : undefined}
            aria-describedby={pwErrorOnCurrent ? 'acct-pw-error' : undefined}
            className={pwErrorOnCurrent ? FORM.fieldInvalid : FORM.field}
          />
          {pwError && pwErrorOnCurrent && (
            <p id="acct-pw-error" className={FORM.fieldError} role="alert">
              {pwError}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="acct-new-pw" className={FORM.label}>
            New password
          </label>
          <input
            id="acct-new-pw"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={FORM.field}
          />
        </div>
        {pwError && !pwErrorOnCurrent && (
          <p className={FORM.error} role="alert">
            {pwError}
          </p>
        )}
        {pwNotice && (
          <div className={FORM.notice} role="status">
            {pwNotice}
          </div>
        )}
        <button
          type="submit"
          disabled={savingPw || !currentPassword || !newPassword}
          className={FORM.secondary}
        >
          {savingPw ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
