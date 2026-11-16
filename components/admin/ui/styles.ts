// Class strings for the 2027 admin (paper ground). Tokens only: no hex, no px,
// square corners. Strings rather than components so server and client
// components (and the odd <a> styled as a button) can share them.
//
// Muted text on paper is ink at an opacity step, as on the public site (the
// DS text-muted / text-meta tokens are for the ink ground).

export const ADMIN_TYPE = {
  // Section labels, table heads, sidebar groups.
  overline: 'text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase',
  // The page's title under its overline.
  title: 'text-header-3 font-bold leading-tight',
  // A card's own heading (a widget or a person's name).
  heading: 'text-header-4 font-bold leading-tight',
  body: 'text-body-3 leading-normal',
  // Dates, counts, captions under a row's main line.
  meta: 'text-data-caption-13 text-surface-ink/60 leading-normal',
  muted: 'text-surface-ink/60',
  link: 'hover:text-accent-red cursor-pointer underline underline-offset-4 focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2',
  focus: 'focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2',
} as const;

// Lists and tables: an ink rule under the head, hairlines between rows, the
// paper-shade hover row. Numbers right-aligned in tabular figures.
export const ADMIN_TABLE = {
  table: 'text-body-3 w-full border-collapse',
  head: 'border-surface-ink border-b-2 text-left',
  th: `${ADMIN_TYPE.overline} py-2 pr-3 align-bottom`,
  row: 'border-surface-ink/20 hover:bg-surface-paper-shade border-b',
  td: 'py-2 pr-3 align-top',
  num: 'text-right tabular-nums',
  // A <ul> list with the same row rules.
  list: 'divide-surface-ink/20 divide-y',
} as const;
