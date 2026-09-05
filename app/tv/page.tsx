import type { Metadata } from 'next';
import TvScreen from './TvScreen';

// In-venue CRT display: a Raspberry Pi in kiosk mode points Chromium here and
// feeds a 4:3 tube over composite for the whole show. Not a page for humans
// with keyboards — no chrome (Header/AdminBanner self-hide for /tv), no
// sitemap entry, no indexing.
export const metadata: Metadata = {
  title: 'TV',
  robots: { index: false, follow: false },
};

export default function TvPage() {
  return <TvScreen />;
}
