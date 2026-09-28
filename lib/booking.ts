// Outbound booking pipeline (planning future seasons) — separate from the
// inbound submissions desk. See scripts/migrations/092_booking.sql.
//
// Pure types/constants only (no db import) so client components can share the
// status unions and palette — same split as lib/date-offers.ts. Queries live
// in the booking page and /api/admin/booking routes.

export type ProspectStatus = 'idea' | 'contacted' | 'in_talks' | 'hold' | 'booked' | 'passed';

export const PROSPECT_STATUSES: ProspectStatus[] = [
  'idea',
  'contacted',
  'in_talks',
  'hold',
  'booked',
  'passed',
];

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  idea: 'Idea',
  contacted: 'Contacted',
  in_talks: 'In talks',
  hold: 'Hold',
  booked: 'Booked',
  passed: 'Passed',
};

// Shares the submissions/date-offers palette family so statuses that mean the
// same thing read the same color across admin desks.
export const PROSPECT_STATUS_COLORS: Record<ProspectStatus, string> = {
  idea: '#A79B8A',
  contacted: '#7FB3D5',
  in_talks: '#C9A86A',
  hold: '#E0B454',
  booked: '#6FCF97',
  passed: '#B0645A',
};

export type HoldStatus = 'pending' | 'confirmed' | 'released';

export const HOLD_STATUSES: HoldStatus[] = ['pending', 'confirmed', 'released'];

export const HOLD_STATUS_LABELS: Record<HoldStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  released: 'Released',
};

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

export interface DateHold {
  id: number;
  date: string;
  prospect_id: number;
  position: number;
  status: HoldStatus;
  note: string | null;
  show_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface DateNote {
  id: number;
  date: string;
  body: string;
  created_at: string;
  updated_at: string;
}
