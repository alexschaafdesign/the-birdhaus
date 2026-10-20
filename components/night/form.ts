// The 2027 form look for the forms in SiteFrame: the account pages (/login,
// /invite, /account) and /contact's message form.
// Tokens only: paper ground, ink hairlines, accent-red for focus and errors,
// square corners, no shadows. Class strings, so server and client components
// can both use them.

const FOCUS = 'focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2';
const FIELD = `bg-surface-paper text-surface-ink text-body-3 placeholder:text-surface-ink/45 w-full rounded-none border px-3 py-2 ${FOCUS}`;

export const FORM = {
  label: 'text-data-overline-11 mb-1 block font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase',
  field: `border-surface-ink ${FIELD}`,
  // The same field when its value is wrong (pair with aria-invalid).
  fieldInvalid: `border-accent-red ${FIELD}`,
  // A note under a label ("shown on your attendee card").
  hint: 'text-body-3 mb-2 leading-normal opacity-70',
  // Errors are plain accent-red text, no box (a boxed error read as another
  // field): directly under the field they're about, or above the submit
  // button when they're about the whole form. Always role="alert". The field
  // itself switches to fieldInvalid (red border) with aria-invalid and
  // aria-describedby pointing at the message.
  error: 'text-body-3 text-accent-red leading-normal',
  fieldError: 'text-body-3 text-accent-red mt-1 leading-normal',
  // Success/info notices stay boxed, role="status".
  notice: 'border-surface-ink text-body-3 border-2 p-3 leading-normal',
  // The main action: filled ink, red on hover.
  primary: `bg-surface-ink text-surface-paper ui-hover:bg-accent-red text-ui-nav-item-14 w-full cursor-pointer px-6 py-3 font-bold tracking-[--spacing(0.25)] uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`,
  // A secondary action: ink outline, fills on hover (the /contact Send button).
  secondary: `text-ui-nav-item-14 border-surface-ink hover:bg-surface-ink hover:text-surface-paper w-fit cursor-pointer border px-6 py-2 tracking-[--spacing(0.25)] uppercase disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`,
  // Underlined text links and link-styled buttons.
  link: `hover:text-accent-red cursor-pointer underline underline-offset-4 ${FOCUS}`,
} as const;
