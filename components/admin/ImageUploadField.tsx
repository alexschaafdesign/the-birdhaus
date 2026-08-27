'use client';

import { useRef, useState } from 'react';
import type { UploadFolder } from '@/lib/r2';
import { downscaleImage } from '@/lib/downscale-image';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB — mirrors the server-side limit in app/api/admin/uploads/route.ts

export default function ImageUploadField({
  label,
  value,
  onChange,
  folder,
  placeholder,
  previewClassName = 'mt-2 max-w-xs rounded',
}: {
  label?: string;
  value: string;
  onChange: (url: string) => void;
  folder: UploadFolder;
  placeholder?: string;
  previewClassName?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }

    setUploading(true);
    try {
      // Shrink big originals in the browser so a full-res photo slips under the
      // upload cap; the server still does the authoritative resize. Gallery
      // photos keep more headroom — they open in a full-screen lightbox.
      const prepared = await downscaleImage(file, { maxDim: folder === 'photos' ? 2400 : 1600 });
      if (prepared.size > MAX_SIZE_BYTES) {
        setError('Image is too large even after resizing (max 8MB).');
        return;
      }
      const formData = new FormData();
      formData.append('file', prepared);
      formData.append('folder', folder);
      const res = await fetch('/api/admin/uploads', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Upload failed');
      onChange(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {label && (
        <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">{label}</label>
      )}
      <div className="flex items-center gap-2">
        <input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} w-full`}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-xs border border-[#E8E0D0]/30 rounded px-3 py-1.5 hover:bg-[#E8E0D0]/10 disabled:opacity-50 whitespace-nowrap flex-shrink-0"
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className={previewClassName} />
      )}
    </div>
  );
}
