'use client';

import { useState } from 'react';
import type { ClubPin } from '@/lib/club-board';
import { embedSrcFor, isSamplyEmbed, isVideoEmbed } from '@/lib/club-embed';

// Pinned files, players, and links at the top of the Song Club portal.
// Admin-featured pins render as a large player block above everything else;
// the rest sit in the compact "Pinned" list. Embeds render as iframes only
// for allowlisted hosts (lib/club-embed.ts); anything else falls back to a
// plain link. Includes the "pin something" form.
export default function ClubPins({
  initialPins,
  viewerMemberId,
  isAdmin,
}: {
  initialPins: ClubPin[];
  viewerMemberId: number | null;
  isAdmin: boolean;
}) {
  const [pins, setPins] = useState<ClubPin[]>(initialPins);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const featured = pins.filter((p) => p.featured);
  const rest = pins.filter((p) => !p.featured);

  async function remove(id: number) {
    setError(null);
    try {
      const res = await fetch(`/api/club/pins/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't remove (${res.status})`);
      setPins(data.pins ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove");
    }
  }

  async function setFeatured(id: number, value: boolean) {
    setError(null);
    try {
      const res = await fetch(`/api/club/pins/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't update (${res.status})`);
      setPins(data.pins ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update");
    }
  }

  function pinCard(pin: ClubPin, large: boolean) {
    const canDelete = isAdmin || (viewerMemberId !== null && pin.memberId === viewerMemberId);
    const embedSrc = pin.kind === 'embed' ? embedSrcFor(pin.url) : null;
    return (
      <li
        key={pin.id}
        className={`rounded-lg border p-3 ${
          large
            ? 'border-[#c8a26a]/40 bg-[#c8a26a]/[0.06] sm:p-4'
            : 'border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03]'
        }`}
      >
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span
            className={`min-w-0 truncate font-medium text-[#E8E0D0] ${
              large ? 'text-base sm:text-lg' : 'text-sm'
            }`}
          >
            {pin.title}
          </span>
          <span className="flex shrink-0 items-baseline gap-2">
            <span className="text-[10px] text-[#E8E0D0]/35">
              {pin.authorName} · {formatWhen(pin.createdAt)}
            </span>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setFeatured(pin.id, !pin.featured)}
                className="text-[10px] text-[#c8a26a]/70 transition hover:text-[#c8a26a]"
              >
                {pin.featured ? 'unfeature' : 'feature'}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => remove(pin.id)}
                className="text-[10px] text-[#E8E0D0]/35 transition hover:text-[#F5A3A3]"
              >
                remove
              </button>
            )}
          </span>
        </div>

        {embedSrc ? (
          <>
            {/* The iframe sits inside an overflow-hidden box; Samply pages get
                shifted up so their empty header band (dead space + share icon)
                is cropped out of view — we can't restyle a cross-origin page. */}
            <div
              className={`mt-2 overflow-hidden rounded bg-[#E8E0D0]/[0.02] ${embedHeight(
                embedSrc,
                large
              )}`}
            >
              <iframe
                src={embedSrc}
                title={pin.title}
                loading="lazy"
                allow="autoplay; encrypted-media; fullscreen"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                className={`w-full border-0 ${
                  isSamplyEmbed(embedSrc) ? '-mt-24 h-[calc(100%+6rem)]' : 'h-full'
                }`}
              />
            </div>
            <a
              href={pin.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-[#E8E0D0]/45 underline-offset-2 hover:text-[#E8E0D0] hover:underline"
            >
              Open on {hostOf(pin.url)} ↗
            </a>
          </>
        ) : (
          <a
            href={pin.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[#E8E0D0]/70 underline underline-offset-2 transition hover:text-[#E8E0D0]"
          >
            {pin.kind === 'file'
              ? `Download${pin.sizeBytes ? ` (${formatBytes(pin.sizeBytes)})` : ''}`
              : `${hostOf(pin.url)} ↗`}
          </a>
        )}
      </li>
    );
  }

  return (
    <section>
      {featured.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#c8a26a]/80">
            Now playing
          </h2>
          <ul className="space-y-3">{featured.map((p) => pinCard(p, true))}</ul>
        </div>
      )}

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
          Pinned
        </h2>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-xs text-[#E8E0D0]/55 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
        >
          {adding ? 'Close' : '+ Pin something'}
        </button>
      </div>

      {adding && (
        <AddPinForm
          isAdmin={isAdmin}
          onAdded={(next) => {
            setPins(next);
            setAdding(false);
          }}
        />
      )}

      {error && (
        <div className="mb-3 rounded border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-sm text-red-200">
          {error}
        </div>
      )}

      {rest.length === 0 ? (
        !adding &&
        featured.length === 0 && (
          <p className="text-sm text-[#E8E0D0]/40">
            Nothing pinned yet — share a Samply link, a demo, or a lyric sheet.
          </p>
        )
      ) : (
        <ul className="space-y-3">{rest.map((p) => pinCard(p, false))}</ul>
      )}
    </section>
  );
}

const inputBase =
  'w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';

function AddPinForm({
  isAdmin,
  onAdded,
}: {
  isAdmin: boolean;
  onAdded: (pins: ClubPin[]) => void;
}) {
  const [tab, setTab] = useState<'link' | 'file'>('link');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [feature, setFeature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let res: Response;
      if (tab === 'file') {
        if (!file) throw new Error('Pick a file first.');
        const form = new FormData();
        form.set('file', file);
        form.set('title', title);
        if (isAdmin && feature) form.set('featured', 'true');
        res = await fetch('/api/club/pins', { method: 'POST', body: form });
      } else {
        // Whether a pasted URL becomes a player or a plain link is decided at
        // render time (embedSrcFor) — pin it as 'embed' and let it degrade.
        res = await fetch('/api/club/pins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'embed', title, url, featured: isAdmin && feature }),
        });
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't pin (${res.status})`);
      onAdded(data.pins ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't pin");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mb-4 space-y-3 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4"
    >
      <div className="flex gap-4 text-xs">
        {(['link', 'file'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`uppercase tracking-wide transition ${
              tab === t ? 'font-semibold text-[#E8E0D0]' : 'text-[#E8E0D0]/45 hover:text-[#E8E0D0]'
            }`}
          >
            {t === 'link' ? 'Link / player' : 'File'}
          </button>
        ))}
      </div>

      <input
        type="text"
        required={tab === 'link'}
        placeholder={tab === 'link' ? 'Title' : 'Title (optional — defaults to the filename)'}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={inputBase}
      />

      {tab === 'link' ? (
        <div>
          <input
            type="url"
            required
            placeholder="https://samply.app/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={inputBase}
          />
          <p className="mt-1 text-[11px] text-[#E8E0D0]/40">
            Samply, Bandcamp, SoundCloud, Spotify, YouTube, Vimeo, and Drive
            links show up as players — anything else pins as a link.
          </p>
        </div>
      ) : (
        <div>
          <input
            type="file"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-[#E8E0D0]/70 file:mr-3 file:rounded file:border-0 file:bg-[#E8E0D0]/15 file:px-3 file:py-1.5 file:text-sm file:text-[#E8E0D0]"
          />
          <p className="mt-1 text-[11px] text-[#E8E0D0]/40">
            Up to 4 MB — good for PDFs, lyric sheets, images. For audio, pin a
            Samply or Bandcamp link instead.
          </p>
        </div>
      )}

      {isAdmin && (
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#c8a26a]/80">
          <input
            type="checkbox"
            checked={feature}
            onChange={(e) => setFeature(e.target.checked)}
            className="accent-[#c8a26a]"
          />
          Feature it in “Now playing” at the top
        </label>
      )}

      {error && (
        <div className="rounded border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-sm text-red-200">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded border border-[#E8E0D0] bg-[#E8E0D0] px-5 py-2 text-sm font-medium text-[#2A2420] transition-colors hover:bg-[#E8E0D0]/90 disabled:opacity-50"
      >
        {busy ? 'Pinning…' : 'Pin it'}
      </button>
    </form>
  );
}

// Samply embeds are whole app pages (a browsable folder), so featured ones
// get a tall panel — most of the viewport — instead of a player-strip height.
// Video wants 16:9; the fixed-height widgets (Spotify/SoundCloud strips) stay
// short because extra height just shows blank space.
function embedHeight(src: string, large: boolean): string {
  if (isVideoEmbed(src)) return 'aspect-video';
  if (isSamplyEmbed(src)) return large ? 'h-[150vh] min-h-[56rem]' : 'h-96';
  return large ? 'h-64 sm:h-80' : 'h-40';
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
