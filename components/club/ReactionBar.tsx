'use client';

import { useState } from 'react';
import { CLUB_REACTION_EMOJI, type ClubReaction } from '@/lib/club-reactions';

// Slack-style reaction chips under a post or comment: one chip per emoji with
// its count (highlighted when the viewer is in it), plus a "+" that reveals
// the picker row. Tapping a chip or a picker emoji toggles the viewer's own
// reaction — the parent owns the network call and state swap.
export default function ReactionBar({
  reactions,
  viewerMemberId,
  isAdmin,
  canReact,
  onToggle,
}: {
  reactions: ClubReaction[];
  viewerMemberId: number | null; // null when the viewer is the admin session
  isAdmin: boolean;
  canReact: boolean;
  onToggle: (emoji: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!canReact && reactions.length === 0) return null;

  const mine = (r: ClubReaction) =>
    isAdmin
      ? r.reactors.some((x) => x.memberId === null)
      : viewerMemberId !== null && r.reactors.some((x) => x.memberId === viewerMemberId);

  async function toggle(emoji: string) {
    if (!canReact || busy) return;
    setBusy(true);
    setPickerOpen(false);
    try {
      await onToggle(emoji);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={!canReact || busy}
          onClick={() => toggle(r.emoji)}
          title={r.reactors.map((x) => x.name).join(', ')}
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
            mine(r)
              ? 'border-[#c8a26a]/60 bg-[#c8a26a]/15 text-[#E8E0D0]'
              : 'border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.04] text-[#E8E0D0]/70'
          } ${canReact ? 'hover:border-[#c8a26a]/60' : 'cursor-default'}`}
        >
          <span>{r.emoji}</span>
          <span className="tabular-nums text-[10px]">{r.reactors.length}</span>
        </button>
      ))}

      {canReact &&
        (pickerOpen ? (
          <span className="flex items-center gap-0.5 rounded-full border border-[#E8E0D0]/20 bg-[#2A2420] px-1 py-0.5">
            {CLUB_REACTION_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                disabled={busy}
                onClick={() => toggle(e)}
                className="rounded-full px-1 text-sm transition hover:bg-[#E8E0D0]/10"
              >
                {e}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              aria-label="Close reactions"
              className="px-1 text-xs text-[#E8E0D0]/40 transition hover:text-[#E8E0D0]"
            >
              ×
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-label="Add reaction"
            title="Add reaction"
            className="flex h-[22px] items-center rounded-full border border-dashed border-[#E8E0D0]/25 px-2 text-xs text-[#E8E0D0]/45 transition hover:border-[#c8a26a]/60 hover:text-[#E8E0D0]"
          >
            {reactions.length === 0 ? '☺+' : '+'}
          </button>
        ))}
    </div>
  );
}
