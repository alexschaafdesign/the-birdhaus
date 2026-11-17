'use client';

import { useEffect, useState } from 'react';
import {
  availabilityEntryOverlaps,
  type Submission,
} from '@/lib/submissions';
import {
  DATE_OFFER_STATUSES,
  DATE_OFFER_LABELS,
  DATE_OFFER_SWATCH,
  type DateOffer,
  type DateOfferStatus,
} from '@/lib/date-offers';

import { Swatch } from './ui';

// Not-contacted reads as the empty swatch, like New on the Submissions board.
const NEW_SWATCH = 'border border-surface-ink bg-surface-paper';

// Surfaces "who's said they're available on this date, and have I contacted
// them yet" right on the show form, instead of making the operator cross-
// reference the separate Submissions board for every draft.
export default function ShowDateAvailability({ date }: { date: string }) {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [dateOffers, setDateOffers] = useState<DateOffer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

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
    <div className="border border-surface-ink p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-body-3 font-bold text-surface-ink/80 hover:text-accent-red"
        >
          <span
            className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}
            aria-hidden
          >
            ▸
          </span>
          Bands available this date
          {submissions !== null && matches.length > 0 && (
            <span className="text-data-caption-13 font-normal text-surface-ink/60">({matches.length})</span>
          )}
        </button>
        <a href="/admin/submissions" className="text-data-caption-13 text-surface-ink/60 hover:text-accent-red underline">
          Open Submissions board →
        </a>
      </div>

      {expanded && (
        <div className="mt-3">
          {error && <p className="text-data-caption-13 text-accent-red mb-2">{error}</p>}

          {submissions === null ? (
            <p className="text-data-caption-13 text-surface-ink/60">Loading…</p>
          ) : matches.length === 0 ? (
            <p className="text-data-caption-13 text-surface-ink/60">
              No submissions have marked {date} as available.
            </p>
          ) : (
            <div className="space-y-2">
              {matches.map((s) => {
            const offer = dateOffers.find((o) => o.submission_id === s.id && o.date === date);
            const status: DateOfferStatus | 'new' = offer?.status ?? 'new';
            const swatch = status === 'new' ? NEW_SWATCH : DATE_OFFER_SWATCH[status];
            return (
              <div
                key={s.id}
                className="border-surface-ink flex flex-wrap items-center justify-between gap-2 border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-body-3 font-bold">{s.band_name}</p>
                  <div className="text-data-caption-13 text-surface-ink/60 flex flex-wrap gap-x-2">
                    {s.genre && <span>{s.genre}</span>}
                    {s.email && <span>{s.email}</span>}
                  </div>
                </div>
                <span className="flex items-center gap-2">
                <Swatch className={swatch} />
                <select
                  value={status}
                  onChange={(e) => setOfferStatus(s.id, e.target.value)}
                  aria-label={`Contact status for ${s.band_name}`}
                  className="border-surface-ink bg-surface-paper text-data-caption-13 cursor-pointer border px-2 py-1 focus-visible:outline-accent-red focus-visible:outline-2"
                >
                  <option value="new">
                    Not contacted
                  </option>
                  {DATE_OFFER_STATUSES.map((offerStatus) => (
                    <option key={offerStatus} value={offerStatus}>
                      {DATE_OFFER_LABELS[offerStatus]}
                    </option>
                  ))}
                </select>
                </span>
              </div>
            );
          })}
        </div>
          )}
        </div>
      )}
    </div>
  );
}
