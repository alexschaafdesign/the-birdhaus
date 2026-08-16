# RSVP + Square ticketing — how it works

How the free RSVP form and the paid Square ticket flow fit together.

**Key idea:** the two systems are **decoupled**. An RSVP is free and just about the
guest list (headcount + address). Buying a ticket is a separate, optional "lock in your
spot" action. The only thing that connects them is a matching **email address**, joined
after the fact during reconciliation.

```
RSVP (free)                              TICKET (optional, paid)
  show page form                           /tickets → /checkout (fresh Square link)
    → /api/rsvp                              → Square hosted checkout → payment
    → rsvps table                                        │
    → confirmation email ──"buy a ticket"──▶ ticket_url  │
                                                          ▼
             matched by EMAIL  ◀──── getShowPurchaseMatches (variation ids + time window)
                     │
        admin RSVP page  +  "email who hasn't bought" blast
```

## 1. The RSVP form (free — headcount + address)

- **Where:** the show page (`app/shows/[slug]/page.tsx`) renders `components/RSVPForm`
  for upcoming shows that have RSVP enabled (`show.rsvpForm`). It passes the show's
  `ticketUrl` into the form so the advance-ticket link can ride along.
- **Submit:** the form POSTs to `app/api/rsvp/route.ts` with
  `showId, name, email, guests, emailList` opt-in, plus a hidden honeypot field. That
  route:
  1. **Honeypot** — if the hidden `website` field is filled (a bot), fake success and
     silently skip the DB write, email, and Mailchimp call.
  2. **Rate limit** — 15/hr per IP (`lib/rate-limit.ts`).
  3. **Validates**, then **re-fetches the show server-side** (never trusts posted show
     details, so a tampered payload can't poison the confirmation email).
  4. **Inserts a row into `rsvps`** (`show_id, name, email, guests, email_list_opt_in`).
  5. **Sends a confirmation email** (Resend) → stamps `confirmation_email_sent_at`.
  6. If opted in, **upserts to Mailchimp** (`lib/mailchimp.ts`) — non-blocking, so a
     Mailchimp outage never fails the RSVP response.
- **Table** (`scripts/migrations/015_rsvps.sql`): `rsvps(id, show_id, name, email,
  guests, email_list_opt_in, confirmation_email_sent_at, created_at)`.

**The confirmation email** (`lib/rsvp-email.ts`) includes a **"Buy an advance ticket →"**
button pointing at `show.ticketUrl`, and is explicit that an RSVP does *not* guarantee a
spot — buying a ticket is how you lock it in.

## 2. `ticket_url` — two flavors

A show's `ticket_url` is either:

- **External** (`externalTicketUrl`) — a link entered manually (some other ticketing
  site), or
- **Ours** — `${SITE_URL}/shows/<slug>/tickets`, set automatically when a show is synced
  to Square.

`PATCH /api/admin/shows/[id]` rewrites our internal `ticket_url` when a Square-managed
show's slug changes, so the email/show-page link never 404s. An external URL is left
untouched.

## 3. Square sync (admin, create-once)

The **"Create Square links"** button on the show edit form →
`app/api/admin/shows/[id]/square/route.ts` → `syncShowToSquare()` in `lib/square.ts`. It:

- Creates a Square **Catalog EVENT item** + **3 tier variations** ($10 / $20 / $30 —
  hardcoded in `TIERS`).
- Uploads the flyer as the item photo.
- Inserts rows into **`show_square_links`** (one per tier: `square_variation_id`,
  `amount_cents`, `url`, …).
- Sets `shows.square_item_id`, `square_image_id`, and `ticket_url = /shows/<slug>/tickets`.

Gated by `SQUARE_SYNC_ENABLED` (**live-only — there is no Square Sandbox for the Catalog
API**) and **create-once** (re-clicking only backfills the flyer / re-points `ticket_url`).

## 4. Buyer checkout — on-demand fresh links

> Square API-generated payment links are **single-use** — a stored link permanently shows
> a "payment confirmed" receipt to everyone after its first sale. See
> [`square-payment-links-fix.md`](./square-payment-links-fix.md) for the full history.

When a buyer clicks the ticket link:

1. **`app/shows/[slug]/tickets/page.tsx`** reads `show_square_links` and renders one
   button per tier. Each button links to **`/shows/[slug]/checkout?tier=<amountCents>`**
   (a plain `<a>`, not `next/link`, so the route isn't prefetched — a link is minted only
   on click).
2. **`app/shows/[slug]/checkout/route.ts`** resolves the tier's catalog variation
   **server-side** by slug + amount (never trusts a variation id from the URL), calls
   **`createTierPaymentLink()`** to mint a **fresh single-use Square link on every click**,
   and **302-redirects** the buyer to it. (Dev fallback when Square is disabled: the stored
   `url`.)
3. The buyer pays on Square. The order carries the tier's `catalog_object_id`.

Because every click mints a new link, the single-use behavior is no longer a problem — you
can't "use up" a show's link, and no per-show re-sync is needed.

## 5. Reconciliation — matching purchases back to RSVPs

Square purchases and RSVPs are joined **after the fact, by email** (all in `lib/square.ts`):

- **`getShowPurchases(variationIds, { since, until })`** — lists COMPLETED Square
  *payments* in a window, retrieves their orders, and matches by line-item
  `catalog_object_id` against the show's variation ids. Returns buyer email + amount +
  order id. (Order state stays `OPEN` for payment-link checkouts, so it keys off payments,
  not order state.) Never throws — returns `[]` on any failure.
- **`getShowPurchaseMatches(showId, rsvpEmails)`** wraps it — pulls the show's variation
  ids from `show_square_links`, uses a tight time window (link-created → show date + 3
  days), and buckets results into:
  - `purchasesByEmail` — RSVP emails that paid, with totals;
  - `unmatchedBuyers` — paid, but the Square email matches no RSVP (typo / different
    address);
  - `paidEmails` — the set of RSVP emails that bought.

This feeds two admin features:

- **The RSVP admin page** (`app/admin/(dashboard)/shows/[id]/rsvps/page.tsx`) — see who
  RSVPed and who has actually bought.
- **The email blast** (`app/api/admin/shows/[id]/email-rsvps/route.ts`) — message everyone
  who RSVPed, or just the **"haven't bought"** audience (which excludes `paidEmails`).

## Gotchas

- Reconciliation matches on the **email the buyer typed into Square**, which can differ
  from their RSVP email. Mismatches land in `unmatchedBuyers` rather than being
  auto-linked.
- All Square writes are **live-only** (`SQUARE_SYNC_ENABLED`), with **no Sandbox** — verify
  any Square change against a single real show.
- Tiers ($10/$20/$30) are **hardcoded** in `lib/square.ts` (`TIERS`); there is no per-show
  price concept in the DB yet.
