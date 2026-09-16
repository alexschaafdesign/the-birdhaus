'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClubPost } from '@/lib/club-board';
import ReactionBar from './ReactionBar';

// The Song Club group thread: oldest-first so it reads top-down, composer at
// the bottom under the latest message. The list lives in its own capped-height
// scroll box that jumps to the bottom on load and after the viewer's own
// top-level post — so the newest message is always in view without scrolling
// the whole page (the board sits below the groups/uploads content). Reacting
// or replying deliberately does NOT move the scroll. Posts carry Slack-style
// emoji reactions and one level of Facebook-style replies. Members can delete
// their own posts; the admin can delete any. Styling mirrors the hub portal's
// message board.
export default function ClubBoard({
  initialPosts,
  viewerMemberId,
  isAdmin,
  eventId = null,
  groupId = null,
  canPost = true,
  readOnlyNote,
}: {
  initialPosts: ClubPost[];
  viewerMemberId: number | null; // null when the viewer is the admin session
  isAdmin: boolean;
  // null = the general Song Club board; a value = a specific event's board.
  eventId?: number | null;
  // Narrows an event board to one group's board.
  groupId?: number | null;
  // Group boards are readable by every attendee but writable only by that
  // group's members — the page decides and passes canPost (admin always may).
  canPost?: boolean;
  readOnlyNote?: string;
}) {
  const [posts, setPosts] = useState<ClubPost[]>(initialPosts);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Pin the scroll box to the newest message on mount, and again after the
  // viewer's own top-level post (send() arms this). Reactions, replies, and
  // deletes leave the scroll where it is.
  const pendingScroll = useRef(true);
  useEffect(() => {
    if (!pendingScroll.current) return;
    pendingScroll.current = false;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [posts]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Admin default: announcement boards email the club by default so a post
  // reaches inboxes; GROUP boards default to no email (casual chat — the
  // server scopes any email to that group's members only). Members never
  // email the board.
  const [emailToo, setEmailToo] = useState(groupId === null);

  const isViewerLoggedIn = isAdmin || viewerMemberId !== null;
  // Reacting only needs to be able to SEE the board (the page gated that);
  // replying follows the same rule as posting.
  const canReact = isViewerLoggedIn;
  const canReply = isAdmin || (viewerMemberId !== null && canPost);

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
        body: JSON.stringify({ body, email: isAdmin && emailToo, eventId, groupId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't post (${res.status})`);
      pendingScroll.current = true;
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

  async function sendReply(parentId: number) {
    const body = replyDraft.trim();
    if (!body) return;
    setReplySending(true);
    setError(null);
    try {
      const res = await fetch('/api/club/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, parentId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't reply (${res.status})`);
      setPosts(data.posts ?? []);
      setReplyDraft('');
      setReplyTo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reply");
    } finally {
      setReplySending(false);
    }
  }

  async function react(postId: number, emoji: string) {
    setError(null);
    try {
      const res = await fetch(`/api/club/posts/${postId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't react (${res.status})`);
      setPosts(data.posts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't react");
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

  function renderPost(p: ClubPost, isReply: boolean) {
    const canDelete = isAdmin || (viewerMemberId !== null && p.memberId === viewerMemberId);
    return (
      <div
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
        <div className="flex flex-wrap items-center gap-3">
          <ReactionBar
            reactions={p.reactions}
            viewerMemberId={viewerMemberId}
            isAdmin={isAdmin}
            canReact={canReact}
            onToggle={(emoji) => react(p.id, emoji)}
          />
          {!isReply && canReply && replyTo !== p.id && (
            <button
              type="button"
              onClick={() => {
                setReplyTo(p.id);
                setReplyDraft('');
              }}
              className="mt-1.5 text-[11px] text-[#E8E0D0]/45 transition hover:text-[#E8E0D0]"
            >
              Reply
            </button>
          )}
        </div>

        {(p.replies.length > 0 || replyTo === p.id) && (
          <div className="mt-2 space-y-2 border-l-2 border-[#E8E0D0]/10 pl-3">
            {p.replies.map((r) => (
              <div key={r.id}>{renderPost(r, true)}</div>
            ))}
            {replyTo === p.id && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendReply(p.id);
                    if (e.key === 'Escape') setReplyTo(null);
                  }}
                  placeholder={`Reply to ${p.authorName}…`}
                  className="w-full rounded border border-[#E8E0D0]/20 bg-transparent px-3 py-1.5 text-sm placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/60 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => sendReply(p.id)}
                  disabled={replySending || !replyDraft.trim()}
                  className="shrink-0 rounded border border-[#E8E0D0]/40 px-3 py-1.5 text-sm text-[#E8E0D0]/80 transition hover:border-[#E8E0D0] hover:text-[#E8E0D0] disabled:opacity-40"
                >
                  {replySending ? '…' : 'Reply'}
                </button>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  aria-label="Cancel reply"
                  className="shrink-0 text-xs text-[#E8E0D0]/40 transition hover:text-[#E8E0D0]"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        ref={scrollRef}
        className="max-h-80 overflow-y-auto overscroll-contain pr-1"
      >
      {posts.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/40">
          Nothing here yet — say hi, share what you&apos;re working on.
        </p>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id}>{renderPost(p, false)}</li>
          ))}
        </ul>
      )}
      </div>

      {error && (
        <div className="rounded border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-sm text-red-200">
          {error}
        </div>
      )}

      {!isViewerLoggedIn ? (
        <a
          href="/song-club/login"
          className="inline-block rounded border border-[#E8E0D0]/30 px-4 py-2 text-sm text-[#E8E0D0]/80 transition hover:border-[#E8E0D0]/60 hover:text-[#E8E0D0]"
        >
          Log in to post
        </a>
      ) : !(isAdmin || canPost) ? (
        <p className="text-xs text-[#E8E0D0]/40">
          {readOnlyNote ?? 'Only members of this group can post here.'}
        </p>
      ) : (
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder={isAdmin ? 'Post as the Birdhaus…' : 'Post to the club…'}
          className="w-full resize-y rounded border border-[#E8E0D0]/30 bg-transparent px-3 py-2 text-sm placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0] focus:outline-none"
        />
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
              {groupId !== null
                ? "Also email this group's members"
                : 'Also email members who want announcements'}
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
