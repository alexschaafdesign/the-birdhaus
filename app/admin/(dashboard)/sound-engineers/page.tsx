import { sql } from '@/lib/db';
import SoundEngineersList, { type SoundEngineerListItem } from '@/components/admin/SoundEngineersList';

export const dynamic = 'force-dynamic';

async function getEngineers(): Promise<SoundEngineerListItem[]> {
  const rows = await sql<SoundEngineerListItem[]>`
    select se.id, se.name, se.photo, se.instagram, se.contact_email,
      (select count(*)::int from show_sound_engineers sse where sse.sound_engineer_id = se.id) as show_count
    from sound_engineers se
    order by se.name asc
  `;
  // bigserial ids arrive as strings over the wire; coerce so client keys/links match.
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

export default async function AdminSoundEngineersPage() {
  const engineers = await getEngineers();
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6">
      <SoundEngineersList initialEngineers={engineers} />
    </main>
  );
}
