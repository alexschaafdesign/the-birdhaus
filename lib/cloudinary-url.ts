// Pure URL helpers — no `cloudinary` SDK import here, so this is safe to
// pull into client components (the SDK in lib/cloudinary.ts is server-only
// and configured with API secrets).

export interface CloudinaryPhoto {
  publicId: string;
  url: string;
  width: number;
  height: number;
  format: string;
}

/**
 * Inserts a resize/format transformation into a Cloudinary delivery URL, so
 * Cloudinary serves an already-resized AVIF/WebP file instead of the raw
 * original. `next/image` renders these `unoptimized` (see components using
 * this) so Vercel's Image Optimization API — which bills per-transformation
 * on the free tier — never touches them; Cloudinary does the resizing instead.
 * c_limit means it downsizes but never upscales past the original.
 */
export function cloudinaryTransform(url: string, width: number): string {
  return url.replace('/image/upload/', `/image/upload/w_${width},c_limit,q_auto,f_auto/`);
}
