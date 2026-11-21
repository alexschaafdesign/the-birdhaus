import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getShowAdvanceState } from '@/lib/advance';
import { getOneShowHealth } from '@/lib/show-health-data';
import { openTodos } from '@/lib/show-health';
import { getTodayCentral } from '@/lib/shows';
import ShowForm from '@/components/admin/ShowForm';
import ShowBookingNotes from '@/components/admin/ShowBookingNotes';
import { ScheduleCard } from '@/components/hub/ShowHubView';
import { loadShowFormData } from './form-data';

export const dynamic = 'force-dynamic';

// The Overview tab: the one page for a show's essentials — the basics + the lineup (one form, one Save), the night's schedule (which sets
// the doors/show times), and this date's booking notes. Crew, the Portal,
// public page, RSVPs and settlement live on the other tabs.
export default async function ShowOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [data, advance, facts] = await Promise.all([
    loadShowFormData(showId),
    getShowAdvanceState(showId),
    getOneShowHealth(showId),
  ]);
  if (!data) notFound();
  // Open to-dos, marked on the fields that fix them.
  const todos = facts ? openTodos(facts, getTodayCentral()) : {};

  // This date's notes from the Booking calendar (booking_days), edited in place.
  const [bookingDay] = await sql<{ title: string | null; notepad: string | null }[]>`
    select title, notepad from booking_days where date = ${data.row.date}
  `;

  // Remount the form whenever the saved lineup or its contacts change (after a
  // save + refresh), so newly added bands get their ids and saved contacts as
  // the new baseline.
  const formKey = JSON.stringify(data.initialValues.bands ?? []);

  return (
    <div className="space-y-6">
      <ShowForm
        key={formKey}
        mode="edit"
        embedded
        section="overview"
        todos={todos}
        initialValues={data.initialValues}
        isPast={data.isPastShow}
        nightDate={data.nightDate}
      />
      {advance && (
        <div id="schedule" className="scroll-mt-6">
          <ScheduleCard
            schedule={advance.vars.schedule}
            soundcheckNotes={advance.vars.soundcheck_notes.trim()}
            adminState={advance}
          />
        </div>
      )}
      <ShowBookingNotes
        date={data.row.date}
        initialTitle={bookingDay?.title ?? ''}
        initialNotepad={bookingDay?.notepad ?? ''}
      />
    </div>
  );
}
