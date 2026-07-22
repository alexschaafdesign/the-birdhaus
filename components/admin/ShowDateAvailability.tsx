'use client';

import { useEffect, useState } from 'react';
import {
  availabilityEntryOverlaps,
  type Submission,
} from '@/lib/submissions';
import {
  DATE_OFFER_STATUSES,
  DATE_OFFER_LABELS,
  DATE_OFFER_COLORS,
  type DateOffer,
  type DateOfferStatus,
} from '@/lib/date-offers';

const NEW_COLOR = '#E8E0D0';

// Surfaces "who's said they're available on this date, and have I contacted
// them yet" right on the show form, instead of making the operator cross-
// reference the separate Submissions board for every draft.
export default function ShowDateAvailability({ date }: { date: string }) {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [dateOffers, setDateOffers] = useState<DateOffer[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/submissions').then((res) => res.json()),
      fetch('/api/admin/date-offers').then((res) => res.json()),
    ])
      .then(([subs, offers]) => {
        setSubmissions(subs);
        setDateOffers(offers);
      })
      .catch(() => setError('Failed to load submissions.'));
  }, []);

  async function setOfferStatus(submissionId: number, value: string) {
    const existing = dateOffers.find((o) => o.submission_id === submissionId && o.date === date);

    if (value === 'new') {
      if (!existing) return;
      setDateOffers((prev) => prev.filter((o) => o.id !== existing.id));
      try {
        const res = await fetch(`/api/admin/date-offers/${existing.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
      } catch {
        setError('Failed to update contact status — refresh and try again.');
      }
      return;
    }

    const status = value as DateOfferStatus;
    if (existing) {
      setDateOffers((prev) => prev.map((o) => (o.id === existing.id ? { ...o, status } : o)));
      try {
        const res = await fetch(`/api/admin/date-offers/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setError('Failed to update contact status — refresh and try again.');
      }
      return;
    }

    try {
      const res = await fetch('/api/admin/date-offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submissionId, date, status }),
      });
      if (!res.ok) throw new Error();
      const saved: DateOffer = await res.json();
      setDateOffers((prev) => [...prev.filter((o) => o.id !== saved.id), saved]);
    } catch {
      setError('Failed to log contact — try again.');
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const matches = (submissions ?? []).filter((s) =>
    s.availability.some((entry) => availabilityEntryOverlaps(entry, date, date))
  );

  return (
    <div className="border border-[#E8E0D0]/15 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#E8E0D0]/80">Bands available this date</h2>
        <a href="/admin/submissions" className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline">
          Open Submissions board →
        </a>
      </div>

      {error && <p className="text-xs text-red-300 mb-2">{error}</p>}

      {submissions === null ? (
        <p className="text-xs text-[#E8E0D0]/30">Loading…</p>
      ) : matches.length === 0 ? (
        <p className="text-xs text-[#E8E0D0]/30">
          No submissions have marked {date} as available.
        </p>
      ) : (
        <div className="space-y-2">
          {matches.map((s) => {
            const offer = dateOffers.find((o) => o.submission_id === s.id && o.date === date);
            const status: DateOfferStatus | 'new' = offer?.status ?? 'new';
            const color = status === 'new' ? NEW_COLOR : DATE_OFFER_COLORS[status];
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2"
                style={{ borderColor: `${color}55` }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.band_name}</p>
                  <div className="text-xs text-[#E8E0D0]/50 flex flex-wrap gap-x-2">
                    {s.genre && <span>{s.genre}</span>}
                    {s.email && <span>{s.email}</span>}
                  </div>
                </div>
                <select
                  value={status}
                  onChange={(e) => setOfferStatus(s.id, e.target.value)}
                  className="bg-transparent text-xs rounded px-2 py-1 border focus:outline-none"
                  style={{ borderColor: color, color }}
                >
                  <option value="new" className="text-[#2A2420]">
                    Not contacted
                  </option>
                  {DATE_OFFER_STATUSES.map((offerStatus) => (
                    <option key={offerStatus} value={offerStatus} className="text-[#2A2420]">
                      {DATE_OFFER_LABELS[offerStatus]}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
