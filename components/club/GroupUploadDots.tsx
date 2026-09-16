import MemberAvatar from './MemberAvatar';

// The group card's "who's in today" strip: members who uploaded today show
// as their avatars (gold-ringed, name on hover), the rest are anonymous
// hollow dots — positive pressure only — with a "4/10 today" tally. Reads
// like a meter filling up over the day.
export default function GroupUploadDots({
  roster,
}: {
  roster: Array<{
    memberId: number;
    name: string;
    avatarUrl: string | null;
    uploadedToday: boolean;
  }>;
}) {
  if (roster.length === 0) return null;
  const uploaded = roster.filter((r) => r.uploadedToday);
  return (
    <span className="mt-2 flex flex-wrap items-center gap-1">
      {uploaded.map((r) => (
        <span
          key={r.memberId}
          title={`${r.name} — uploaded today`}
          className="inline-flex rounded-full ring-1 ring-[#c8a26a]/70"
        >
          <MemberAvatar name={r.name} avatarUrl={r.avatarUrl} />
        </span>
      ))}
      {Array.from({ length: roster.length - uploaded.length }).map((_, i) => (
        <span
          key={`todo-${i}`}
          aria-hidden
          className="h-4 w-4 rounded-full border border-dashed border-[#E8E0D0]/25"
        />
      ))}
      <span
        className={`ml-1 text-[11px] font-semibold tabular-nums ${
          uploaded.length > 0 ? 'text-[#c8a26a]' : 'text-[#E8E0D0]/35'
        }`}
      >
        {uploaded.length}/{roster.length} today
      </span>
    </span>
  );
}
