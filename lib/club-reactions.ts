// Shared between server (validation) and client (the picker): the curated
// reaction set for Song Club posts and track comments. Keep this list small
// and stable — every emoji here is a promise to render it forever.

export const CLUB_REACTION_EMOJI = ['👍', '❤️', '🔥', '😂', '🎉', '👀'] as const;

export function isClubReactionEmoji(e: string): boolean {
  return (CLUB_REACTION_EMOJI as readonly string[]).includes(e);
}

// One emoji's reactors on a post/comment. memberId null = "the Birdhaus".
// The client derives count (reactors.length) and "did I react" from this.
export interface ClubReaction {
  emoji: string;
  reactors: Array<{ memberId: number | null; name: string }>;
}
