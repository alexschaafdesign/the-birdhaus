import type { Metadata } from 'next';
import TokenSpecimen from './TokenSpecimen';

// Validation surface for the generated tokens.css — not linked from anywhere
// and kept out of search + the sitemap (app/sitemap.ts is a curated list that
// never includes it).
export const metadata: Metadata = {
  title: 'Token specimen',
  robots: { index: false, follow: false },
};

export default function TokenSpecimenPage() {
  return <TokenSpecimen />;
}
