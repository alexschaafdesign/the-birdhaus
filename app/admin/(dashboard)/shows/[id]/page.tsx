import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { getTodayCentral } from '@/lib/shows';
import { getOneShowHealth } from '@/lib/show-health-data';
import { getShowAdvanceState } from '@/lib/advance';
import ShowForm from '@/components/admin/ShowForm';
import ShowOverview from '@/components/admin/ShowOverview';
import ShowBookingNotes from '@/components/admin/ShowBookingNotes';
import { ScheduleCard } from '@/components/hub/ShowHubView';
import { loadShowFormData } from './form-data';

export const dynamic = 'force-dynamic';

// The Overview tab: the one page for a show's essentials — the checklist, the
// basics + the lineup (one form, one Save), the night's schedule (which sets
// the doors/show times), and this date's booking notes. Crew, the Portal,
// public page, RSVPs and settlement live on the other tabs.
export default async function ShowOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [data, facts, advance, [counts]] = await Promise.all([
    loadShowFormData(showId),
    getOneShowHealth(showId),
    getShowAdvanceState(showId),
    sql<{ active_band_count: number; bands_with_inputs: number; settlement_saved: boolean }[]>`
      select
        (select count(*)::int from show_bands where show_id = ${showId} and not excluded) as active_band_count,
        (select count(distinct band_id)::int from show_input_items where show_id = ${showId}) as bands_with_inputs,
        exists(select 1 from settlements where show_id = ${showId}) as settlement_saved
    `,
  ]);
  if (!data || !facts) notFound();

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
      <ShowOverview
        showId={showId}
        facts={facts}
        today={getTodayCentral()}
        confirmedEngineer={data.confirmedEngineer}
        doorPerson={data.row.door_person_name?.trim() || null}
        photographerName={data.assignedPhotographerName}
        bandsWithInputs={counts?.bands_with_inputs ?? 0}
        activeBandCount={counts?.active_band_count ?? 0}
        settlementSaved={counts?.settlement_saved ?? false}
      />
      <ShowForm
        key={formKey}
        mode="edit"
        embedded
        section="overview"
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
