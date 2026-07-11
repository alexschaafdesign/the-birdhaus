import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getShowsForBand } from '@/lib/bands';
import BandForm, { type BandFormInitialValues } from '@/components/admin/BandForm';

export const dynamic = 'force-dynamic';

interface BandRow {
  id: number;
  name: string;
  instagram: string | null;
  bio: string | null;
  photo: string | null;
  is_touring: boolean;
  hometown: string | null;
}

export default async function EditBandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bandId = Number(id);
  if (!Number.isInteger(bandId)) notFound();

  const [row] = await sql<
    BandRow[]
  >`select id, name, instagram, bio, photo, is_touring, hometown from bands where id = ${bandId}`;
  if (!row) notFound();

  const linkedShows = await getShowsForBand(bandId);

  const initialValues: BandFormInitialValues = {
    id: row.id,
    name: row.name,
    instagram: row.instagram,
    bio: row.bio,
    photo: row.photo,
    isTouring: row.is_touring,
    hometown: row.hometown,
  };

  return (
    <main className="max-w-3xl mx-auto px-6 pb-16 pt-6">
      <BandForm mode="edit" initialValues={initialValues} linkedShows={linkedShows} />
    </main>
  );
}
