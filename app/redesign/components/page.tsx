import type { Metadata } from 'next';
import ComponentGallery from './ComponentGallery';

// Preview surface for the DS primitives in components/ui. Not linked, kept out
// of search + the sitemap (app/sitemap.ts is a curated list that never includes
// it) — same posture as /redesign/tokens.
export const metadata: Metadata = {
  title: 'Component preview',
  robots: { index: false, follow: false },
};

export default function ComponentsPreviewPage() {
  return <ComponentGallery />;
}
