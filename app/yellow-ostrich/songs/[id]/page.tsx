import { redirect } from 'next/navigation';

export default async function YellowOstrichSongRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  redirect(`/w/yellow-ostrich/songs/${(await params).id}`);
}
