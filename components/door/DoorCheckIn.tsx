'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DoorData, DoorRsvp } from '@/lib/door';

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// Round tap target for the − / + steppers. Sized big for fingers on a shared iPad.
function StepButton({
  label,
  sign,
  onClick,
  disabled,
  variant = 'plain',
}: {
  label: string;
  sign: '−' | '+';
  onClick: () => void;
  disabled?: boolean;
  variant?: 'plain' | 'accent';
}) {
  const base =
    'flex items-center justify-center rounded-full h-16 w-16 text-3xl leading-none select-none transition-colors disabled:opacity-25 active:scale-95';
  const style =
    sign === '+'
      ? variant === 'accent'
        ? 'bg-[#c8a26a] text-[#171412] font-bold'
        : 'bg-sky-400/20 text-sky-200 border border-sky-400/40'
      : 'border border-[#E8E0D0]/25 text-[#E8E0D0]/70';
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${style}`}
    >
      {sign}
    </button>
  );
}

export default function DoorCheckIn({ token, data }: { token: string; data: DoorData }) {
  const [rsvps, setRsvps] = useState<DoorRsvp[]>(data.rsvps);
  const [walkins, setWalkins] = useState(data.walkinCount);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The walk-in − is anonymous, so a stray tap loses a head silently. Require a
  // deliberate two-tap: the first arms it, the second (within a few seconds)
  // actually removes one. A single accidental brush does nothing.
  const [walkinMinusArmed, setWalkinMinusArmed] = useState(false);

  useEffect(() => {
    if (!walkinMinusArmed) return;
    const t = setTimeout(() => setWalkinMinusArmed(false), 3000);
    return () => clearTimeout(t);
  }, [walkinMinusArmed]);

  const rsvpHeads = rsvps.reduce((sum, r) => sum + r.arrivedCount, 0);
  const total = rsvpHeads + walkins;
  const partiesHere = rsvps.filter((r) => r.arrivedCount > 0).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rsvps;
    return rsvps.filter((r) => r.name.toLowerCase().includes(q));
  }, [rsvps, query]);

  // Optimistic ±1. The server increments atomically, so we trust our local step
  // and only reverse it if the request fails (concurrent taps stay correct).
  async function bumpRsvp(id: number, delta: 1 | -1) {
    setError(null);
    setRsvps((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, arrivedCount: Math.max(0, r.arrivedCount + delta) } : r
      )
    );
    try {
      const res = await fetch(`/api/door/${token}/rsvp/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setRsvps((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, arrivedCount: Math.max(0, r.arrivedCount - delta) } : r
        )
      );
      setError('Tap didn’t save — check the connection and try again.');
    }
  }

  async function bumpWalkin(delta: 1 | -1) {
    setError(null);
    setWalkins((w) => Math.max(0, w + delta));
    try {
      const res = await fetch(`/api/door/${token}/walkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setWalkins((w) => Math.max(0, w - delta));
      setError('Tap didn’t save — check the connection and try again.');
    }
  }

  return (
    <main className="min-h-screen bg-[#171412] text-[#E8E0D0]">
      {/* Working banner for the door person (this page is no longer guest-facing) */}
      <div className="bg-[#c8a26a] text-[#171412] text-center px-5 py-4">
        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-none">
          Door check-in
        </div>
        <div className="text-sm sm:text-base font-semibold mt-1.5">
          Tap + on a name for each person arriving · ✓ means they’ve already paid
        </div>
      </div>

      {/* Sticky header with the live show total */}
      <header className="sticky top-0 z-10 bg-[#171412]/95 backdrop-blur border-b border-[#E8E0D0]/10 px-5 py-4">
        <div className="max-w-3xl mx-auto flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#c8a26a] font-semibold">
              the birdhaus · door
            </div>
            <h1 className="text-xl font-bold leading-tight truncate">{data.title}</h1>
            <p className="text-sm text-[#E8E0D0]/60">
              {formatDate(data.date)}
              {data.doorsTime && <> · Doors {data.doorsTime}</>}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-5xl font-bold tabular-nums leading-none">{total}</div>
            <div className="text-[11px] uppercase tracking-wide text-[#E8E0D0]/50 mt-1">
              in the house
            </div>
          </div>
        </div>
        <div className="max-w-3xl mx-auto mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[#E8E0D0]/50">
          <span>
            <span className="text-sky-300">{rsvpHeads}</span> from {partiesHere} RSVP
            {partiesHere === 1 ? '' : 's'}
          </span>
          <span>
            <span className="text-[#c8a26a]">{walkins}</span> walk-in{walkins === 1 ? '' : 's'}
          </span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 py-5 space-y-5">
        {error && (
          <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded-lg px-4 py-2 flex justify-between items-center">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-red-300/70 px-2">
              ✕
            </button>
          </div>
        )}

        {/* Walk-in tally — for anyone who didn't RSVP. No name needed. */}
        <section className="border border-[#c8a26a]/40 bg-[#c8a26a]/[0.06] rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xl sm:text-2xl font-semibold">Walk-ins</div>
            <div className="text-base sm:text-lg text-[#E8E0D0]/70">
              Tap + for each person arriving without an RSVP
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-label={walkinMinusArmed ? 'Tap again to remove a walk-in' : 'Remove a walk-in'}
              onClick={() => {
                if (walkins === 0) return;
                if (walkinMinusArmed) {
                  setWalkinMinusArmed(false);
                  bumpWalkin(-1);
                } else {
                  setWalkinMinusArmed(true);
                }
              }}
              disabled={walkins === 0}
              className={`flex items-center justify-center rounded-full h-16 text-2xl leading-none select-none transition-all disabled:opacity-25 active:scale-95 ${
                walkinMinusArmed
                  ? 'w-28 bg-red-500 text-white font-semibold text-lg'
                  : 'w-16 border border-[#E8E0D0]/25 text-[#E8E0D0]/70'
              }`}
            >
              {walkinMinusArmed ? 'Remove?' : '−'}
            </button>
            <span className="text-4xl font-bold tabular-nums w-12 text-center">{walkins}</span>
            <StepButton label="Add a walk-in" sign="+" variant="accent" onClick={() => bumpWalkin(1)} />
          </div>
        </section>

        {/* Search — find your name fast in a long list */}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search names…"
          className="w-full bg-[#2A2420] border border-[#E8E0D0]/20 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-[#E8E0D0]/50 placeholder:text-[#E8E0D0]/30"
        />

        {/* RSVP list — tap your name once per person in your group */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((r) => {
            const here = r.arrivedCount > 0;
            const prepaid = r.paid || r.ticketsBought > 0;
            return (
              <div
                key={r.id}
                className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                  here
                    ? 'border-sky-400/50 bg-sky-400/10'
                    : 'border-[#E8E0D0]/15 bg-[#2A2420]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-lg font-semibold leading-tight truncate">{r.name}</div>
                  <div className="text-xs text-[#E8E0D0]/45">
                    {here ? (
                      <span className="text-sky-300">
                        {r.arrivedCount} here{r.guests > 1 ? ` of ${r.guests}` : ''}
                      </span>
                    ) : (
                      <>party of {r.guests}</>
                    )}
                    {prepaid && (
                      <span className="text-emerald-300">
                        {' · '}✓{' '}
                        {r.ticketsBought > 0
                          ? `${r.ticketsBought} ticket${r.ticketsBought === 1 ? '' : 's'}`
                          : 'paid'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StepButton
                    label={`Remove one from ${r.name}`}
                    sign="−"
                    onClick={() => bumpRsvp(r.id, -1)}
                    disabled={!here}
                  />
                  <span className="text-2xl font-bold tabular-nums w-8 text-center">
                    {r.arrivedCount}
                  </span>
                  <StepButton label={`Check in one for ${r.name}`} sign="+" onClick={() => bumpRsvp(r.id, 1)} />
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-[#E8E0D0]/40 py-10">
            {rsvps.length === 0 ? 'No RSVPs for this show.' : 'No names match your search.'}
          </p>
        )}

        <p className="text-center text-xs text-[#E8E0D0]/30 pt-2 pb-8">
          Tap + once for each person in the party. No ✓ = collect at the door.
        </p>
      </div>
    </main>
  );
}
