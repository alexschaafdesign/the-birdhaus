import sharp from 'sharp';
import { R2_PUBLIC_BASE } from '@/lib/r2-public';

// TV-sized variants of R2-hosted images (flyers, band photos), for /tv only.
//
// The originals on images.thebirdhaus.org are up to 1400px (older ones bigger
// still) — fine for the public site, poison for the Pi 3B+ behind the CRT,
// which software-decodes every image and then paints it into a ≤640px stage.
// This route serves a 640px JPEG instead: /api/tv/img?src=flyers/<key>.
//
// Cloudinary-hosted images don't come through here — Cloudinary resizes
// itself via URL transforms (see lib/cloudinary-url.ts). And this is not the
// Vercel Image Optimization API, which bills per-transformation on this plan;
// it's one cheap function hit per unique image, then the CDN serves it: keys
// are content-addressed (timestamp + random suffix), so the response is
// immutable and cacheable forever.

export const dynamic = 'force-dynamic';

// One fixed width, no size parameter: every consumer shares one cached
// variant, and the URL space can't be abused to mint unbounded transforms.
// 640 = the TV stage width; the bounce mode displays at 384 and scaling a
// 640px decode down is cheap (it's the multi-megapixel decodes that hurt).
const TV_WIDTH = 640;

// Only folders the TV feed actually references.
const ALLOWED_PREFIXES = ['flyers/', 'bands/'];
// Object keys are server-generated (folder/timestamp-hex.ext) — anything
// outside this shape is not ours to fetch.
const KEY_RE = /^[a-z0-9/_-]+\.[a-z0-9]+$/i;

// Matches the TV stage background (tv.module.css --bg) so transparent PNG
// flyers flatten into the set instead of turning white/black under JPEG.
const FLATTEN_BG = '#0b0c0e';

export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get('src') ?? '';
  if (
    !KEY_RE.test(src) ||
    src.includes('..') ||
    !ALLOWED_PREFIXES.some((p) => src.startsWith(p))
  ) {
    return new Response('bad src', { status: 400 });
  }

  const upstream = await fetch(`${R2_PUBLIC_BASE}/${src}`);
  if (!upstream.ok) {
    // The TV's preload gate treats a failed image as "run copy-only", so an
    // honest error here degrades gracefully on the tube.
    return new Response('upstream fetch failed', { status: 502 });
  }

  try {
    const original = Buffer.from(await upstream.arrayBuffer());
    // Baseline JPEG on purpose (no mozjpeg/progressive): progressive decode
    // costs multiple passes, and the whole point is cheap decodes on the Pi.
    const resized = await sharp(original)
      .rotate()
      .resize(TV_WIDTH, TV_WIDTH * 2, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: FLATTEN_BG })
      .jpeg({ quality: 82 })
      .toBuffer();

    return new Response(new Uint8Array(resized), {
      headers: {
        'Content-Type': 'image/jpeg',
        // Immutable: the key embeds a timestamp + random suffix, so the file
        // at a given URL never changes. CDN caches it; the function runs once
        // per unique image per region.
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      },
    });
  } catch {
    return new Response('resize failed', { status: 502 });
  }
}
