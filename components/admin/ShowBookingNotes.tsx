'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Panel } from './ui';
import { FORM } from '@/components/night/form';

// The booking calendar's notes for this show's date (booking_days), shown on
// the show's Overview so what you jotted while booking ("Fend – asked") travels
// with the show. Not a copy: it edits the same calendar day, so Booking and the
// show always read the same notes. Autosaves like the Booking day panel.
export default function ShowBookingNotes({
  date,
  initialTitle,
  initialNotepad,
  unavailable,
}: {
  date: string;
  initialTitle: string;
  initialNotepad: string;
  // Kept as-is on save (the booking route rewrites the whole day).
  unavailable: boolean;
}) {
  const [notepad, setNotepad] = useState(initialNotepad);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saved = useRef(initialNotepad);
  const latest = useRef(initialNotepad);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save() {
    const value = latest.current;
    if (value === saved.current) return;
    setStatus('saving');
    try {
      const res = await fetch('/api/admin/booking/days', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, title: initialTitle, notepad: value, unavailable }),
      });
      if (!res.ok) throw new Error();
      saved.current = value;
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  function change(value: string) {
    setNotepad(value);
    latest.current = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 800);
  }

  // Flush a pending edit when leaving the page.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      void save();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <Panel
      title="Booking notes"
      collapsible
      defaultOpen={initialNotepad.trim() !== ''}
      action={
        <Link
          href="/admin/booking"
          className="text-data-caption-13 text-surface-ink/60 underline underline-offset-4 hover:text-accent-red"
        >
          Booking calendar →
        </Link>
      }
    >
      <textarea
        rows={4}
        value={notepad}
        onChange={(e) => change(e.target.value)}
        onBlur={() => void save()}
        placeholder={'Notes from booking this night — e.g.\nFend - asked\nJosie - confirmed'}
        aria-label="Booking notes for this date"
        className={`${FORM.field} resize-y`}
      />
      <p className="mt-1.5 text-data-caption-13 text-surface-ink/60">
        The same notes as this date on the Booking calendar — edit them in either place.
        {status === 'saving' && ' Saving…'}
        {status === 'saved' && ' Saved ✓'}
        {status === 'error' && <span className="text-accent-red"> Didn&apos;t save — try again.</span>}
      </p>
    </Panel>
  );
}
