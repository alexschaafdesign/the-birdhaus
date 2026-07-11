import { getAllBandsWithPlayCount } from '@/lib/bands';
import BandsGallery from '@/components/BandsGallery';

export default async function BandsPage() {
  const bands = await getAllBandsWithPlayCount();

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-5xl font-bold mb-2">Bands</h1>
        <BandsGallery bands={bands} />
      </div>
    </main>
  );
}
