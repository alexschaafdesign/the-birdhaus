'use client';

import { useState } from 'react';
import Link from 'next/link';
import Section from '@/components/admin/Section';
import { DATE_OFFER_COLORS, DATE_OFFER_LABELS } from '@/lib/date-offers';
import type { BookingProspect, DateHold, DateNote } from '@/lib/booking';
import { HOLD_STATUS_LABELS } from '@/lib/booking';
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
  onAddHold,
  onPatchHold,
  onDeleteHold,
  onConfirmHold,
  onAddNote,
  onDeleteNote,
}: {
  info: DayInfo;
  prospects: BookingProspect[];
  prospectsById: Map<number, BookingProspect>;
  onClose: () => void;
  onToggleAvailable: (date: string) => void;
  onAddHold: (date: string, prospectId: number) => void;
  onPatchHold: (hold: DateHold, patch: Record<string, unknown>) => void;
  onDeleteHold: (hold: DateHold) => void;
  onConfirmHold: (hold: DateHold) => void;
  onAddNote: (date: string, body: string) => void;
  onDeleteNote: (note: DateNote) => void;
}) {
  const [holdProspectId, setHoldProspectId] = useState('');
  const [noteDraft, setNoteDraft] = useState('');

  const { date } = info;
  const showOnDate = info.show ?? info.draftShow;
  const longDate = parseLocalDate(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const pendingProspectIds = new Set(info.pendingHolds.map((h) => h.prospect_id));
  const holdOptions = prospects
    .filter((p) => !pendingProspectIds.has(p.id) && p.status !== 'passed')
    .sort((a, b) => a.name.localeCompare(b.name));

  function prospectName(id: number) {
    return prospectsById.get(id)?.name ?? 'Deleted prospect';
  }

  function handleAddHold(e: React.FormEvent) {
    e.preventDefault();
    const id = Number(holdProspectId);
    if (!Number.isInteger(id) || id <= 0) return;
    onAddHold(date, id);
    setHoldProspectId('');
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
    <div className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-xl border-t border-[#E8E0D0]/20 bg-[#171412] p-4 shadow-2xl lg:static lg:z-auto lg:mt-6 lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
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

        <Section title="Hold ladder">
          {info.pendingHolds.length === 0 && info.otherHolds.length === 0 && (
            <p className="mb-3 text-xs text-[#E8E0D0]/30">No holds on this date yet.</p>
          )}

          {info.pendingHolds.length > 0 && (
            <ul className="mb-3 space-y-2">
              {info.pendingHolds.map((hold) => (
                <li key={hold.id} className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-amber-500/90 px-1.5 py-0.5 font-mono text-xs font-bold text-black">
                    H{hold.position}
                  </span>
                  <span className="text-sm font-medium">{prospectName(hold.prospect_id)}</span>
                  {hold.note && <span className="text-xs text-[#E8E0D0]/40">{hold.note}</span>}
                  <span className="ml-auto flex items-center gap-1">
                    {hold.position > 1 && (
                      <button
                        onClick={() => onPatchHold(hold, { position: hold.position - 1 })}
                        title="Promote"
                        className="rounded border border-[#E8E0D0]/30 px-2 py-0.5 text-xs hover:bg-[#E8E0D0]/10"
                      >
                        ▲
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Confirm ${prospectName(hold.prospect_id)} on ${longDate}? This creates a draft show and releases the other holds.`
                          )
                        ) {
                          onConfirmHold(hold);
                        }
                      }}
                      className="rounded border border-green-500/50 px-2 py-0.5 text-xs text-green-400 hover:bg-green-500/10"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => onPatchHold(hold, { status: 'released' })}
                      className="rounded border border-[#E8E0D0]/30 px-2 py-0.5 text-xs text-[#E8E0D0]/60 hover:bg-[#E8E0D0]/10"
                    >
                      Release
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Delete this hold entirely?')) onDeleteHold(hold);
                      }}
                      aria-label="Delete hold"
                      className="rounded px-1.5 py-0.5 text-xs text-[#E8E0D0]/40 hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {info.otherHolds.length > 0 && (
            <ul className="mb-3 space-y-1">
              {info.otherHolds.map((hold) => (
                <li key={hold.id} className="flex items-center gap-2 text-xs text-[#E8E0D0]/40">
                  <span className={hold.status === 'confirmed' ? 'text-green-400/70' : ''}>
                    {HOLD_STATUS_LABELS[hold.status]}
                  </span>
                  <span>{prospectName(hold.prospect_id)}</span>
                  <button
                    onClick={() => {
                      if (window.confirm('Delete this hold from history?')) onDeleteHold(hold);
                    }}
                    aria-label="Delete hold"
                    className="px-1 text-[#E8E0D0]/30 hover:text-red-400"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddHold} className="flex items-center gap-2">
            <select
              value={holdProspectId}
              onChange={(e) => setHoldProspectId(e.target.value)}
              className={`${inputClass} min-w-0 flex-1 bg-[#171412]`}
            >
              <option value="">Add a hold — pick a prospect…</option>
              {holdOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!holdProspectId}
              className="rounded border border-[#E8E0D0]/30 px-3 py-1.5 text-sm hover:bg-[#E8E0D0]/10 disabled:opacity-40"
            >
              + Hold
            </button>
          </form>
          {holdOptions.length === 0 && prospects.length === 0 && (
            <p className="mt-2 text-xs text-[#E8E0D0]/30">Add prospects in the rail first.</p>
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

        <Section title="Notes">
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
              placeholder="Idea or note for this date…"
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
        </Section>
      </div>
    </div>
  );
}
