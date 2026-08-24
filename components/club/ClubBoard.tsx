'use client';

import { useState } from 'react';
import type { ClubPost } from '@/lib/club-board';

// The Song Club group thread: oldest-first so it reads top-down, composer at
// the bottom under the latest message. Members can delete their own posts;
// the admin can delete any. Styling mirrors the hub portal's message board.
export default function ClubBoard({
  initialPosts,
  viewerMemberId,
  isAdmin,
  eventId = null,
}: {
  initialPosts: ClubPost[];
  viewerMemberId: number | null; // null when the viewer is the admin session
  isAdmin: boolean;
  // null = the general Song Club board; a value = a specific event's board.
  eventId?: number | null;
}) {
  const [posts, setPosts] = useState<ClubPost[]>(initialPosts);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Admin default: also email the club, so an announcement reaches inboxes
  // rather than waiting for people to revisit. Members never email the board.
  const [emailToo, setEmailToo] = useState(true);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/club/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, email: isAdmin && emailToo, eventId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't post (${res.status})`);
      setPosts(data.posts ?? []);
      setDraft('');
      if (typeof data.emailedCount === 'number') {
        setNotice(
          `Posted + emailed ${data.emailedCount} member${data.emailedCount === 1 ? '' : 's'}.`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post");
    } finally {
      setSending(false);
    }
  }

  async function remove(id: number) {
    setError(null);
    try {
      const res = await fetch(`/api/club/posts/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't delete (${res.status})`);
      setPosts(data.posts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete");
    }
  }

  return (
    <div className="space-y-4">
      {posts.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/40">
          Nothing here yet — say hi, share what you&apos;re working on.
        </p>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => {
            const canDelete = isAdmin || (viewerMemberId !== null && p.memberId === viewerMemberId);
            return (
              <li
                key={p.id}
                className={`rounded-lg border p-3 ${
                  p.fromAdmin
                    ? 'border-[#c8a26a]/30 bg-[#c8a26a]/[0.06]'
                    : 'border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03]'
                }`}
              >
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="text-xs font-semibold text-[#E8E0D0]">{p.authorName}</span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="text-[10px] text-[#E8E0D0]/35">{formatWhen(p.createdAt)}</span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        className="text-[10px] text-[#E8E0D0]/35 transition hover:text-[#F5A3A3]"
                      >
                        delete
                      </button>
                    )}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-[#E8E0D0]/85">{p.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      {!(isAdmin || viewerMemberId !== null) ? (
        <a
          href="/song-club/login"
          className="inline-block rounded border border-[#E8E0D0]/30 px-4 py-2 text-sm text-[#E8E0D0]/80 transition hover:border-[#E8E0D0]/60 hover:text-[#E8E0D0]"
        >
          Log in to post
        </a>
      ) : (
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder={isAdmin ? 'Post as the Birdhaus…' : 'Post to the club…'}
          className="w-full resize-y rounded border border-[#E8E0D0]/30 bg-transparent px-3 py-2 text-sm placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0] focus:outline-none"
        />
        {error && (
          <div className="rounded border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-sm text-red-200">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded border border-green-400/40 bg-green-400/10 px-3 py-1.5 text-sm text-green-200">
            {notice}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={send}
            disabled={sending || !draft.trim()}
            className="rounded border border-[#E8E0D0] bg-[#E8E0D0] px-5 py-2 text-sm font-medium text-[#2A2420] transition-colors hover:bg-[#E8E0D0]/90 disabled:opacity-50"
          >
            {sending ? 'Posting…' : isAdmin && emailToo ? 'Post + email' : 'Post'}
          </button>
          {isAdmin && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#E8E0D0]/60">
              <input
                type="checkbox"
                checked={emailToo}
                onChange={(e) => setEmailToo(e.target.checked)}
                className="accent-[#c8a26a]"
              />
              Also email members who want announcements
            </label>
          )}
        </div>
      </div>
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
