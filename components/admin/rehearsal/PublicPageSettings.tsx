'use client';

import { useState } from 'react';
import { FORM } from '@/components/night/form';

// The public /rehearsal page's switch, copy and photos, inside the rehearsal
// Settings form (saved with it). Photos upload to R2 ('rehearsal' folder).

const label = FORM.label;
const hint = 'font-normal normal-case tracking-normal text-surface-ink/60';
const area = `${FORM.field} min-h-28 leading-relaxed`;

export interface PublicPageValue {
  publicPageEnabled: boolean;
  publicIntro: string;
  publicFactsLine: string;
  houseRules: string;
  photoUrls: string[];
}

export default function PublicPageSettings({
  value,
  onChange,
}: {
  value: PublicPageValue;
  onChange: (patch: Partial<PublicPageValue>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    const added: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('folder', 'rehearsal');
        const res = await fetch('/api/admin/uploads', { method: 'POST', body: form });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.url) throw new Error(data?.error ?? `Upload failed (${res.status})`);
        added.push(data.url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      if (added.length) onChange({ photoUrls: [...value.photoUrls, ...added].slice(0, 12) });
      setUploading(false);
    }
  }

  function move(i: number, d: -1 | 1) {
    const next = [...value.photoUrls];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ photoUrls: next });
  }

  return (
    <div className="space-y-4">
      <label className="text-body-3 flex cursor-pointer flex-wrap items-center gap-2">
        <input
          type="checkbox" className="accent-surface-ink size-4"
          checked={value.publicPageEnabled}
          onChange={(e) => onChange({ publicPageEnabled: e.target.checked })}
        />
        Show the public page at <code>/rehearsal</code>{' '}
        <span className={hint}>(off = the page is a 404; links and invites still work)</span>
      </label>
      <label className="block space-y-1.5">
        <span className={label}>
          Intro <span className={hint}>(the pitch at the top; blank lines make paragraphs)</span>
        </span>
        <textarea value={value.publicIntro} onChange={(e) => onChange({ publicIntro: e.target.value })} className={area} />
      </label>
      <label className="block space-y-1.5">
        <span className={label}>
          Facts line <span className={hint}>(the short red line under the intro)</span>
        </span>
        <input
          value={value.publicFactsLine}
          maxLength={300}
          onChange={(e) => onChange({ publicFactsLine: e.target.value })}
          className={FORM.field}
        />
      </label>
      <label className="block space-y-1.5">
        <span className={label}>
          House rules <span className={hint}>(one per line; shown as a short list)</span>
        </span>
        <textarea value={value.houseRules} onChange={(e) => onChange({ houseRules: e.target.value })} className={area} />
      </label>
      <div className="space-y-2">
        <span className={label}>
          Photos <span className={hint}>(up to 12; first one leads)</span>
        </span>
        {value.photoUrls.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {value.photoUrls.map((u, i) => (
              <li key={u} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="aspect-[4/3] w-full object-cover" />
                <div className="flex gap-3 text-data-caption-13 text-surface-ink/60">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="underline disabled:opacity-30">
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === value.photoUrls.length - 1}
                    className="underline disabled:opacity-30"
                  >
                    →
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ photoUrls: value.photoUrls.filter((x) => x !== u) })}
                    className="text-accent-red ml-auto cursor-pointer underline underline-offset-4 hover:no-underline"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={uploading || value.photoUrls.length >= 12}
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = '';
          }}
          className="block text-body-3 text-surface-ink/70 file:mr-3 file:cursor-pointer file:border file:border-surface-ink file:bg-transparent file:px-3 file:py-1 file:text-surface-ink"
        />
        {uploading && <p className="text-data-caption-13 text-surface-ink/60">Uploading…</p>}
        {error && <p role="alert" className={FORM.error}>{error}</p>}
        <p className={`text-data-caption-13 ${hint}`}>Photos and text save with the Save settings button below.</p>
      </div>
    </div>
  );
}
