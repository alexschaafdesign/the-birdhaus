'use client';

import { useState, type FormEvent } from 'react';
import type { SongClubRsvp } from '@/lib/song-club-rsvps';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

// "Email all RSVPs" for a Song Club event — mirrors the house-show blast
// (components/admin/RsvpSummary), minus the Square non-buyers audience since
// Song Club events don't sell tickets. Custom subject/message with {name}
// personalization, posted to /api/admin/song-club/[id]/email-rsvps.
export default function SongClubRsvpBlast({
  eventId,
  eventTitle,
  rsvps,
}: {
  eventId: number;
  eventTitle: string;
  rsvps: SongClubRsvp[];
}) {
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    sent: number;
    failed: { email: string; error: string }[];
    recipientCount: number;
    invalid: string[];
  } | null>(null);

  const uniqueEmailCount = new Set(
    rsvps.map((r) => r.email.trim().toLowerCase()).filter(Boolean)
  ).size;

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!subject.trim() || !message.trim()) {
      setError('Subject and message are required');
      return;
    }
    if (uniqueEmailCount === 0) {
      setError('No recipients to email.');
      return;
    }

    if (
      !confirm(
        `Send this email to all ${uniqueEmailCount} RSVP${
          uniqueEmailCount === 1 ? '' : 's'
        }? This cannot be undone.`
      )
    )
      return;

    setSending(true);
    try {
      const res = await fetch(`/api/admin/song-club/${eventId}/email-rsvps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Failed to send');
      setResult(body);
      if ((body?.failed?.length ?? 0) === 0) {
        setComposing(false);
        setSubject('');
        setMessage('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mb-6">
      {!composing && (
        <button
          type="button"
          onClick={() => {
            setComposing(true);
            setResult(null);
            setError(null);
          }}
          disabled={uniqueEmailCount === 0}
          className="border border-[#E8E0D0]/40 rounded px-3 py-1 text-xs hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-40"
        >
          Email all RSVPs
        </button>
      )}

      {composing && (
        <form
          onSubmit={handleSend}
          className="border border-[#E8E0D0]/25 rounded-lg p-4 space-y-3"
        >
          <h3 className="text-sm font-semibold text-[#E8E0D0]/80">Compose email</h3>

          <p className="text-xs text-[#E8E0D0]/50">
            Sending to{' '}
            <strong className="text-[#E8E0D0]/80">
              {uniqueEmailCount} recipient{uniqueEmailCount === 1 ? '' : 's'}
            </strong>{' '}
            (unique emails). Use <code className="text-[#E8E0D0]/70">{'{name}'}</code> in the
            message to insert each person&apos;s first name.
          </p>

          <div>
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
              Subject
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={`${inputClass} w-full`}
              placeholder={`Reminder: ${eventTitle}`}
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              className={`${inputClass} w-full resize-y`}
              placeholder={'Hi {name},\n\nJust a reminder that the meetup is this weekend...'}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={sending || uniqueEmailCount === 0}
              className="border border-[#E8E0D0]/40 rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-50"
            >
              {sending
                ? 'Sending...'
                : `Send to ${uniqueEmailCount} recipient${uniqueEmailCount === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={() => setComposing(false)}
              className="text-[#E8E0D0]/60 hover:text-[#E8E0D0] text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {result && (
        <div className="mt-3 border border-green-400/30 bg-green-400/5 text-sm rounded px-3 py-2">
          <div className="text-green-300">
            Sent {result.sent} email{result.sent === 1 ? '' : 's'}.
          </div>
          {result.invalid.length > 0 && (
            <div className="text-[#E8E0D0]/50 mt-1">
              Skipped {result.invalid.length} invalid address
              {result.invalid.length === 1 ? '' : 'es'}: {result.invalid.join(', ')}
            </div>
          )}
          {result.failed.length > 0 && (
            <div className="text-red-300 mt-1">
              Failed {result.failed.length}: {result.failed.map((f) => f.email).join(', ')}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-3 py-2 flex justify-between items-center">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-300/70 hover:text-red-300"
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}
