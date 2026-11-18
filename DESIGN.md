# Design: the 2027 back-of-house

How the admin (`/admin`), the band portal (`/hub/<token>`) and the door kiosk
(`/door/<token>`) look, and the rules that keep them that way. They share the
public site's 2027 design system. This file covers how that system is applied
to working screens. The public site's pages aren't covered here.

## Source of truth

- **Figma:** "DESIGN SYSTEM – BIRDHAUS" (file `egMhEQpEBESg0d69GqUgdR`, a
  published team library). Figma is read-only from this repo.
- **Tokens:** `tokens.figma.json` → `npm run tokens` → `app/redesign/tokens.css`.
  Never hand-edit `tokens.css`. Tailwind v4 reads it through `@theme`, so every
  token is a utility class (`bg-surface-paper`, `text-body-3`, …).
- **Interaction variants:** `ui-hover` and `ui-pressed` (custom variants in
  `app/globals.css`). Use them on buttons and other controls instead of
  `hover:` / `active:`, so hover never sticks on touch.

## Ground and colour

Back-of-house is on **paper**. Ink is only used for the admin bar along the
top, primary buttons and "on" states.

| Token | Use |
| --- | --- |
| `surface-paper` | Page and card ground. |
| `surface-paper-shade` | Wells inside a card, a row's hover, the active sidebar link, image placeholders. |
| `surface-ink` | Text, borders and rules, primary buttons, toggles that are on, the admin bar. |
| `accent-red` | Overlines above a page title, the active tab or link, errors, a destructive link, and the one thing on a screen that needs attention. |
| `accent-brick` | Red on an ink ground (not used in admin today). |
| `spectrum-violet / magenta / red / orange / amber` | **Fills only** on paper: swatches, chart bars, a status edge. Never text: most fail contrast on paper (see the comments in `tokens.css`). |

- **Muted text:** ink at an opacity step. Use `/60` for meta and captions,
  `/45` for placeholders and `/20` for hairlines.
