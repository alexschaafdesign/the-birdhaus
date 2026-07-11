import Link from 'next/link';
import { getAllBands } from '@/lib/bands';

export default async function BandsPage() {
  const bands = await getAllBands();

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-5xl font-bold mb-2">Bands</h1>
        <p className="text-[#E8E0D0]/70 mb-10">Every band that&rsquo;s played the Birdhaus.</p>

        {bands.length === 0 ? (
          <p className="text-[#E8E0D0]/60">No bands yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {bands.map((band) => (
              <Link
                key={band.id}
                href={`/bands/${band.slug}`}
                className="group block"
              >
                <div className="aspect-square rounded-lg overflow-hidden bg-[#E8E0D0]/5 border border-[#E8E0D0]/15 group-hover:border-[#E8E0D0]/50 transition-colors">
                  {band.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={band.photo}
                      alt={band.name}
                      className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl font-bold text-[#E8E0D0]/20">
                        {band.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-center font-medium truncate group-hover:text-[#E8E0D0]/70 transition-colors">
                  {band.name}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
