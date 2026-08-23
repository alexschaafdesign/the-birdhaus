import { getAllBandsWithPlayCount } from '@/lib/bands';
import BandsGallery from '@/components/BandsGallery';

export default async function BandsPage() {
  const bands = await getAllBandsWithPlayCount();

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="vhs-stripes h-1.5 w-24 mb-3" aria-hidden="true" />
        <h1 className="text-5xl font-bold mb-2 uppercase tracking-tight">Bands</h1>
        <BandsGallery bands={bands} />
      </div>
    </main>
  );
}
