'use client';

import { useState } from 'react';

// The public /rehearsal page's switch, copy and photos, inside the rehearsal
// Settings form (saved with it). Photos upload to R2 ('rehearsal' folder).

const label = 'block text-xs uppercase tracking-wide text-[#E8E0D0]/60';
const hint = 'normal-case tracking-normal text-[#E8E0D0]/40';
const area =
  'w-full min-h-[7rem] rounded border border-[#E8E0D0]/30 bg-[#171412] px-3 py-2 text-sm leading-relaxed focus:outline-none focus:border-[#E8E0D0]/60';

export interface PublicPageValue {
  publicPageEnabled: boolean;
  publicIntro: string;
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
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
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
                <img src={u} alt="" className="aspect-[4/3] w-full rounded object-cover" />
                <div className="flex gap-3 text-xs text-[#E8E0D0]/60">
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
                    className="ml-auto underline hover:text-red-300"
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
          className="block text-sm text-[#E8E0D0]/70 file:mr-3 file:rounded file:border file:border-[#E8E0D0]/30 file:bg-transparent file:px-3 file:py-1 file:text-[#E8E0D0]"
        />
        {uploading && <p className="text-xs text-[#E8E0D0]/60">Uploading…</p>}
        {error && <p className="text-xs text-red-300">{error}</p>}
        <p className={`text-xs ${hint}`}>Photos and text save with the Save settings button below.</p>
      </div>
    </div>
  );
}
