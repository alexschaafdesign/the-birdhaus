export type DateOfferStatus = 'contacted' | 'confirmed' | 'declined';

export const DATE_OFFER_STATUSES: DateOfferStatus[] = ['contacted', 'confirmed', 'declined'];

export const DATE_OFFER_LABELS: Record<DateOfferStatus, string> = {
  contacted: 'Contacted',
  confirmed: 'Confirmed',
  declined: 'Declined',
};

// Reuses the submission status palette so "contacted" / "confirmed" / "declined"
// read the same as their submission-level counterparts (contacted / booked / passed).
export const DATE_OFFER_COLORS: Record<DateOfferStatus, string> = {
  contacted: '#7FB3D5',
  confirmed: '#6FCF97',
  declined: '#B0645A',
};

export interface DateOffer {
  id: number;
  submission_id: number;
  date: string;
  status: DateOfferStatus;
  created_at: string;
  updated_at: string;
}
