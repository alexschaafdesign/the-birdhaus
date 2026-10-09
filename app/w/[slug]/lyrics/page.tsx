import { redirect } from 'next/navigation';

// The lyrics desk moved to the workspace root when it became the main room;
// old /lyrics links (and their ?song=) land there.
export default async function LyricsDeskRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ song?: string }>;
}) {
  const { slug } = await params;
  const { song } = await searchParams;
  redirect(`/w/${slug}${song ? `?song=${encodeURIComponent(song)}` : ''}`);
}
