'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClubMember, ProfileLink } from '@/lib/club-members';
import { downscaleImage } from '@/lib/downscale-image';

const inputBase =
  'w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';
// Same look as inputBase but without w-full, so the label/url pair can size
// via flex instead of both fighting to be 100% wide.
const linkInput =
  'rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';
const labelClass = 'mb-1 block text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55';

// Self-service profile, avatar, notification prefs, and password change.
export default function AccountSettings({ member }: { member: ClubMember }) {
  const router = useRouter();
  const [name, setName] = useState(member.name);
  const [bio, setBio] = useState(member.bio ?? '');
  const [links, setLinks] = useState<ProfileLink[]>(member.links ?? []);
  const [avatarUrl, setAvatarUrl] = useState(member.avatar_url);
  const [prefs, setPrefs] = useState({
    notifyTrackComments: member.notify_track_comments,
    notifyAnnouncements: member.notify_announcements,
    notifyEvents: member.notify_events,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwNotice, setPwNotice] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    setProfileNotice(null);
    try {
      const res = await fetch('/api/club/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          bio,
          links: links.filter((l) => l.url.trim()),
          ...prefs,
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
      const res = await fetch('/api/club/account/avatar', { method: 'POST', body: form });
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
    setPwNotice(null);
    try {
      const res = await fetch('/api/club/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't change (${res.status})`);
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
    <div className="space-y-8">
      <form onSubmit={saveProfile} className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.05]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg text-[#E8E0D0]/40">
                {member.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <label className="cursor-pointer text-sm text-[#E8E0D0]/70 underline-offset-2 hover:text-[#E8E0D0] hover:underline">
            {uploadingAvatar ? 'Uploading…' : 'Change avatar'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingAvatar}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
              }}
            />
          </label>
        </div>

        <div>
          <label htmlFor="acct-name" className={labelClass}>
            Name
          </label>
          <input
            id="acct-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputBase}
          />
        </div>

        <div>
          <label htmlFor="acct-bio" className={labelClass}>
            Bio
          </label>
          <textarea
            id="acct-bio"
            rows={3}
            placeholder="A line or two about you and your music."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={`${inputBase} resize-y`}
          />
        </div>

        <div>
          <label className={labelClass}>Links</label>
          <p className="mb-2 text-[11px] text-[#E8E0D0]/40">
            Bandcamp, Instagram, your site — shown on your attendee card.
          </p>
          <div className="space-y-2">
            {links.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Label"
                  value={l.label}
                  onChange={(e) =>
                    setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                  className={`${linkInput} w-28 shrink-0`}
                />
                <input
                  type="text"
                  placeholder="https://…"
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
                  className="shrink-0 px-2 text-lg text-[#E8E0D0]/40 transition hover:text-[#F5A3A3]"
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
              className="mt-2 text-xs text-[#c8a26a]/80 underline-offset-2 transition hover:text-[#c8a26a] hover:underline"
            >
              + Add a link
            </button>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className={labelClass}>Email me when…</legend>
          <Toggle
            label="Someone comments on my track"
            checked={prefs.notifyTrackComments}
            onChange={(v) => setPrefs({ ...prefs, notifyTrackComments: v })}
          />
          <Toggle
            label="There's a new announcement or board post from the Birdhaus"
            checked={prefs.notifyAnnouncements}
            onChange={(v) => setPrefs({ ...prefs, notifyAnnouncements: v })}
          />
          <Toggle
            label="A new Song Club event is scheduled"
            checked={prefs.notifyEvents}
            onChange={(v) => setPrefs({ ...prefs, notifyEvents: v })}
          />
        </fieldset>

        {profileError && (
          <div className="rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
            {profileError}
          </div>
        )}
        {profileNotice && (
          <div className="rounded-lg border border-[#7bb98a]/40 bg-[#7bb98a]/10 p-3 text-sm text-[#bfe6c8]">
            {profileNotice}
          </div>
        )}

        <button
          type="submit"
          disabled={savingProfile}
          className="rounded-md bg-[#E8E0D0] px-5 py-2 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:opacity-50"
        >
          {savingProfile ? 'Saving…' : 'Save profile'}
        </button>
      </form>

      <form onSubmit={changePassword} className="space-y-3 border-t border-[#E8E0D0]/10 pt-6">
        <h2 className="text-sm font-semibold text-[#E8E0D0]">Change password</h2>
        <div>
          <label htmlFor="acct-current-pw" className={labelClass}>
            Current password
          </label>
          <input
            id="acct-current-pw"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputBase}
          />
        </div>
        <div>
          <label htmlFor="acct-new-pw" className={labelClass}>
            New password
          </label>
          <input
            id="acct-new-pw"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputBase}
          />
        </div>
        {pwError && (
          <div className="rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
            {pwError}
          </div>
        )}
        {pwNotice && (
          <div className="rounded-lg border border-[#7bb98a]/40 bg-[#7bb98a]/10 p-3 text-sm text-[#bfe6c8]">
            {pwNotice}
          </div>
        )}
        <button
          type="submit"
          disabled={savingPw || !currentPassword || !newPassword}
          className="rounded-md border border-[#E8E0D0]/40 px-5 py-2 text-sm text-[#E8E0D0]/80 transition hover:border-[#E8E0D0] hover:text-[#E8E0D0] disabled:opacity-40"
        >
          {savingPw ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-[#E8E0D0]/80">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-[#c8a26a]"
      />
      {label}
    </label>
  );
}
