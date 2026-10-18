import type { Metadata } from 'next';
import { getAllBandsWithPlayCount } from '@/lib/bands';
import { SiteFrame } from '@/components/night/SiteFrame';
import { SectionHeader } from '@/components/ui/SectionHeader';
import BandsGallery from '@/components/BandsGallery';

// Every band that's played the Birdhaus (2027 frame). No nav item: reached
// from the archive's "All bands →" link, band links on night pages, and the
// sitemap. ARCHIVE is the lit nav item.

export const metadata: Metadata = {
  title: 'Bands',
  description: "Every band that's played the Birdhaus.",
  alternates: { canonical: '/bands' },
};

export default async function BandsPage() {
  const bands = await getAllBandsWithPlayCount();

  return (
    <SiteFrame stats={null} navPath="/bands">
      <h1 className="sr-only">Bands</h1>
      <section aria-labelledby="bands" className="flex flex-col gap-4">
        <SectionHeader id="bands" label="Bands" rule="none" />
        <BandsGallery bands={bands} />
      </section>
    </SiteFrame>
  );
}