- **No other colours:** no hex, no Tailwind palette colours (`emerald-400`,
  `yellow-500`, `white`, `black`), and no tinted washes of them. The build
  enforces this (see [Guard](#guard)).

### Status without status colours

The DS has no green and no status tokens, so status relies on a glyph and
weight as well as colour. It reads in greyscale and on a printout:

- **`StatusMark`**, with tones:
  - `ok`: ink with a ✓
  - `attention`: ink on an amber fill
  - `problem`: accent-red with a ■
  - `neutral`: ink at 60%
- **`Swatch` + label:** a small square of a spectrum fill beside an ink label.
  Used for categories with more than two states. The maps live with the data:
  - `STATUS_SWATCH` in `lib/submissions.ts`: new, contacted violet, replied
    magenta, set aside amber, booked ink, passed red.
  - `DATE_OFFER_SWATCH` in `lib/date-offers.ts`.
- **On/off toggles** (Arrived, Paid, audience filters): ink fill with paper
  text when on, outlined when off. Set `aria-pressed`.
- **Money:**
  - Venue net bar: ink when positive, red when negative.
  - An overridden payout: red border. An overridden percentage: red text.
  - Settlement section markers: income ink, expenses amber, bands violet,
    everything else ink/30.
- **Rehearsal calendar** (`/admin/rehearsal/calendar`):
  - Show day: accent-red/15 cell. Not available: paper-shade. All-day block:
    ink/15.
  - Busy times from your calendar: a 4px spectrum-amber edge.
  - Bookings: confirmed has a solid ink border, requested a dashed one, and a
    conflict a 2px red border with ⚠.
  - Today: ink fill with paper text.
- **Charts** (Year in Review):
  - Series: Square violet, Venmo orange, Cash amber, as CSS variables
    (`var(--color-spectrum-violet)`).
  - Text on a bar: paper on violet, ink on orange and amber.

## Type

CommitMono only (400 and 700 exist; anything else falls back), set by the
frame. Only use the DS text tokens, never `text-sm` / `text-xl` / `font-medium`.

| Token | Use |
| --- | --- |
| `text-header-2` | Page-level titles on /hub and /door. |
| `text-header-3` | An admin page title (`ADMIN_TYPE.title`). |
| `text-header-4` | A card's own heading, a person's name (`ADMIN_TYPE.heading`). |
| `text-body-3` | Body, fields, buttons (size s), table cells. |
| `text-data-caption-13` | Meta under a row, dates, counts (`ADMIN_TYPE.meta`, ink/60). |
| `text-data-overline-11` | Uppercase section labels, table heads, sidebar groups, form labels (`ADMIN_TYPE.overline`, `FORM.label`). |
| `text-data-label-10-small` | Tiny badges on the show tabs. |
| `text-header-1` | Big numbers on the door kiosk. |

Weights are 400 and bold (700). Numbers in tables and totals use `tabular-nums`.

## Shape

- Corners are always square: no `rounded-*`. `rounded-none` is fine, and so is
  the word `rounded` as a JS identifier.
- No soft shadows.
- **Cards:** a 1px ink border. A card that matters more (a tinted settlement
  section, an inline edit form) gets a 2px border.
- **Hairlines inside a card:** `border-surface-ink/20`. A table head gets a 2px
  ink rule under it.

## Building blocks

Import everything from `components/admin/ui`.

- **`PageHeader`:**
  - `overline`: the section name, in accent-red, e.g. "Shows", "Money", "Settings".
  - `title`
  - `description`
  - `actions`: buttons on the right; they wrap under the title on a phone.
- **`Panel`:** the card. It takes an overline `title`, an `action` slot, and
  optionally `collapsible` and `defaultOpen`. Omit `title` for a plain box,
  such as a filter bar.
- **`ADMIN_TYPE`** and **`ADMIN_TABLE`:** class strings for the type roles
  above and for tables and lists (an ink rule under the head, hairlines between
  rows, a paper-shade hover row, numbers right-aligned).
- **Forms:**
  - `Field` / `Input` / `Textarea` / `Select` / `Checkbox` / `Notice`, built on
    `FORM` from `components/night/form.ts`.
  - `FIELD_INLINE` is `FORM.field` without `w-full`. Use it for fields sized by
    the caller (`w-40`, `w-auto`).
  - Checkboxes use `accent-surface-ink size-4`.
- **Buttons:** the DS `Button` / `buttonClassName(variant, size)` from
  `components/ui/Button`.
  - Admin uses size **s**. Size **m** is for the one big action on a page
    ("Save settlement", "Save template").
  - `primary`: ink fill, red on hover, for the main action.
  - `secondary`: ink outline, for everything else.
  - `ghost`: link-like.
  - Destructive actions are a red text link ("Remove", "Delete"), not a red
    button.
  - Add `disabled:opacity-40` (or `/50`) where a button can be disabled.
- **Links in text:** `ADMIN_TYPE.link`: underlined, with a 4px offset, red on
  hover.
- **Errors and notices:**
  - Errors are red text, `FORM.error`. A page-level error is a 2px red box with
    `role="alert"` and a "Dismiss" link.
  - Success and info notices are `FORM.notice` (a 2px ink box).
- **Modals:** an ink scrim (`bg-surface-ink/60–90`) behind a paper panel with a
  2px ink border.

## The frame

- `app/admin/(dashboard)/layout.tsx` checks the admin session and renders
  `AdminShell`.
- `AdminShell` lays out the page:
  - `AdminBar` (fullWidth) across the top: ink, with the `onInk` wordmark.
  - `AdminSidebar` on the left from `lg` up. Groups are overlines. The active
    link is red and bold, with a 4px red bar on its left, on paper-shade.
  - Below `lg`, the sidebar becomes a "Group / Page" Menu bar.
- The sections come from `ADMIN_NAV` in `components/admin/nav.ts`.
- **Page body:** `mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8`, starting with a
  `PageHeader`.
- **A show's workspace** (`shows/[id]/layout.tsx`): prev/next links
  (`ShowPrevNav`), the title, and `ShowTabs`, a rail with a red underline on
  the active tab and small ink badges.
- **/hub and /door** sit outside the admin frame. Their own pages set
  `bg-surface-paper text-surface-ink`.
  - /door is a kiosk: large type, big + and − targets, and a red banner across
    the top.
  - Markdown on /hub is styled by `.hub-prose` in `app/globals.css`, using
    token variables only.
- **Left as they are:** printed and emailed output (settlement and inputs PDFs,
  emails, the RSVP door-list print window, the invite email preview) keeps its
  own document styling.

Every admin route is on this frame, the rehearsal admin included. The old
dark shell and its two-row nav are gone.

## Guard

`scripts/check-admin-tokens.mjs` runs in `npm run build`, or on its own with
`npm run check:admin-tokens`.

- **Scope:** `components/admin`, `app/admin`, `components/hub`,
  `components/door`, `app/hub` and `app/door`.
- **What fails the build:** hex colours, Tailwind palette colours and rounded
  corners.
- **Exemptions**, each listed with its reason in the file:
  - the react-pdf documents
  - CSS inside a `<style>` block
  - lines right after an `admin-tokens-ok` comment, for brand marks such as the
    Venmo logo

If the guard fails, use a token. Exempt a line only when an outside brand or
document format needs a literal colour.

## Gotchas

- **Two classes for one property** in a class list resolve by CSS order, not by
  their position in the string. `FORM.field`'s `w-full` beats `w-40`, which is
  why `FIELD_INLINE` exists. `text-surface-paper` vs `text-surface-ink` on one
  element once made the wordmark invisible, which is why the wordmark takes
  `onInk`. Pick a variant or a separate class string instead of stacking an
  override.
- **Opacity doesn't nest:** a child's `hover:opacity-100` can't undo a parent's
  `opacity-60`. Change colour on hover instead.
- **`<option>` elements** inherit ink on paper, so don't give them a text
  colour.
- **Spectrum colours** are fills only on paper. For red text, use `accent-red`,
  not `spectrum-red`.
