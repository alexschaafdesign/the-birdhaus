'use client';

import { useState } from 'react';
import type { PortalMessage } from '@/lib/hub-portal';

// Shared message board for the show: every post is visible to anyone who opens
// this portal link — the whole lineup, the sound engineer, and the Birdhaus — so
// the advance conversation is a group thread, not a private DM to Alex. `bandId`
// (from the identity picker upstream) attributes the post; null = "sound engineer
// / other". Posting returns the refreshed thread so Alex's replies show up too.
export default function HubMessages({
  token,
  initialMessages,
  bandId,
}: {
  token: string;
  initialMessages: PortalMessage[];
  bandId: number | null;
}) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/hub/${token}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bandId, body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't send (${res.status})`);
      setMessages(data.messages ?? []);
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#E8E0D0]/45">
        Posts here are shared with everyone on the bill — the whole lineup, the
        sound engineer, and the Birdhaus can all see them.
      </p>

      {messages.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/40">
          No posts yet. Introduce yourself, or ask the group about load-in, gear,
          or timing — everyone on this show will see it.
        </p>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => {
            const fromBirdhaus = m.direction === 'outbound';
            return (
              <li
                key={m.id}
                className={`rounded-lg border p-3 ${
                  fromBirdhaus
                    ? 'border-[#c8a26a]/30 bg-[#c8a26a]/[0.06]'
                    : 'border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03]'
                }`}
              >
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="text-xs font-semibold text-[#E8E0D0]">{m.senderName}</span>
                  <span className="text-[10px] text-[#E8E0D0]/35">{formatWhen(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-[#E8E0D0]/85">{m.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-200 text-sm rounded px-4 py-2">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Post to the whole bill…"
          className="w-full resize-y bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !draft.trim()}
          className="bg-[#E8E0D0] text-[#2A2420] border border-[#E8E0D0] rounded px-5 py-2 text-sm font-medium hover:bg-[#E8E0D0]/90 transition-colors disabled:opacity-50"
        >
          {sending ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
