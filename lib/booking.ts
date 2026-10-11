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

// A band asked about a specific night (date_holds row). Asked → Hold →
// Booked, or Passed. Named "holds" in the schema from the original ladder
// design; see scripts/migrations/103_booking_asks.sql.
export type HoldStatus = 'asked' | 'hold' | 'booked' | 'passed';

export const HOLD_STATUSES: HoldStatus[] = ['asked', 'hold', 'booked', 'passed'];

// Statuses that still claim the night (one per band per date, enforced by a
// partial unique index).
export const LIVE_HOLD_STATUSES: HoldStatus[] = ['asked', 'hold', 'booked'];

export const HOLD_STATUS_LABELS: Record<HoldStatus, string> = {
  asked: 'Asked',
  hold: 'Hold',
  booked: 'Booked',
  passed: 'Passed',
};

// Same hues as the matching prospect statuses.
export const HOLD_STATUS_COLORS: Record<HoldStatus, string> = {
  asked: PROSPECT_STATUS_COLORS.contacted,
  hold: PROSPECT_STATUS_COLORS.hold,
  booked: PROSPECT_STATUS_COLORS.booked,
  passed: PROSPECT_STATUS_COLORS.passed,
};

// Booked first, passed last — the order a date's asked list reads in.
export const HOLD_STATUS_RANK: Record<HoldStatus, number> = { booked: 0, hold: 1, asked: 2, passed: 3 };

// What the Bands rail shows. Only "not interested" is stored (status
// 'passed'); everything else derives from the band's dates: any live ask
// (asked/hold/booked) on today or later → active, otherwise wishlist. The
// older pipeline values (contacted, in_talks, …) are still valid in the
// column and simply read as wishlist/active.
export type BandStanding = 'active' | 'wishlist' | 'not_interested';

export const BAND_STANDINGS: BandStanding[] = ['active', 'wishlist', 'not_interested'];

export const BAND_STANDING_LABELS: Record<BandStanding, string> = {
  active: 'Active',
  wishlist: 'Wishlist',
  not_interested: 'Not interested',
};

export const BAND_STANDING_COLORS: Record<BandStanding, string> = {
  active: PROSPECT_STATUS_COLORS.contacted,
  wishlist: PROSPECT_STATUS_COLORS.idea,
  not_interested: PROSPECT_STATUS_COLORS.passed,
};

export function bandStanding(prospect: { status: ProspectStatus }, hasUpcomingLiveAsk: boolean): BandStanding {
  if (prospect.status === 'passed') return 'not_interested';
  return hasUpcomingLiveAsk ? 'active' : 'wishlist';
}

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
