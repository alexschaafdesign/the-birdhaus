'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { DATE_OFFER_COLORS, DATE_OFFER_LABELS } from '@/lib/date-offers';
import type { DayInfo } from './BookingDashboard';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

const SAVE_DELAY_MS = 800;

function parseLocalDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Keyed by date in the dashboard, so the drafts below reset per day.
export default function DayPanel({
  info,
  onClose,
  onToggleAvailable,
  onSave,
}: {
  info: DayInfo;
  onClose: () => void;
  onToggleAvailable: (date: string) => void;
  onSave: (date: string, title: string, notepad: string) => Promise<boolean>;
}) {
  const { date } = info;
  const [title, setTitle] = useState(info.plan?.title ?? '');
  const [notepad, setNotepad] = useState(info.plan?.notepad ?? '');
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saved' | 'failed'>('idle');

  // Autosave: debounce while typing, flush on close/unmount (switching days
  // unmounts too, via the key) so nothing typed is dropped.
  const saved = useRef({ title, notepad });
  const latest = useRef({ title, notepad });
  useEffect(() => {
    latest.current = { title, notepad };
  }, [title, notepad]);

  useEffect(() => {
    if (title === saved.current.title && notepad === saved.current.notepad) return;
    setSaveState('pending');
    const timer = setTimeout(async () => {
      saved.current = { title, notepad };
      setSaveState((await onSave(date, title, notepad)) ? 'saved' : 'failed');
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [title, notepad, date, onSave]);

  useEffect(
    () => () => {
      const { title: t, notepad: n } = latest.current;
      if (t !== saved.current.title || n !== saved.current.notepad) void onSave(date, t, n);
    },
    // Unmount-only flush; latest/saved are refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const showOnDate = info.show ?? info.draftShow;
  const longDate = parseLocalDate(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

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

        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={
              showOnDate ? 'Title (the show’s title shows on the calendar)' : 'Title — shows on the calendar, e.g. “Fresh Cuts?”'
            }
            aria-label="Day title"
            className={`${inputClass} w-full text-base font-semibold`}
          />
          <textarea
            value={notepad}
            onChange={(e) => setNotepad(e.target.value)}
            maxLength={10000}
            rows={8}
            placeholder={'Notepad — e.g.\nGhosting Merit?\nFend - asked\nJosie - asked'}
            aria-label="Day notepad"
            className={`${inputClass} w-full resize-y leading-relaxed`}
          />
          <p className="h-4 text-right text-xs text-[#E8E0D0]/40">
            {saveState === 'pending' && 'Saving…'}
            {saveState === 'saved' && 'Saved'}
            {saveState === 'failed' && <span className="text-red-400">Not saved</span>}
          </p>
        </div>

        {info.offers.length > 0 && (
          <div>
            <h4 className="mb-2 font-mono text-xs uppercase tracking-widest text-[#E8E0D0]/50">
              Offered via submissions
            </h4>
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
              Managed on the{' '}
              <Link href="/admin/submissions" className="underline hover:text-[#E8E0D0]">
                Submissions
              </Link>{' '}
              board.
            </p>
          </div>
        )}

        {!showOnDate && (
          <p className="text-xs text-[#E8E0D0]/40">
            <Link href={`/admin/shows/new?date=${date}`} className="underline hover:text-[#E8E0D0]">
              Draft a show for this date
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
