export type DateOfferStatus = 'contacted' | 'confirmed' | 'declined';

export const DATE_OFFER_STATUSES: DateOfferStatus[] = ['contacted', 'confirmed', 'declined'];

export const DATE_OFFER_LABELS: Record<DateOfferStatus, string> = {
  contacted: 'Contacted',
  confirmed: 'Confirmed',
  declined: 'Declined',
};

// Paper-admin swatches, matching STATUS_SWATCH in lib/submissions.ts
// (contacted / booked / passed), so a date offer reads the same as its
// submission-level counterpart.
export const DATE_OFFER_SWATCH: Record<DateOfferStatus, string> = {
  contacted: 'bg-spectrum-violet',
  confirmed: 'bg-surface-ink',
  declined: 'bg-spectrum-red',
};

export interface DateOffer {
  id: number;
  submission_id: number;
  date: string;
  status: DateOfferStatus;
  created_at: string;
  updated_at: string;
}
