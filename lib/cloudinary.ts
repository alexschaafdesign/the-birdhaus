import { v2 as cloudinary } from 'cloudinary';
import type { CloudinaryPhoto } from './cloudinary-url';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'defdv9zw7',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export type { CloudinaryPhoto } from './cloudinary-url';

/**
 * Fetch all images from a Cloudinary folder, oldest first.
 * Runs server-side only (needs CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET).
 * Returns [] if credentials are missing or the request fails, so a missing
 * config never breaks the build.
 */
export async function getPhotosFromFolder(folder: string): Promise<CloudinaryPhoto[]> {
  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.warn(
      `[cloudinary] Missing CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET — skipping gallery for "${folder}".`
    );
    return [];
  }

  try {
    const { resources } = await cloudinary.search
      .expression(`folder:"${folder}" AND resource_type:image`)
      .sort_by('created_at', 'asc')
      .max_results(100)
      .execute();

    return (resources || []).map(
      (r: { public_id: string; secure_url: string; width: number; height: number }) => ({
        publicId: r.public_id,
        url: r.secure_url,
        width: r.width,
        height: r.height,
      })
    );
  } catch (err) {
    console.error(`[cloudinary] Failed to fetch folder "${folder}":`, err);
    return [];
  }
}
