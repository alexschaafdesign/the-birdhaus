import { getAllTvImages } from '@/lib/tv-images';
import TvImagesList from '@/components/admin/TvImagesList';

export const dynamic = 'force-dynamic';

export default async function AdminTvImagesPage() {
  const images = await getAllTvImages();
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6">
      <TvImagesList initialImages={images} />
    </main>
  );
}
