// Outbound booking planning (future seasons) — separate from the inbound
// submissions desk. See scripts/migrations/092_booking.sql and
// 104_booking_days.sql.
//
// Pure types/constants only (no db import) so client components can share
// them. Queries live in the booking page and /api/admin/booking routes.

// Stored on booking_prospects (the artist wishlist). The wishlist no longer
// shows a status; the column keeps its original values for compatibility.
export type ProspectStatus = 'idea' | 'contacted' | 'in_talks' | 'hold' | 'booked' | 'passed';

export const PROSPECT_STATUSES: ProspectStatus[] = [
  'idea',
  'contacted',
  'in_talks',
  'hold',
  'booked',
  'passed',
];

// An artist on the wishlist (table: booking_prospects).
export interface BookingProspect {
  id: number;
  band_id: number | null;
  name: string;
  status: ProspectStatus;
  priority: number;
  last_contacted_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

// One calendar day's plan: the title shows on the calendar cell, the notepad
// holds everything else ("Ghosting Merit? Fend - asked").
export interface BookingDay {
  date: string;
  title: string;
  notepad: string;
}
