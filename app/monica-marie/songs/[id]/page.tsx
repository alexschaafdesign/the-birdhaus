import { redirect } from 'next/navigation';

export default async function MonicaMarieSongRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  redirect(`/w/monica-marie/songs/${(await params).id}`);
}
