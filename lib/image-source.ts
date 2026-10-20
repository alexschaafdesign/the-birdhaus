import { cloudinaryTransform } from './cloudinary-url';

// How a stored photo URL should reach next/image, so a tile downloads a
// tile-sized file instead of the original (band photos up to 3.5 MB, gallery
// uploads up to 2400px):
//   * our R2 bucket (images.thebirdhaus.org): through Next's optimizer, which
//     serves a resized WebP per the <Image sizes> (next.config `images`);
//   * Cloudinary: resized by Cloudinary itself (a w_… transform) and kept off
//     Vercel's optimizer, which bills per transformation (lib/cloudinary-url);
//   * any other host: as is. next/image refuses to optimize a host that isn't
//     in next.config remotePatterns, so this keeps an odd URL from breaking the
//     page.
// Pure, so client components can use it.

const OPTIMIZER_HOSTS = new Set(['images.thebirdhaus.org']);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** `cloudinaryWidth`: the width to ask Cloudinary for, about 2× the largest
 *  rendered size. Ignored for other hosts. */
export function imageSource(url: string, cloudinaryWidth: number): { src: string; unoptimized: boolean } {
  const host = hostOf(url);
  if (host && OPTIMIZER_HOSTS.has(host)) return { src: url, unoptimized: false };
  if (host === 'res.cloudinary.com') return { src: cloudinaryTransform(url, cloudinaryWidth), unoptimized: true };
  return { src: url, unoptimized: true };
}
