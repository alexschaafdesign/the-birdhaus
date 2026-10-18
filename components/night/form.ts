// The 2027 form look for the account pages in SiteFrame (/login, /invite,
// /account). Matches /contact's message form (app/contact/ContactForm.tsx).
// Tokens only: paper ground, ink hairlines, accent-red for focus and errors,
// square corners, no shadows. Class strings, so server and client components
// can both use them.

const FOCUS = 'focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2';

export const FORM = {
  label: 'text-data-overline-11 mb-1 block font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase',
  field: `border-surface-ink bg-surface-paper text-surface-ink text-body-3 placeholder:text-surface-ink/45 w-full rounded-none border px-3 py-2 ${FOCUS}`,
  // A note under a label ("shown on your attendee card").
  hint: 'text-body-3 mb-2 leading-normal opacity-70',
  // Inline result boxes. Errors carry role="alert", notices role="status".
  error: 'border-accent-red text-accent-red text-body-3 border-2 p-3 leading-normal',
  notice: 'border-surface-ink text-body-3 border-2 p-3 leading-normal',
  // The main action: filled ink, red on hover.
  primary: `bg-surface-ink text-surface-paper ui-hover:bg-accent-red text-ui-nav-item-14 w-full cursor-pointer px-6 py-3 font-bold tracking-[--spacing(0.25)] uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`,
  // A secondary action: ink outline, fills on hover (the /contact Send button).
  secondary: `text-ui-nav-item-14 border-surface-ink hover:bg-surface-ink hover:text-surface-paper w-fit cursor-pointer border px-6 py-2 tracking-[--spacing(0.25)] uppercase disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`,
  // Underlined text links and link-styled buttons.
  link: `hover:text-accent-red cursor-pointer underline underline-offset-4 ${FOCUS}`,
} as const;
