'use client';

import { useState } from 'react';
import Link from 'next/link';
import Section from '@/components/admin/Section';
import BandNameInput from '@/components/admin/BandNameInput';
import { DATE_OFFER_COLORS, DATE_OFFER_LABELS } from '@/lib/date-offers';
import type { BookingProspect, DateHold, DateNote, HoldStatus } from '@/lib/booking';
import { HOLD_STATUSES, HOLD_STATUS_COLORS, HOLD_STATUS_LABELS, LIVE_HOLD_STATUSES } from '@/lib/booking';
import type { DayInfo } from './BookingDashboard';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

function parseLocalDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export default function DayPanel({
  info,
  prospects,
  prospectsById,
  onClose,
  onToggleAvailable,
  onAddAsk,
  onPatchHold,
  onDeleteHold,
  onCreateDraftShow,
  onAddNote,
  onDeleteNote,
}: {
  info: DayInfo;
  prospects: BookingProspect[];
  prospectsById: Map<number, BookingProspect>;
  onClose: () => void;
  onToggleAvailable: (date: string) => void;
  onAddAsk: (date: string, band: { prospectId: number } | { name: string; bandId: number | null }) => void;
  onPatchHold: (hold: DateHold, patch: Record<string, unknown>) => void;
  onDeleteHold: (hold: DateHold) => void;
  onCreateDraftShow: (hold: DateHold) => void;
  onAddNote: (date: string, body: string) => void;
  onDeleteNote: (note: DateNote) => void;
}) {
  const [askName, setAskName] = useState('');
  const [askBandId, setAskBandId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const { date } = info;
  const showOnDate = info.show ?? info.draftShow;
  const longDate = parseLocalDate(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Quick-add chips: prospects not already live on this night, most wanted
  // first, so a band you're chasing is one click away.
  const liveProspectIds = new Set(
    info.asks.filter((h) => LIVE_HOLD_STATUSES.includes(h.status)).map((h) => h.prospect_id)
  );
  const quickPicks = prospects
    .filter((p) => !liveProspectIds.has(p.id) && p.status !== 'passed' && p.status !== 'booked')
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))
    .slice(0, 8);

  function prospectName(id: number) {
    return prospectsById.get(id)?.name ?? 'Deleted prospect';
  }

  function handleAddAsk(e: React.FormEvent) {
    e.preventDefault();
    const name = askName.trim();
    if (!name) return;
    onAddAsk(date, { name, bandId: askBandId });
    setAskName('');
    setAskBandId(null);
  }

  function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    const body = noteDraft.trim();
    if (!body) return;
    onAddNote(date, body);
    setNoteDraft('');
  }

  return (
    // Inline card under the calendar on desktop; bottom sheet on mobile so the
    // panel is reachable from either view without covering the whole screen.
    <div className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-xl border-t border-[#E8E0D0]/20 bg-[#171412] p-4 shadow-2xl lg:static lg:z-auto lg:max-h-none lg:overflow-visible lg:rounded-lg lg:border lg:border-yellow-400/40 lg:bg-transparent lg:p-4 lg:shadow-none">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{longDate}</h3>
          {showOnDate && (
            <Link
              href={`/admin/shows/${showOnDate.id}`}
              className="text-sm text-yellow-400/90 hover:text-yellow-300 hover:underline"
            >
              {showOnDate.title}
              {!info.show && ' (draft)'} — open show →
            </Link>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close day panel"
          className="rounded px-2 py-1 text-[#E8E0D0]/50 hover:bg-[#E8E0D0]/10 hover:text-[#E8E0D0]"
        >
          ×
        </button>
      </div>

      <div className="space-y-4">
        {!showOnDate && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => onToggleAvailable(date)}
              className={`rounded border px-3 py-1.5 text-sm transition-colors ${
                info.available
                  ? 'border-green-500/60 text-green-400 hover:bg-green-500/10'
                  : 'border-[#E8E0D0]/30 text-[#E8E0D0]/70 hover:bg-[#E8E0D0]/10'
              }`}
            >
              {info.available ? '✓ Available — click to unmark' : 'Mark available'}
            </button>
          </div>
        )}

        {/* The first note doubles as the day's label on the calendar grid. */}
        <Section title="Notes / ideas">
          {info.notes.length > 0 && (
            <ul className="mb-3 space-y-1.5">
              {info.notes.map((note) => (
                <li key={note.id} className="flex items-start gap-2 text-sm">
                  <span className="flex-1 whitespace-pre-wrap text-[#E8E0D0]/80">{note.body}</span>
                  <button
                    onClick={() => onDeleteNote(note)}
                    aria-label="Delete note"
                    className="px-1 text-[#E8E0D0]/40 hover:text-red-400"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleAddNote} className="flex items-center gap-2">
            <input
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="e.g. “Fresh Cuts maybe”, “Comedy show?”"
              className={`${inputClass} min-w-0 flex-1`}
            />
            <button
              type="submit"
              disabled={!noteDraft.trim()}
              className="rounded border border-[#E8E0D0]/30 px-3 py-1.5 text-sm hover:bg-[#E8E0D0]/10 disabled:opacity-40"
            >
              + Note
            </button>
          </form>
          <p className="mt-2 text-xs text-[#E8E0D0]/40">The first note shows on the calendar cell.</p>
        </Section>

        {info.offers.length > 0 && (
          <Section title="Offered via submissions">
            <div className="flex flex-wrap gap-2">
              {info.offers.map((offer) => (
                <span
                  key={offer.id}
                  className="rounded-full border px-3 py-1 text-xs"
                  style={{ borderColor: DATE_OFFER_COLORS[offer.status], color: DATE_OFFER_COLORS[offer.status] }}
                >
                  {offer.band_name} — {DATE_OFFER_LABELS[offer.status]}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#E8E0D0]/40">
              Managed on the <Link href="/admin/submissions" className="underline hover:text-[#E8E0D0]">Submissions</Link> board.
            </p>
          </Section>
        )}

        <Section title="Bands asked">
          {info.asks.length === 0 && (
            <p className="mb-3 text-xs text-[#E8E0D0]/30">Nobody asked about this night yet.</p>
          )}

          {info.asks.length > 0 && (
            <ul className="mb-3 space-y-2">
              {info.asks.map((hold) => {
                const passed = hold.status === 'passed';
                return (
                  <li key={hold.id} className={`space-y-1 ${passed ? 'opacity-50' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{prospectName(hold.prospect_id)}</span>
                      <select
                        value={hold.status}
                        onChange={(e) => onPatchHold(hold, { status: e.target.value as HoldStatus })}
                        aria-label={`Status for ${prospectName(hold.prospect_id)}`}
                        className="rounded border bg-[#171412] px-2 py-0.5 text-xs focus:outline-none"
                        style={{ borderColor: HOLD_STATUS_COLORS[hold.status], color: HOLD_STATUS_COLORS[hold.status] }}
                      >
                        {HOLD_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {HOLD_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove ${prospectName(hold.prospect_id)} from this date?`)) onDeleteHold(hold);
                        }}
                        aria-label="Remove from this date"
                        className="rounded px-1.5 py-0.5 text-xs text-[#E8E0D0]/40 hover:text-red-400"
                      >
                        ×
                      </button>
                    </div>
                    <input
                      key={`${hold.id}-${hold.updated_at}`}
                      defaultValue={hold.note ?? ''}
                      placeholder="Note (e.g. “waiting to hear back”, “$300 guarantee”)"
                      onBlur={(e) => {
                        const note = e.target.value.trim();
                        if (note !== (hold.note ?? '')) onPatchHold(hold, { note: note || null });
                      }}
                      className={`${inputClass} w-full py-1 text-xs`}
                    />
                    {hold.status === 'booked' && (
                      <p className="text-xs">
                        {hold.show_id !== null ? (
                          <Link href={`/admin/shows/${hold.show_id}`} className="text-yellow-400/90 hover:underline">
                            Open show →
                          </Link>
                        ) : showOnDate ? (
                          <span className="text-[#E8E0D0]/40">A show already exists on this date.</span>
                        ) : (
                          <button
                            onClick={() => onCreateDraftShow(hold)}
                            className="rounded border border-green-500/50 px-2 py-0.5 text-green-400 hover:bg-green-500/10"
                          >
                            Create draft show
                          </button>
                        )}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={handleAddAsk} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <BandNameInput
                value={askName}
                onChange={(value) => {
                  setAskName(value);
                  setAskBandId(null);
                }}
                onSelect={(match) => {
                  setAskName(match.name);
                  setAskBandId(match.id);
                }}
                className={`${inputClass} w-full`}
                placeholder="Who did you ask? Band name…"
              />
            </div>
            <button
              type="submit"
              disabled={!askName.trim()}
              className="rounded border border-[#E8E0D0]/30 px-3 py-1.5 text-sm hover:bg-[#E8E0D0]/10 disabled:opacity-40"
            >
              + Asked
            </button>
          </form>

          {quickPicks.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[#E8E0D0]/40">Prospects:</span>
              {quickPicks.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onAddAsk(date, { prospectId: p.id })}
                  className="rounded-full border border-[#E8E0D0]/20 px-2 py-0.5 text-xs text-[#E8E0D0]/70 hover:bg-[#E8E0D0]/10"
                >
                  + {p.name}
                </button>
              ))}
            </div>
          )}

          {!showOnDate && (
            <p className="mt-3 text-xs text-[#E8E0D0]/40">
              Prefer the full form?{' '}
              <Link href={`/admin/shows/new?date=${date}`} className="underline hover:text-[#E8E0D0]">
                Draft a show for this date
              </Link>
            </p>
          )}
        </Section>

      </div>
    </div>
  );
}
