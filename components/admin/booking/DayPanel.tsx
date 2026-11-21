'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FORM } from '@/components/night/form';
import { ADMIN_TYPE, buttonClassName } from '@/components/admin/ui';
import type { DayInfo } from './BookingDashboard';

const inputClass = FORM.field;

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
    <div className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto  border-t border-surface-ink bg-surface-paper p-4  lg:static lg:z-auto lg:max-h-none lg:overflow-visible  lg:border lg:border-surface-ink lg:bg-surface-paper lg:p-4 lg:shadow-none">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-header-4 font-bold">{longDate}</h3>
          {showOnDate && (
            <Link
              href={`/admin/shows/${showOnDate.id}`}
              className={`text-body-3 ${ADMIN_TYPE.link}`}
            >
              {showOnDate.title}
              {!info.show && ' (draft)'} — open show →
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close day panel"
          className="cursor-pointer px-2 py-1 hover:bg-surface-paper-shade hover:text-accent-red"
        >
          ×
        </button>
      </div>

      <div className="space-y-4">
        {/* Blocks are added and removed on the master Calendar only. A show
            can still land on a blocked day (someone else runs it). */}
        {info.blocked && (
          <p className="border-accent-red text-body-3 border-l-4 pl-2">
            <span className="text-accent-red font-bold">Blocked</span>
            {info.blocked.length ? `: ${info.blocked.join(' · ')}` : ''}
            <span className="text-data-caption-13 text-surface-ink/60">
              {' · '}
              <Link href={`/admin/calendar?month=${date.slice(0, 7)}&day=${date}`} className="underline hover:text-accent-red">
                change on the Calendar
              </Link>
            </span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!showOnDate && !info.blocked && (
            <button
              type="button"
              onClick={() => onToggleAvailable(date)}
              aria-pressed={Boolean(info.available)}
              className={buttonClassName(info.available ? 'primary' : 'secondary', 's')}
            >
              {info.available ? '✓ Available — click to unmark' : 'Mark available'}
            </button>
          )}
          {!info.blocked && (
            <Link
              href={`/admin/calendar?month=${date.slice(0, 7)}&day=${date}`}
              className="text-data-caption-13 text-surface-ink/60 underline hover:text-accent-red"
            >
              Not available? Block it on the Calendar
            </Link>
          )}
        </div>

        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={
              showOnDate ? 'Title (the show’s title shows on the calendar)' : 'Title — shows on the calendar, e.g. “Fresh Cuts?”'
            }
            aria-label="Day title"
            className={`${inputClass} w-full text-body-1 font-bold`}
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
          <p className="h-4 text-right text-data-caption-13 text-surface-ink/60">
            {saveState === 'pending' && 'Saving…'}
            {saveState === 'saved' && 'Saved'}
            {saveState === 'failed' && <span className="text-accent-red">Not saved</span>}
          </p>
        </div>


        {!showOnDate && (
          <p className="text-data-caption-13 text-surface-ink/60">
            <Link href={`/admin/shows/new?date=${date}`} className="underline hover:text-accent-red">
              Draft a show for this date
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
