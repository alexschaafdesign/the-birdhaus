import Link from 'next/link';
import { SiteFrame } from '@/components/night/SiteFrame';
import { ButtonArrow, buttonClassName } from '@/components/ui/Button';

// 404 (2027 frame): any unknown path, and every notFound() — an unknown show,
// band or photographer, a private booking, a photographer with no photos.
export default function NotFound() {
  return (
    <SiteFrame stats={null}>
      <section className="flex max-w-2xl flex-col gap-4 py-6">
        <p className="text-data-overline-11 text-accent-red font-bold tracking-[--spacing(0.625)] uppercase">404</p>
        <h1 className="text-header-1 leading-none font-bold uppercase">Nothing here</h1>
        <p className="text-body-3 leading-normal">
          This page flew the coop. The show, band, or link you&rsquo;re after may have moved or never existed.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/" className={`${buttonClassName('primary', 's')} w-fit`}>
            Home
            <ButtonArrow size="s" />
          </Link>
          <Link href="/archive" className={`${buttonClassName('secondary', 's')} w-fit`}>
            Archive
            <ButtonArrow size="s" />
          </Link>
        </div>
      </section>
    </SiteFrame>
  );
}
