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
  contact_email: string | null;
  payment_method: string | null;
  twinscene_slug: string | null;
}

export default async function EditBandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bandId = Number(id);
  if (!Number.isInteger(bandId)) notFound();

  const [row] = await sql<
    BandRow[]
  >`select id, name, instagram, bio, photo, is_touring, hometown, contact_email, payment_method, twinscene_slug from bands where id = ${bandId}`;
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
    contactEmail: row.contact_email,
    paymentMethod: row.payment_method,
    twinsceneSlug: row.twinscene_slug,
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <BandForm mode="edit" initialValues={initialValues} linkedShows={linkedShows} />
    </main>
  );
}
