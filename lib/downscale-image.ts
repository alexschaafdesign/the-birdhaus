// Client-side image downscale, run BEFORE an upload so a big original slips
// under the request-body size cap. The server (uploadToR2) still does the
// authoritative resize/re-encode — this just gets multi-megabyte photos through
// the door (Vercel functions cap the request body, and /api/admin/uploads caps
// at 8MB). Draw to a canvas at a capped long edge, then step JPEG quality down
// until it fits `maxBytes`.
//
// Fail-open: anything unexpected (decode error, no canvas, still too big at the
// floor quality) returns the original file so the server-side cap stays the
// backstop and nothing silently corrupts. GIFs pass straight through — a canvas
// flatten would kill the animation.

interface DownscaleOptions {
  // Longest edge of the output, px. Only ever shrinks (never upscales).
  maxDim?: number;
  // Target byte ceiling; quality steps down until the JPEG fits.
  maxBytes?: number;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export async function downscaleImage(file: File, opts: DownscaleOptions = {}): Promise<File> {
  const maxDim = opts.maxDim ?? 1600;
  const maxBytes = opts.maxBytes ?? 4 * 1024 * 1024; // under Vercel's ~4.5MB body cap

  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  // Already small enough and not oversized — leave it alone.
  if (file.size <= maxBytes) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxDim / longest);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const rename = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    let smallest: Blob | null = null;
    for (const quality of [0.85, 0.72, 0.6]) {
      const blob = await toJpeg(canvas, quality);
      if (!blob) continue;
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= maxBytes) {
        return new File([blob], rename, { type: 'image/jpeg' });
      }
    }
    // Nothing hit the target (rare at 1600px): send the smallest we managed if
    // it at least beats the original, else fall back to the original.
    if (smallest && smallest.size < file.size) {
      return new File([smallest], rename, { type: 'image/jpeg' });
    }
    return file;
  } catch {
    return file;
  }
}
