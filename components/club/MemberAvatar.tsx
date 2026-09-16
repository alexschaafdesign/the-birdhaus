// Small round member avatar with the single-letter fallback, for showing next
// to a name wherever a member did something (uploaded a track, commented,
// posted, pinned). Matches the waveform marker / user menu styling.
export default function MemberAvatar({
  name,
  avatarUrl,
  size = 'sm',
}: {
  name: string;
  avatarUrl: string | null;
  // sm = dense rows (comments, posts); md = card headers.
  size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 'h-4 w-4 text-[8px]' : 'h-5 w-5 text-[9px]';
  return (
    <span
      className={`inline-block shrink-0 overflow-hidden rounded-full border border-[#E8E0D0]/25 bg-[#E8E0D0]/10 align-[-3px] ${dim}`}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-semibold text-[#E8E0D0]/80">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}
