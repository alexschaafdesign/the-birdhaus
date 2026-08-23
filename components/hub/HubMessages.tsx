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
  asAdmin = false,
  adminShowId = null,
}: {
  token: string;
  initialMessages: PortalMessage[];
  bandId: number | null;
  // True when an authenticated admin (Alex) is posting: the message is recorded
  // as the Birdhaus rather than attributed to a band. Re-verified server-side.
  asAdmin?: boolean;
  // Set (alongside asAdmin) when the visitor is an admin: unlocks the "also
  // email the lineup" option, which routes the post through the admin message
  // API (proxy-gated) so it goes out as an email on the advance thread too.
  adminShowId?: number | null;
}) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Admin default is email-on: a message to the bill should reach inboxes, not
  // wait for someone to revisit the portal. Unchecking makes it board-only.
  const [emailToo, setEmailToo] = useState(true);
  const emailOption = asAdmin && adminShowId !== null;

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      if (emailOption && emailToo) {
        // Admin, with email: the unified send path (thread + board + email).
        const res = await fetch(`/api/admin/shows/${adminShowId}/advance/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body, email: true }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `Couldn't send (${res.status})`);
        // Refresh the board view (the admin route returns admin state, not the
        // portal-shaped thread).
        const thread = await fetch(`/api/hub/${token}/messages`).then((r) => r.json());
        setMessages(thread.messages ?? []);
        setNotice(
          `Posted + emailed to ${data.sentCount} recipient${data.sentCount === 1 ? '' : 's'}.`
        );
      } else {
        const res = await fetch(`/api/hub/${token}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bandId, body, asAdmin }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `Couldn't send (${res.status})`);
        setMessages(data.messages ?? []);
        if (emailOption) setNotice('Posted to the board (no email sent).');
      }
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

      {/* Compose first, so the way to post is the first thing people see. */}
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Post to the whole bill…"
          className="w-full resize-y bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30"
        />
        {error && (
          <div className="border border-red-400/40 bg-red-400/10 text-red-200 text-sm rounded px-3 py-1.5">
            {error}
          </div>
        )}
        {notice && (
          <div className="border border-green-400/40 bg-green-400/10 text-green-200 text-sm rounded px-3 py-1.5">
            {notice}
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={send}
            disabled={sending || !draft.trim()}
            className="bg-[#E8E0D0] text-[#2A2420] border border-[#E8E0D0] rounded px-5 py-2 text-sm font-medium hover:bg-[#E8E0D0]/90 transition-colors disabled:opacity-50"
          >
            {sending ? 'Posting…' : emailOption && emailToo ? 'Post + email' : 'Post'}
          </button>
          {emailOption && (
            <label className="flex items-center gap-1.5 text-xs text-[#E8E0D0]/60 cursor-pointer">
              <input
                type="checkbox"
                checked={emailToo}
                onChange={(e) => setEmailToo(e.target.checked)}
                className="accent-[#E8E0D0]"
              />
              Also email everyone on the advance
            </label>
          )}
        </div>
      </div>

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
