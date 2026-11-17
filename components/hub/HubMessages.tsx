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
      <p className="text-data-caption-13 text-surface-ink/60">
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
          className="w-full resize-y bg-transparent border border-surface-ink px-3 py-2 text-body-3 focus:outline-none focus:border-accent-red placeholder:text-surface-ink/45"
        />
        {error && (
          <div className="border border-accent-red text-accent-red text-body-3 px-3 py-1.5">
            {error}
          </div>
        )}
        {notice && (
          <div className="border border-surface-ink text-surface-ink text-body-3 px-3 py-1.5">
            {notice}
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={send}
            disabled={sending || !draft.trim()}
            className="bg-surface-ink text-surface-paper border-2 border-surface-ink inline-flex h-9.5 items-center justify-center px-4.5 text-body-3 font-bold ui-hover:bg-accent-red ui-hover:border-accent-red transition-colors cursor-pointer focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
          >
            {sending ? 'Posting…' : emailOption && emailToo ? 'Post + email' : 'Post'}
          </button>
          {emailOption && (
            <label className="flex items-center gap-1.5 text-data-caption-13 text-surface-ink/60 cursor-pointer">
              <input
                type="checkbox"
                checked={emailToo}
                onChange={(e) => setEmailToo(e.target.checked)}
                className="accent-surface-ink"
              />
              Also email everyone on the advance
            </label>
          )}
        </div>
      </div>

      {messages.length === 0 ? (
        <p className="text-body-3 text-surface-ink/60">
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
                className={` border p-3 ${
                  fromBirdhaus
                    ? 'border-accent-red bg-surface-paper-shade'
                    : 'border-surface-ink/20 bg-surface-paper'
                }`}
              >
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="text-data-caption-13 font-bold text-surface-ink">{m.senderName}</span>
                  <span className="text-data-label-10-small text-surface-ink/60">{formatWhen(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-body-3 text-surface-ink/80">{m.body}</p>
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
